/**
 * Fawry Payment Provider (Egypt)
 * 
 * Expert-validated implementation for Egyptian market.
 * Demonstrates voucher-based cash payment flow with Arabic locale support.
 * 
 * Key Features:
 * - Cash voucher generation with QR codes
 * - Arabic language support (required)
 * - E.164 phone validation (required)
 * - Provider-agnostic database integration
 * - Webhook handling with signature verification
 */

import crypto from 'crypto';
import { pool } from '../../database';
import { ServerLoggingService } from '../../serverLoggingService';
import {
  PaymentProvider,
  PaymentProviderKey,
  CheckoutResult,
  WebhookEvent,
  PriceSnapshot,
  PaymentError,
  PaymentStatus,
  validatePhoneForProvider,
  validateLocaleForProvider
} from '../enhancedTypes';
import { regionalPaymentFactory } from '../RegionalPaymentFactory';

// Fawry SDK types (would be from actual Fawry SDK)
interface FawrySDKConfig {
  merchantId: string;
  securityKey: string;
  baseUrl: string;
  environment: 'sandbox' | 'production';
}

interface FawryPaymentRequest {
  merchantRefNum: string;
  customerMobile: string;
  customerEmail: string;
  paymentMethod: 'PAYATFAWRY' | 'CARD';
  amount: number;
  itemId: string;
  description: string;
  language: 'ar-eg' | 'en-us';
  expiry: string; // ISO 8601
}

interface FawryPaymentResponse {
  referenceNumber: string;
  paymentUrl: string;
  barcodeUrl: string;
  instructions: string;
  expirationTime: string;
}

interface FawryWebhookEvent {
  type: string;
  statusCode: string;
  merchantRefNumber: string;
  referenceNumber: string;
  amount: number;
  paymentAmount: number;
  fawryFees: number;
  paymentMethod: string;
  paymentTime: string;
  customerMobile: string;
  customerEmail: string;
  signature: string;
}

// Mock Fawry SDK for demonstration
class MockFawrySDK {
  private config: FawrySDKConfig;

  constructor(config: FawrySDKConfig) {
    this.config = config;
  }

  async createPaymentRequest(params: FawryPaymentRequest): Promise<FawryPaymentResponse> {
    // Mock implementation - in real implementation would call Fawry API
    const referenceNumber = `FWR_${Date.now()}`;
    const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
    
    return {
      referenceNumber,
      paymentUrl: `https://www.atfawry.com/pay/${referenceNumber}`,
      barcodeUrl: `https://www.atfawry.com/qr/${referenceNumber}`,
      instructions: params.language === 'ar-eg' 
        ? `ادفع في أي فرع فوري أو ماكينة فوري باستخدام الرقم المرجعي: ${referenceNumber}`
        : `Pay at any Fawry location or machine using reference number: ${referenceNumber}`,
      expirationTime
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    // Mock implementation - in real implementation would verify against Fawry's signature
    const expectedSignature = crypto
      .createHmac('sha256', this.config.securityKey)
      .update(rawBody)
      .digest('hex');
    return signature === expectedSignature;
  }

  generateSignature(data: string): string {
    return crypto
      .createHmac('sha256', this.config.securityKey)
      .update(data)
      .digest('hex');
  }
}

export class FawryProvider implements PaymentProvider {
  readonly key: PaymentProviderKey = 'fawry';
  private fawry: MockFawrySDK;
  private merchantId: string;
  private securityKey: string;

  constructor() {
    const config = this.loadConfig();
    this.fawry = new MockFawrySDK(config);
    this.merchantId = config.merchantId;
    this.securityKey = config.securityKey;

    console.log(`✅ FawryProvider initialized (${config.environment} mode)`);
  }

  // =====================================================
  // Enhanced Provider Interface Implementation
  // =====================================================

