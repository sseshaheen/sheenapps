/**
 * Payment Service Types
 * 
 * Comprehensive type definitions for payment processing, subscription management,
 * and Stripe integration. Designed for type safety and clear API contracts.
 */

// =====================================================
// Core Payment Types
// =====================================================

export type PaymentStatus = 'succeeded' | 'failed' | 'pending' | 'canceled' | 'partially_refunded';
export type SubscriptionStatus = 'active' | 'canceled' | 'incomplete' | 'incomplete_expired' | 'past_due' | 'trialing' | 'paused';

// =====================================================
// Authentication & Authorization
// =====================================================

export interface PaymentClaims {
  userId: string;
  email: string;
  roles: string[];
  issued: number;
  expires: number;
  // Organization support for future expansion
  organizationId?: string;
}

// =====================================================
// Payment Provider Interface
// =====================================================

export interface PaymentProvider {
  // Customer Management
  getOrCreateCustomer(userId: string, userEmail: string): Promise<Customer>;
  
  // Checkout & Subscriptions
  createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult>;
  createPortalSession(params: PortalParams): Promise<PortalResult>;
  cancelSubscription(params: CancelParams): Promise<CancelResult>;
  
  // Status & Information
  getSubscriptionStatus(userId: string): Promise<SubscriptionStatusResult>;
  
  // Webhook Processing
  handleWebhook(rawBody: string, signature: string): Promise<void>;
  
  // Security & Validation
  isAllowedPrice(priceId: string): boolean;
}

// =====================================================
// Customer Types
// =====================================================

export interface Customer {
  id: string;
  stripe_customer_id: string;
  email: string;
  user_id?: string; // MVP: User-centric approach
  organization_id?: string; // Future: Organization support
}

// =====================================================
// Checkout Session Types
// =====================================================

export interface CheckoutParams {
  planId: 'free' | 'lite' | 'starter' | 'builder' | 'pro' | 'ultra';
  authenticatedClaims: PaymentClaims;
  locale?: string;
  trial?: boolean;
  idempotencyKey: string;
  correlationId: string;
  userEmail?: string; // Optional override
  currency?: string; // Future: Multi-currency support
  promotionCode?: string; // Promotion code for discount
}

export interface CheckoutResult {
  success: boolean;
  url?: string;
  sessionId?: string;
  correlationId: string;
  error?: string;
}

// =====================================================
// Billing Portal Types
// =====================================================

export interface PortalParams {
  authenticatedClaims: PaymentClaims;
  locale?: string;
  returnUrl?: string;
  correlationId: string;
}

export interface PortalResult {
  success: boolean;
  url?: string;
  correlationId: string;
  error?: string;
}

// =====================================================
// Subscription Management Types
// =====================================================

export interface CancelParams {
  authenticatedClaims: PaymentClaims;
  immediately?: boolean;
  correlationId: string;
}

export interface CancelResult {
  success: boolean;
  canceledImmediately?: boolean;
  correlationId: string;
  error?: string;
}

export interface SubscriptionStatusResult {
  hasSubscription: boolean;
  status: SubscriptionStatus | null;
  planName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
  trialEnd?: string | null;
  isTrialing?: boolean;
}

// =====================================================
// Webhook Processing Types
// =====================================================

export interface WebhookEventData {
  eventId: string;
  eventType: string;
  correlationId: string;
  userId?: string;
  customerId?: string;
  subscriptionId?: string;
}

export interface AccessDecision {
  action: 'grant' | 'revoke' | 'noop';
  until?: Date;
  reason?: string;
}

// =====================================================
// Database Record Types
// =====================================================

export interface CustomerRecord {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  email: string;
  created_at: string;
  updated_at: string;
  organization_id?: string; // Future expansion
}

export interface SubscriptionRecord {
  id: string;
  customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  plan_name: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at?: string;
  trial_start?: string;
  trial_end?: string;
  created_at: string;
  updated_at: string;
  currency: string;
  organization_id?: string;
  is_trial: boolean;
  is_paused: boolean;
  pause_reason?: string;
  resume_at?: string;
}

export interface PaymentRecord {
  id: string;
  customer_id: string;
  stripe_payment_intent_id: string;
  amount: number;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
  stripe_invoice_id?: string;
  currency: string;
  description?: string;
  failure_reason?: string;
}

// =====================================================
// Error Types
// =====================================================

export class PaymentError extends Error {
  constructor(
    public code: PaymentErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export type PaymentErrorCode = 
  | 'CUSTOMER_NOT_FOUND'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'INVALID_PLAN'
  | 'INVALID_PRICE'
  | 'WEBHOOK_VERIFICATION_FAILED'
  | 'DUPLICATE_PROCESSING'
  | 'RATE_LIMIT_EXCEEDED'
  | 'STRIPE_API_ERROR'
  | 'DATABASE_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'CONSULTATION_NOT_FOUND';

// =====================================================
// Configuration Types
// =====================================================

export interface PaymentProviderConfig {
  secretKey: string;
  allowedPrices: Set<string>;
  webhookSecrets: string[];
  isLiveMode: boolean;
  defaultCurrency: string;
}

// =====================================================
// Plan Mapping Types
// =====================================================

export interface PlanMapping {
  planId: string;
  priceIds: Record<string, string>; // currency -> price_id
  name: string;
  features: string[];
  trialDays?: number;
}

export const PLAN_MAPPINGS: Record<string, PlanMapping> = {
  free: {
    planId: 'free',
    priceIds: { usd: '' }, // Free plan has no price ID
    name: 'Free Plan',
    features: ['Basic features', 'Community support'],
    trialDays: 0
  },
  lite: {
    planId: 'lite',
    priceIds: { usd: process.env.STRIPE_PRICE_LITE_USD || '' },
    name: 'Lite Plan',
    features: ['110 minutes monthly', '15 minutes daily bonus', '220 minutes rollover cap'],
    trialDays: 14
  },
  starter: {
    planId: 'starter',
    priceIds: { usd: process.env.STRIPE_PRICE_STARTER_USD || '' },
    name: 'Starter Plan',
    features: ['Basic features', 'Email support'],
    trialDays: 14
  },
  builder: {
    planId: 'builder',
    priceIds: { usd: process.env.STRIPE_PRICE_BUILDER_USD || '' },
    name: 'Builder Plan', 
    features: ['Advanced features', 'Priority support', 'Analytics'],
    trialDays: 14
  },
  pro: {
    planId: 'pro',
    priceIds: { usd: process.env.STRIPE_PRICE_PRO_USD || '' },
    name: 'Pro Plan',
    features: ['Pro features', '24/7 support', 'Custom integrations'],
    trialDays: 14
  },
  ultra: {
    planId: 'ultra',
    priceIds: { usd: process.env.STRIPE_PRICE_ULTRA_USD || '' },
    name: 'Ultra Plan',
    features: ['Enterprise features', 'Dedicated support', 'Custom integrations', 'SLA'],
    trialDays: 14
  }
};