/**
 * Enhanced Payment Service Types for Multi-Provider System
 * 
 * Expert-validated type definitions for payment provider abstraction.
 * Incorporates 3 rounds of expert feedback for operational excellence.
 * 
 * Key Features:
 * - Provider-agnostic interfaces with capability matrix
 * - Enhanced error taxonomy with actionable guidance
 * - Voucher vs redirect checkout result types
 * - E.164 phone and Arabic locale validation
 * - Price snapshot immutability for order protection
 * - Global idempotency fences and audit trails
 */

// =====================================================
// Core Database Enum Types (Match Database Schema)
// =====================================================

export type PaymentProviderKey = 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs';

export type PaymentStatus = 
  | 'created' | 'requires_action' | 'pending' | 'authorized' | 'captured'
  | 'succeeded' | 'failed' | 'canceled' | 'expired';

export type SubscriptionStatus = 
  | 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled' 
  | 'incomplete' | 'incomplete_expired';

export type PaymentFlow = 
  | 'subscription_invoice' | 'one_time_package' | 'cash_voucher' | 'wallet_topup';

// =====================================================
// Enhanced Error Handling (Expert Round 2)
// =====================================================

export class PaymentError extends Error {
  constructor(
    public code: PaymentErrorCode,
    message: string,
    public details?: any,
    public actionRequired?: string              // 🚀 EXPERT R2: Actionable guidance
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export type PaymentErrorCode = 
  | 'NOT_SUPPORTED' | 'REQUIRES_CUSTOMER_ACTION' | 'DECLINED' | 'TIMEOUT' 
  | 'INVALID_REQUEST' | 'MISSING_PHONE' | 'MISSING_LOCALE' | 'INVALID_PHONE'
  | 'CUSTOMER_NOT_FOUND' | 'SUBSCRIPTION_NOT_FOUND' | 'INVALID_PLAN'
  | 'INVALID_PRICE' | 'WEBHOOK_VERIFICATION_FAILED' | 'DUPLICATE_PROCESSING'
  | 'RATE_LIMIT_EXCEEDED' | 'PROVIDER_API_ERROR' | 'DATABASE_ERROR'
  | 'AUTHENTICATION_ERROR' | 'AUTHORIZATION_ERROR' | 'CONFIGURATION_ERROR';

// =====================================================
// Provider Capabilities Matrix (Expert Enhanced)
// =====================================================

export interface ProviderCapabilities {
  supports: {
    subscription: boolean;
    oneTime: boolean;
    partialRefunds: boolean;
    currencies: string[];
    paymentMethods: ('card' | 'wallet' | 'cash' | 'bank_transfer')[];
    webhooks: string[]; // Events we can rely on
  };
  settlementDays: number;
  requiresPhone: boolean;
  requiresArabicLocale: boolean;                // 🚀 EXPERT R2: RTL requirement
  slos: {                                       // 🚀 EXPERT R2: Observable SLOs
    successRateThreshold: number;               // e.g., 0.95 (95%)
    webhookLatencyThresholdMs: number;          // e.g., 60000 (60s)
  };
}

// 🔧 EXPERT FINAL: Enhanced capabilities with SLOs and fallback routing
export const PROVIDER_CAPABILITIES: Record<PaymentProviderKey, ProviderCapabilities> = {
  stripe: {
    supports: {
      subscription: true,
      oneTime: true, 
      partialRefunds: true,
      currencies: ['USD', 'EUR', 'GBP'],
      paymentMethods: ['card', 'bank_transfer'],
      webhooks: ['payment_succeeded', 'invoice_payment_succeeded', 'customer_subscription_updated']
    },
    settlementDays: 2,
    requiresPhone: false,
    requiresArabicLocale: false,
    slos: {
      successRateThreshold: 0.95,
      webhookLatencyThresholdMs: 60000
    }
  },
  fawry: {
    supports: {
      subscription: false,
      oneTime: true,
      partialRefunds: false,
      currencies: ['EGP'],
      paymentMethods: ['cash'],
      webhooks: ['payment_succeeded', 'payment_expired']
    },
    settlementDays: 1,
    requiresPhone: true,
    requiresArabicLocale: true,
    slos: {
      successRateThreshold: 0.90, // Cash payments are less reliable
      webhookLatencyThresholdMs: 120000 // 2 minutes for cash settlement
    }
  },
  paymob: {
    supports: {
      subscription: true,
      oneTime: true,
      partialRefunds: true,
      currencies: ['EGP'],
      paymentMethods: ['card', 'wallet'],
      webhooks: ['payment_succeeded', 'payment_failed', 'subscription_updated']
    },
    settlementDays: 3,
    requiresPhone: true,
    requiresArabicLocale: true,
    slos: {
      successRateThreshold: 0.92,
      webhookLatencyThresholdMs: 90000
    }
  },
  stcpay: {
    supports: {
      subscription: false,
      oneTime: true,
      partialRefunds: true,
      currencies: ['SAR'],
      paymentMethods: ['wallet'],
      webhooks: ['payment_succeeded', 'payment_failed']
    },
    settlementDays: 1,
    requiresPhone: true,
    requiresArabicLocale: true,
    slos: {
      successRateThreshold: 0.94,
      webhookLatencyThresholdMs: 45000
    }
  },
  paytabs: {
    supports: {
      subscription: true,
      oneTime: true,
      partialRefunds: true,
      currencies: ['SAR'],
      paymentMethods: ['card'],
      webhooks: ['payment_succeeded', 'payment_failed', 'subscription_updated']
    },
    settlementDays: 2,
    requiresPhone: true,
    requiresArabicLocale: true,
    slos: {
      successRateThreshold: 0.93,
      webhookLatencyThresholdMs: 75000
    }
  }
};

// 🔧 EXPERT FINAL: Deterministic provider fallback routing
export const PROVIDER_ROUTING_POLICIES = {
  eg: { 
    subscription: ['paymob', 'stripe'], // Cards first, then international fallback
    package: ['fawry', 'paymob']        // Cash first, then cards
  },
  sa: { 
    subscription: ['paytabs', 'stripe'], // Local cards first, then international
    package: ['stcpay', 'paytabs']       // Mobile wallet first, then cards
  },
  us: {
    subscription: ['stripe'],
    package: ['stripe']
  },
  gb: {
    subscription: ['stripe'],
    package: ['stripe']
  },
  eu: {
    subscription: ['stripe'],
    package: ['stripe']
  }
};

// =====================================================
// Enhanced Provider Interface (Expert Validated)
// =====================================================

export interface PriceSnapshot {
  unit_amount_cents: number;
  currency: string;
  tax_inclusive: boolean;
  interval?: string; // For subscriptions
}

export interface ProviderSelectionInput {
  region: string;
  currency: string;
  productType: 'subscription' | 'package'; // 🆕 EXPERT: Critical for routing
  userId?: string; // For user preference detection
}

// 🚀 EXPERT ROUND 2: Better checkout result types (voucher vs redirect)
export type CheckoutResult = 
  | { 
      type: 'redirect';
      url: string;
      sessionId: string;
      expiresAt?: string;
      correlationId: string;
    }
  | {
      type: 'voucher';
      reference: string;
      expiresAt: string;                    // 🔧 EXPERT: RFC3339 timestamp required
      barcodeUrl?: string;
      instructions: string;                 // 🔧 EXPERT: Localized instructions required
      providedMetadata?: Record<string, any>;
      correlationId: string;
    };

export interface WebhookEvent {
  type: 'payment.succeeded' | 'payment.failed' | 'subscription.updated' | 'payment.expired';
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  orderId?: string | undefined;                             // 🚀 EXPERT R2: Tie back to our order ID
  providerEventId?: string | undefined;                     // Unique event ID from provider
  providerPaymentId?: string | undefined;
  providerSubscriptionId?: string | undefined;
  providerCustomerId?: string | undefined;
  amountCents?: number | undefined;
  currency?: string | undefined;
  occurredAt: Date;
  metadata?: Record<string, any> | undefined;               // Provider-specific metadata
}

// Enhanced PaymentProvider interface (simplified from expert's complex version)
export interface PaymentProvider {
  readonly key: PaymentProviderKey;
  
  // 🚀 EXPERT R2: Enhanced price resolution with validation
  resolvePriceReference(pricingItemId: string, currency: string, productType: 'subscription' | 'package'): Promise<{
    externalId: string;
    priceSnapshot: PriceSnapshot;
  }>;
  
  // 🔧 EXPERT FINAL: Contract guarantees for UI integration
  createCheckoutSession(params: {
    userId: string;
    pricingItemId: string;
    currency: string;
    productType: 'subscription' | 'package';
    orderId: string;
    locale: string;                             // 🔧 EXPERT: Required, validated at API edge
    idempotencyKey: string;
    priceSnapshot: PriceSnapshot;
  }): Promise<CheckoutResult>;                  // Voucher or redirect with UI guarantees
  
  // Subscription management (if supported)
  cancelSubscription?(subscriptionId: string): Promise<void>;
  getSubscriptionStatus?(subscriptionId: string): Promise<{
    status: SubscriptionStatus;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
  }>;
  
  // Post-payment actions
  refundPayment?(paymentId: string, amountCents?: number): Promise<void>;
  
  // 🆕 EXPERT: Webhook handling
  verifyWebhook(rawBody: string, headers: Record<string, string>): boolean;
  parseWebhookEvents(rawBody: string): WebhookEvent[];
}

// =====================================================
// Validation Helpers (Expert Round 2)
// =====================================================

export function validatePhoneForProvider(phone: string | null, providerKey: PaymentProviderKey): void {
  const capabilities = PROVIDER_CAPABILITIES[providerKey];
  if (capabilities?.requiresPhone && !phone) {
    throw new PaymentError('MISSING_PHONE', 
      'Phone number required for this payment method',
      { provider: providerKey },
      'Please add a valid phone number to continue'
    );
  }
  if (phone && !isValidE164(phone)) {
    throw new PaymentError('INVALID_PHONE',
      'Phone number must be in E.164 format',
      { phone, expected: '+1234567890' },
      'Please enter phone number with country code (e.g., +201234567890)'
    );
  }
}

export function validateLocaleForProvider(locale: string | null, providerKey: PaymentProviderKey): void {
  const capabilities = PROVIDER_CAPABILITIES[providerKey];
  if (capabilities?.requiresArabicLocale && locale !== 'ar') {
    throw new PaymentError('MISSING_LOCALE',
      'Arabic locale required for this payment provider',
      { provider: providerKey, provided: locale },
      'This payment method requires Arabic language support'
    );
  }
}

function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

// =====================================================
// Database Record Types (Provider-Agnostic)
// =====================================================

export interface CustomerRecord {
  id: string;
  user_id: string;
  payment_provider: PaymentProviderKey;
  provider_customer_id: string;
  email: string;
  phone_number?: string;
  phone_verified: boolean;
  preferred_locale: string;
  preferred_currency: string;
  region_code?: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceRecord {
  id: string;
  customer_id: string;
  pricing_item_id: string;
  order_id: string;
  idempotency_key: string;
  provider_invoice_id?: string;
  price_snapshot: PriceSnapshot;
  amount_cents: number;
  currency: string;
  payment_flow: PaymentFlow;
  status: 'draft' | 'open' | 'paid' | 'void' | 'expired';
  expires_at?: string;
  payment_provider: PaymentProviderKey;
  provider_metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionRecord {
  id: string;
  customer_id: string;
  pricing_item_id: string;
  provider_subscription_id: string;
  plan_key: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  currency: string;
  amount_cents: number;
  payment_provider: PaymentProviderKey;
  provider_metadata: Record<string, any>;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  trial_start?: string;
  trial_end?: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentRecord {
  id: string;
  customer_id: string;
  invoice_id?: string;
  idempotency_key?: string;
  provider_payment_id: string;
  provider_transaction_id?: string;
  amount_cents: number;
  currency: string;
  payment_provider: PaymentProviderKey;
  status: PaymentStatus;
  payment_flow: PaymentFlow;
  payment_method?: string;
  provider_metadata: Record<string, any>;
  exchange_rate_used: number;
  amount_usd_cents: number;
  failure_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface AITimeLedgerRecord {
  id: string;
  user_id: string;
  source_type: 'payment' | 'subscription_credit' | 'voucher' | 'admin_adjustment' | 'rollback';
  source_id?: string;
  seconds_delta: number;
  reason?: string;
  created_by?: string;
  occurred_at: string;
}

// =====================================================
// Legacy Integration Types (For Migration)
// =====================================================

// Keep existing types for backward compatibility during transition
export interface CheckoutParams {
  planId: string;
  authenticatedClaims: {
    userId: string;
    email: string;
    roles: string[];
  };
  locale?: string;
  trial?: boolean;
  idempotencyKey: string;
  correlationId: string;
  userEmail?: string;
  currency?: string;
  promotionCode?: string;
}

// Legacy result type for backward compatibility
export interface LegacyCheckoutResult {
  success: boolean;
  url?: string;
  sessionId?: string;
  correlationId: string;
  error?: string;
}