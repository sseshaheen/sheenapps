/**
 * Billing and Subscription Types
 * Updated to match 0015_stripe_billing_improvements.sql
 */

// ENUM types from database
export type SubscriptionStatus = 
  | 'active'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'past_due'
  | 'paused'
  | 'trialing'
  | 'unpaid'

export type PaymentStatus = 
  | 'succeeded'
  | 'pending'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'

export type PlanName = 'free' | 'starter' | 'growth' | 'scale' | 'pro' | 'enterprise'

export type Currency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'AUD' | 'CAD' | 'AED' | 'SAR' | 'EGP' | 'MAD'

// Database table interfaces
export interface Customer {
  id: string
  user_id: string
  stripe_customer_id: string
  email: string
  created_at: string
  updated_at: string
}

export interface Subscription {
  id: string
  customer_id: string
  stripe_subscription_id: string
  stripe_price_id: string
  plan_name: PlanName
  status: SubscriptionStatus
  currency: Currency
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
  canceled_at?: string
  trial_start?: string
  trial_end?: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  customer_id: string
  stripe_payment_intent_id: string
  amount: number // In cents (was amount_cents)
  currency: Currency
  exchange_rate?: number
  amount_usd?: number // Generated column
  status: PaymentStatus
  stripe_invoice_id?: string
  description?: string
  created_at: string
}

export interface Invoice {
  id: string
  stripe_invoice_id: string
  customer_id: string
  subscription_id?: string
  amount_paid: number
  amount_due: number
  currency: Currency
  exchange_rate?: number
  amount_paid_usd?: number // Generated column
  status: string
  invoice_pdf?: string
  hosted_invoice_url?: string
  created_at: string
  updated_at: string
}

export interface UsageTracking {
  id: string
  user_id: string
  metric_name: 'projects_created' | 'ai_operations' | 'exports' | 'storage_mb'
  metric_value: number
  period_start: string
  period_end: string
  created_at: string
  updated_at: string
}

export interface PlanLimits {
  plan_name: PlanName
  max_projects: number // -1 = unlimited
  max_ai_operations_per_month: number // -1 = unlimited
  max_exports_per_month: number // -1 = unlimited
  max_storage_mb: number // -1 = unlimited
  features: Record<string, boolean>
  created_at: string
  updated_at: string
}

export interface SubscriptionHistory {
  id: string
  subscription_id: string
  action: 'created' | 'updated' | 'canceled' | 'reactivated'
  old_status?: SubscriptionStatus
  new_status?: SubscriptionStatus
  old_plan_name?: string
  new_plan_name?: string
  metadata?: Record<string, any>
  created_at: string
}

// API Response types
export interface UserSubscriptionResponse {
  subscription_id?: string
  plan_name: PlanName
  status: SubscriptionStatus
  current_period_start?: string
  current_period_end?: string
  cancel_at_period_end?: boolean
}

export interface BillingInfo {
  subscription: UserSubscriptionResponse | null
  plan: PlanName
  status: SubscriptionStatus | 'free'
  limits: PlanLimits
  usage: Record<string, number>
}

export interface CreateCheckoutRequest {
  planName: Exclude<PlanName, 'free'>
  currency?: Currency
  successUrl?: string
  cancelUrl?: string
  trial?: boolean
}

export interface CreateCheckoutResponse {
  success: boolean
  sessionId: string
  url: string
}

export interface CreatePortalRequest {
  returnUrl?: string
}

export interface CreatePortalResponse {
  success: boolean
  url: string
}

// Utility types
export interface PlanFeatures {
  custom_domain: boolean
  white_label: boolean
  priority_support: boolean
  advanced_analytics?: boolean
  api_access?: boolean
  collaboration?: boolean
}

export interface UsageLimits {
  projects: {
    used: number
    limit: number
    unlimited: boolean
  }
  ai_generations: {
    used: number
    limit: number
    unlimited: boolean
  }
  exports: {
    used: number
    limit: number
    unlimited: boolean
  }
  storage: {
    used: number // in MB
    limit: number // in MB
    unlimited: boolean
  }
}

// Helper functions
export function isUnlimited(limit: number): boolean {
  return limit === -1
}

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount / 100) // Convert cents to currency unit
}