  /**
   * Resolve price reference for Fawry (EGP only, one-time payments)
   */
  async resolvePriceReference(
    pricingItemId: string, 
    currency: string, 
    productType: 'subscription' | 'package'
  ): Promise<{ externalId: string; priceSnapshot: PriceSnapshot }> {
    if (!pool) {
      throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
    }

    // Fawry only supports one-time payments in EGP
    if (productType === 'subscription') {
      throw new PaymentError('NOT_SUPPORTED', 
        'Fawry does not support subscription payments',
        { provider: 'fawry', productType },
        'Please use a card-based payment method for subscriptions'
      );
    }

    if (currency.toUpperCase() !== 'EGP') {
      throw new PaymentError('NOT_SUPPORTED', 
        `Fawry only supports EGP currency, got ${currency}`,
        { provider: 'fawry', currency },
        'Please select EGP currency for Fawry payments'
      );
    }

    // Query the pricing_item_prices table for Fawry mapping
    const result = await pool.query(`
      SELECT 
        provider_price_external_id,
        unit_amount_cents,
        tax_inclusive
      FROM pricing_item_prices pip
      WHERE pip.pricing_item_id = $1 
        AND pip.payment_provider = 'fawry'
        AND pip.currency = 'EGP'
        AND pip.is_active = true
    `, [pricingItemId]);

    if (!result.rows[0]) {
      throw new PaymentError('NOT_SUPPORTED', 
        `No Fawry price mapping for item ${pricingItemId} in EGP`,
        { pricingItemId, provider: 'fawry' },
        'This package is not available for cash payment. Please try a different payment method.'
      );
    }

    const priceData = result.rows[0];
    
    const priceSnapshot: PriceSnapshot = {
      unit_amount_cents: priceData.unit_amount_cents,
      currency: 'EGP',
      tax_inclusive: priceData.tax_inclusive
    };

    return {
      externalId: priceData.provider_price_external_id,
      priceSnapshot
    };
  }

