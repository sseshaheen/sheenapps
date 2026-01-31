import {
  PaymentProvider,
  PaymentProviderKey,
  CheckoutResult,
  WebhookEvent,
  PriceSnapshot,
  PaymentError,
  validatePhoneForProvider,
  validateLocaleForProvider
} from '../enhancedTypes';
import { pool } from '../../database';

/**
 * PayTabs Provider for Saudi Arabia Market
 * 
 * Capabilities:
 * - ✅ Subscriptions: Yes (Mada card support)
 * - ✅ One-time payments: Yes
 * - ✅ Currencies: SAR, USD, EUR
 * - ✅ Payment methods: Cards (Visa, Mastercard, Mada)
 * - ✅ Webhooks: payment_succeeded, payment_failed, subscription_updated
 * 
 * Requirements:
 * - Phone number: Optional (recommended)
 * - Arabic locale: Optional (recommended for better UX)
 * - Settlement: T+2 days
 */
export class PayTabsProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'paytabs';
  private serverKey: string;
  private profileId: string;
  private baseUrl: string;
  private webhookSecret: string;

  constructor() {
    this.serverKey = process.env.PAYTABS_SERVER_KEY!;
    this.profileId = process.env.PAYTABS_PROFILE_ID!;
    this.webhookSecret = process.env.PAYTABS_WEBHOOK_SECRET!;
    this.baseUrl = process.env.PAYTABS_BASE_URL || 'https://secure.paytabs.com';
    
    if (!this.serverKey || !this.profileId) {
      throw new PaymentError(
        'INVALID_REQUEST',
        'Missing PayTabs configuration. Ensure PAYTABS_SERVER_KEY and PAYTABS_PROFILE_ID are set.',
        { provider: 'paytabs' },
        'Contact administrator to configure PayTabs credentials'
      );
    }
  }

  async resolvePriceReference(
    pricingItemId: string,
    currency: string,
    productType: 'subscription' | 'package'
  ): Promise<{ externalId: string; priceSnapshot: PriceSnapshot }> {
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT pip.provider_price_external_id, pip.unit_amount_cents, 
               pip.tax_inclusive, pip.billing_interval, pip.supports_recurring
        FROM pricing_item_prices pip
        WHERE pip.pricing_item_id = $1 
          AND pip.payment_provider = 'paytabs'::payment_provider_key
          AND pip.currency = $2 
          AND pip.is_active = true
      `, [pricingItemId, currency]);

      if (result.rows.length === 0) {
        throw new PaymentError(
          'NOT_SUPPORTED',
          `No PayTabs price mapping found for pricing item ${pricingItemId} in ${currency}`,
          { pricingItemId, currency, provider: 'paytabs' },
          'This product is not available with PayTabs payment method'
        );
      }

      const mapping = result.rows[0];

      // Validate product type compatibility
      if (productType === 'subscription' && !mapping.supports_recurring) {
        throw new PaymentError(
          'NOT_SUPPORTED',
          `PayTabs price mapping for ${pricingItemId} does not support recurring subscriptions`,
          { pricingItemId, productType, provider: 'paytabs' },
          'This subscription plan is not available with PayTabs'
        );
      }

      return {
        externalId: mapping.provider_price_external_id,
        priceSnapshot: {
          unit_amount_cents: mapping.unit_amount_cents,
          currency: currency,
          tax_inclusive: mapping.tax_inclusive,
          interval: mapping.billing_interval
        }
      };
    } finally {
      client.release();
    }
  }

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
      // Get or create customer
      const customer = await this.getOrCreateCustomer(params.userId);

      // Create PayTabs payment page
      const payTabsPayment = await this.createPaymentPage({
        amount: params.priceSnapshot.unit_amount_cents / 100, // PayTabs uses currency units, not cents
        currency: params.currency,
        merchantOrderId: params.idempotencyKey,
        customerEmail: customer.email,
        customerPhone: customer.phone_number,
        productType: params.productType,
        locale: params.locale,
        description: `SheenApps ${params.productType === 'subscription' ? 'Subscription' : 'Package'}`,
        isRecurring: params.productType === 'subscription',
        billingInterval: params.priceSnapshot.interval
      });

      // Return redirect checkout result
      return {
        type: 'redirect',
        url: payTabsPayment.redirectUrl,
        sessionId: payTabsPayment.tranRef,
        correlationId: params.orderId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      };

    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError(
        'TIMEOUT',
        `PayTabs checkout session creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error', provider: 'paytabs' },
        'Please try again or contact support if the problem persists'
      );
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const signature = headers['x-paytabs-signature'] || headers['signature'];
    
    if (!signature) {
      return false;
    }

    try {
      const expectedSignature = this.calculatePayTabsSignature(rawBody);
      return signature === expectedSignature;
    } catch (error) {
      return false;
    }
  }

  parseWebhookEvents(rawBody: string): WebhookEvent[] {
    try {
      const payload = JSON.parse(rawBody);
      const events: WebhookEvent[] = [];

      // PayTabs webhook event structure
      switch (payload.payment_result?.response_status) {
        case 'A': // Authorized/Approved
          if (payload.tran_type === 'Sale') {
            events.push({
              type: 'payment.succeeded',
              orderId: payload.cart_id,
              providerPaymentId: payload.tran_ref,
              providerCustomerId: payload.customer_details?.email,
              amountCents: Math.round((payload.tran_total || 0) * 100),
              currency: payload.tran_currency?.toUpperCase(),
              occurredAt: new Date(payload.tran_date || new Date()),
              metadata: {
                tranRef: payload.tran_ref,
                paymentMethod: payload.payment_result?.payment_info_type,
                cardMasked: payload.payment_result?.payment_info,
                authCode: payload.payment_result?.auth_code,
                providerMetadata: payload
              }
            });
          } else if (payload.tran_type === 'Auth') {
            // Subscription setup completed
            events.push({
              type: 'subscription.updated',
              orderId: payload.cart_id,
              providerPaymentId: payload.tran_ref,
              providerCustomerId: payload.customer_details?.email,
              occurredAt: new Date(payload.tran_date || new Date()),
              metadata: {
                tranRef: payload.tran_ref,
                subscriptionSetup: true,
                cardToken: payload.payment_token,
                providerMetadata: payload
              }
            });
          }
          break;

        case 'D': // Declined
        case 'E': // Error
        case 'P': // Pending (treat as failed for now)
        case 'V': // Voided
          events.push({
            type: 'payment.failed',
            orderId: payload.cart_id,
            providerPaymentId: payload.tran_ref,
            providerCustomerId: payload.customer_details?.email,
            amountCents: Math.round((payload.tran_total || 0) * 100),
            currency: payload.tran_currency?.toUpperCase(),
            occurredAt: new Date(payload.tran_date || new Date()),
            metadata: {
              failureReason: payload.payment_result?.response_message || payload.payment_result?.response_status,
              responseCode: payload.payment_result?.response_code,
              tranRef: payload.tran_ref,
              providerMetadata: payload
            }
          });
          break;

        default:
          console.warn('Unknown PayTabs webhook response status:', payload.payment_result?.response_status);
      }

      return events;
    } catch (error) {
      throw new PaymentError(
        'INVALID_REQUEST',
        `Failed to parse PayTabs webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error', provider: 'paytabs' }
      );
    }
  }

  // Subscription management
  async cancelSubscription(subscriptionId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/payment/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.serverKey
        },
        body: JSON.stringify({
          profile_id: this.profileId,
          tran_ref: subscriptionId,
          tran_type: 'Void'
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`PayTabs subscription cancellation failed: ${error}`);
      }

      const result = await response.json();
      if (result.payment_result?.response_status !== 'A') {
        throw new Error(`Subscription cancellation rejected: ${result.payment_result?.response_message}`);
      }
    } catch (error) {
      throw new PaymentError(
        'TIMEOUT',
        `Failed to cancel PayTabs subscription: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { subscriptionId, provider: 'paytabs' },
        'Please contact support to cancel your subscription'
      );
    }
  }

  async getSubscriptionStatus(subscriptionId: string): Promise<{
    status: any; // subscription_status enum
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/payment/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.serverKey
        },
        body: JSON.stringify({
          profile_id: this.profileId,
          tran_ref: subscriptionId
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`PayTabs subscription query failed: ${error}`);
      }

      const result = await response.json();
      
      // Map PayTabs status to our canonical status
      const status = this.mapPayTabsStatus(result.payment_result?.response_status);
      
      // PayTabs doesn't provide period info in query, we'll need to calculate
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1); // Assume monthly for now

      return {
        status,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd
      };
    } catch (error) {
      throw new PaymentError(
        'TIMEOUT',
        `Failed to get PayTabs subscription status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { subscriptionId, provider: 'paytabs' }
      );
    }
  }

  // Private helper methods

  private async getOrCreateCustomer(userId: string) {
    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const client = await pool.connect();
    try {
      // Check if customer exists
      let result = await client.query(`
        SELECT * FROM billing_customers 
        WHERE user_id = $1 AND payment_provider = 'paytabs'::payment_provider_key
      `, [userId]);

      if (result.rows.length > 0) {
        return result.rows[0];
      }

      // Get user details
      const userResult = await client.query(`
        SELECT email, phone_number FROM auth.users WHERE id = $1
      `, [userId]);

      if (userResult.rows.length === 0) {
        throw new PaymentError('INVALID_REQUEST', 'User not found', { userId });
      }

      const user = userResult.rows[0];

      // Insert customer record (PayTabs doesn't require separate customer creation)
      const insertResult = await client.query(`
        INSERT INTO billing_customers (
          user_id, payment_provider, provider_customer_id, email, 
          phone_number, preferred_locale, preferred_currency, region_code,
          provider_metadata
        ) VALUES ($1, 'paytabs'::payment_provider_key, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId,
        user.email, // Use email as provider_customer_id for PayTabs
        user.email,
        user.phone_number,
        'ar', // Default to Arabic for Saudi
        'SAR',
        'SA',
        JSON.stringify({
          email: user.email,
          phone: user.phone_number,
          region: 'saudi_arabia'
        })
      ]);

      return insertResult.rows[0];
    } finally {
      client.release();
    }
  }

  private async createPaymentPage(paymentData: {
    amount: number;
    currency: string;
    merchantOrderId: string;
    customerEmail: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    customerPhone?: string | undefined;
    productType: 'subscription' | 'package';
    locale: 'en' | 'ar';
    description: string;
    isRecurring: boolean;
    billingInterval?: string | undefined;
  }) {
    const payload = {
      profile_id: this.profileId,
      tran_type: paymentData.isRecurring ? 'Auth' : 'Sale', // Auth for subscription setup, Sale for one-time
      tran_class: paymentData.isRecurring ? 'recurring' : 'ecom',
      cart_id: paymentData.merchantOrderId,
      cart_description: paymentData.description,
      cart_currency: paymentData.currency,
      cart_amount: paymentData.amount,
      paypage_lang: paymentData.locale === 'ar' ? 'ar' : 'en',
      customer_details: {
        name: paymentData.customerEmail.split('@')[0], // Default from email
        email: paymentData.customerEmail,
        phone: paymentData.customerPhone || '',
        street1: 'N/A',
        city: 'Riyadh',
        state: 'Riyadh Province',
        country: 'SA',
        zip: '11564'
      },
      shipping_details: {
        name: paymentData.customerEmail.split('@')[0],
        email: paymentData.customerEmail,
        phone: paymentData.customerPhone || '',
        street1: 'N/A',
        city: 'Riyadh',
        state: 'Riyadh Province',
        country: 'SA',
        zip: '11564'
      },
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/success`,
      callback_url: `${process.env.API_URL}/webhooks/paytabs`,
      hide_shipping: true,
      framed: false
    };

    // Add recurring-specific fields
    if (paymentData.isRecurring) {
      Object.assign(payload, {
        recurring_details: {
          recurring_interval: paymentData.billingInterval === 'year' ? 12 : 1,
          recurring_interval_mode: paymentData.billingInterval === 'year' ? 'M' : 'M', // Monthly intervals
          recurring_start_date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
          recurring_currency: paymentData.currency,
          recurring_amount: paymentData.amount
        }
      });
    }

    const response = await fetch(`${this.baseUrl}/payment/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': this.serverKey
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`PayTabs payment page creation failed: ${error}`);
    }

    const result = await response.json();
    
    if (!result.redirect_url) {
      throw new Error(`PayTabs payment page creation failed: ${result.result || 'Unknown error'}`);
    }

    return {
      redirectUrl: result.redirect_url,
      tranRef: result.tran_ref,
      paymentToken: result.payment_token
    };
  }

  private calculatePayTabsSignature(payload: string): string {
    if (!this.webhookSecret) {
      return ''; // Skip verification if no secret configured
    }

    const crypto = require('crypto');
    
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
  }

  private mapPayTabsStatus(payTabsStatus: string): any {
    switch (payTabsStatus) {
      case 'A': return 'active';
      case 'D': return 'canceled';
      case 'E': return 'incomplete';
      case 'P': return 'past_due';
      case 'V': return 'canceled';
      default: return 'incomplete';
    }
  }
}