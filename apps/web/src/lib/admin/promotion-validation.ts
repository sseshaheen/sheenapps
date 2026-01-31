import type { 
  PromotionRequest, 
  ProviderCapabilities, 
  DerivedProviderFeatures 
} from '@/types/admin-promotions'
import type { SupportedCurrency, PaymentProvider, RegionCode } from '@/types/billing'

// ✅ EXPERT PATTERN: Prevent database constraint violations
// ✅ EXPERT FINAL: Belt-and-suspenders normalization
export function normalizePromotionPayload(request: PromotionRequest): PromotionRequest {
  return {
    ...request,
    // ✅ EXPERT: DB constraint "no empty arrays" - send undefined instead
    supported_providers: request.supported_providers?.length ? request.supported_providers : undefined,
    checkout_type_restrictions: request.checkout_type_restrictions?.length ? request.checkout_type_restrictions : undefined,
    regional_configs: request.regional_configs?.length ? request.regional_configs?.map(config => ({
      ...config,
      region_code: config.region_code.toLowerCase() as RegionCode // ✅ EXPERT FINAL: Normalize region case
    })) : undefined,
    
    // ✅ EXPERT FINAL: Normalize currency case (only when present)
    currency: request.currency?.toUpperCase() as SupportedCurrency,
    minimum_order_currency: request.minimum_order_currency?.toUpperCase() as SupportedCurrency,
  }
}

// ✅ EXPERT PATTERN: Form invariants validation (without adding Zod dependency)
export function validatePromotionRequest(request: PromotionRequest): { isValid: boolean; errors: string[] } {
  const errors: string[] = []
  
  // Basic validations
  if (!request.name || request.name.length < 3) {
    errors.push('Promotion name must be at least 3 characters')
  }
  
  if (!request.discount_value || request.discount_value <= 0) {
    errors.push('Discount value must be positive')
  }
  
  if (!request.codes || request.codes.length === 0) {
    errors.push('At least one promotion code is required')
  }
  
  // ✅ EXPERT: Form invariants to match constraints
  if (request.discount_type === 'fixed_amount' && !request.currency) {
    errors.push('Currency is required for fixed amount discounts')
  }
  
  if (request.discount_type === 'percentage' && request.currency) {
    errors.push('Percentage discounts must not include currency')
  }
  
  // ✅ EXPERT: Minimum order both-or-neither validation
  const hasMinAmount = (request.minimum_order_amount ?? 0) > 0
  const hasMinCurrency = !!request.minimum_order_currency
  if (hasMinAmount !== hasMinCurrency) {
    errors.push('Minimum order amount and currency must be set together or left empty')
  }
  
  return { isValid: errors.length === 0, errors }
}

// ✅ EXPERT: Derive client-side features from backend capabilities
export function deriveProviderFeatures(capabilities: ProviderCapabilities): DerivedProviderFeatures {
  return {
    supports_vouchers: capabilities.checkout_types.includes('voucher'),
    supports_redirect: capabilities.checkout_types.includes('redirect'),
    is_active: capabilities.status !== 'disabled'
  }
}

// ✅ EXPERT FINAL: Enhanced admin-friendly error messages
export function getAdminFriendlyError(error: any): string {
  if (error.message?.includes('No selected provider supports')) {
    return 'No selected provider supports the chosen currency. Please select different providers or currency.'
  }
  if (error.message?.includes('Fixed discount requires currency')) {
    return 'Fixed discount amounts require a currency selection. Please select a currency or switch to percentage discount.'
  }
  if (error.message?.includes('minimum order amount requires currency')) {
    return 'Select a currency for the minimum order or clear the amount.'
  }
  if (error.message?.includes('no providers selected')) {
    return 'Pick at least one payment provider.'
  }
  if (error.message?.includes('rate limit')) {
    return 'Too many validation requests. Please wait a moment before trying again.'
  }
  if (error.message?.includes('timeout')) {
    return 'Validation request timed out. Please try again.'
  }
  // Default to original message for debugging
  return error.message || 'An unexpected error occurred during validation'
}

// ✅ EXPERT FINAL: Provider capability type guard
export function isProviderCapabilities(x: unknown): x is ProviderCapabilities {
  return !!x && 
         typeof x === 'object' && 
         'key' in x && 
         'supported_currencies' in x && 
         'checkout_types' in x
}

// ✅ EXPERT FINAL: Check if currency is supported by selected providers
export function getCurrencyProviderWarning(
  currency: string | undefined,
  selectedProviders: PaymentProvider[],
  capabilities: ProviderCapabilities[]
): string | null {
  if (!currency || selectedProviders.length === 0) return null
  
  const supportingProviders = capabilities.filter(cap => 
    selectedProviders.includes(cap.key) && 
    cap.supported_currencies.includes(currency as SupportedCurrency)
  )
  
  if (supportingProviders.length === 0) {
    return `None of the selected providers support ${currency}. Consider selecting different providers or currency.`
  }
  
  return null
}