  /**
   * Create cash voucher checkout session
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
      // Validate Fawry requirements upfront
      validateLocaleForProvider(params.locale, 'fawry'); // Must be 'ar' for Fawry
      
      // Get customer with phone validation
      const customer = await this.getOrCreateCustomer(params.userId);
      validatePhoneForProvider(customer.phone_number, 'fawry'); // E.164 required

      // Resolve price reference (validates EGP + package-only)
      const { externalId: itemId } = await this.resolvePriceReference(
        params.pricingItemId, 
        params.currency, 
        params.productType
      );

      // Create billing invoice with voucher flow and expiration
      const expirationTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await this.createInvoiceRecord({
        customerId: customer.id,
        pricingItemId: params.pricingItemId,
        orderId: params.orderId,
        idempotencyKey: params.idempotencyKey,
        priceSnapshot: params.priceSnapshot,
        currency: params.currency,
        expirationTime
      });

      // Create Fawry payment request
      const fawryRequest: FawryPaymentRequest = {
        merchantRefNum: params.orderId,
        customerMobile: customer.phone_number!,
        customerEmail: customer.email,
        paymentMethod: 'PAYATFAWRY',
        amount: params.priceSnapshot.unit_amount_cents / 100, // Fawry expects amount in EGP
        itemId: itemId,
        description: await this.getItemDescription(params.pricingItemId, params.locale),
        language: params.locale === 'ar' ? 'ar-eg' : 'en-us',
        expiry: expirationTime.toISOString()
      };

      const fawryResponse = await this.fawry.createPaymentRequest(fawryRequest);

      // Update invoice with Fawry reference
      await this.updateInvoiceWithProviderData(params.orderId, fawryResponse.referenceNumber);

      // Record success for health monitoring
      regionalPaymentFactory.recordPaymentOutcome('fawry', true);

      console.log(`✅ Fawry voucher created: ${fawryResponse.referenceNumber} for order ${params.orderId}`);
      
      return {
        type: 'voucher',
        reference: fawryResponse.referenceNumber,
        expiresAt: fawryResponse.expirationTime,
        barcodeUrl: fawryResponse.barcodeUrl,
        instructions: fawryResponse.instructions,
        providedMetadata: {
          paymentUrl: fawryResponse.paymentUrl,
          customerMobile: customer.phone_number
        },
        correlationId: params.orderId
      };

    } catch (error: any) {
      // Record failure for health monitoring
      regionalPaymentFactory.recordPaymentOutcome('fawry', false);

      await ServerLoggingService.getInstance().logCriticalError(
        'fawry_voucher_creation_failed',
        error,
        params
      );

      console.error('[Fawry] Voucher creation failed:', error);
      
      if (error instanceof PaymentError) {
        throw error;
      }
      
      throw new PaymentError('PROVIDER_API_ERROR', `Fawry voucher creation failed: ${error.message}`, error);
    }
  }

  /**
   * Webhook verification using Fawry signature
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean {
    const signature = headers['x-fawry-signature'] || headers['signature'];
    if (!signature) {
      console.warn('[Fawry] No signature header found');
      return false;
    }

    return this.fawry.verifyWebhookSignature(rawBody, signature);
  }

  /**
   * Parse Fawry webhook events into standardized format
   */
  parseWebhookEvents(rawBody: string): WebhookEvent[] {
    const fawryEvent = JSON.parse(rawBody) as FawryWebhookEvent;
    const events: WebhookEvent[] = [];

    // Map Fawry status codes to our standard events
    switch (fawryEvent.statusCode) {
      case '200': // Payment successful
        events.push({
          type: 'payment.succeeded',
          orderId: fawryEvent.merchantRefNumber,
          providerPaymentId: fawryEvent.referenceNumber,
          amountCents: Math.round(fawryEvent.paymentAmount * 100), // Convert EGP to cents
          currency: 'EGP',
          occurredAt: new Date(fawryEvent.paymentTime)
        });
        break;

      case '647': // Payment failed/expired
        events.push({
          type: 'payment.failed',
          orderId: fawryEvent.merchantRefNumber,
          providerPaymentId: fawryEvent.referenceNumber,
          amountCents: Math.round(fawryEvent.amount * 100),
          currency: 'EGP',
          occurredAt: new Date()
        });
        break;

      case '648': // Payment expired
        events.push({
          type: 'payment.expired',
          orderId: fawryEvent.merchantRefNumber,
          providerPaymentId: fawryEvent.referenceNumber,
          amountCents: Math.round(fawryEvent.amount * 100),
          currency: 'EGP',
          occurredAt: new Date()
        });
        break;

      default:
        console.warn(`[Fawry] Unknown status code: ${fawryEvent.statusCode}`);
    }

    return events;
  }

  // =====================================================
  // Fawry-Specific Methods (No subscriptions supported)
  // =====================================================

  // Fawry doesn't support subscriptions
  async cancelSubscription?(subscriptionId: string): Promise<void> {
    throw new PaymentError('NOT_SUPPORTED', 'Fawry does not support subscriptions');
  }

  async getSubscriptionStatus?(subscriptionId: string): Promise<any> {
    throw new PaymentError('NOT_SUPPORTED', 'Fawry does not support subscriptions');
  }

  // Fawry doesn't support partial refunds
  async refundPayment?(paymentId: string, amountCents?: number): Promise<void> {
    if (amountCents) {
      throw new PaymentError('NOT_SUPPORTED', 'Fawry does not support partial refunds');
    }
    
    // Full refunds would require manual process or different API call
    throw new PaymentError('NOT_SUPPORTED', 
      'Fawry refunds require manual processing',
      { paymentId },
      'Please contact customer support for refund assistance'
    );
  }

  // =====================================================
  // Private Helper Methods
  // =====================================================

