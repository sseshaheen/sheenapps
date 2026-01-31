import type { SupportedCurrency, RegionCode, PaymentProvider } from '@/types/billing'

export interface PromotionRequest {
  name: string
  description?: string
  discount_type: 'percentage' | 'fixed_amount'
  discount_value: number
  currency?: SupportedCurrency // Required for fixed_amount
  codes: string[]
  
  // Multi-provider fields
  supported_providers?: PaymentProvider[] // ⚠️ EXPERT: Send undefined instead of [] to avoid DB constraint violations
  checkout_type_restrictions?: CheckoutType[] // ⚠️ EXPERT: Send undefined instead of [] to avoid DB constraint violations
  minimum_order_amount?: number
  minimum_order_currency?: SupportedCurrency
  
  // Usage limits
  max_total_uses?: number
  max_uses_per_user?: number
  valid_from?: string
  valid_until?: string
  
  // Regional config
  regional_configs?: {
    region_code: RegionCode
    preferred_providers?: PaymentProvider[]
    localized_name?: Record<string, string>
  }[] // ⚠️ EXPERT: Send undefined instead of [] to avoid DB constraint violations
}

export interface PromotionValidationRequest {
  promotion_config: PromotionRequest
  test_scenarios: Array<{
    region: RegionCode
    currency: SupportedCurrency
    order_amount: number
    provider: PaymentProvider
  }>
}

export interface PromotionValidationResponse {
  valid: boolean
  warnings: string[]
  scenario_results: Array<{
    eligible: boolean
    discount_amount: number
    final_amount: number
    selected_provider: PaymentProvider
  }>
}

// ✅ EXPERT FIX: Align with actual backend response format
export interface ProviderCapabilities {
  key: PaymentProvider
  name: string
  supported_currencies: SupportedCurrency[]
  supported_regions: RegionCode[]
  checkout_types: ('voucher' | 'redirect')[] // ✅ EXPERT: Matches backend exactly
  status?: 'active' | 'maintenance' | 'disabled' // ✅ EXPERT: From backend
  features?: {
    supports_percentage_discount?: boolean
    supports_fixed_discount?: boolean
    supports_minimum_order?: boolean
    max_discount_percentage?: number
    max_fixed_discount?: Record<string, number> // Per currency limits
  }
}

// ✅ EXPERT PATTERN: Derive booleans client-side from backend data
export interface DerivedProviderFeatures {
  supports_vouchers: boolean // Derived from checkout_types.includes('voucher')
  supports_redirect: boolean // Derived from checkout_types.includes('redirect')
  is_active: boolean // Derived from status !== 'disabled'
}

export type CheckoutType = 'voucher' | 'redirect'

// Regional defaults response interface
export interface RegionalDefaults {
  providers: PaymentProvider[]
  currency: SupportedCurrency
  _fallback?: boolean // Flag for UI to show info banner
}

// Create promotion response
export interface CreatePromotionResponse {
  id: string
  status: string
  _isIdempotent?: boolean // Flag for UI to show "already exists" message
  warnings?: string[] // Include any backend warnings
}