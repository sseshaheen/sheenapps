import { PoolClient } from 'pg';
import Stripe from 'stripe';
import { enhancedAITimeBillingService } from './enhancedAITimeBillingService';
import { pricingCatalogService } from './pricingCatalogService';
import { planLifecycleService } from './planLifecycleService';
import { referralCommissionService } from './referralCommissionService';

/**
 * Enhanced webhook processor for bucket-based AI time billing system
 * 
 * Integrates Stripe events with the new bucket system:
 * - Credits subscription buckets on invoice.paid
 * - Credits package buckets on checkout.session.completed
 * - Handles rollover processing on subscription renewals
 * - Processes subscription cancellations without clawback
 */
export class EnhancedWebhookProcessor {

  /**
   * Process subscription renewal with AI time bucket crediting
   */
  async handleSubscriptionRenewal(
    client: PoolClient,
    subscription: Stripe.Subscription,
    correlationId: string
  ): Promise<void> {
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);
    
    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.log(`🔄 Processing subscription renewal: ${subscription.id} for user ${userId}`);

    // Get catalog to determine included minutes
    const catalog = await pricingCatalogService.getActiveCatalog();
    const firstItem = subscription.items.data[0];
    if (!firstItem) {
      console.error(`❌ No subscription items found for ${subscription.id}`);
      return;
    }
    const planKey = await this.mapStripePriceToUserPlan(firstItem.price.id);
    const plan = catalog.subscriptions.find(s => s.key === planKey);

    if (!plan) {
      console.error(`❌ Plan not found for price ${firstItem.price.id}`);
      return;
    }

    // Check if this is a renewal (not first payment)
    const isRenewal = await this.isSubscriptionRenewal(client, userId, subscription.id);

    if (isRenewal) {
      // Process rollover from previous cycle
      await this.processSubscriptionRollover(client, userId, plan.rolloverCap || 0);
    }

    // Credit new subscription bucket for this cycle
    const cycleEndDate = new Date((subscription as any).current_period_end * 1000);
    
    await enhancedAITimeBillingService.creditUserBalance(
      userId,
      plan.minutes * 60, // Convert minutes to seconds
      'subscription',
      cycleEndDate
    );

    console.log(`✅ Credited ${plan.minutes} minutes to user ${userId} (expires: ${cycleEndDate.toISOString()})`);

    // Process referral commissions for subscription payment
    try {
      // Create a mock payment record ID for referral processing
      const mockPaymentId = `subscription_${subscription.id}_${Date.now()}`;
      
      // Estimate payment amount from plan pricing (in cents)
      const planAmountCents = Math.round((plan.minutes * 60) * 0.5 * 100); // Rough estimate at $0.005/second
      
      await referralCommissionService.processPaymentForCommissions(
        mockPaymentId,
        userId,
        planAmountCents,
        'USD'
      );
      
      console.log(`💰 Processed referral commissions for subscription renewal by user ${userId}`);
    } catch (error) {
      // Don't fail the webhook if commission processing fails
      console.error(`⚠️ Failed to process referral commissions for user ${userId}:`, error);
    }