  private loadConfig(): FawrySDKConfig {
    const merchantId = process.env.FAWRY_MERCHANT_ID;
    const securityKey = process.env.FAWRY_SECURITY_KEY;
    const baseUrl = process.env.FAWRY_BASE_URL || 'https://atfawry.fawrystaging.com';
    const environment = (process.env.FAWRY_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox';

    if (!merchantId || !securityKey) {
      throw new PaymentError('CONFIGURATION_ERROR', 
        'Missing Fawry configuration: FAWRY_MERCHANT_ID and FAWRY_SECURITY_KEY required'
      );
    }

    return {
      merchantId,
      securityKey,
      baseUrl,
      environment
    };
  }

  private async getOrCreateCustomer(userId: string): Promise<{
    id: string;
    provider_customer_id: string;
    email: string;
    phone_number: string | null;
  }> {
    if (!pool) {
      throw new PaymentError('DATABASE_ERROR', 'Database connection not available');
    }

    // Check for existing Fawry customer
    const existingResult = await pool.query(`
      SELECT id, provider_customer_id, email, phone_number
      FROM billing_customers 
      WHERE user_id = $1 AND payment_provider = 'fawry'
    `, [userId]);

    if (existingResult.rows.length > 0) {
      return existingResult.rows[0];
    }

    // Get user info
    const userResult = await pool.query(`
      SELECT email, phone FROM auth.users WHERE id = $1
    `, [userId]);

    if (!userResult.rows[0]) {
      throw new PaymentError('INVALID_REQUEST', 'User not found');
    }

    const { email, phone } = userResult.rows[0];

    // For Fawry, we use a simple customer ID format
    const fawryCustomerId = `fawry_${userId}`;

    // Insert into provider-agnostic customers table
    const insertResult = await pool.query(`
      INSERT INTO billing_customers (
        user_id, payment_provider, provider_customer_id, email, 
        phone_number, preferred_locale, preferred_currency, region_code
      ) VALUES ($1, 'fawry', $2, $3, $4, 'ar', 'EGP', 'EG')
      ON CONFLICT (user_id) 
      WHERE payment_provider = 'fawry'
      DO UPDATE SET
        email = EXCLUDED.email,
        phone_number = EXCLUDED.phone_number,
        updated_at = NOW()
      RETURNING id, provider_customer_id, email, phone_number
    `, [userId, fawryCustomerId, email, phone]);

    return insertResult.rows[0];
  }

  private async createInvoiceRecord(params: {
    customerId: string;
    pricingItemId: string;
    orderId: string;
    idempotencyKey: string;
    priceSnapshot: PriceSnapshot;
    currency: string;
    expirationTime: Date;
  }): Promise<void> {
    if (!pool) return;

    await pool.query(`
      INSERT INTO billing_invoices (
        customer_id, pricing_item_id, order_id, idempotency_key,
        price_snapshot, amount_cents, currency, payment_flow,
        status, expires_at, payment_provider, provider_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'cash_voucher', 'open', $8, 'fawry', '{}')
      ON CONFLICT (idempotency_key) DO NOTHING
    `, [
      params.customerId,
      params.pricingItemId,
      params.orderId,
      params.idempotencyKey,
      JSON.stringify(params.priceSnapshot),
      params.priceSnapshot.unit_amount_cents,
      params.currency.toUpperCase(),
      params.expirationTime
    ]);
  }

  private async updateInvoiceWithProviderData(orderId: string, referenceNumber: string): Promise<void> {
    if (!pool) return;

    await pool.query(`
      UPDATE billing_invoices 
      SET 
        provider_invoice_id = $1, 
        provider_metadata = jsonb_build_object('reference_number', $1),
        updated_at = NOW()
      WHERE order_id = $2
    `, [referenceNumber, orderId]);
  }

  private async getItemDescription(pricingItemId: string, locale: 'en' | 'ar'): Promise<string> {
    if (!pool) return 'SheenApps Package';

    const result = await pool.query(`
      SELECT display_name FROM pricing_items WHERE id = $1
    `, [pricingItemId]);

    if (result.rows[0]) {
      const displayName = result.rows[0].display_name;
      return locale === 'ar' 
        ? `حزمة شين آبس - ${displayName}`
        : `SheenApps ${displayName} Package`;
    }

    return locale === 'ar' ? 'حزمة شين آبس' : 'SheenApps Package';
  }
}