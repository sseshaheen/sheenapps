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
 * Paymob Provider for Egypt Market
 * 
 * Capabilities:
 * - ✅ Subscriptions: Yes (card tokenization)
 * - ✅ One-time payments: Yes
 * - ✅ Currencies: EGP
 * - ✅ Payment methods: Cards, wallets, installments
 * - ✅ Webhooks: payment_succeeded, payment_failed, subscription_updated
 * 
 * Requirements:
 * - Phone number: Recommended but not required
 * - Arabic locale: Recommended for better UX
 * - Settlement: T+2 days
 */
export class PaymobProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'paymob';
  private apiKey: string;
  private integrationId: string;
  private iframeId: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.PAYMOB_API_KEY!;
    this.integrationId = process.env.PAYMOB_INTEGRATION_ID!;
    this.iframeId = process.env.PAYMOB_IFRAME_ID!;
    this.baseUrl = process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com/api';
    
    if (!this.apiKey || !this.integrationId || !this.iframeId) {
      throw new PaymentError(
        'INVALID_REQUEST',
        'Missing Paymob configuration. Ensure PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, and PAYMOB_IFRAME_ID are set.',
        { provider: 'paymob' },
        'Contact administrator to configure Paymob credentials'
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
          AND pip.payment_provider = 'paymob'::payment_provider_key
          AND pip.currency = $2 
          AND pip.is_active = true
      `, [pricingItemId, currency]);

      if (result.rows.length === 0) {
        throw new PaymentError(
          'NOT_SUPPORTED',
          `No Paymob price mapping found for pricing item ${pricingItemId} in ${currency}`,
          { pricingItemId, currency, provider: 'paymob' },
          'This product is not available with Paymob payment method'
        );
      }

      const mapping = result.rows[0];

      // Validate product type compatibility
      if (productType === 'subscription' && !mapping.supports_recurring) {
        throw new PaymentError(
          'NOT_SUPPORTED',
          `Paymob price mapping for ${pricingItemId} does not support recurring subscriptions`,
          { pricingItemId, productType, provider: 'paymob' },
          'This subscription plan is not available with Paymob'
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
    // Validate provider requirements
    validateLocaleForProvider(params.locale, 'paymob'); // Recommended for better UX

    try {
      // Get or create customer
      const customer = await this.getOrCreateCustomer(params.userId);

      // Create Paymob order
      const paymobOrder = await this.createPaymobOrder({
        amountCents: params.priceSnapshot.unit_amount_cents,
        currency: params.currency,
        merchantOrderId: params.idempotencyKey,
        customerId: customer.provider_customer_id,
        userId: params.userId,
        productType: params.productType,
        locale: params.locale
      });

      // Create payment key for iframe
      const paymentKey = await this.createPaymentKey({
        orderId: paymobOrder.id,
        amountCents: params.priceSnapshot.unit_amount_cents,
        currency: params.currency,
        integrationId: this.integrationId,
        billingData: {
          email: customer.email,
          phone_number: customer.phone_number,
          first_name: customer.provider_metadata.first_name || '',
          last_name: customer.provider_metadata.last_name || '',
          country: 'EG',
          state: 'Cairo', // Default for Egypt
          city: 'Cairo'
        }
      });

      // Return redirect checkout result
      return {
        type: 'redirect',
        url: `https://accept.paymob.com/api/acceptance/iframes/${this.iframeId}?payment_token=${paymentKey.token}`,
        sessionId: paymobOrder.id.toString(),
        correlationId: params.orderId,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes
      };

    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError(
        'TIMEOUT',
        `Paymob checkout session creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error', provider: 'paymob' },
        'Please try again or contact support if the problem persists'
      );
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const hmacHeader = headers['x-paymob-signature'] || headers['x-webhook-signature'];
    
    if (!hmacHeader) {
      return false;
    }

    try {
      const expectedSignature = this.calculatePaymobSignature(rawBody);
      return hmacHeader === expectedSignature;
    } catch (error) {
      return false;
    }
  }

  parseWebhookEvents(rawBody: string): WebhookEvent[] {
    try {
      const payload = JSON.parse(rawBody);
      const events: WebhookEvent[] = [];

      // Paymob webhook structure varies by event type
      switch (payload.type) {
        case 'TRANSACTION':
          if (payload.obj && payload.obj.success === true) {
            events.push({
              type: 'payment.succeeded',
              orderId: payload.obj.order?.merchant_order_id,
              providerPaymentId: payload.obj.id?.toString(),
              providerCustomerId: payload.obj.order?.customer_id?.toString(),
              amountCents: payload.obj.amount_cents,
              currency: payload.obj.currency?.toUpperCase(),
              occurredAt: new Date(payload.obj.created_at),
              metadata: {
                paymobOrderId: payload.obj.order?.id,
                providerMetadata: payload.obj
              }
            });
          } else if (payload.obj && payload.obj.success === false) {
            events.push({
              type: 'payment.failed',
              orderId: payload.obj.order?.merchant_order_id,
              providerPaymentId: payload.obj.id?.toString(),
              providerCustomerId: payload.obj.order?.customer_id?.toString(),
              amountCents: payload.obj.amount_cents,
              currency: payload.obj.currency?.toUpperCase(),
              occurredAt: new Date(payload.obj.created_at),
              metadata: {
                paymobOrderId: payload.obj.order?.id,
                providerMetadata: payload.obj
              }
            });
          }
          break;

        case 'TOKEN':
          // Card tokenization event for subscriptions
          if (payload.obj && payload.obj.token) {
            events.push({
              type: 'subscription.updated', // We'll handle this as subscription setup
              orderId: payload.obj.order?.merchant_order_id,
              providerCustomerId: payload.obj.customer_id?.toString(),
              occurredAt: new Date(payload.obj.created_at),
              metadata: {
                cardToken: payload.obj.token,
                maskedPan: payload.obj.masked_pan,
                providerMetadata: payload.obj
              }
            });
          }
          break;

        default:
          // Unknown event type - log but don't throw
          console.warn('Unknown Paymob webhook event type:', payload.type);
      }

      return events;
    } catch (error) {
      throw new PaymentError(
        'INVALID_REQUEST',
        `Failed to parse Paymob webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error', provider: 'paymob' }
      );
    }
  }

  // Optional subscription management (if supported by Paymob)
  async cancelSubscription(subscriptionId: string): Promise<void> {
    // Paymob subscription cancellation would go here
    // For MVP, we'll handle this manually through admin interface
    throw new PaymentError(
      'NOT_SUPPORTED',
      'Subscription cancellation not yet implemented for Paymob',
      { subscriptionId, provider: 'paymob' },
      'Please contact support to cancel your subscription'
    );
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
        WHERE user_id = $1 AND payment_provider = 'paymob'::payment_provider_key
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

      // Create Paymob customer
      const paymobCustomer = await this.createPaymobCustomer({
        first_name: user.email.split('@')[0], // Default from email
        last_name: '',
        email: user.email,
        phone_number: user.phone_number
      });

      // Insert customer record
      const insertResult = await client.query(`
        INSERT INTO billing_customers (
          user_id, payment_provider, provider_customer_id, email, 
          phone_number, preferred_locale, preferred_currency, region_code,
          provider_metadata
        ) VALUES ($1, 'paymob'::payment_provider_key, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId,
        paymobCustomer.id.toString(),
        user.email,
        user.phone_number,
        'ar', // Default to Arabic for Egypt
        'EGP',
        'EG',
        JSON.stringify({
          first_name: paymobCustomer.first_name,
          last_name: paymobCustomer.last_name,
          paymob_customer_id: paymobCustomer.id
        })
      ]);

      return insertResult.rows[0];
    } finally {
      client.release();
    }
  }

  private async createPaymobCustomer(customerData: {
    first_name: string;
    last_name: string;
    email: string;
    phone_number?: string;
  }) {
    const response = await fetch(`${this.baseUrl}/ecommerce/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        merchant_id: parseInt(process.env.PAYMOB_MERCHANT_ID!),
        first_name: customerData.first_name,
        last_name: customerData.last_name,
        email: customerData.email,
        phone_number: customerData.phone_number || '',
        api_key: this.apiKey
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Paymob customer creation failed: ${error}`);
    }

    return await response.json();
  }

  private async createPaymobOrder(orderData: {
    amountCents: number;
    currency: string;
    merchantOrderId: string;
    customerId: string;
    userId: string;
    productType: 'subscription' | 'package';
    locale: 'en' | 'ar';
  }) {
    const response = await fetch(`${this.baseUrl}/ecommerce/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        delivery_needed: false,
        amount_cents: orderData.amountCents,
        currency: orderData.currency,
        merchant_order_id: orderData.merchantOrderId,
        customer_id: parseInt(orderData.customerId),
        items: [{
          name: `SheenApps ${orderData.productType === 'subscription' ? 'Subscription' : 'Package'}`,
          amount_cents: orderData.amountCents,
          description: `AI-powered app builder ${orderData.productType}`,
          quantity: 1
        }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Paymob order creation failed: ${error}`);
    }

    return await response.json();
  }

  private async createPaymentKey(paymentData: {
    orderId: number;
    amountCents: number;
    currency: string;
    integrationId: string;
    billingData: any;
  }) {
    const response = await fetch(`${this.baseUrl}/acceptance/payment_keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        amount_cents: paymentData.amountCents,
        expiration: 3600, // 1 hour
        order_id: paymentData.orderId,
        billing_data: paymentData.billingData,
        currency: paymentData.currency,
        integration_id: parseInt(paymentData.integrationId)
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Paymob payment key creation failed: ${error}`);
    }

    return await response.json();
  }

  private calculatePaymobSignature(payload: string): string {
    // Paymob uses HMAC-SHA512 for webhook signatures
    const crypto = require('crypto');
    const secret = process.env.PAYMOB_WEBHOOK_SECRET!;
    
    return crypto
      .createHmac('sha512', secret)
      .update(payload)
      .digest('hex');
  }
}