import { FastifyInstance } from 'fastify';

// Define types locally since payment types file doesn't exist
export type PaymentProviderKey = 'stripe' | 'fawry' | 'paymob' | 'stc_pay' | 'paytabs';
export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR';
export type RegionCode = 'us' | 'ca' | 'gb' | 'eu' | 'eg' | 'sa';
export type CheckoutType = 'redirect' | 'voucher';

// Provider capabilities matrix - single source of truth
export const PROVIDER_CAPABILITIES: Record<string, {
  currencies: readonly string[];
  checkoutTypes: readonly string[];
  regions: readonly string[];
  maxDiscountPercentage: number;
  supportsMinimumOrder: boolean;
  supportsPercentage: boolean;
  supportsFixedAmount: boolean;
}> = {
  stripe: { 
    currencies: ['USD', 'EUR', 'GBP'] as const, 
    checkoutTypes: ['redirect'] as const,
    regions: ['us', 'ca', 'gb', 'eu'] as const,
    maxDiscountPercentage: 100,
    supportsMinimumOrder: true,
    supportsPercentage: true,
    supportsFixedAmount: true
  },
  fawry: { 
    currencies: ['EGP'] as const, 
    checkoutTypes: ['voucher'] as const,
    regions: ['eg'] as const,
    maxDiscountPercentage: 50,
    supportsMinimumOrder: true,
    supportsPercentage: true,
    supportsFixedAmount: true
  },
  paymob: { 
    currencies: ['EGP'] as const, 
    checkoutTypes: ['redirect'] as const,
    regions: ['eg'] as const,
    maxDiscountPercentage: 100,
    supportsMinimumOrder: true,
    supportsPercentage: true,
    supportsFixedAmount: true
  },
  stc_pay: { 
    currencies: ['SAR'] as const, 
    checkoutTypes: ['redirect'] as const,
    regions: ['sa'] as const,
    maxDiscountPercentage: 75,
    supportsMinimumOrder: true,
    supportsPercentage: true,
    supportsFixedAmount: true
  },
  paytabs: { 
    currencies: ['SAR', 'USD', 'EUR'] as const, 
    checkoutTypes: ['redirect'] as const,
    regions: ['sa', 'us', 'eu'] as const,
    maxDiscountPercentage: 100,
    supportsMinimumOrder: true,
    supportsPercentage: true,
    supportsFixedAmount: true
  }
};

// Types already defined at top of file

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface PromotionRequest {
  name: string;
  description?: string;
  discount_type: 'percentage' | 'fixed_amount';
  discount_value: number;
  max_total_uses?: number;
  max_uses_per_user?: number;
  valid_from?: string;
  valid_until?: string;
  notes?: string;
  codes: string[];
  currency?: string;
  supported_providers?: PaymentProviderKey[];
  minimum_order_amount?: number;
  minimum_order_currency?: string;
  checkout_type_restrictions?: CheckoutType[];
  regional_configs?: {
    region_code: RegionCode;
    preferred_providers?: PaymentProviderKey[];
    localized_name?: { [locale: string]: string };
    localized_description?: { [locale: string]: string };
    min_order_override?: number;
  }[];
}

export interface TestScenario {
  region: RegionCode;
  currency: CurrencyCode;
  order_amount: number;
  provider?: PaymentProviderKey;
  checkout_type?: CheckoutType;
}

export interface ScenarioResult {
  scenario: TestScenario;
  eligible: boolean;
  discount_amount: number;
  final_amount: number;
  selected_provider: PaymentProviderKey | null;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  reason?: string | undefined;
}

// Normalization functions (match database functions)
export function normalizeCurrency(currency: string | undefined): CurrencyCode | undefined {
  if (!currency) return undefined;
  const normalized = currency.toUpperCase().trim() as CurrencyCode;
  if (!['USD', 'EUR', 'GBP', 'EGP', 'SAR'].includes(normalized)) {
    throw new Error(`Invalid currency: ${currency}`);
  }
  return normalized;
}

