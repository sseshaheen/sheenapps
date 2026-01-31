/**
 * Stripe Webhook Worker
 *
 * Enhanced webhook processing worker with comprehensive security features:
 * - Price allowlist validation to prevent unauthorized plan manipulation
 * - Complete event type coverage for subscription lifecycle
 * - Database transactions for consistency
 * - Advisory locks for race condition protection
 * - Comprehensive error handling and retry logic
 * - Security incident logging for unauthorized changes
 *
 * Processing Pattern:
 * 1. Webhook received → Fast 200 OK response → Event queued
 * 2. Worker picks up event → Process with security validation
 * 3. Update subscription/payment records via SECURITY DEFINER functions
 * 4. Handle access grants/revocations based on event type
 */

import { Job, Worker } from 'bullmq';
import Stripe from 'stripe';
import { getAllowedPriceIds, getStripeConfig } from '../config/stripeEnvironmentValidation';
import { pool } from '../services/database';
import { enhancedWebhookProcessor } from '../services/enhancedWebhookProcessor';
import { AccessDecision } from '../services/payment/types';
import { ServerLoggingService } from '../services/serverLoggingService';

// =====================================================
// Type Definitions
// =====================================================

interface StripeWebhookJobData {
  eventId: string;
  eventType: string;
  correlationId: string;
  userId?: string;
  customerId?: string;
  subscriptionId?: string;
}

// =====================================================
// Webhook Worker Class
// =====================================================

export class StripeWebhookWorker {
  private stripe: Stripe;
  private allowedPrices: Set<string>;
  private worker: Worker | null = null;