    // Log billing event
    await this.logBillingEvent(client, userId, {
      type: 'subscription_credit',
      seconds: plan.minutes * 60,
      reason: `${plan.name} subscription renewal`,
      timestamp: new Date().toISOString(),
      metadata: {
        plan_key: plan.key,
        subscription_id: subscription.id,
        cycle_end: cycleEndDate.toISOString(),
        correlation_id: correlationId
      }
    });
  }

  /**
   * Process package purchase with AI time bucket crediting
   */
  async handlePackagePurchase(
    client: PoolClient,
    session: Stripe.Checkout.Session,
    correlationId: string
  ): Promise<void> {
    const userId = session.client_reference_id || session.metadata?.user_id;
    
    if (!userId) {
      console.warn(`⚠️ No user ID found in checkout session ${session.id}`);
      return;
    }

    // Get package info from line items
    if (!session.line_items?.data.length) {
      // Retrieve line items if not included
      const lineItems = await this.retrieveSessionLineItems(session.id);
      if (!lineItems.length) {
        console.error(`❌ No line items found for session ${session.id}`);
        return;
      }
    }

    const priceId = session.line_items?.data[0]?.price?.id;
    if (!priceId) {
      console.error(`❌ No price ID found for session ${session.id}`);
      return;
    }

    // Get package details from catalog
    const packageInfo = await pricingCatalogService.getPricingItemByStripeId(priceId);
    
    if (!packageInfo || packageInfo.item_type !== 'package') {
      console.error(`❌ Package not found for price ${priceId}`);
      return;
    }

    console.log(`💰 Processing package purchase: ${packageInfo.display_name} for user ${userId}`);

    // Credit package bucket with 90-day expiry
    const expiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    
    await enhancedAITimeBillingService.creditUserBalance(
      userId,
      packageInfo.seconds,
      'package',
      expiryDate
    );

    console.log(`✅ Credited ${Math.floor(packageInfo.seconds / 60)} minutes to user ${userId} (expires: ${expiryDate.toISOString()})`);

    // Process referral commissions for this payment
    try {
      // Create a mock payment record ID for referral processing
      const mockPaymentId = `checkout_${session.id}_${Date.now()}`;
      
      await referralCommissionService.processPaymentForCommissions(
        mockPaymentId,
        userId,
        session.amount_total || 0,
        session.currency?.toUpperCase() || 'USD'
      );
      
      console.log(`💰 Processed referral commissions for package purchase by user ${userId}`);
    } catch (error) {
      // Don't fail the webhook if commission processing fails
      console.error(`⚠️ Failed to process referral commissions for user ${userId}:`, error);
    }

    // Log billing event
    await this.logBillingEvent(client, userId, {
      type: 'package_credit',
      seconds: packageInfo.seconds,
      reason: `${packageInfo.display_name} purchase`,
      timestamp: new Date().toISOString(),
      metadata: {
        package_key: packageInfo.item_key,
        session_id: session.id,
        expires_at: expiryDate.toISOString(),
        amount_paid: session.amount_total,
        correlation_id: correlationId
      }
    });
  }

  /**
   * Handle subscription cancellation (keep granted buckets)
   */
  async handleSubscriptionCancellation(
    client: PoolClient,
    subscription: Stripe.Subscription,
    correlationId: string
  ): Promise<void> {
    const userId = await this.deriveUserIdFromCustomer(client, subscription.customer as string);
    
    if (!userId) {
      console.warn(`⚠️ No user found for customer ${subscription.customer}`);
      return;
    }

    console.log(`❌ Processing subscription cancellation: ${subscription.id} for user ${userId}`);

    // Use plan lifecycle service to handle cancellation properly
    await planLifecycleService.handleSubscriptionCancellation(
      userId,
      'Stripe subscription cancelled',
      new Date(subscription.canceled_at ? subscription.canceled_at * 1000 : Date.now())
    );

    console.log(`✅ Subscription cancelled for user ${userId} - existing minutes retained`);
  }

  /**
   * Process rollover from previous subscription cycle
   */
  private async processSubscriptionRollover(
    client: PoolClient,
    userId: string,
    rolloverCapMinutes: number
  ): Promise<void> {
    
    // Get current buckets
    const balanceQuery = `
      SELECT second_buckets FROM user_ai_time_balance 
      WHERE user_id = $1 
      FOR UPDATE
    `;
    
    const result = await client.query(balanceQuery, [userId]);
    if (result.rows.length === 0) return;

    const buckets = result.rows[0].second_buckets || [];
    
    // Find unused subscription seconds from previous cycle
    const subscriptionBuckets = buckets.filter((b: any) => 
      b.source === 'subscription' && 
      (b.seconds - b.consumed) > 0
    );

    if (subscriptionBuckets.length === 0) return;

    const totalUnusedSeconds = subscriptionBuckets.reduce((sum: number, bucket: any) => 
      sum + (bucket.seconds - bucket.consumed), 0
    );

    if (totalUnusedSeconds === 0) return;

    const rolloverCapSeconds = rolloverCapMinutes * 60;
    const secondsToRollover = Math.min(totalUnusedSeconds, rolloverCapSeconds);
    const secondsDiscarded = Math.max(0, totalUnusedSeconds - rolloverCapSeconds);

    // Create rollover bucket
    if (secondsToRollover > 0) {
      const rolloverExpiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      
      await enhancedAITimeBillingService.creditUserBalance(
        userId,
        secondsToRollover,
        'rollover',
        rolloverExpiryDate
      );

      // Log rollover event
      await this.logBillingEvent(client, userId, {
        type: 'rollover_created',
        seconds: secondsToRollover,
        reason: `Subscription cycle rollover (${Math.floor(secondsToRollover / 60)} minutes)`,
        timestamp: new Date().toISOString(),
        metadata: {
          rollover_cap_minutes: rolloverCapMinutes,
          total_unused_seconds: totalUnusedSeconds,
          expires_at: rolloverExpiryDate.toISOString()
        }
      });
    }

    // Log discarded minutes if any
    if (secondsDiscarded > 0) {
      await this.logBillingEvent(client, userId, {
        type: 'rollover_discard',
        seconds: -secondsDiscarded,
        reason: `Rollover cap exceeded (${Math.floor(secondsDiscarded / 60)} minutes discarded)`,
        timestamp: new Date().toISOString(),
        metadata: {
          rollover_cap_minutes: rolloverCapMinutes,
          seconds_discarded: secondsDiscarded
        }
      });

      console.log(`⚠️ Discarded ${Math.floor(secondsDiscarded / 60)} minutes for user ${userId} (rollover cap: ${rolloverCapMinutes} minutes)`);
    }

    // Remove old subscription buckets (they've been processed into rollover)
    const updatedBuckets = buckets.filter((b: any) => b.source !== 'subscription');
    
    await client.query(`
      UPDATE user_ai_time_balance 
      SET second_buckets = $2
      WHERE user_id = $1
    `, [userId, JSON.stringify(updatedBuckets)]);
  }

  /**
   * Check if this is a subscription renewal vs first payment
   */
  private async isSubscriptionRenewal(
    client: PoolClient,
    userId: string,
    subscriptionId: string
  ): Promise<boolean> {
    const result = await client.query(`
      SELECT COUNT(*) as count
      FROM user_ai_time_consumption 
      WHERE user_id = $1 
        AND build_id = $2 
        AND operation_type = 'subscription_credit'
    `, [userId, subscriptionId]);
    
    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Retrieve session line items from Stripe
   */
  private async retrieveSessionLineItems(sessionId: string): Promise<Stripe.LineItem[]> {
    // This would use the Stripe client to retrieve line items
    // For now, return empty array as fallback
    return [];
  }

  /**
   * Map Stripe price ID to user plan key
   */
  private async mapStripePriceToUserPlan(priceId: string): Promise<string> {
    const pricingItem = await pricingCatalogService.getPricingItemByStripeId(priceId);
    return pricingItem?.item_key || 'unknown';
  }

  /**
   * Derive user ID from Stripe customer ID
   */
  private async deriveUserIdFromCustomer(client: PoolClient, customerId: string): Promise<string | null> {
    const result = await client.query(`
      SELECT user_id FROM billing_customers WHERE stripe_customer_id = $1
    `, [customerId]);
    
    return result.rows.length > 0 ? result.rows[0].user_id : null;
  }

  /**
   * Log billing event with standardized format
   */
  private async logBillingEvent(
    client: PoolClient,
    userId: string,
    event: {
      type: string;
      seconds: number;
      reason: string;
      timestamp: string;
      metadata?: any;
    }
  ): Promise<void> {
    try {
      await client.query(`
        INSERT INTO user_ai_time_consumption (
          user_id,
          project_id,
          build_id,
          version_id,
          idempotency_key,
          operation_type,
          started_at,
          ended_at,
          duration_ms,
          duration_seconds,
          billable_seconds,
          success,
          error_type,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        userId,
        'webhook',
        event.type,
        'billing_event',
        `webhook_${Date.now()}_${userId}`,
        event.type,
        new Date(event.timestamp),
        new Date(event.timestamp),
        0, // No processing time
        Math.abs(event.seconds),
        event.seconds, // Can be negative for debits
        true,
        event.reason,
        new Date(event.timestamp)
      ]);
    } catch (error) {
      // Don't fail the webhook if event logging fails
      console.error('Failed to log billing event:', error);
    }
  }
}

export const enhancedWebhookProcessor = new EnhancedWebhookProcessor();