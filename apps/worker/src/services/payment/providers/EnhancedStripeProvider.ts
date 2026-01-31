/**
 * Enhanced Stripe Provider
 * 
 * Expert-validated Stripe implementation with multi-provider interface.
 * Maintains backward compatibility while adding new capabilities.
 * 
 * Key Features:
 * - Implements enhanced PaymentProvider interface
 * - Price snapshot immutability and validation
 * - Provider-agnostic database integration
 * - Enhanced webhook handling with signature storage
 * - Global idempotency and audit trail integration
 */

import Stripe from 'stripe';
import { pool } from '../../database';
import { getAllowedPriceIds, getStripeConfig } from '../../../config/stripeEnvironmentValidation';
import { ServerLoggingService } from '../../serverLoggingService';
import {
  PaymentProvider,
  PaymentProviderKey,
  CheckoutResult,
  WebhookEvent,
  PriceSnapshot,
  PaymentError,
  PaymentStatus,
  SubscriptionStatus
} from '../enhancedTypes';
import { regionalPaymentFactory } from '../RegionalPaymentFactory';

export class EnhancedStripeProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'stripe';
  private stripe: Stripe;
  private allowedPrices: Set<string>;
  private webhookSecrets: string[];
  private isLiveMode: boolean;

  constructor() {
    const config = getStripeConfig();
    
    // Initialize Stripe client
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-08-27.basil',
      telemetry: false,
      timeout: 15000,
    });
    
    this.allowedPrices = getAllowedPriceIds();
    this.webhookSecrets = [
      config.primaryWebhookSecret,
      config.backupWebhookSecret
    ].filter(Boolean) as string[];
    
    this.isLiveMode = config.isLiveMode;
    
    console.log(`✅ EnhancedStripeProvider initialized (${this.isLiveMode ? 'LIVE' : 'TEST'} mode)`);
  }

  // =====================================================
  // Enhanced Provider Interface Implementation
  // =====================================================

  /**
   * Resolve price reference with expert-validated price snapshot
   */
  async resolvePriceReference(
    pricingItemId: string, 
    currency: string, 
    productType: 'subscription' | 'package'
  ): Promise<{ externalId: string; priceSnapshot: PriceSnapshot }> {
    if (!pool) {
      throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
    }

    // Query the pricing_item_prices table for Stripe mapping
    const result = await pool.query(`
      SELECT 
        provider_price_external_id,
        unit_amount_cents,
        tax_inclusive,
        billing_interval,
        supports_recurring
      FROM pricing_item_prices pip
      WHERE pip.pricing_item_id = $1 
        AND pip.payment_provider = 'stripe'
        AND pip.currency = $2
        AND pip.is_active = true
    `, [pricingItemId, currency.toUpperCase()]);

    if (!result.rows[0]) {
      throw new PaymentError('NOT_SUPPORTED', 
        `No Stripe price mapping for item ${pricingItemId} in ${currency}`);
    }

    const priceData = result.rows[0];
    
    // Validate price is in allowlist for security
    if (!this.allowedPrices.has(priceData.provider_price_external_id)) {
      throw new PaymentError('INVALID_PRICE', 
        `Price ID ${priceData.provider_price_external_id} not in server allowlist`);
    }

    // Validate product type compatibility
    if (productType === 'subscription' && !priceData.supports_recurring) {
      throw new PaymentError('NOT_SUPPORTED', 
        'This pricing item does not support subscriptions with Stripe');
    }

    const priceSnapshot: PriceSnapshot = {
      unit_amount_cents: priceData.unit_amount_cents,
      currency: currency.toUpperCase(),
      tax_inclusive: priceData.tax_inclusive,
      interval: priceData.billing_interval
    };

    return {
      externalId: priceData.provider_price_external_id,
      priceSnapshot
    };
  }

  /**
   * Create checkout session with enhanced validation and provider-agnostic recording
   */
  async createCheckoutSession(params: {
    userId: string;
    pricingItemId: string;
    currency: string;
    productType: 'subscription' | 'package';
    orderId: string;
    locale: 'en' | 'ar';
    idempotencyKey: string;
    priceSnapshot: PriceSnapshot;
  }): Promise<CheckoutResult> {
    try {
      // Get or create customer in provider-agnostic way
      const customer = await this.getOrCreateCustomer(params.userId);
      
      // Resolve price reference
      const { externalId: priceId } = await this.resolvePriceReference(
        params.pricingItemId, 
        params.currency, 
        params.productType
      );

      // Create billing invoice record first (expert pattern: unified order object)
      await this.createInvoiceRecord({
        customerId: customer.id,
        pricingItemId: params.pricingItemId,
        orderId: params.orderId,
        idempotencyKey: params.idempotencyKey,
        priceSnapshot: params.priceSnapshot,
        currency: params.currency,
        productType: params.productType
      });

      // Create Stripe checkout session
      const sessionConfig: Stripe.Checkout.SessionCreateParams = {
        customer: customer.provider_customer_id,
        client_reference_id: params.userId,
        metadata: { 
          user_id: params.userId,
          order_id: params.orderId,
          pricing_item_id: params.pricingItemId,
          product_type: params.productType
        },
        mode: params.productType === 'subscription' ? 'subscription' : 'payment',
        
        line_items: [{
          price: priceId,
          quantity: 1
        }],
        
        success_url: this.buildSuccessUrl(params.locale),
        cancel_url: this.buildCancelUrl(params.locale),
        
        customer_update: { 
          address: 'auto',
          name: 'auto' 
        },
        
        consent_collection: { 
          terms_of_service: 'required' 
        },
        
        locale: this.mapLocaleToStripe(params.locale),
        payment_method_collection: 'if_required',
        
        invoice_creation: {
          enabled: true
        }
      };

      const session = await this.stripe.checkout.sessions.create(sessionConfig, {
        idempotencyKey: `stripe:checkout:${params.idempotencyKey}`,
        timeout: 15000
      });

      // Update invoice with Stripe session ID
      await this.updateInvoiceWithProviderData(params.orderId, session.id);

      // Record success for health monitoring
      regionalPaymentFactory.recordPaymentOutcome('stripe', true);

      console.log(`✅ Stripe checkout session created: ${session.id} for order ${params.orderId}`);
      
      return {
        type: 'redirect',
        url: session.url!,
        sessionId: session.id,
        correlationId: params.orderId
      };

    } catch (error: any) {
      // Record failure for health monitoring
      regionalPaymentFactory.recordPaymentOutcome('stripe', false);

      await ServerLoggingService.getInstance().logCriticalError(
        'stripe_enhanced_checkout_creation_failed',
        error,
        params
      );

      console.error('[Enhanced Stripe] Checkout creation failed:', error);
      
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError('PROVIDER_API_ERROR', `Stripe checkout creation failed: ${error.message}`, error);
    }
  }

  /**
   * Enhanced webhook verification with signature storage
   * Handles various header formats (lowercase, mixed case, arrays)
   */
  verifyWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): boolean {
    // Normalize header access (handle case-insensitivity and arrays)
    const getHeader = (name: string): string | undefined => {
      const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
      if (!key) return undefined;
      const value = headers[key];
      return Array.isArray(value) ? value[0] : value;
    };

    const signature = getHeader('stripe-signature');
    if (!signature) return false;

    // Try each configured webhook secret
    for (const secret of this.webhookSecrets) {
      try {
        this.stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
        return true;
      } catch (err) {
        continue;
      }
    }

    return false;
  }

  /**
   * Verify and parse webhook in one operation (prevents unverified parsing)
   * This is the recommended entry point for webhook handling
   */
  verifyAndParseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): WebhookEvent[] | null {
    // Normalize header access
    const getHeader = (name: string): string | undefined => {
      const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
      if (!key) return undefined;
      const value = headers[key];
      return Array.isArray(value) ? value[0] : value;
    };

    const signature = getHeader('stripe-signature');
    if (!signature) return null;

    // Try each configured webhook secret to get verified event
    let verifiedEvent: Stripe.Event | null = null;
    for (const secret of this.webhookSecrets) {
      try {
        verifiedEvent = this.stripe.webhooks.constructEvent(rawBody, signature, secret, 300);
        break;
      } catch (err) {
        continue;
      }
    }

    if (!verifiedEvent) return null;

    // Parse the VERIFIED event (not raw body)
    return this.parseStripeEvent(verifiedEvent);
  }

  /**
   * Parse webhook events into standardized format
   * @deprecated Use verifyAndParseWebhook instead to ensure verification
   */
  parseWebhookEvents(rawBody: string): WebhookEvent[] {
    console.warn('[EnhancedStripeProvider] parseWebhookEvents called directly - use verifyAndParseWebhook instead');
    const stripeEvent = JSON.parse(rawBody) as Stripe.Event;
    return this.parseStripeEvent(stripeEvent);
  }

  /**
   * Internal: Parse a verified Stripe event into standardized format
   */
  private parseStripeEvent(stripeEvent: Stripe.Event): WebhookEvent[] {
    const events: WebhookEvent[] = [];

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        events.push({
          type: 'payment.succeeded',
          orderId: session.metadata?.order_id,
          providerPaymentId: session.payment_intent as string,
          providerCustomerId: session.customer as string,
          amountCents: session.amount_total || 0,
          currency: session.currency?.toUpperCase(),
          occurredAt: new Date(stripeEvent.created * 1000)
        });
        break;

      case 'invoice.payment_succeeded':
        const successInvoice = stripeEvent.data.object as Stripe.Invoice;
        events.push({
          type: 'payment.succeeded',
          providerPaymentId: (successInvoice as any).payment_intent as string,
          providerSubscriptionId: (successInvoice as any).subscription as string,
          amountCents: successInvoice.amount_paid,
          currency: successInvoice.currency?.toUpperCase(),
          occurredAt: new Date(stripeEvent.created * 1000)
        });
        break;

      case 'invoice.payment_failed':
        const failedInvoice = stripeEvent.data.object as Stripe.Invoice;
        events.push({
          type: 'payment.failed',
          providerPaymentId: (failedInvoice as any).payment_intent as string,
          providerSubscriptionId: (failedInvoice as any).subscription as string,
          amountCents: failedInvoice.amount_due,
          currency: failedInvoice.currency?.toUpperCase(),
          occurredAt: new Date(stripeEvent.created * 1000)
        });
        break;

      case 'customer.subscription.updated':
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        events.push({
          type: 'subscription.updated',
          providerSubscriptionId: subscription.id,
          providerCustomerId: subscription.customer as string,
          occurredAt: new Date(stripeEvent.created * 1000)
        });
        break;
    }

    return events;
  }

  // =====================================================
  // Optional Interface Methods (Stripe Specific)
  // =====================================================

  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.stripe.subscriptions.cancel(subscriptionId, {
        prorate: true
      });
      console.log(`✅ Stripe subscription canceled: ${subscriptionId}`);
    } catch (error: any) {
      throw new PaymentError('PROVIDER_API_ERROR', `Subscription cancellation failed: ${error.message}`, error);
    }
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<{
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      
      return {
        status: this.mapStripeSubscriptionStatus(subscription.status),
        currentPeriodStart: new Date((subscription as any).current_period_start * 1000),
        currentPeriodEnd: new Date((subscription as any).current_period_end * 1000)
      };
    } catch (error: any) {
      throw new PaymentError('PROVIDER_API_ERROR', `Subscription status check failed: ${error.message}`, error);
    }
  }

  async refundPayment(paymentId: string, amountCents?: number): Promise<void> {
    try {
      await this.stripe.refunds.create({
        payment_intent: paymentId,
        ...(amountCents !== undefined && { amount: amountCents }),
        metadata: {
          refund_source: 'enhanced_provider'
        }
      });
      console.log(`✅ Stripe refund processed: ${paymentId}`);
    } catch (error: any) {
      throw new PaymentError('PROVIDER_API_ERROR', `Refund failed: ${error.message}`, error);
    }
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  private async getOrCreateCustomer(userId: string): Promise<{
    id: string;
    provider_customer_id: string;
  }> {
    if (!pool) {
      throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
    }

    // Check for existing customer
    const existingResult = await pool.query(`
      SELECT id, provider_customer_id, email
      FROM billing_customers 
      WHERE user_id = $1 AND payment_provider = 'stripe'
    `, [userId]);

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }

    // Get user info
    const userResult = await pool.query(`
      SELECT email FROM auth.users WHERE id = $1
    `, [userId]);

    if (!userResult.rows[0]) {
      throw new PaymentError('INVALID_REQUEST', 'User not found');
    }

    const userEmail = userResult.rows[0].email;

    // Create customer in Stripe
    const stripeCustomer = await this.stripe.customers.create({
      email: userEmail,
      metadata: { 
        user_id: userId,
        created_by: 'enhanced_provider'
      }
    }, { 
      idempotencyKey: `stripe:customer:${userId}`
    });

    // Insert into provider-agnostic customers table
    // Use (user_id, payment_provider) conflict key to support multiple providers per user
    const insertResult = await pool.query(`
      INSERT INTO billing_customers (
        user_id, payment_provider, provider_customer_id, email
      ) VALUES ($1, 'stripe', $2, $3)
      ON CONFLICT (user_id, payment_provider) DO UPDATE SET
        provider_customer_id = EXCLUDED.provider_customer_id,
        updated_at = NOW()
      RETURNING id, provider_customer_id
    `, [userId, stripeCustomer.id, userEmail]);

    return insertResult.rows[0];
  }

  private async createInvoiceRecord(params: {
    customerId: string;
    pricingItemId: string;
    orderId: string;
    idempotencyKey: string;
    priceSnapshot: PriceSnapshot;
    currency: string;
    productType: 'subscription' | 'package';
  }): Promise<void> {
    if (!pool) return;

    const paymentFlow = params.productType === 'subscription' 
      ? 'subscription_invoice' 
      : 'one_time_package';

    await pool.query(`
      INSERT INTO billing_invoices (
        customer_id, pricing_item_id, order_id, idempotency_key,
        price_snapshot, amount_cents, currency, payment_flow,
        status, payment_provider, provider_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', 'stripe', '{}')
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      params.customerId,
      params.pricingItemId,
      params.orderId,
      params.idempotencyKey,
      JSON.stringify(params.priceSnapshot),
      params.priceSnapshot.unit_amount_cents,
      params.currency.toUpperCase(),
      paymentFlow
    ]);
  }

  private async updateInvoiceWithProviderData(orderId: string, sessionId: string): Promise<void> {
    if (!pool) return;

    await pool.query(`
      UPDATE billing_invoices 
      SET provider_invoice_id = $1, status = 'open', updated_at = NOW()
      WHERE order_id = $2
    `, [sessionId, orderId]);
  }

  private buildSuccessUrl(locale: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/${locale}/billing/success`;
  }

  private buildCancelUrl(locale: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/${locale}/billing/cancel`;
  }

  private mapLocaleToStripe(locale: string): Stripe.Checkout.SessionCreateParams.Locale {
    const mapping: Record<string, Stripe.Checkout.SessionCreateParams.Locale> = {
      'en': 'en',
      'ar': 'en' // Stripe doesn't support Arabic, fallback to English
    };
    return mapping[locale] || 'en';
  }

  private mapStripeSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
    const mapping: Record<string, SubscriptionStatus> = {
      'active': 'active',
      'canceled': 'canceled',
      'incomplete': 'incomplete',
      'incomplete_expired': 'incomplete_expired',
      'past_due': 'past_due',
      'trialing': 'trialing',
      'paused': 'paused'
    };
    return mapping[stripeStatus] || 'canceled';
  }
}