export function isActiveSubscription(status: SubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing'
}

export function canUpgrade(currentPlan: PlanName): boolean {
  const planOrder: Record<PlanName, number> = {
    free: 0,
    starter: 1,
    growth: 2,
    scale: 3,
    pro: 4,
    enterprise: 5
  }
  return planOrder[currentPlan] < 5
}

export function canDowngrade(currentPlan: PlanName): boolean {
  const planOrder: Record<PlanName, number> = {
    free: 0,
    starter: 1,
    growth: 2,
    scale: 3,
    pro: 4,
    enterprise: 5
  }
  return planOrder[currentPlan] > 0
}

// =============================================================================
// 🆕 ENHANCED BILLING SYSTEM TYPES (v1 Implementation)
// Based on docs/FRONTEND_USAGE_BILLING_INTEGRATION.md
// =============================================================================

// Pricing Catalog Types (New)
export interface PricingCatalog {
  version: string;
  rollover_policy: {
    days: number;
  };
  subscriptions: SubscriptionPlan[];
  packages: Package[];
  currency?: string;  // Expert enhancement - currency-aware responses
  currency_fallback_from?: string;  // Expert enhancement - fallback notifications
}

// Expert recommendation - Currency-aware catalog with fallback support
export interface CurrencyAwareCatalog extends PricingCatalog {
  currency_fallback_from?: string;  // Original requested currency when fallback occurred
}

export interface SubscriptionPlan {
  key: string;
  name: string;
  minutes: number;
  price: number;              // Monthly price (backwards compatibility)
  monthlyPrice: number;       // ✅ NEW: Explicit monthly price
  yearlyPrice: number;        // ✅ NEW: Backend-calculated yearly price
  displayedDiscount?: number; // ✅ NEW: Marketing-safe discount % (0-100)
  yearlyDiscount?: number;    // Database discount % (for reference)
  currency?: SupportedCurrency;
  popular?: boolean;
  features?: string[];
  trial_days?: number;
  bonusDaily?: number;
  monthlyBonusCap?: number;
  rolloverCap?: number;
  taxInclusive: boolean;  // Expert recommendation
  tax_inclusive?: boolean; // Also support snake_case for compatibility
  advisor: {
    eligible: boolean;
    payoutUSD?: number;
  };
}

export interface Package {
  key: string;
  name: string;
  minutes: number;
  price: number;
  currency?: SupportedCurrency;
  popular?: boolean;
  bonus_minutes?: number;
  taxInclusive: boolean;  // Expert recommendation
  tax_inclusive?: boolean; // Also support snake_case for compatibility
}

// Enhanced Balance Types (Replacement for BalanceResponse)
export interface EnhancedBalance {
  version: string;
  plan_key?: string;              // Expert recommendation for frontend gating
  subscription_status?: string;   // Expert recommendation for frontend gating  
  catalog_version?: string;       // Expert recommendation for cache busting
  totals: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
    next_expiry_at: string | null;
  };
  buckets: {
    daily: Array<{ seconds: number; expires_at: string; }>;
    paid: Array<{ seconds: number; expires_at: string; source: string; }>;
  };
  bonus: {
    daily_minutes: number;
    used_this_month_minutes: number;
    monthly_cap_minutes: number;
  };
}

export interface BalanceBucket {
  source: 'daily' | 'subscription' | 'rollover' | 'package' | 'welcome' | 'gift';
  seconds: number;
  expires_at: string | null;
}

// Usage Analytics Types (New)
export interface UsageAnalytics {
  total_seconds: number;
  by_operation: Record<string, number>;
  daily_trend: Array<{
    date: string;
    seconds: number;
  }>;
}

// Billing Events Types (New)
export type BillingEventType = 
  | 'subscription_credit' 
  | 'package_credit'
  | 'daily_bonus'
  | 'consumption'
  | 'rollover_created'
  | 'rollover_discard'
  | 'rollover_discard_pending'
  | 'auto_topup_triggered'
  | 'adjustment';

