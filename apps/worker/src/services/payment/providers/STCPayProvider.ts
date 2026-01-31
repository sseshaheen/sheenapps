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
 * STC Pay Provider for Saudi Arabia Market
 * 
 * Capabilities:
 * - ❌ Subscriptions: No (wallet limitation)
 * - ✅ One-time payments: Yes
 * - ✅ Currencies: SAR
 * - ✅ Payment methods: Mobile wallet
 * - ✅ Webhooks: payment_succeeded, payment_failed
 * 
 * Requirements:
 * - Phone number: REQUIRED (wallet identification)
 * - Arabic locale: REQUIRED (regulatory requirement)
 * - Settlement: T+1 days
 */
export class STCPayProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'stcpay';
  private clientId: string;
  private clientSecret: string;
  private baseUrl: string;
  private webhookSecret: string;

  constructor() {
    this.clientId = process.env.STCPAY_CLIENT_ID!;
    this.clientSecret = process.env.STCPAY_CLIENT_SECRET!;
    this.webhookSecret = process.env.STCPAY_WEBHOOK_SECRET!;
    this.baseUrl = process.env.STCPAY_BASE_URL || 'https://api.stcpay.com.sa';
    
    if (!this.clientId || !this.clientSecret || !this.webhookSecret) {
      throw new PaymentError(
        'INVALID_REQUEST',
        'Missing STC Pay configuration. Ensure STCPAY_CLIENT_ID, STCPAY_CLIENT_SECRET, and STCPAY_WEBHOOK_SECRET are set.',
        { provider: 'stcpay' },
        'Contact administrator to configure STC Pay credentials'
      );
    }
  }

  async resolvePriceReference(
    pricingItemId: string,
    currency: string,
    productType: 'subscription' | 'package'
  ): Promise<{ externalId: string; priceSnapshot: PriceSnapshot }> {
    // STC Pay doesn't support subscriptions
    if (productType === 'subscription') {
      throw new PaymentError(
        'NOT_SUPPORTED',
        'STC Pay does not support recurring subscriptions',
        { pricingItemId, productType, provider: 'stcpay' },
        'Please choose a different payment method for subscription plans'
      );
    }

    if (!pool) {
      throw new Error('Database pool not initialized');
    }
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT pip.provider_price_external_id, pip.unit_amount_cents, 
               pip.tax_inclusive, pip.supports_recurring
        FROM pricing_item_prices pip
        WHERE pip.pricing_item_id = $1 
          AND pip.payment_provider = 'stcpay'::payment_provider_key
          AND pip.currency = $2 
          AND pip.is_active = true
      `, [pricingItemId, currency]);

      if (result.rows.length === 0) {
        throw new PaymentError(
          'NOT_SUPPORTED',
          `No STC Pay price mapping found for pricing item ${pricingItemId} in ${currency}`,
          { pricingItemId, currency, provider: 'stcpay' },
          'This product is not available with STC Pay'
        );
      }

      const mapping = result.rows[0];

      return {
        externalId: mapping.provider_price_external_id,
        priceSnapshot: {
          unit_amount_cents: mapping.unit_amount_cents,
          currency: currency,
          tax_inclusive: mapping.tax_inclusive
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
    // Validate STC Pay requirements
    validateLocaleForProvider(params.locale, 'stcpay'); // Arabic required
    
    // Get customer and validate phone
    const customer = await this.getOrCreateCustomer(params.userId);
    validatePhoneForProvider(customer.phone_number, 'stcpay'); // Phone required

    // STC Pay doesn't support subscriptions
    if (params.productType === 'subscription') {
      throw new PaymentError(
        'NOT_SUPPORTED',
        'STC Pay does not support recurring subscriptions',
        { productType: params.productType, provider: 'stcpay' },
        'Please choose PayTabs for subscription plans'
      );
    }

    try {
      // Get OAuth access token
      const accessToken = await this.getAccessToken();

      // Create STC Pay payment request
      const stcPayment = await this.createPaymentRequest({
        accessToken,
        amount: params.priceSnapshot.unit_amount_cents / 100, // STC Pay uses SAR, not cents
        currency: params.currency,
        merchantOrderId: params.idempotencyKey,
        customerPhone: customer.phone_number,
        customerEmail: customer.email,
        description: `SheenApps Package Purchase`,
        locale: params.locale
      });

      // Return redirect checkout result
      return {
        type: 'redirect',
        url: stcPayment.checkoutUrl,
        sessionId: stcPayment.orderId,
        correlationId: params.orderId,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes for wallet
      };

    } catch (error) {
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError(
        'TIMEOUT',
        `STC Pay checkout session creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error', provider: 'stcpay' },
        'Please ensure your STC Pay wallet is active and try again'
      );
    }
  }

  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const signature = headers['x-stcpay-signature'] || headers['signature'];
    
    if (!signature) {
      return false;
    }

    try {
      const expectedSignature = this.calculateSTCPaySignature(rawBody);
      return signature === expectedSignature;
    } catch (error) {
      return false;
    }
  }

  parseWebhookEvents(rawBody: string): WebhookEvent[] {
    try {
      const payload = JSON.parse(rawBody);
      const events: WebhookEvent[] = [];

      // STC Pay webhook event structure
      switch (payload.status) {
        case 'PAID':
          events.push({
            type: 'payment.succeeded',
            orderId: payload.merchant_order_id || payload.order_id,
            providerPaymentId: payload.payment_id || payload.transaction_id,
            providerCustomerId: payload.customer_id,
            amountCents: Math.round((payload.amount || 0) * 100), // Convert SAR to cents
            currency: 'SAR',
            occurredAt: new Date(payload.created_at || payload.updated_at || new Date()),
            metadata: {
              walletTransactionId: payload.wallet_transaction_id,
              paymentMethod: 'stcpay_wallet',
              providerMetadata: payload
            }
          });
          break;

        case 'FAILED':
        case 'CANCELLED':
        case 'EXPIRED':
          events.push({
            type: 'payment.failed',
            orderId: payload.merchant_order_id || payload.order_id,
            providerPaymentId: payload.payment_id || payload.transaction_id,
            providerCustomerId: payload.customer_id,
            amountCents: Math.round((payload.amount || 0) * 100),
            currency: 'SAR',
            occurredAt: new Date(payload.created_at || payload.updated_at || new Date()),
            metadata: {
              walletTransactionId: payload.wallet_transaction_id,
              failureReason: payload.failure_reason || payload.status,
              providerMetadata: payload
            }
          });
          break;

        default:
          console.warn('Unknown STC Pay webhook status:', payload.status);
      }

      return events;
    } catch (error) {
      throw new PaymentError(
        'INVALID_REQUEST',
        `Failed to parse STC Pay webhook: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { error: error instanceof Error ? error.message : 'Unknown error', provider: 'stcpay' }
      );
    }
  }

  // STC Pay doesn't support subscriptions
  async cancelSubscription(subscriptionId: string): Promise<void> {
    throw new PaymentError(
      'NOT_SUPPORTED',
      'STC Pay does not support subscriptions',
      { subscriptionId, provider: 'stcpay' },
      'STC Pay is only available for one-time purchases'
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
        WHERE user_id = $1 AND payment_provider = 'stcpay'::payment_provider_key
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

      // Validate phone number for STC Pay
      if (!user.phone_number) {
        throw new PaymentError(
          'MISSING_PHONE',
          'Phone number is required for STC Pay',
          { userId, provider: 'stcpay' },
          'Please add a Saudi phone number to use STC Pay'
        );
      }

      // Insert customer record (STC Pay doesn't have separate customer creation API)
      const insertResult = await client.query(`
        INSERT INTO billing_customers (
          user_id, payment_provider, provider_customer_id, email, 
          phone_number, preferred_locale, preferred_currency, region_code,
          provider_metadata
        ) VALUES ($1, 'stcpay'::payment_provider_key, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        userId,
        userId, // Use userId as provider_customer_id for STC Pay
        user.email,
        user.phone_number,
        'ar', // Arabic required for Saudi
        'SAR',
        'SA',
        JSON.stringify({
          wallet_phone: user.phone_number,
          region: 'saudi_arabia'
        })
      ]);

      return insertResult.rows[0];
    } finally {
      client.release();
    }
  }

  private async getAccessToken(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'payment'
      }).toString()
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`STC Pay OAuth failed: ${error}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  private async createPaymentRequest(paymentData: {
    accessToken: string;
    amount: number;
    currency: string;
    merchantOrderId: string;
    customerPhone: string;
    customerEmail: string;
    description: string;
    locale: 'en' | 'ar';
  }) {
    const response = await fetch(`${this.baseUrl}/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${paymentData.accessToken}`
      },
      body: JSON.stringify({
        amount: paymentData.amount,
        currency: paymentData.currency,
        description: paymentData.description,
        merchant_order_id: paymentData.merchantOrderId,
        customer: {
          phone: paymentData.customerPhone,
          email: paymentData.customerEmail
        },
        return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/billing/success`,
        webhook_url: `${process.env.API_URL}/webhooks/stcpay`,
        language: paymentData.locale === 'ar' ? 'ar' : 'en',
        payment_method: 'stcpay_wallet'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`STC Pay payment creation failed: ${error}`);
    }

    const data = await response.json();
    return {
      orderId: data.id || data.payment_id,
      checkoutUrl: data.checkout_url || data.payment_url,
      paymentId: data.id
    };
  }

  private calculateSTCPaySignature(payload: string): string {
    const crypto = require('crypto');
    
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
  }
}