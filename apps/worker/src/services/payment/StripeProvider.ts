/**
 * Enhanced Stripe Payment Provider
 * 
 * Production-hardened Stripe integration with comprehensive security features:
 * - Price allowlist validation to prevent unauthorized plan manipulation  
 * - Race-safe customer and subscription management
 * - Multi-secret webhook verification with rotation support
 * - Async webhook processing with deduplication
 * - Idempotent operations with conflict resolution
 * - Comprehensive error handling and logging
 * 
 * Security Features:
 * - Server-side price validation prevents client-side manipulation
 * - Advisory locks prevent race conditions during concurrent operations
 * - SECURITY DEFINER database functions ensure consistent permissions
 * - No sensitive data in redirect URLs
 * - Proper webhook signature verification with backup secret support
 */

import Stripe from 'stripe';
import * as crypto from 'crypto';
import { pool } from '../database';
import { getAllowedPriceIds, getStripeConfig } from '../../config/stripeEnvironmentValidation';
import { ServerLoggingService } from '../serverLoggingService';
import {
  PaymentProvider,
  PaymentClaims, 
  Customer,
  CheckoutParams,
  CheckoutResult,
  PortalParams,
  PortalResult,
  CancelParams,
  CancelResult,
  SubscriptionStatusResult,
  PaymentError,
  PLAN_MAPPINGS
} from './types';
import { promoCore } from '../promotion/PromoCore';
import { stripeAdapter } from '../promotion/StripeAdapter';

export class StripeProvider implements PaymentProvider {
  private stripe: Stripe;
  private allowedPrices: Set<string>;
  private webhookSecrets: string[];
  private isLiveMode: boolean;
  