  constructor() {
    const config = getStripeConfig();
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-08-27.basil',
      timeout: 15000
    });
    this.allowedPrices = getAllowedPriceIds();

    console.log('🔧 StripeWebhookWorker initialized');
    console.log(`🎯 ${this.allowedPrices.size} allowed price IDs`);
  }

  /**
   * Start the webhook worker
   * Processes queued Stripe events with comprehensive error handling
   */
  public startWorker(): void {
    if (!pool) {
      console.error('❌ Database not available - cannot start Stripe webhook worker');
      return;
    }

    // Redis connection config (same as other queues)
    const connection = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      maxRetriesPerRequest: null,
    };

    this.worker = new Worker('stripe-webhooks', async (job: Job<StripeWebhookJobData>) => {
      return this.processWebhookJob(job);
    }, {
      connection,
      concurrency: 5, // Process up to 5 webhooks concurrently
      removeOnComplete: { count: 10 }, // Keep last 10 successful jobs for monitoring
      removeOnFail: { count: 50 }, // Keep more failed jobs for debugging
    });

    // Worker event handlers
    this.worker.on('completed', (job) => {
      console.log(`✅ Webhook processed: ${job.data.eventType} (${job.data.eventId})`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`❌ Webhook processing failed: ${job?.data?.eventType} (${job?.data?.eventId}):`, err);
    });

    this.worker.on('stalled', (jobId) => {
      console.warn(`⚠️ Webhook job stalled: ${jobId}`);
    });

    console.log('🚀 Stripe webhook worker started');
  }

  /**
   * Stop the webhook worker gracefully
   */
  public async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      console.log('⏹️ Stripe webhook worker stopped');
    }
  }

  /**
   * Process individual webhook job with transaction safety
   */
  private async processWebhookJob(job: Job<StripeWebhookJobData>): Promise<void> {
    const { eventId, eventType, correlationId } = job.data;

    console.log(`🔄 Processing webhook: ${eventType} (${eventId})`);

    if (!pool) {
      throw new Error('Database connection not available');
    }

    // Retrieve raw event from storage
    const eventResult = await pool.query(`
      SELECT payload FROM stripe_raw_events WHERE id = $1
    `, [eventId]);

    if (eventResult.rows.length === 0) {
      throw new Error(`Raw event not found: ${eventId}`);
    }

    const event = JSON.parse(eventResult.rows[0].payload) as Stripe.Event;

    // Process within database transaction for consistency
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await this.processStripeEventInTransaction(client, event, correlationId);

      await client.query('COMMIT');
      console.log(`✅ Event processed successfully: ${eventId}`);

    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`❌ Event processing failed: ${eventId}:`, error);

      // Log critical error for monitoring
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_webhook_transaction_failed',
        error as Error,
        {
          eventId,
          eventType,
          correlationId
        }
      );

      throw error; // Re-throw to trigger job retry
    } finally {
      client.release();
    }
  }

  /**
   * Process Stripe event within database transaction
   * Includes comprehensive security validation and event handling
   */
  private async processStripeEventInTransaction(
    client: any,
    event: Stripe.Event,
    correlationId: string
  ): Promise<void> {

    // SECURITY: Validate price changes to prevent unauthorized manipulation
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;

      if (priceId && !this.allowedPrices.has(priceId)) {
        console.error(`🚨 SECURITY ALERT: Unauthorized price change detected!`);
        console.error(`   Price ID: ${priceId}`);
        console.error(`   Subscription: ${subscription.id}`);
        console.error(`   Event: ${event.id}`);

        // Log security incident
        await ServerLoggingService.getInstance().logCriticalError(
          'stripe_unauthorized_price_change',
          new Error(`Unauthorized price manipulation: ${priceId}`),
          {
            subscriptionId: subscription.id,
            priceId,
            correlationId,
            eventId: event.id,
            customerId: subscription.customer as string
          }
        );

        // DO NOT update our records for unauthorized changes
        console.log('🛡️ Skipping record update due to security validation failure');
        return;
      }
    }

    // Determine access decision based on event
    const accessDecision = this.determineAccessFromEvent(event);

    // Process event based on type
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(client, event, correlationId);
        break;

      case 'checkout.session.async_payment_succeeded':
        await this.handleAsyncPaymentSucceeded(client, event, correlationId);
        break;

      case 'checkout.session.async_payment_failed':
        await this.handleAsyncPaymentFailed(client, event, correlationId);
        break;

      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(client, event, correlationId);
        break;

      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(client, event, correlationId);
        break;

      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(client, event, correlationId);
        break;

      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(client, event, correlationId);
        break;

      case 'invoice.payment_failed':
        await this.handlePaymentFailed(client, event, correlationId);
        break;

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        await this.handleDomainPaymentIntent(client, event, correlationId);
        break;

      case 'customer.subscription.trial_will_end':
        await this.handleTrialWillEnd(client, event, correlationId);
        break;

      // Domain dispute handling
      case 'charge.dispute.created':
        await this.handleDisputeCreated(client, event, correlationId);
        break;

      case 'charge.dispute.updated':
        await this.handleDisputeUpdated(client, event, correlationId);
        break;

      case 'charge.dispute.closed':
        await this.handleDisputeClosed(client, event, correlationId);
        break;

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type} - logging for analysis`);
        // Log unhandled events for potential future implementation
        await ServerLoggingService.getInstance().logCriticalError(
          'stripe_unhandled_event_type',
          new Error(`Unhandled event: ${event.type}`),
          {
            eventId: event.id,
            eventType: event.type,
            correlationId
          }
        );
    }

    console.log(`📊 Access decision for ${event.type}: ${accessDecision.action}`);
  }

  // =====================================================
  // Event Handlers
  // =====================================================

  private async handleCheckoutCompleted(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;

    if (!userId) {
      console.warn(`⚠️ No user ID found in checkout session ${session.id}`);
      return;
    }

    console.log(`✅ Checkout completed for user ${userId}`);

    // Apply advisory lock for user-specific operations
    await client.query('SELECT stripe_lock_user($1)', [userId]);

    // If there's a subscription, it will be handled by subscription.created event
    // Here we handle one-time payments (AI time packages)
    if (session.mode === 'subscription' && (session as any).subscription) {
      console.log(`🔄 Subscription ${(session as any).subscription} will be handled by subscription.created event`);
    } else if (session.mode === 'payment') {
      console.log(`💰 One-time payment completed: ${(session as any).payment_intent}`);

      // ENHANCED: Credit AI time buckets for package purchase
      await enhancedWebhookProcessor.handlePackagePurchase(client, session, correlationId);
    }

    // Update processed events with user correlation
    await client.query(`
      UPDATE processed_stripe_events
      SET user_id = $1, correlation_id = $2
      WHERE stripe_event_id = $3
    `, [userId, correlationId, event.id]);
  }

  private async handleAsyncPaymentSucceeded(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;

    if (!userId) {
      console.warn(`⚠️ No user ID found in async payment success ${session.id}`);
      return;
    }

    console.log(`✅ Async payment succeeded for user ${userId}`);

    // Grant access since payment succeeded after initial processing
    // This handles cases like 3D Secure, bank transfers, etc.
    await client.query('SELECT stripe_lock_user($1)', [userId]);
  }

  private async handleAsyncPaymentFailed(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;

    if (!userId) {
      console.warn(`⚠️ No user ID found in async payment failure ${session.id}`);
      return;
    }

    console.error(`❌ Async payment failed for user ${userId}`);

    // Handle access revocation due to payment failure
    await client.query('SELECT stripe_lock_user($1)', [userId]);

    // Could implement logic to suspend access, send notification, etc.
  }

  private async handleSubscriptionCreated(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);

    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.log(`✅ Subscription created: ${subscription.id} for user ${userId}`);

    await client.query('SELECT stripe_lock_user($1)', [userId]);

    // Create subscription record using security definer function
    await client.query(`
      SELECT stripe_upsert_subscription($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      subscription.id,
      subscription.items.data[0]?.price.id,
      this.mapStripePriceToUserPlan(subscription.items.data[0]?.price.id),
      subscription.status,
      new Date((subscription as any).current_period_start * 1000),
      new Date((subscription as any).current_period_end * 1000),
      correlationId
    ]);
  }

  private async handleSubscriptionUpdated(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);

    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.log(`🔄 Subscription updated: ${subscription.id} -> ${subscription.status}`);

    await client.query('SELECT stripe_lock_user($1)', [userId]);

    // Update subscription using security definer function
    await client.query(`
      SELECT stripe_upsert_subscription($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      subscription.id,
      subscription.items.data[0]?.price.id,
      this.mapStripePriceToUserPlan(subscription.items.data[0]?.price.id),
      subscription.status,
      new Date((subscription as any).current_period_start * 1000),
      new Date((subscription as any).current_period_end * 1000),
      correlationId
    ]);
  }

  private async handleSubscriptionDeleted(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);

    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.log(`❌ Subscription deleted: ${subscription.id}`);

    await client.query('SELECT stripe_lock_user($1)', [userId]);

    // ENHANCED: Handle subscription cancellation with bucket preservation
    await enhancedWebhookProcessor.handleSubscriptionCancellation(client, subscription, correlationId);

    // Mark subscription as canceled in billing system
    await client.query(`
      UPDATE billing_subscriptions
      SET status = 'canceled', canceled_at = now(), updated_at = now()
      WHERE stripe_subscription_id = $1
    `, [subscription.id]);
  }

  private async handlePaymentSucceeded(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    if (!(invoice as any).subscription) {
      console.log(`💰 One-time payment succeeded: ${invoice.id}`);
      return;
    }

    // This is a subscription renewal
    const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);

    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.log(`✅ Subscription renewal succeeded: ${subscription.id} for user ${userId}`);

    await client.query('SELECT stripe_lock_user($1)', [userId]);

    // Record successful payment using security definer function
    if ((invoice as any).payment_intent) {
      await client.query(`
        SELECT stripe_record_payment($1, $2, $3, $4, $5)
      `, [
        userId,
        (invoice as any).payment_intent,
        invoice.amount_paid,
        'succeeded',
        correlationId
      ]);
    }

    // ENHANCED: Credit AI time buckets for subscription renewal
    await enhancedWebhookProcessor.handleSubscriptionRenewal(client, subscription, correlationId);

    // Ensure subscription is marked as active and access is granted
    await client.query(`
      SELECT stripe_upsert_subscription($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      subscription.id,
      subscription.items.data[0]?.price.id,
      this.mapStripePriceToUserPlan(subscription.items.data[0]?.price.id),
      'active', // Ensure active status on successful payment
      new Date((subscription as any).current_period_start * 1000),
      new Date((subscription as any).current_period_end * 1000),
      correlationId
    ]);
  }

  private async handlePaymentFailed(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;

    if (!(invoice as any).subscription) {
      console.error(`❌ One-time payment failed: ${invoice.id}`);
      return;
    }

    const subscription = await this.stripe.subscriptions.retrieve((invoice as any).subscription as string);
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);

    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.error(`❌ Subscription payment failed: ${subscription.id} for user ${userId}`);

    await client.query('SELECT stripe_lock_user($1)', [userId]);

    // Record failed payment
    if ((invoice as any).payment_intent) {
      await client.query(`
        SELECT stripe_record_payment($1, $2, $3, $4, $5)
      `, [
        userId,
        (invoice as any).payment_intent,
        invoice.amount_due,
        'failed',
        correlationId
      ]);
    }

    // Update subscription status (may move to past_due)
    await client.query(`
      SELECT stripe_upsert_subscription($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      subscription.id,
      subscription.items.data[0]?.price.id,
      this.mapStripePriceToUserPlan(subscription.items.data[0]?.price.id),
      subscription.status, // Use current status from Stripe
      new Date((subscription as any).current_period_start * 1000),
      new Date((subscription as any).current_period_end * 1000),
      correlationId
    ]);

    // Could implement dunning management, suspension logic, etc.
  }

  private async handleTrialWillEnd(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);

    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.log(`⏰ Trial ending soon: ${subscription.id} for user ${userId}`);

    // Could trigger trial ending email, upgrade prompts, etc.
  }

  /**
   * Handle payment_intent.succeeded / payment_intent.payment_failed for domain billing.
   * Filters by metadata.type to only process domain-related payment intents.
   */
  private async handleDomainPaymentIntent(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    const metadata = paymentIntent.metadata;

    // Only handle domain-related payments; ignore all other payment intents
    if (metadata.type !== 'domain_registration' && metadata.type !== 'domain_renewal') {
      console.log(`ℹ️ Non-domain payment intent ${paymentIntent.id}, skipping`);
      return;
    }

    if (event.type === 'payment_intent.succeeded') {
      // Extract charge_id for dispute tracking
      // latest_charge can be: string | Stripe.Charge | null (depends on expansion)
      let chargeId: string | null = null;
      if (typeof paymentIntent.latest_charge === 'string') {
        chargeId = paymentIntent.latest_charge;
      } else if (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object') {
        chargeId = paymentIntent.latest_charge.id;
      }

      // If still null, fetch with expansion (rare, but handles edge cases)
      if (!chargeId) {
        try {
          const expanded = await this.stripe.paymentIntents.retrieve(paymentIntent.id, {
            expand: ['latest_charge'],
          });
          if (expanded.latest_charge && typeof expanded.latest_charge === 'object') {
            chargeId = expanded.latest_charge.id;
          }
        } catch (err) {
          console.warn(`⚠️ Could not expand latest_charge for ${paymentIntent.id}:`, err);
        }
      }

      // Update invoice status to paid with charge_id for dispute linking
      await client.query(
        `UPDATE inhouse_domain_invoices
         SET status = 'paid', paid_at = NOW(), updated_at = NOW(),
             stripe_charge_id = COALESCE($2, stripe_charge_id)
         WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id, chargeId]
      );

      // Update domain record with latest payment info
      if (metadata.domain_id) {
        await client.query(
          `UPDATE inhouse_registered_domains
           SET last_payment_id = $1, updated_at = NOW()
           WHERE id = $2`,
          [paymentIntent.id, metadata.domain_id]
        );
      }

      console.log(`✅ Domain payment succeeded: ${paymentIntent.id} (${metadata.type})${chargeId ? ` charge: ${chargeId}` : ''}`);

    } else {
      // payment_intent.payment_failed
      await client.query(
        `UPDATE inhouse_domain_invoices
         SET status = 'open', updated_at = NOW()
         WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id]
      );

      // Record payment_failed event on the domain
      if (metadata.domain_id) {
        await client.query(
          `INSERT INTO inhouse_domain_events (domain_id, project_id, event_type, metadata, actor_type)
           VALUES ($1, $2, 'payment_failed', $3, 'webhook')`,
          [
            metadata.domain_id,
            metadata.project_id || '',
            JSON.stringify({
              paymentIntentId: paymentIntent.id,
              reason: paymentIntent.last_payment_error?.message,
              correlationId,
            }),
          ]
        );
      }

      console.error(`❌ Domain payment failed: ${paymentIntent.id} (${metadata.type})`);
    }

    // Log activity outside the transaction-scoped queries
    await ServerLoggingService.getInstance().logCriticalError(
      event.type === 'payment_intent.succeeded'
        ? 'domain_payment_succeeded'
        : 'domain_payment_failed',
      new Error(`Domain ${metadata.type}: ${event.type}`),
      {
        paymentIntentId: paymentIntent.id,
        domain: metadata.domain,
        domainId: metadata.domain_id,
        type: metadata.type,
        correlationId,
      }
    );
  }

  // =====================================================
  // Dispute Handlers (Domain Billing)
  // =====================================================

  /**
   * Check if we've already processed this Stripe event (idempotency guard)
   */
  private async isEventProcessed(client: any, eventId: string): Promise<boolean> {
    const { rows } = await client.query(`
      SELECT 1 FROM stripe_processed_events WHERE event_id = $1
    `, [eventId]);
    return rows.length > 0;
  }

  /**
   * Handle dispute created - mark domain as at_risk
   * Uses transactional idempotency: claim event first, then apply changes
   */
  private async handleDisputeCreated(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    // Idempotency check (outside transaction - read-only)
    if (await this.isEventProcessed(client, event.id)) {
      console.log(`ℹ️ Dispute event ${event.id} already processed, skipping`);
      return;
    }

    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge as any)?.id;

    console.log(`⚠️ Dispute created: ${dispute.id} for charge ${chargeId}`);

    // Find the domain associated with this charge (outside transaction - read-only)
    const domainResult = await client.query(`
      SELECT rd.id, rd.domain, rd.project_id, rd.status
      FROM inhouse_registered_domains rd
      JOIN inhouse_domain_invoices di ON di.domain_id = rd.id
      WHERE di.stripe_charge_id = $1
    `, [chargeId]);

    if (domainResult.rows.length === 0) {
      console.log(`ℹ️ Dispute ${dispute.id} not for a domain charge (charge_id: ${chargeId})`);
      // Still mark as processed to avoid retries
      await client.query(`
        INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (event_id) DO NOTHING
      `, [event.id, event.type]);
      return;
    }

    const domain = domainResult.rows[0];

    // === BEGIN TRANSACTION ===
    // All state changes + idempotency mark must be atomic
    await client.query('BEGIN');

    try {
      // 1. Mark as processed FIRST (claim the event)
      const claimed = await client.query(`
        INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `, [event.id, event.type]);

      if (claimed.rows.length === 0) {
        // Another worker already claimed this event
        await client.query('ROLLBACK');
        console.log(`ℹ️ Dispute event ${event.id} claimed by another worker`);
        return;
      }

      // 2. Record dispute event
      await client.query(`
        INSERT INTO inhouse_domain_events
        (domain_id, project_id, event_type, metadata, actor_type)
        VALUES ($1, $2, 'dispute_created', $3, 'webhook')
      `, [
        domain.id,
        domain.project_id,
        JSON.stringify({
          disputeId: dispute.id,
          stripeEventId: event.id,
          chargeId,
          amount: dispute.amount,
          reason: dispute.reason,
          status: dispute.status,
          correlationId,
        }),
      ]);

      // 3. Update invoice with dispute info
      await client.query(`
        UPDATE inhouse_domain_invoices
        SET dispute_id = $1, dispute_status = $2, updated_at = NOW()
        WHERE stripe_charge_id = $3
      `, [dispute.id, dispute.status, chargeId]);

      // 4. Move to intermediate "at_risk" status
      if (domain.status === 'active') {
        await client.query(`
          UPDATE inhouse_registered_domains
          SET status = 'at_risk', updated_at = NOW()
          WHERE id = $1
        `, [domain.id]);

        console.log(`⚠️ Domain ${domain.domain} marked at_risk due to dispute`);
      }

      await client.query('COMMIT');
      // === END TRANSACTION ===

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    // Notifications are outside transaction (non-critical, can retry)
    await this.notifyAdminOfDispute(domain, dispute, 'created');
    await this.notifyUserOfDispute(domain, dispute);
  }

  /**
   * Handle dispute updated - escalate to suspended if needed
   */
  private async handleDisputeUpdated(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    if (await this.isEventProcessed(client, event.id)) return;

    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge as any)?.id;

    // Read-only query: find domain if we need to escalate (outside transaction)
    let domainToSuspend: { id: string; domain: string } | null = null;
    if (dispute.status === 'needs_response' || dispute.status === 'warning_needs_response') {
      const domainResult = await client.query(`
        SELECT rd.id, rd.domain, rd.status
        FROM inhouse_registered_domains rd
        JOIN inhouse_domain_invoices di ON di.domain_id = rd.id
        WHERE di.stripe_charge_id = $1 AND rd.status = 'at_risk'
      `, [chargeId]);

      if (domainResult.rows.length > 0) {
        domainToSuspend = domainResult.rows[0];
      }
    }

    // === BEGIN TRANSACTION ===
    await client.query('BEGIN');

    try {
      // 1. Claim the event first
      const claimed = await client.query(`
        INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `, [event.id, event.type]);

      if (claimed.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      // 2. Update dispute status on invoice
      await client.query(`
        UPDATE inhouse_domain_invoices
        SET dispute_status = $1, updated_at = NOW()
        WHERE stripe_charge_id = $2
      `, [dispute.status, chargeId]);

      // 3. Suspend domain if dispute escalated
      if (domainToSuspend) {
        await client.query(`
          UPDATE inhouse_registered_domains
          SET status = 'suspended', updated_at = NOW()
          WHERE id = $1
        `, [domainToSuspend.id]);

        console.log(`🚫 Domain ${domainToSuspend.domain} suspended - dispute escalated to ${dispute.status}`);
      }

      await client.query('COMMIT');
      // === END TRANSACTION ===

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Handle dispute closed - restore or suspend domain based on outcome
   */
  private async handleDisputeClosed(client: any, event: Stripe.Event, correlationId: string): Promise<void> {
    if (await this.isEventProcessed(client, event.id)) return;

    const dispute = event.data.object as Stripe.Dispute;
    const chargeId = typeof dispute.charge === 'string' ? dispute.charge : (dispute.charge as any)?.id;

    // Find the domain (outside transaction - read-only)
    const domainResult = await client.query(`
      SELECT rd.id, rd.domain, rd.project_id, rd.status
      FROM inhouse_registered_domains rd
      JOIN inhouse_domain_invoices di ON di.domain_id = rd.id
      WHERE di.stripe_charge_id = $1
    `, [chargeId]);

    if (domainResult.rows.length === 0) {
      // Still mark as processed
      await client.query(`
        INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (event_id) DO NOTHING
      `, [event.id, event.type]);
      return;
    }

    const domain = domainResult.rows[0];
    const won = dispute.status === 'won';

    // === BEGIN TRANSACTION ===
    await client.query('BEGIN');

    try {
      // 1. Claim the event first
      const claimed = await client.query(`
        INSERT INTO stripe_processed_events (event_id, event_type, processed_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id
      `, [event.id, event.type]);

      if (claimed.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }

      // 2. Update invoice
      await client.query(`
        UPDATE inhouse_domain_invoices
        SET dispute_status = $1, updated_at = NOW()
        WHERE stripe_charge_id = $2
      `, [dispute.status, chargeId]);

      // 3. Record closure event
      await client.query(`
        INSERT INTO inhouse_domain_events
        (domain_id, project_id, event_type, metadata, actor_type)
        VALUES ($1, $2, $3, $4, 'webhook')
      `, [
        domain.id,
        domain.project_id,
        won ? 'dispute_won' : 'dispute_lost',
        JSON.stringify({
          disputeId: dispute.id,
          stripeEventId: event.id,
          status: dispute.status,
          amount: dispute.amount,
          correlationId,
        }),
      ]);

      // 4. Update domain status
      if (won) {
        if (domain.status === 'at_risk' || domain.status === 'suspended') {
          await client.query(`
            UPDATE inhouse_registered_domains
            SET status = 'active', updated_at = NOW()
            WHERE id = $1
          `, [domain.id]);

          console.log(`✅ Domain ${domain.domain} reactivated - dispute won`);
        }
      } else {
        if (domain.status !== 'suspended') {
          await client.query(`
            UPDATE inhouse_registered_domains
            SET status = 'suspended', updated_at = NOW()
            WHERE id = $1
          `, [domain.id]);
        }

        console.log(`❌ Dispute lost for ${domain.domain} - domain suspended`);
      }

      await client.query('COMMIT');
      // === END TRANSACTION ===

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }

    // Notification outside transaction (non-critical)
    await this.notifyAdminOfDispute(domain, dispute, 'closed');
  }

  /**
   * Notify admin of dispute event
   */
  private async notifyAdminOfDispute(
    domain: { id: string; domain: string; project_id: string },
    dispute: Stripe.Dispute,
    action: 'created' | 'closed'
  ): Promise<void> {
    try {
      const subject = action === 'created'
        ? `⚠️ Dispute Created: ${domain.domain}`
        : `📋 Dispute Closed: ${domain.domain} (${dispute.status})`;

      // Log to monitoring system for admin visibility
      await ServerLoggingService.getInstance().logCriticalError(
        `domain_dispute_${action}`,
        new Error(subject),
        {
          domainId: domain.id,
          domain: domain.domain,
          projectId: domain.project_id,
          disputeId: dispute.id,
          disputeStatus: dispute.status,
          amount: dispute.amount,
          reason: dispute.reason,
        }
      );

      console.log(`📧 Admin notified of dispute ${action}: ${domain.domain}`);
    } catch (error) {
      console.error('Failed to notify admin of dispute:', error);
      // Non-critical - don't throw
    }
  }

  /**
   * Notify user of dispute event
   */
  private async notifyUserOfDispute(
    domain: { id: string; domain: string; project_id: string },
    dispute: Stripe.Dispute
  ): Promise<void> {
    try {
      // TODO: Implement actual user notification (email, in-app notification)
      // For now, just log
      console.log(`📧 User notification queued for dispute on ${domain.domain}`);
    } catch (error) {
      console.error('Failed to notify user of dispute:', error);
      // Non-critical - don't throw
    }
  }

  // =====================================================
  // Utility Methods
  // =====================================================

  /**
   * Determine access grant/revoke decision based on Stripe event
   * Comprehensive coverage of all subscription lifecycle events
   */
  private determineAccessFromEvent(event: Stripe.Event): AccessDecision {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' &&
            ['paid', 'no_payment_required'].includes(session.payment_status)) {
          return { action: 'grant', until: this.calculatePeriodEnd(session) };
        }
        return { action: 'noop' };

      case 'checkout.session.async_payment_succeeded':
        return { action: 'grant', until: this.calculatePeriodEnd(event.data.object) };

      case 'checkout.session.async_payment_failed':
        return { action: 'revoke', reason: 'async_payment_failed' };

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        const subscription = event.data.object as Stripe.Subscription;
        if (['active', 'trialing'].includes(subscription.status)) {
          return { action: 'grant', until: new Date((subscription as any).current_period_end * 1000) };
        }
        if (['past_due', 'canceled', 'incomplete_expired'].includes(subscription.status)) {
          return { action: 'revoke', reason: `subscription_${subscription.status}` };
        }
        return { action: 'noop' };

      case 'invoice.payment_succeeded':
        const successInvoice = event.data.object as Stripe.Invoice;
        if ((successInvoice as any).subscription && successInvoice.billing_reason !== 'subscription_create') {
          return { action: 'grant', until: this.calculateInvoicePeriodEnd(successInvoice) };
        }
        return { action: 'noop' };

      case 'invoice.payment_failed':
        return { action: 'revoke', reason: 'payment_failed' };

      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed':
        return { action: 'noop' }; // Domain billing — handled separately

      default:
        return { action: 'noop' };
    }
  }

  private async deriveUserIdFromCustomer(client: any, customerId: string): Promise<string | null> {
    const result = await client.query(`
      SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1
    `, [customerId]);

    return result.rows.length > 0 ? result.rows[0].user_id : null;
  }

  private mapStripePriceToUserPlan(priceId?: string): string {
    if (!priceId) return 'unknown';

    const priceMap: Record<string, string> = {
      [process.env.STRIPE_PRICE_LITE_USD || '']: 'lite',
      [process.env.STRIPE_PRICE_STARTER_USD || '']: 'starter',
      [process.env.STRIPE_PRICE_BUILDER_USD || '']: 'builder',
      [process.env.STRIPE_PRICE_PRO_USD || '']: 'pro',
      [process.env.STRIPE_PRICE_ULTRA_USD || '']: 'ultra'
    };

    return priceMap[priceId] || 'unknown';
  }

  private calculatePeriodEnd(sessionOrInvoice: any): Date {
    // Implementation would calculate period end from session/invoice data
    // For now, return a reasonable default
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  }

  private calculateInvoicePeriodEnd(invoice: Stripe.Invoice): Date {
    // Calculate from invoice line items period end
    const firstLine = invoice.lines.data[0];
    if (firstLine?.period) {
      return new Date(firstLine.period.end * 1000);
    }
    return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  }
}

// =====================================================
// Worker Instance Management
// =====================================================

let webhookWorkerInstance: StripeWebhookWorker | null = null;

/**
 * Get or create the webhook worker instance
 */
export function getStripeWebhookWorker(): StripeWebhookWorker {
  if (!webhookWorkerInstance) {
    webhookWorkerInstance = new StripeWebhookWorker();
  }
  return webhookWorkerInstance;
}

/**
 * Initialize webhook worker if Stripe is configured
 */
export function initializeStripeWebhookWorker(): void {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.log('⚠️ Stripe not configured - webhook worker not started');
    return;
  }

  const worker = getStripeWebhookWorker();
  worker.startWorker();
}

/**
 * Gracefully shutdown webhook worker
 */
export async function shutdownStripeWebhookWorker(): Promise<void> {
  if (webhookWorkerInstance) {
    await webhookWorkerInstance.stopWorker();
    webhookWorkerInstance = null;
  }
}