export interface BillingEvent {
  type: BillingEventType;
  seconds: number;
  reason: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface BillingEventHistory {
  events: BillingEvent[];
}

// Enhanced Error Types (Replacement for WorkerAPIError in billing context)
export interface InsufficientFundsError {
  error: 'INSUFFICIENT_AI_TIME';
  http_status: 402;
  balance_seconds: number;
  breakdown_seconds: {
    bonus_daily: number;
    paid: number;
  };
  suggestions: Array<{
    type: 'package' | 'upgrade';
    key?: string;
    plan?: string;
    minutes?: number;
  }>;
  catalog_version: string;
  resume_token?: string;  // Expert recommendation for retry logic
}

// Expert recommendation - Batch Operations
export interface BatchOperationRequest {
  operation: 'build' | 'plan' | 'export' | 'metadata_generation';
  estimate_seconds: number;
}

export interface BatchOperationResponse {
  sufficient: boolean;
  total_required_seconds: number;
  balance_seconds: number;
  insufficient_operations?: Array<{
    operation: string;
    deficit_seconds: number;
    suggestions: Array<{
      type: 'package' | 'upgrade';
      key?: string;
      plan?: string;
      minutes?: number;
    }>;
  }>;
  resume_token?: string;
}

// Helper functions for new types
export function formatMinutes(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min${minutes !== 1 ? 's' : ''}`;
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

export function isBalanceError(error: any): error is InsufficientFundsError {
  return error?.error === 'INSUFFICIENT_AI_TIME' && error?.http_status === 402;
}

// =============================================================================
// 🆕 MULTI-PROVIDER PAYMENT TYPES (v2 Enhancement)
// Based on docs/MULTI_PROVIDER_FRONTEND_INTEGRATION_PLAN.md
// =============================================================================

// Core Multi-Provider Types
export type PaymentProvider = 'stripe' | 'fawry' | 'paymob' | 'stcpay' | 'paytabs'
export type RegionCode = 'us' | 'ca' | 'gb' | 'eu' | 'eg' | 'sa'
export type SupportedCurrency = Currency // Alias for existing Currency type
export type LocaleCode = 'en' | 'ar'

// Enhanced discriminated union for multi-provider checkout results
export interface MultiProviderCheckoutResultRedirect {
  payment_provider: PaymentProvider
  checkout_type: 'redirect'
  checkout_url: string
  order_id: string
  currency: SupportedCurrency
  server_now: string                    // Expert: Server time sync for accurate timers
  redirect_expires_at?: string          // Expert: Session expiry tracking
  provider_order_reference?: string     // Expert: For support/debugging
  
  // Legacy fields for compatibility
  session_id: string
  unit_amount_cents: number
  display_price: number
  package_minutes: number
}

export interface MultiProviderCheckoutResultVoucher {
  payment_provider: PaymentProvider
  checkout_type: 'voucher'
  order_id: string
  voucher_reference: string
  voucher_expires_at: string
  server_now: string                    // Expert: Server time sync for countdown accuracy
  voucher_barcode_url?: string
  voucher_instructions?: string         // Expert: Sanitized text only (backend handles XSS prevention)
  currency: SupportedCurrency
  
  // Legacy fields for compatibility
  session_id: string
  unit_amount_cents: number
  display_price: number
  package_minutes: number
}

export type MultiProviderCheckoutResult =
  | MultiProviderCheckoutResultRedirect
  | MultiProviderCheckoutResultVoucher

// Type guard helpers (following our GitHub sync action patterns)
export function isVoucherResult(result: MultiProviderCheckoutResult): result is MultiProviderCheckoutResultVoucher {
  return result.checkout_type === 'voucher'
}

export function isRedirectResult(result: MultiProviderCheckoutResult): result is MultiProviderCheckoutResultRedirect {
  return result.checkout_type === 'redirect'
}

// Enhanced API Request Types
export interface MultiProviderPurchaseRequest {
  package_key: string
  currency: SupportedCurrency
  region: RegionCode
  // locale moved to x-sheen-locale header
  idempotencyKey?: string              // Client-side idempotency protection
  phone?: string                       // For providers requiring phone (STC Pay)
  resumeToken?: string                 // For retry scenarios
}

// Voucher Status Polling Types (Expert addition)
export type VoucherStatus = 'open' | 'paid' | 'expired' | 'void'

export interface VoucherStatusResponse {
  order_id: string
  status: VoucherStatus
  payment_provider: PaymentProvider
  updated_at: string
  amount_cents?: number
  currency?: SupportedCurrency
}

// Regional Configuration Types
export interface RegionalConfig {
  region: RegionCode
  default_currency: SupportedCurrency
  supported_currencies: SupportedCurrency[]
  supported_providers: PaymentProvider[]
}

// Enhanced Error Types for Multi-Provider
export interface MultiProviderError {
  error: 'NOT_SUPPORTED' | 'MISSING_PHONE' | 'MISSING_LOCALE' | 'PROVIDER_TIMEOUT' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED'
  message: string
  provider?: PaymentProvider
  region?: RegionCode
  currency?: SupportedCurrency
  actionRequired?: string
  params?: {
    waitTime?: number
    retryAfterSeconds?: number
    suggestedCurrency?: SupportedCurrency
    suggestedProvider?: PaymentProvider
  }
}

// Provider Capability Information
export interface ProviderCapabilities {
  payment_provider: PaymentProvider
  supports: {
    subscription: boolean
    oneTime: boolean
    currencies: SupportedCurrency[]
    paymentMethods: string[]
  }
  requiresPhone: boolean
  requiresArabicLocale: boolean
  regions: RegionCode[]
}

// Helper Functions for Multi-Provider Support
export function getRegionForCurrency(currency: SupportedCurrency): RegionCode {
  const currencyToRegionMap: Record<SupportedCurrency, RegionCode> = {
    'USD': 'us',
    'CAD': 'ca',
    'GBP': 'gb',
    'EUR': 'eu',
    'EGP': 'eg',
    'SAR': 'sa',
    'JPY': 'us',  // Fallback to US
    'AUD': 'us',  // Fallback to US
    'AED': 'sa',  // Fallback to Saudi Arabia
    'MAD': 'eu'   // Fallback to EU
  }
  
  return currencyToRegionMap[currency] || 'us'
}

export function generateIdempotencyKey(operation: string, userId: string, packageKey: string): string {
  const timestamp = Date.now()
  return `${operation}_${userId}_${packageKey}_${timestamp}`
}

export function isMultiProviderError(error: any): error is MultiProviderError {
  return error?.error && ['NOT_SUPPORTED', 'MISSING_PHONE', 'MISSING_LOCALE', 'PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE', 'RATE_LIMITED'].includes(error.error)
}

export function maskPhoneNumber(phone: string): string {
  if (phone.length < 6) return phone
  const countryCode = phone.substring(0, phone.length - 8)
  const lastTwo = phone.slice(-2)
  const firstFour = phone.substring(countryCode.length, countryCode.length + 4)
  return `${countryCode}${firstFour}****${lastTwo}`
}

// =============================================================================
// 🆕 DISCOUNT COUPON TYPES (Phase 1 Implementation)
// Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md
// =============================================================================

export interface PromotionValidationRequest {
  code: string
  package_key: string // Backend will map our package IDs
  currency: SupportedCurrency // Already uppercase
  region: RegionCode // Already lowercase
  totalMinorUnits: number
  locale?: LocaleCode
  context?: {
    sessionId?: string
    checkoutType?: 'redirect' | 'voucher'
  }
}

export interface PromotionValidationResponse {
  valid: boolean
  validationToken?: string // Single-use, 30min validity
  discountType?: 'percentage' | 'fixed_amount'
  discountValue?: number
  discountMinorUnits?: number
  finalAmountMinorUnits?: number
  preferredProvider?: PaymentProvider
  errors?: string[]
  metadata?: {
    promotionName: string // Sanitize with DOMPurify before display
    originalCurrency: string
  }
}

export interface PromotionReservationRequest {
  userId: string
  validationToken: string // Single-use token from validation
  expiresInMinutes?: number
}

export interface PromotionReservationResponse {
  reservationId: string
  discountMinorUnits: number
  finalAmountMinorUnits: number
  provider: PaymentProvider
  displayInfo?: {
    voucherCode?: string
    expiresAt: string
  }
}

// Extend existing MultiProviderPurchaseRequest
export interface MultiProviderPurchaseRequestWithCoupon extends MultiProviderPurchaseRequest {
  promotion_reservation_id?: string
}