  constructor() {
    const config = getStripeConfig();
    
    // Initialize Stripe client
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-08-27.basil', // Use latest stable API version
      telemetry: false, // Disable telemetry for security
      timeout: 15000, // 15 second timeout for API calls
    });
    
    // Server-side price allowlist (SECURITY CRITICAL)
    this.allowedPrices = getAllowedPriceIds();
    
    // Support webhook secret rotation
    this.webhookSecrets = [
      config.primaryWebhookSecret,
      config.backupWebhookSecret
    ].filter(Boolean) as string[];
    
    this.isLiveMode = config.isLiveMode;
    
    console.log(`✅ StripeProvider initialized (${this.isLiveMode ? 'LIVE' : 'TEST'} mode)`);
    console.log(`🎯 ${this.allowedPrices.size} price IDs in allowlist`);
    console.log(`🔐 ${this.webhookSecrets.length} webhook secret(s) configured`);
  }
  
  // =====================================================
  // Security & Validation Methods
  // =====================================================
  
  /**
   * Validates that a price ID is in our server-side allowlist
   * CRITICAL: Prevents unauthorized plan manipulation attacks
   */
  public isAllowedPrice(priceId: string): boolean {
    return this.allowedPrices.has(priceId);
  }
  
  /**
   * Maps internal plan ID to Stripe price ID with validation
   * Throws error if plan/currency combination is not supported
   */
  private getPriceId(planId: string, currency: string = 'usd'): string {
    const planMapping = PLAN_MAPPINGS[planId];
    if (!planMapping) {
      throw new PaymentError('INVALID_PLAN', `Unsupported plan: ${planId}`);
    }
    
    // Handle free plan (no price ID needed)
    if (planId === 'free') {
      throw new PaymentError('INVALID_PLAN', `Free plan does not support checkout - no payment required`);
    }
    
    const priceId = planMapping.priceIds[currency.toLowerCase()];
    if (!priceId) {
      throw new PaymentError('INVALID_PLAN', `Plan ${planId} not available in currency ${currency} - missing environment variable STRIPE_PRICE_${planId.toUpperCase()}_USD`);
    }
    
    // Double-check against allowlist
    if (!this.isAllowedPrice(priceId)) {
      throw new PaymentError('INVALID_PRICE', `Price ID ${priceId} not in server allowlist`);
    }
    
    return priceId;
  }
  
  // =====================================================
  // Customer Management
  // =====================================================
  
  /**
   * Get existing customer or create new one (race-safe)
   * Uses database unique constraint for race condition protection
   */
  public async getOrCreateCustomer(userId: string, userEmail: string): Promise<Customer> {
    if (!pool) {
      throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
    }
    
    // Check for existing customer first
    const existingResult = await pool.query(`
      SELECT id, provider_customer_id as stripe_customer_id, email 
      FROM billing_customers 
      WHERE user_id = $1
    `, [userId]);
    
    if (existingResult.rows.length > 0) {
      return existingResult.rows[0] as Customer;
    }
    
    // Create customer in Stripe with idempotency
    const idempotencyKey = `customer:create:${userId}`;
    
    try {
      const stripeCustomer = await this.stripe.customers.create({
        email: userEmail,
        metadata: { 
          user_id: userId,
          created_by: 'sheenapps_worker',
          environment: this.isLiveMode ? 'production' : 'development'
        }
      }, { 
        idempotencyKey,
        timeout: 10000 // 10 second timeout
      });
      
      // Insert into database with conflict resolution (race-safe)
      const insertResult = await pool.query(`
        INSERT INTO billing_customers (user_id, payment_provider, provider_customer_id, email)
        VALUES ($1, 'stripe', $2, $3)
        ON CONFLICT (user_id) DO UPDATE SET
          provider_customer_id = EXCLUDED.provider_customer_id,
          email = EXCLUDED.email,
          updated_at = now()
        RETURNING id, provider_customer_id as stripe_customer_id, email
      `, [userId, stripeCustomer.id, userEmail]);
      
      return insertResult.rows[0] as Customer;
      
    } catch (error: any) {
      // Enhanced error logging
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_customer_creation_failed',
        error,
        {
          userId,
          userEmail,
          idempotencyKey,
          isLiveMode: this.isLiveMode
        }
      );
      
      throw new PaymentError('STRIPE_API_ERROR', `Customer creation failed: ${error.message}`, error);
    }
  }
  
  // =====================================================
  // Checkout Session Management
  // =====================================================
  
  /**
   * Create Stripe checkout session with comprehensive validation
   * Includes security hardening and user-friendly configuration
   */
  public async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const { 
      planId, 
      authenticatedClaims, 
      locale = 'en', 
      trial = false, 
      idempotencyKey, 
      correlationId, 
      promotionCode 
    } = params;
    
    try {
      // Get or create customer (race-safe)
      const customer = await this.getOrCreateCustomer(
        authenticatedClaims.userId,
        params.userEmail || authenticatedClaims.email
      );
      
      // Get validated price ID
      const priceId = this.getPriceId(planId, params.currency || 'usd');
      
      // Build secure redirect URLs (no sensitive data)
      const redirectUrls = this.buildRedirectUrls(locale);
      
      // Get plan configuration
      const planMapping = PLAN_MAPPINGS[planId];
      if (!planMapping) {
        throw new PaymentError('INVALID_PLAN', `Unsupported plan: ${planId}`);
      }

      // Handle promotion code validation and reservation
      let promotionReservation: any = null;
      let stripePromotionCodeId: string | undefined = undefined;

      if (promotionCode) {
        console.log(`🎟️ Processing promotion code: ${promotionCode} for user ${authenticatedClaims.userId}`);

        // Calculate estimated cart total (for validation)
        // This is approximate - Stripe will calculate the final amount
        const basePrice = parseInt(priceId.split('_').pop() || '0'); // Extract price from ID
        const estimatedTotal = basePrice; // In minor units

        // Validate promotion code
        const validation = await promoCore.validate({
          code: promotionCode,
          userId: authenticatedClaims.userId,
          cartTotal: estimatedTotal,
          currency: params.currency || 'usd'
        });

        if (!validation.valid) {
          return {
            success: false,
            error: validation.error || 'Invalid promotion code',
            correlationId
          };
        }

        // Reserve the promotion for this checkout
        const reservation = await promoCore.reserve({
          code: promotionCode,
          userId: authenticatedClaims.userId,
          cartTotal: estimatedTotal,
          cartItems: [{ id: planId, quantity: 1, price: estimatedTotal }],
          currency: params.currency || 'usd',
          correlationId
        });

        if (!reservation.success) {
          return {
            success: false,
            error: reservation.error || 'Failed to reserve promotion',
            correlationId
          };
        }

        promotionReservation = reservation.reservation;

        // Create or get ephemeral Stripe artifacts
        const artifactResult = await stripeAdapter.createEphemeralArtifact({
          promotionId: validation.promotion!.id,
          promotionCodeId: validation.promotionCode!.id,
          code: promotionCode,
          discountType: validation.promotion!.discount_type,
          discountValue: validation.promotion!.discount_value,
          currency: params.currency || 'usd',
          userId: authenticatedClaims.userId,
          correlationId
        });

        if (!artifactResult.success) {
          console.error('Failed to create ephemeral Stripe artifacts:', artifactResult.error);
          // Release the reservation
          if (promotionReservation) {
            await promoCore.release(promotionReservation.id);
          }
          return {
            success: false,
            error: 'Failed to process promotion code',
            correlationId
          };
        }

        stripePromotionCodeId = artifactResult.stripePromotionCodeId;

        // Update Stripe promotion code with reservation ID
        if (stripePromotionCodeId) {
          await stripeAdapter.updatePromotionCodeMetadata(
            stripePromotionCodeId, 
            promotionReservation.id
          );
        }

        console.log(`✅ Promotion code reserved: ${promotionCode} -> ${promotionReservation.id}`);
      }
      
      // Prepare checkout session configuration
      const sessionConfig: Stripe.Checkout.SessionCreateParams = {
        customer: customer.stripe_customer_id,
        client_reference_id: authenticatedClaims.userId, // For webhook correlation
        metadata: { 
          user_id: authenticatedClaims.userId,
          correlation_id: correlationId,
          plan_id: planId,
          created_by: 'sheenapps_worker',
          // Add promotion tracking
          ...(promotionReservation && {
            promotion_reservation_id: promotionReservation.id,
            promotion_code: promotionCode
          })
        },
        mode: 'subscription',
        
        // Line items
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        
        // URLs (secure - no sensitive data)
        success_url: redirectUrls.success_url,
        cancel_url: redirectUrls.cancel_url,
        
        // Enhanced checkout configuration
        customer_update: { 
          address: 'auto',
          name: 'auto' 
        },
        
        // Terms of service consent - disabled for development
        // consent_collection: { 
        //   terms_of_service: 'required' 
        // },
        
        // Free trial support
        subscription_data: trial && planMapping.trialDays ? {
          trial_period_days: planMapping.trialDays,
          metadata: {
            trial_granted: 'true',
            trial_reason: 'new_user_promotion',
            // Add promotion tracking to subscription
            ...(promotionReservation && {
              promotion_reservation_id: promotionReservation.id
            })
          }
        } : {
          metadata: {
            // Add promotion tracking to subscription
            ...(promotionReservation && {
              promotion_reservation_id: promotionReservation.id
            })
          }
        },
        
        // Locale support for international users
        locale: this.mapLocaleToStripe(locale),
        
        // Payment method collection
        payment_method_collection: 'if_required',
        
        // Invoice creation - automatic for subscription mode
        // invoice_creation: {
        //   enabled: true // Only for mode: 'payment', automatic for 'subscription'
        // },
        
        // Automatic tax calculation (if configured in Stripe)
        automatic_tax: {
          enabled: false // Set to true when tax calculation is configured
        },
        
        // Promotion code handling
        ...(stripePromotionCodeId ? {
          // Pre-apply our promotion code
          discounts: [{
            promotion_code: stripePromotionCodeId
          }],
          // Disable manual promotion code entry since we're managing it
          allow_promotion_codes: false
        } : {
          // Allow manual promotion codes if none provided
          allow_promotion_codes: true
        }),
        
        // Billing address collection
        billing_address_collection: 'auto'
      };

      // Create checkout session with comprehensive configuration
      const session = await this.stripe.checkout.sessions.create(sessionConfig, {
        idempotencyKey: `checkout:${authenticatedClaims.userId}:${planId}:${idempotencyKey}:${promotionCode || 'no_promo'}`,
        timeout: 15000
      });
      
      // Log successful checkout creation
      console.log(`✅ Checkout session created: ${session.id} for user ${authenticatedClaims.userId} (${planId})${promotionCode ? ` with promotion: ${promotionCode}` : ''}`);
      
      return {
        success: true,
        url: session.url!,
        sessionId: session.id,
        correlationId
      };
      
    } catch (error: any) {
      // Enhanced error logging with context
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_checkout_creation_failed',
        error,
        {
          userId: authenticatedClaims.userId,
          planId,
          correlationId,
          idempotencyKey,
          locale
        }
      );
      
      console.error('[Stripe] Checkout creation failed:', error);
      
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError('STRIPE_API_ERROR', `Checkout creation failed: ${error.message}`, error);
    }
  }
  
  // =====================================================
  // Billing Portal Management
  // =====================================================
  
  /**
   * Create billing portal session for subscription management
   * Allows customers to update payment methods, view invoices, etc.
   */
  public async createPortalSession(params: PortalParams): Promise<PortalResult> {
    const { authenticatedClaims, locale = 'en', returnUrl, correlationId } = params;
    
    try {
      // Verify customer exists (must have subscription to access portal)
      if (!pool) {
        throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
      }
      
      const customerResult = await pool.query(`
        SELECT id, provider_customer_id as stripe_customer_id, email 
        FROM billing_customers 
        WHERE user_id = $1
      `, [authenticatedClaims.userId]);
      
      if (customerResult.rows.length === 0) {
        throw new PaymentError('CUSTOMER_NOT_FOUND', 'No customer record found - subscription required for portal access');
      }
      
      const customer = customerResult.rows[0];
      
      // Create billing portal session
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customer.stripe_customer_id,
        return_url: returnUrl || this.buildPortalReturnUrl(locale)
      }, {
        timeout: 10000
      });
      
      console.log(`✅ Portal session created: ${session.id} for user ${authenticatedClaims.userId}`);
      
      return {
        success: true,
        url: session.url,
        correlationId
      };
      
    } catch (error: any) {
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_portal_creation_failed',
        error,
        {
          userId: authenticatedClaims.userId,
          correlationId
        }
      );
      
      console.error('[Stripe] Portal creation failed:', error);
      
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError('STRIPE_API_ERROR', `Portal creation failed: ${error.message}`, error);
    }
  }
  
  // =====================================================
  // Subscription Management
  // =====================================================
  
  /**
   * Cancel user's active subscription
   * Supports immediate cancellation or end-of-period cancellation
   */
  public async cancelSubscription(params: CancelParams): Promise<CancelResult> {
    const { authenticatedClaims, immediately = false, correlationId } = params;
    
    try {
      if (!pool) {
        throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
      }
      
      // Find user's active subscription
      const subscriptionResult = await pool.query(`
        SELECT s.stripe_subscription_id, s.status, s.plan_name
        FROM billing_subscriptions s
        JOIN billing_customers c ON s.customer_id = c.id
        WHERE c.user_id = $1 
        AND s.status IN ('active', 'trialing', 'past_due')
        ORDER BY s.created_at DESC
        LIMIT 1
      `, [authenticatedClaims.userId]);
      
      if (subscriptionResult.rows.length === 0) {
        throw new PaymentError('SUBSCRIPTION_NOT_FOUND', 'No active subscription found for user');
      }
      
      const subscription = subscriptionResult.rows[0];
      
      // Cancel subscription in Stripe
      if (immediately) {
        await this.stripe.subscriptions.cancel(subscription.stripe_subscription_id, {
          prorate: true // Provide prorated refund
        });
        console.log(`✅ Subscription immediately canceled: ${subscription.stripe_subscription_id}`);
      } else {
        await this.stripe.subscriptions.update(subscription.stripe_subscription_id, {
          cancel_at_period_end: true
        });
        console.log(`✅ Subscription set to cancel at period end: ${subscription.stripe_subscription_id}`);
      }
      
      return {
        success: true,
        canceledImmediately: immediately,
        correlationId
      };
      
    } catch (error: any) {
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_subscription_cancellation_failed',
        error,
        {
          userId: authenticatedClaims.userId,
          immediately,
          correlationId
        }
      );
      
      console.error('[Stripe] Subscription cancellation failed:', error);
      
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError('STRIPE_API_ERROR', `Subscription cancellation failed: ${error.message}`, error);
    }
  }
  
  /**
   * Get comprehensive subscription status for a user
   * Returns detailed information about current subscription state
   */
  public async getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult> {
    try {
      if (!pool) {
        throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
      }
      
      const result = await pool.query(`
        SELECT s.*, c.provider_customer_id as stripe_customer_id
        FROM billing_subscriptions s
        JOIN billing_customers c ON s.customer_id = c.id
        WHERE c.user_id = $1
        AND s.status NOT IN ('canceled', 'incomplete_expired')
        ORDER BY s.created_at DESC
        LIMIT 1
      `, [userId]);
      
      if (result.rows.length === 0) {
        return {
          hasSubscription: false,
          status: null,
          planName: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: null
        };
      }
      
      const subscription = result.rows[0];
      
      return {
        hasSubscription: true,
        status: subscription.status,
        planName: subscription.plan_name,
        currentPeriodEnd: (subscription as any).current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        trialEnd: subscription.trial_end,
        isTrialing: subscription.status === 'trialing'
      };
      
    } catch (error: any) {
      console.error('[Stripe] Subscription status check failed:', error);
      throw new PaymentError('DATABASE_ERROR', `Status check failed: ${error.message}`, error);
    }
  }
  
  // =====================================================
  // Webhook Processing
  // =====================================================
  
  /**
   * Process Stripe webhook with comprehensive security and async processing
   * Features: Multi-secret verification, deduplication, fast response, async processing
   */
  public async handleWebhook(rawBody: string, signature: string): Promise<void> {
    // Multi-secret verification (supports webhook secret rotation)
    let event: Stripe.Event | undefined;
    
    for (const secret of this.webhookSecrets) {
      try {
        event = this.stripe.webhooks.constructEvent(
          rawBody, 
          signature, 
          secret,
          300 // 5-minute tolerance for clock skew
        );
        break;
      } catch (err) {
        // Continue to next secret
        continue;
      }
    }
    
    if (!event) {
      throw new PaymentError('WEBHOOK_VERIFICATION_FAILED', 'Invalid webhook signature - no valid secret matched');
    }
    
    console.log(`📥 Webhook received: ${event.type} (${event.id})`);
    
    if (!pool) {
      throw new PaymentError('DATABASE_ERROR', 'Database connection not available for webhook processing');
    }
    
    // CRITICAL: Atomic deduplication check (prevents duplicate processing)
    const dedupResult = await pool.query(`
      INSERT INTO processed_stripe_events (stripe_event_id, event_type, processed_at)
      VALUES ($1, $2, now())
      ON CONFLICT (stripe_event_id) DO NOTHING
      RETURNING stripe_event_id
    `, [event.id, event.type]);
    
    if (dedupResult.rows.length === 0) {
      console.log(`🔄 Event ${event.id} already processed - skipping`);
      return; // Already processed
    }
    
    // Store raw event for debugging/replay capabilities
    await pool.query(`
      INSERT INTO stripe_raw_events (id, payload) 
      VALUES ($1, $2) 
      ON CONFLICT (id) DO NOTHING
    `, [event.id, rawBody]);
    
    // 3. Enqueue for async processing (fast 200 OK response pattern)
    try {
      const { addStripeWebhookJob } = await import('../../queue/modularQueues');
      await addStripeWebhookJob({
        eventId: event.id,
        eventType: event.type,
        correlationId: crypto.randomUUID()
      });
      
      console.log(`✅ Event ${event.id} queued for async processing`);
    } catch (error) {
      // If queueing fails, process synchronously as fallback
      console.warn(`⚠️ Queue unavailable, processing webhook synchronously: ${event.id}`);
      
      try {
        await Promise.race([
          this.processWebhookEvent(event),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Webhook processing timeout')), 25000)
          )
        ]);
      } catch (processingError) {
        console.error(`⚠️ Webhook processing failed for ${event.id}:`, processingError);
        
        await ServerLoggingService.getInstance().logCriticalError(
          'stripe_webhook_processing_failed',
          processingError as Error,
          {
            eventId: event.id,
            eventType: event.type,
            fallbackMode: true
          }
        );
      }
    }
  }
  
  /**
   * Process individual webhook events with comprehensive handling
   * Supports all critical subscription and payment events
   */
  private async processWebhookEvent(event: Stripe.Event): Promise<void> {
    if (!pool) return;
    
    // Security: Validate price changes to prevent unauthorized manipulation
    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const priceId = subscription.items.data[0]?.price.id;
      
      if (priceId && !this.isAllowedPrice(priceId)) {
        console.error(`🚨 SECURITY ALERT: Unauthorized price change detected: ${priceId}`);
        
        await ServerLoggingService.getInstance().logCriticalError(
          'unauthorized_stripe_price_change',
          new Error(`Unauthorized price: ${priceId}`),
          {
            subscriptionId: subscription.id,
            priceId,
            eventId: event.id,
            customerId: subscription.customer as string
          }
        );
        
        // Don't update our records for unauthorized changes
        return;
      }
    }
    
    // Process different event types
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(event);
        break;
        
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event);
        break;
        
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event);
        break;
        
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event);
        break;
        
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event);
        break;
        
      case 'charge.refund.updated':
        await this.handleRefundUpdated(event);
        break;
        
      default:
        console.log(`ℹ️ Unhandled webhook event type: ${event.type}`);
    }
  }
  
  // =====================================================
  // Webhook Event Handlers
  // =====================================================
  
  private async handleCheckoutCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id || session.metadata?.user_id;
    
    if (!userId) {
      console.warn(`⚠️ No user ID found in checkout session ${session.id}`);
      return;
    }
    
    console.log(`✅ Checkout completed for user ${userId}, session ${session.id}`);
    
    // Handle promotion code redemption if present
    await this.processPromotionRedemption(session, userId);
    
    // The subscription creation will be handled by customer.subscription.created event
    // Here we could trigger welcome emails, onboarding flows, etc.
  }
  
  private async handleSubscriptionUpdated(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    
    // Find user ID from customer
    const customerResult = await pool!.query(`
      SELECT user_id FROM billing_customers WHERE provider_customer_id = $1
    `, [subscription.customer as string]);
    
    if (customerResult.rows.length === 0) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }
    
    const userId = customerResult.rows[0].user_id;
    
    // Use security definer function for safe upsert
    await pool!.query(`
      SELECT stripe_upsert_subscription($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      userId,
      subscription.id,
      subscription.items.data[0]?.price.id,
      this.mapStripePriceToUserPlan(subscription.items.data[0]?.price.id),
      subscription.status,
      new Date((subscription as any).current_period_start * 1000),
      new Date((subscription as any).current_period_end * 1000),
      event.id
    ]);
    
    console.log(`✅ Subscription updated for user ${userId}: ${subscription.status}`);
  }
  
  private async handleSubscriptionDeleted(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    
    // Update subscription status to canceled
    await pool!.query(`
      UPDATE billing_subscriptions 
      SET status = 'canceled', canceled_at = now(), updated_at = now()
      WHERE stripe_subscription_id = $1
    `, [subscription.id]);
    
    console.log(`✅ Subscription canceled: ${subscription.id}`);
  }
  
  private async handlePaymentSucceeded(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    
    if ((invoice as any).subscription) {
      // This is a subscription renewal
      console.log(`✅ Subscription payment succeeded: ${(invoice as any).subscription}`);
    }
  }
  
  private async handlePaymentFailed(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    
    if ((invoice as any).subscription) {
      console.log(`❌ Subscription payment failed: ${(invoice as any).subscription}`);
      // Could trigger dunning emails, suspension logic, etc.
    }
  }
  
  /**
   * Handle refund webhook events - update admin audit logs with Stripe refund IDs
   */
  private async handleRefundUpdated(event: Stripe.Event): Promise<void> {
    const refund = event.data.object as Stripe.Refund;
    
    console.log(`💰 Refund updated: ${refund.id} (${refund.status})`);
    
    try {
      if (!pool) {
        throw new Error('Database connection not available');
      }

      // Check if refund has admin metadata (from our admin system)
      const metadata = refund.metadata;
      if (metadata?.correlation_id || metadata?.admin_user_id) {
        
        // Update admin action log with Stripe refund ID (webhook closure)
        const updateResult = await pool.query(`
          UPDATE admin_action_log_app 
          SET extra = COALESCE(extra, '{}') || $1::jsonb
          WHERE correlation_id = $2
            AND action = 'refund.issue'
            AND resource_type = 'invoice'
        `, [
          JSON.stringify({
            stripe_refund_id: refund.id,
            stripe_refund_status: refund.status,
            stripe_refund_amount: refund.amount,
            webhook_processed_at: new Date().toISOString()
          }),
          metadata.correlation_id || metadata.original_correlation_id
        ]);

        if (updateResult.rowCount && updateResult.rowCount > 0) {
          console.log(`✅ Admin audit log updated with refund ID: ${refund.id}`);
          
          // Log the webhook closure event
          if (metadata.admin_user_id) {
            await pool.query(`
              SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)
            `, [
              metadata.admin_user_id,
              'refund.webhook_closure',
              'invoice',
              refund.payment_intent || 'unknown',
              `Stripe refund ${refund.status}: ${refund.id}`,
              metadata.correlation_id,
              JSON.stringify({
                stripe_refund_id: refund.id,
                stripe_refund_status: refund.status,
                stripe_refund_amount: refund.amount,
                webhook_event_id: event.id
              })
            ]);
          }
        } else {
          console.log(`⚠️ No matching admin action log found for correlation_id: ${metadata.correlation_id}`);
        }
      }
      
    } catch (error) {
      await ServerLoggingService.getInstance().logCriticalError(
        'refund_webhook_processing_failed',
        error as Error,
        {
          refund_id: refund.id,
          event_id: event.id,
          correlation_id: refund.metadata?.correlation_id
        }
      );
    }
  }
  
  // =====================================================
  // Utility Methods
  // =====================================================
  
  private buildRedirectUrls(locale: string): { success_url: string, cancel_url: string } {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // SECURITY: No sensitive data in URLs - derive state from session
    return {
      success_url: `${baseUrl}/${locale}/billing/success`,
      cancel_url: `${baseUrl}/${locale}/billing/cancel`
    };
  }
  
  private buildPortalReturnUrl(locale: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/${locale}/billing`;
  }
  
  private mapLocaleToStripe(locale: string): Stripe.Checkout.SessionCreateParams.Locale {
    const mapping: Record<string, Stripe.Checkout.SessionCreateParams.Locale> = {
      'en': 'en',
      'ar': 'en', // Stripe doesn't support Arabic, fallback to English
      'fr': 'fr',
      'es': 'es',
      'de': 'de',
      'it': 'it',
      'ja': 'ja',
      'zh': 'zh'
    };
    return mapping[locale] || 'en';
  }
  
  private mapStripePriceToUserPlan(priceId?: string): string {
    if (!priceId) return 'unknown';
    
    // Map price ID back to plan name
    for (const [planId, mapping] of Object.entries(PLAN_MAPPINGS)) {
      if (Object.values(mapping.priceIds).includes(priceId)) {
        return planId;
      }
    }
    
    return 'unknown';
  }

  // =====================================================
  // Advisor Network Consultation Payment Methods
  // =====================================================

  /**
   * Create payment intent for consultation booking
   * Platform-fixed pricing model: $9/$19/$35 for 15/30/60 min
   */
  public async createConsultationPayment(params: {
    consultationId: string;
    advisorId: string;
    clientId: string;
    durationMinutes: 15 | 30 | 60;
    clientEmail: string;
  }): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    totalAmount: number;
    advisorEarnings: number;
  }> {
    const { consultationId, advisorId, clientId, durationMinutes, clientEmail } = params;
    
    // Get platform-fixed pricing
    const pricing = this.getConsultationPricing(durationMinutes);
    
    try {
      // Get or create customer
      const customer = await this.getOrCreateCustomer(clientId, clientEmail);
      
      // Create payment intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: pricing.price_cents,
        currency: 'usd',
        customer: customer.stripe_customer_id,
        metadata: {
          consultation_id: consultationId,
          advisor_id: advisorId,
          client_id: clientId,
          duration_minutes: durationMinutes.toString(),
          type: 'consultation',
          platform_fee_cents: pricing.platform_fee_cents.toString(),
          advisor_earnings_cents: pricing.advisor_earnings_cents.toString()
        },
        description: `${durationMinutes}-minute consultation`,
        receipt_email: clientEmail,
        capture_method: 'automatic', // Capture immediately on booking
        confirmation_method: 'automatic',
        setup_future_usage: 'off_session' // Allow future bookings without re-entering card
      });

      // Store in consultation_charges table
      if (pool) {
        await pool.query(`
          INSERT INTO advisor_consultation_charges (
            consultation_id, stripe_payment_intent_id, total_amount_cents,
            platform_fee_cents, advisor_earnings_cents, currency, status
          )
          VALUES ($1, $2, $3, $4, $5, 'USD', 'pending')
          ON CONFLICT (stripe_payment_intent_id) DO NOTHING
        `, [
          consultationId,
          paymentIntent.id,
          pricing.price_cents,
          pricing.platform_fee_cents,
          pricing.advisor_earnings_cents
        ]);
      }

      console.log(`✅ Consultation payment created: ${paymentIntent.id} for ${durationMinutes}min ($${pricing.price_cents / 100})`);

      return {
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret!,
        totalAmount: pricing.price_cents,
        advisorEarnings: pricing.advisor_earnings_cents
      };

    } catch (error: any) {
      await ServerLoggingService.getInstance().logCriticalError(
        'consultation_payment_creation_failed',
        error,
        {
          consultationId,
          advisorId,
          clientId,
          durationMinutes
        }
      );

      throw new PaymentError('STRIPE_API_ERROR', `Consultation payment creation failed: ${error.message}`, error);
    }
  }

  /**
   * Create a general refund with idempotency support
   * Used by admin audit system for invoice refunds
   */
  public async createRefund(
    refundParams: {
      payment_intent: string;
      amount?: number;
      reason?: Stripe.Refund.Reason;
      metadata?: Record<string, string>;
    },
    idempotencyKey?: string
  ): Promise<Stripe.Refund> {
    try {
      const options: Stripe.RequestOptions = {};
      if (idempotencyKey) {
        options.idempotencyKey = idempotencyKey;
      }

      const createParams: any = {
        payment_intent: refundParams.payment_intent,
        amount: refundParams.amount,
        metadata: refundParams.metadata || {}
      };
      
      // Only add reason if provided to avoid type issues
      if (refundParams.reason) {
        createParams.reason = refundParams.reason;
      }

      const refund = await this.stripe.refunds.create(createParams, options);

      return refund;
    } catch (error: any) {
      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_general_refund_failed',
        error,
        {
          payment_intent: refundParams.payment_intent,
          amount: refundParams.amount,
          idempotency_key: idempotencyKey
        }
      );
      throw new PaymentError('STRIPE_API_ERROR', `Refund creation failed: ${error.message}`, error);
    }
  }

  /**
   * Process consultation refund
   * Handles cancellation refund logic based on timing
   */
  public async processConsultationRefund(params: {
    consultationId: string;
    refundReason: 'cancellation' | 'no_show' | 'dispute';
    refundAmount?: number; // Optional partial refund amount
    adminNotes?: string;
  }): Promise<{
    refundId: string;
    refundAmount: number;
    success: boolean;
  }> {
    const { consultationId, refundReason, refundAmount, adminNotes } = params;

    try {
      if (!pool) {
        throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
      }

      // Get consultation and charge details
      const consultationResult = await pool.query(`
        SELECT 
          c.id, c.advisor_id, c.start_time, c.advisor_earnings_cents,
          cc.stripe_payment_intent_id, cc.total_amount_cents, cc.status
        FROM advisor_consultations c
        JOIN advisor_consultation_charges cc ON cc.consultation_id = c.id
        WHERE c.id = $1
      `, [consultationId]);

      if (consultationResult.rows.length === 0) {
        throw new PaymentError('CONSULTATION_NOT_FOUND', 'Consultation or charge not found');
      }

      const consultation = consultationResult.rows[0];
      const chargeAmount = refundAmount || consultation.total_amount_cents;

      // Create refund in Stripe
      const refund = await this.stripe.refunds.create({
        payment_intent: consultation.stripe_payment_intent_id,
        amount: chargeAmount,
        reason: refundReason === 'dispute' ? 'requested_by_customer' : 'requested_by_customer',
        metadata: {
          consultation_id: consultationId,
          refund_reason: refundReason,
          admin_notes: adminNotes || ''
        }
      });

      // Update charge status
      await pool.query(`
        UPDATE advisor_consultation_charges
        SET status = 'refunded', updated_at = now()
        WHERE consultation_id = $1
      `, [consultationId]);

      // Create negative adjustment for advisor earnings
      if (refundReason === 'cancellation') {
        await pool.query(`
          INSERT INTO advisor_adjustments (
            advisor_id, consultation_id, amount_cents, reason, notes, created_at
          )
          VALUES ($1, $2, $3, 'refund', $4, now())
        `, [
          consultation.advisor_id,
          consultationId,
          -consultation.advisor_earnings_cents, // Negative adjustment
          `Consultation cancelled - refund issued: ${refund.id}`
        ]);
      }

      console.log(`✅ Consultation refund processed: ${refund.id} ($${chargeAmount / 100})`);

      return {
        refundId: refund.id,
        refundAmount: chargeAmount,
        success: true
      };

    } catch (error: any) {
      await ServerLoggingService.getInstance().logCriticalError(
        'consultation_refund_failed',
        error,
        {
          consultationId,
          refundReason,
          refundAmount
        }
      );

      throw new PaymentError('STRIPE_API_ERROR', `Consultation refund failed: ${error.message}`, error);
    }
  }

  /**
   * Generate monthly advisor payouts
   * Calculates earnings from succeeded charges plus adjustments
   */
  public async calculateAdvisorPayouts(month: Date): Promise<{
    advisorId: string;
    totalEarningsCents: number;
    consultationsCount: number;
    adjustmentsCents: number;
  }[]> {
    try {
      if (!pool) {
        throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
      }

      const result = await pool.query(`
        SELECT
          c.advisor_id,
          COUNT(c.id) as consultations_count,
          COALESCE(SUM(cc.advisor_earnings_cents), 0) as earned_cents,
          COALESCE(SUM(a.amount_cents), 0) as adjustments_cents,
          COALESCE(SUM(cc.advisor_earnings_cents), 0) + COALESCE(SUM(a.amount_cents), 0) as total_payout_cents
        FROM advisor_consultations c
        JOIN advisor_consultation_charges cc ON cc.consultation_id = c.id AND cc.status = 'succeeded'
        LEFT JOIN advisor_adjustments a ON a.advisor_id = c.advisor_id 
          AND date_trunc('month', a.created_at) = date_trunc('month', $1::date)
        WHERE date_trunc('month', c.start_time) = date_trunc('month', $1::date)
        GROUP BY c.advisor_id
        HAVING COALESCE(SUM(cc.advisor_earnings_cents), 0) + COALESCE(SUM(a.amount_cents), 0) > 0
      `, [month]);

      return result.rows.map(row => ({
        advisorId: row.advisor_id,
        totalEarningsCents: parseInt(row.total_payout_cents),
        consultationsCount: parseInt(row.consultations_count),
        adjustmentsCents: parseInt(row.adjustments_cents)
      }));

    } catch (error: any) {
      await ServerLoggingService.getInstance().logCriticalError(
        'advisor_payout_calculation_failed',
        error,
        { month: month.toISOString() }
      );

      throw new PaymentError('DATABASE_ERROR', `Payout calculation failed: ${error.message}`, error);
    }
  }

  /**
   * Process Stripe Connect transfer to advisor
   * Requires advisor to have completed Stripe Connect onboarding
   */
  public async processAdvisorPayout(params: {
    advisorId: string;
    payoutId: string;
    amountCents: number;
    stripeConnectAccountId: string;
  }): Promise<{
    transferId: string;
    success: boolean;
  }> {
    const { advisorId, payoutId, amountCents, stripeConnectAccountId } = params;

    try {
      // Create transfer to advisor's Stripe Connect account
      const transfer = await this.stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: stripeConnectAccountId,
        metadata: {
          advisor_id: advisorId,
          payout_id: payoutId,
          type: 'advisor_payout'
        },
        description: `Monthly advisor payout - ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
      });

      // Update payout record
      if (pool) {
        await pool.query(`
          UPDATE advisor_payouts
          SET 
            stripe_transfer_id = $1,
            status = 'paid',
            processed_at = now()
          WHERE id = $2
        `, [transfer.id, payoutId]);
      }

      console.log(`✅ Advisor payout processed: ${transfer.id} ($${amountCents / 100})`);

      return {
        transferId: transfer.id,
        success: true
      };

    } catch (error: any) {
      // Update payout status to failed
      if (pool) {
        await pool.query(`
          UPDATE advisor_payouts
          SET status = 'failed', processed_at = now()
          WHERE id = $1
        `, [payoutId]);
      }

      await ServerLoggingService.getInstance().logCriticalError(
        'advisor_payout_transfer_failed',
        error,
        {
          advisorId,
          payoutId,
          amountCents,
          stripeConnectAccountId
        }
      );

      throw new PaymentError('STRIPE_API_ERROR', `Advisor payout failed: ${error.message}`, error);
    }
  }

  /**
   * Get consultation pricing for given duration
   * Platform-fixed pricing model
   */
  private getConsultationPricing(durationMinutes: 15 | 30 | 60): {
    price_cents: number;
    platform_fee_cents: number;
    advisor_earnings_cents: number;
  } {
    const pricing = {
      15: { price_cents: 900, platform_fee_cents: 270, advisor_earnings_cents: 630 },
      30: { price_cents: 1900, platform_fee_cents: 570, advisor_earnings_cents: 1330 },
      60: { price_cents: 3500, platform_fee_cents: 1050, advisor_earnings_cents: 2450 }
    };

    return pricing[durationMinutes];
  }

  // =====================================================
  // Promotion Processing Methods
  // =====================================================

  /**
   * Process promotion code redemption from checkout session
   * Handles both pre-applied and manually entered promotion codes
   */
  private async processPromotionRedemption(session: Stripe.Checkout.Session, userId: string): Promise<void> {
    try {
      // Check if there's a promotion reservation in metadata
      const reservationId = session.metadata?.promotion_reservation_id;
      
      if (reservationId) {
        console.log(`🎟️ Processing pre-applied promotion reservation: ${reservationId}`);
        
        // Commit the reservation
        const commitResult = await promoCore.commit({
          reservationId: reservationId,
          stripePaymentIntentId: session.payment_intent as string,
          stripeSessionId: session.id
        });
        
        if (commitResult.success) {
          console.log(`✅ Promotion reservation committed: ${reservationId} -> ${commitResult.redemptionId}`);
        } else {
          console.error(`❌ Failed to commit promotion reservation ${reservationId}:`, commitResult.error);
        }
        return;
      }

      // Check for manually applied promotion codes in the session
      if (session.total_details?.breakdown?.discounts) {
        for (const discount of session.total_details.breakdown.discounts) {
          if (discount.discount.promotion_code) {
            await this.processManualPromotionCode(
              discount.discount.promotion_code as string, 
              session, 
              userId, 
              discount.amount
            );
          }
        }
      }

    } catch (error) {
      console.error('Error processing promotion redemption:', error);
      // Don't throw - promotion processing shouldn't block checkout completion
    }
  }

  /**
   * Process manually entered promotion code from Stripe checkout
   * Links external promotion code to canonical system
   */
  private async processManualPromotionCode(
    stripePromotionCodeId: string, 
    session: Stripe.Checkout.Session, 
    userId: string,
    discountAmount: number
  ): Promise<void> {
    try {
      console.log(`🎟️ Processing manual promotion code: ${stripePromotionCodeId}`);

      // Validate this is one of our promotion codes
      const isValidPromo = await stripeAdapter.validateStripePromotionCode(stripePromotionCodeId);
      if (!isValidPromo) {
        console.log(`⚠️ External promotion code detected, skipping: ${stripePromotionCodeId}`);
        return;
      }

      // Get canonical promotion IDs
      const canonicalIds = await stripeAdapter.getCanonicalIdsFromStripePromotionCode(stripePromotionCodeId);
      
      if (!canonicalIds.promotionId || !canonicalIds.promotionCodeId) {
        console.error(`❌ Missing canonical IDs for Stripe promotion code: ${stripePromotionCodeId}`);
        return;
      }

      // Check if there's already a reservation
      let reservationId = canonicalIds.reservationId;
      
      if (!reservationId) {
        // No existing reservation - create one retroactively for tracking
        const reservation = await promoCore.reserve({
          code: 'MANUAL_ENTRY', // We don't have the original code
          userId: userId,
          cartTotal: session.amount_total || 0,
          cartItems: [{ id: 'manual', quantity: 1, price: session.amount_total || 0 }],
          correlationId: session.id
        });
        
        if (reservation.success) {
          reservationId = reservation.reservation!.id;
        } else {
          console.error('Failed to create retroactive reservation:', reservation.error);
          return;
        }
      }

      // Commit the reservation
      const commitResult = await promoCore.commit({
        reservationId: reservationId,
        stripePaymentIntentId: session.payment_intent as string,
        stripeSessionId: session.id
      });

      if (commitResult.success) {
        console.log(`✅ Manual promotion code committed: ${stripePromotionCodeId} -> ${commitResult.redemptionId}`);
      } else {
        console.error(`❌ Failed to commit manual promotion code:`, commitResult.error);
      }

    } catch (error) {
      console.error('Error processing manual promotion code:', error);
    }
  }
}