export function normalizeRegion(region: string): RegionCode {
  const normalized = region.toLowerCase().trim() as RegionCode;
  if (!['us', 'ca', 'gb', 'eu', 'eg', 'sa'].includes(normalized)) {
    throw new Error(`Invalid region: ${region}`);
  }
  return normalized;
}

export function normalizeProvider(provider: string): PaymentProviderKey {
  const normalized = provider.toLowerCase().trim() as PaymentProviderKey;
  if (!['stripe', 'fawry', 'paymob', 'stc_pay', 'paytabs'].includes(normalized)) {
    throw new Error(`Invalid provider: ${provider}`);
  }
  return normalized;
}

// Core validation function
export function validateProviderCompatibility(
  providers: PaymentProviderKey[],
  currency?: string,
  checkoutTypes?: CheckoutType[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Normalize currency
  const normalizedCurrency = currency ? normalizeCurrency(currency) : undefined;
  
  // Check if at least one provider is selected
  if (!providers || providers.length === 0) {
    errors.push('At least one payment provider must be selected');
    return { valid: false, errors, warnings };
  }
  
  // Check currency support
  if (normalizedCurrency) {
    const currencySupported = providers.some(p => 
      PROVIDER_CAPABILITIES[p]?.currencies.includes(normalizedCurrency)
    );
    
    if (!currencySupported) {
      errors.push(`No selected provider supports ${normalizedCurrency}`);
    }
  }
  
  // Check checkout type support
  if (checkoutTypes && checkoutTypes.length > 0) {
    for (const ct of checkoutTypes) {
      const ctSupported = providers.some(p =>
        PROVIDER_CAPABILITIES[p]?.checkoutTypes.includes(ct)
      );
      if (!ctSupported) {
        errors.push(`No selected provider supports ${ct} checkout`);
      }
    }
  }
  
  // Warnings for suboptimal configurations
  if (providers.length === 1) {
    warnings.push('Only one provider selected - consider adding more for redundancy');
  }
  
  // Check for mixed checkout types
  const hasVoucherProvider = providers.some(p => 
    PROVIDER_CAPABILITIES[p]?.checkoutTypes.includes('voucher')
  );
  const hasRedirectProvider = providers.some(p => 
    PROVIDER_CAPABILITIES[p]?.checkoutTypes.includes('redirect')
  );
  
  if (hasVoucherProvider && hasRedirectProvider && !checkoutTypes) {
    warnings.push('Mixed checkout types available - consider setting checkout_type_restrictions for consistency');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

// Validate full promotion request
export function validatePromotionRequest(request: PromotionRequest): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Basic validation
  if (!request.name || request.name.trim().length === 0) {
    errors.push('Promotion name is required');
  }
  
  if (!request.codes || request.codes.length === 0) {
    errors.push('At least one promotion code is required');
  }
  
  // Validate discount configuration
  if (request.discount_type === 'percentage') {
    if (request.discount_value <= 0 || request.discount_value > 100) {
      errors.push('Percentage discount must be between 0 and 100');
    }
    if (request.currency) {
      errors.push('Percentage discounts cannot have a currency');
    }
  } else if (request.discount_type === 'fixed_amount') {
    if (!request.currency) {
      errors.push('Fixed amount discounts require a currency');
    }
    if (request.discount_value <= 0) {
      errors.push('Fixed amount discount must be greater than 0');
    }
  }
  
  // Validate dates
  if (request.valid_from && request.valid_until) {
    const from = new Date(request.valid_from);
    const until = new Date(request.valid_until);
    if (from >= until) {
      errors.push('End date must be after start date');
    }
    if (until < new Date()) {
      errors.push('End date cannot be in the past');
    }
    
    // Warning for short promotions
    const daysValid = (until.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (daysValid < 7) {
      warnings.push(`Promotion expires in ${Math.floor(daysValid)} days`);
    }
  }
  
  // Validate minimum order
  if (request.minimum_order_amount !== undefined || request.minimum_order_currency !== undefined) {
    if (!request.minimum_order_amount || !request.minimum_order_currency) {
      errors.push('Both minimum order amount and currency must be provided together');
    } else if (request.minimum_order_amount < 0) {
      errors.push('Minimum order amount cannot be negative');
    }
  }
  
  // Validate checkout type restrictions
  if (request.checkout_type_restrictions !== undefined) {
    if (request.checkout_type_restrictions !== null && request.checkout_type_restrictions.length === 0) {
      errors.push('Checkout type restrictions cannot be an empty array. Use null/undefined for no restrictions');
    }
  }
  
  // Provider validation
  const providers = request.supported_providers || ['stripe'];
  const providerValidation = validateProviderCompatibility(
    providers,
    request.currency,
    request.checkout_type_restrictions || undefined
  );
  
  errors.push(...providerValidation.errors);
  warnings.push(...providerValidation.warnings);
  
  // Validate regional configs
  if (request.regional_configs) {
    const seenRegions = new Set<string>();
    for (const config of request.regional_configs) {
      const normalizedRegion = normalizeRegion(config.region_code);
      if (seenRegions.has(normalizedRegion)) {
        errors.push(`Duplicate regional configuration for ${normalizedRegion}`);
      }
      seenRegions.add(normalizedRegion);
      
      // Validate preferred providers are in supported list
      if (config.preferred_providers) {
        for (const provider of config.preferred_providers) {
          if (!providers.includes(provider)) {
            errors.push(`Regional config for ${normalizedRegion} includes unsupported provider ${provider}`);
          }
        }
      }
    }
  }
  
  // High discount warning
  if (request.discount_type === 'percentage' && request.discount_value > 80) {
    warnings.push(`High discount percentage: ${request.discount_value}%`);
  }
  
  // No usage limits warning
  if (!request.max_total_uses && !request.max_uses_per_user) {
    warnings.push('No usage limits set - promotion can be used unlimited times');
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

// Test promotion scenarios
export function testPromotionScenario(
  promotion: PromotionRequest,
  scenario: TestScenario
): ScenarioResult {
  const result: ScenarioResult = {
    scenario,
    eligible: false,
    discount_amount: 0,
    final_amount: scenario.order_amount,
    selected_provider: null,
    reason: undefined
  };
  
  // Check dates
  const now = new Date();
  if (promotion.valid_from && new Date(promotion.valid_from) > now) {
    result.reason = 'Promotion not yet active';
    return result;
  }
  if (promotion.valid_until && new Date(promotion.valid_until) < now) {
    result.reason = 'Promotion expired';
    return result;
  }
  
  // Check minimum order
  if (promotion.minimum_order_amount && promotion.minimum_order_currency) {
    if (scenario.currency !== promotion.minimum_order_currency) {
      result.reason = `Minimum order currency mismatch: requires ${promotion.minimum_order_currency}`;
      return result;
    }
    if (scenario.order_amount < promotion.minimum_order_amount) {
      result.reason = `Order amount below minimum: ${promotion.minimum_order_amount} ${promotion.minimum_order_currency}`;
      return result;
    }
  }
  
  // Check currency compatibility for fixed amount
  if (promotion.discount_type === 'fixed_amount' && promotion.currency !== scenario.currency) {
    result.reason = `Currency mismatch: promotion is in ${promotion.currency}`;
    return result;
  }
  
  // Check checkout type
  if (promotion.checkout_type_restrictions && scenario.checkout_type) {
    if (!promotion.checkout_type_restrictions.includes(scenario.checkout_type)) {
      result.reason = `Checkout type ${scenario.checkout_type} not supported`;
      return result;
    }
  }
  
  // Find compatible provider
  const providers = promotion.supported_providers || ['stripe'];
  let selectedProvider: PaymentProviderKey | null = null;
  
  // If scenario specifies provider, check if it's supported
  if (scenario.provider) {
    if (providers.includes(scenario.provider)) {
      const capabilities = PROVIDER_CAPABILITIES[scenario.provider];
      if (capabilities?.currencies.includes(scenario.currency)) {
        selectedProvider = scenario.provider;
      }
    }
  }

  // Otherwise find first compatible provider
  if (!selectedProvider) {
    for (const provider of providers) {
      const capabilities = PROVIDER_CAPABILITIES[provider];
      if (capabilities?.currencies.includes(scenario.currency)) {
        if (!scenario.checkout_type || capabilities.checkoutTypes.includes(scenario.checkout_type)) {
          selectedProvider = provider;
          break;
        }
      }
    }
  }
  
  if (!selectedProvider) {
    result.reason = 'No compatible payment provider found';
    return result;
  }
  
  // Calculate discount
  result.selected_provider = selectedProvider;
  result.eligible = true;
  
  if (promotion.discount_type === 'percentage') {
    result.discount_amount = Math.floor(scenario.order_amount * promotion.discount_value / 100);
  } else {
    result.discount_amount = promotion.discount_value;
  }
  
  // Apply max discount for provider
  const providerCaps = PROVIDER_CAPABILITIES[selectedProvider];
  const maxDiscount = providerCaps?.maxDiscountPercentage ?? 100;
  if (promotion.discount_type === 'percentage' && promotion.discount_value > maxDiscount) {
    result.discount_amount = Math.floor(scenario.order_amount * maxDiscount / 100);
    result.reason = `Discount capped at provider maximum: ${maxDiscount}%`;
  }
  
  result.final_amount = Math.max(0, scenario.order_amount - result.discount_amount);
  
  if (!result.reason) {
    result.reason = 'Eligible for discount';
  }
  
  return result;
}

// Get regional defaults based on timezone/locale
export function getRegionalDefaults(region?: RegionCode): {
  providers: PaymentProviderKey[];
  currency: CurrencyCode;
  checkoutTypes: CheckoutType[];
} {
  const regionLower = region ? normalizeRegion(region) : 'us';
  
  switch (regionLower) {
    case 'eg':
      return {
        providers: ['fawry', 'paymob'],
        currency: 'EGP',
        checkoutTypes: ['voucher', 'redirect']
      };
    case 'sa':
      return {
        providers: ['stc_pay', 'paytabs'],
        currency: 'SAR',
        checkoutTypes: ['redirect']
      };
    case 'gb':
      return {
        providers: ['stripe'],
        currency: 'GBP',
        checkoutTypes: ['redirect']
      };
    case 'eu':
      return {
        providers: ['stripe'],
        currency: 'EUR',
        checkoutTypes: ['redirect']
      };
    default:
      return {
        providers: ['stripe'],
        currency: 'USD',
        checkoutTypes: ['redirect']
      };
  }
}

// Provider availability check (can be extended to check real status)
export interface ProviderStatus {
  key: PaymentProviderKey;
  name: string;
  supported_currencies: CurrencyCode[];
  supported_regions: RegionCode[];
  checkout_types: CheckoutType[];
  status: 'active' | 'maintenance' | 'disabled';
  features: {
    supports_percentage_discount: boolean;
    supports_fixed_discount: boolean;
    supports_minimum_order: boolean;
    max_discount_percentage?: number;
    max_fixed_discount?: { [currency: string]: number };
  };
}

export function getProviderAvailability(): ProviderStatus[] {
  return Object.entries(PROVIDER_CAPABILITIES).map(([key, capabilities]) => ({
    key: key as PaymentProviderKey,
    name: key.charAt(0).toUpperCase() + key.slice(1),
    supported_currencies: capabilities.currencies as CurrencyCode[],
    supported_regions: capabilities.regions as RegionCode[],
    checkout_types: capabilities.checkoutTypes as CheckoutType[],
    status: 'active' as const, // In production, check real status
    features: {
      supports_percentage_discount: capabilities.supportsPercentage,
      supports_fixed_discount: capabilities.supportsFixedAmount,
      supports_minimum_order: capabilities.supportsMinimumOrder,
      max_discount_percentage: capabilities.maxDiscountPercentage,
      // max_fixed_discount could be configured per currency in future
    }
  }));
}

// Export service initialization
export function initializePromotionValidationService(fastify: FastifyInstance): void {
  fastify.log.info('Promotion validation service initialized with multi-provider support');
}