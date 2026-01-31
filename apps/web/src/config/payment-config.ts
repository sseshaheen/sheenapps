// Currency-specific price ID mapping for multi-gateway support

export interface PriceMapping {
  stripe?: string
  cashier?: string
  paypal?: string
}

export interface PlanPricing {
  [currency: string]: PriceMapping
}

// Price ID configuration for each plan and currency
export const PLAN_PRICE_IDS: Record<string, PlanPricing> = {
  starter: {
    usd: {
      stripe: process.env.STRIPE_PRICE_ID_STARTER || process.env.STRIPE_PRICE_ID_STARTER_USD,
      cashier: process.env.CASHIER_PLAN_ID_STARTER_USD,
      paypal: process.env.PAYPAL_PLAN_ID_STARTER_USD
    },
    eur: {
      stripe: process.env.STRIPE_PRICE_ID_STARTER_EUR,
      cashier: process.env.CASHIER_PLAN_ID_STARTER_EUR,
      paypal: process.env.PAYPAL_PLAN_ID_STARTER_EUR
    },
    egp: {
      cashier: process.env.CASHIER_PLAN_ID_STARTER_EGP
    }
  },
  growth: {
    usd: {
      stripe: process.env.STRIPE_PRICE_ID_GROWTH || process.env.STRIPE_PRICE_ID_GROWTH_USD,
      cashier: process.env.CASHIER_PLAN_ID_GROWTH_USD,
      paypal: process.env.PAYPAL_PLAN_ID_GROWTH_USD
    },
    eur: {
      stripe: process.env.STRIPE_PRICE_ID_GROWTH_EUR,
      cashier: process.env.CASHIER_PLAN_ID_GROWTH_EUR,
      paypal: process.env.PAYPAL_PLAN_ID_GROWTH_EUR
    },
    egp: {
      cashier: process.env.CASHIER_PLAN_ID_GROWTH_EGP
    }
  },
  scale: {
    usd: {
      stripe: process.env.STRIPE_PRICE_ID_SCALE || process.env.STRIPE_PRICE_ID_SCALE_USD,
      cashier: process.env.CASHIER_PLAN_ID_SCALE_USD,
      paypal: process.env.PAYPAL_PLAN_ID_SCALE_USD
    },
    eur: {
      stripe: process.env.STRIPE_PRICE_ID_SCALE_EUR,
      cashier: process.env.CASHIER_PLAN_ID_SCALE_EUR,
      paypal: process.env.PAYPAL_PLAN_ID_SCALE_EUR
    },
    egp: {
      cashier: process.env.CASHIER_PLAN_ID_SCALE_EGP
    }
  }
}

// Country to currency mapping
export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  // North America
  US: 'usd',
  CA: 'usd',
  MX: 'usd',

  // Europe (Eurozone)
  AT: 'eur', // Austria
  BE: 'eur', // Belgium
  BG: 'eur', // Bulgaria
  HR: 'eur', // Croatia
  CY: 'eur', // Cyprus
  CZ: 'eur', // Czech Republic
  DK: 'eur', // Denmark
  EE: 'eur', // Estonia
  FI: 'eur', // Finland
  FR: 'eur', // France
  DE: 'eur', // Germany
  GR: 'eur', // Greece
  HU: 'eur', // Hungary
  IE: 'eur', // Ireland
  IT: 'eur', // Italy
  LV: 'eur', // Latvia
  LT: 'eur', // Lithuania
  LU: 'eur', // Luxembourg
  MT: 'eur', // Malta
  NL: 'eur', // Netherlands
  PL: 'eur', // Poland
  PT: 'eur', // Portugal
  RO: 'eur', // Romania
  SK: 'eur', // Slovakia
  SI: 'eur', // Slovenia
  ES: 'eur', // Spain
  SE: 'eur', // Sweden

  // Middle East / North Africa
  EG: 'egp', // Egypt
  SA: 'usd', // Saudi Arabia
  AE: 'usd', // UAE
  MA: 'eur', // Morocco

  // Default
  DEFAULT: 'usd'
}

// Tax configuration
export const TAX_CONFIG = {
  stripe: {
    automatic_tax: {
      enabled: true,
      // enabled: process.env.NODE_ENV === 'production' // Only enable in production
    },
    tax_id_collection: {
      enabled: true
    }
  },
  tax_rates: {
    us: process.env.STRIPE_TAX_ID_US,
    eu: process.env.STRIPE_TAX_ID_EU,
    gb: process.env.STRIPE_TAX_ID_GB
  }
}

// Helper functions
export function getCurrencyForCountry(countryCode: string): string {
  return COUNTRY_CURRENCY_MAP[countryCode] || COUNTRY_CURRENCY_MAP.DEFAULT
}

export function getPriceId(
  planName: string,
  currency: string,
  gateway: 'stripe' | 'cashier' | 'paypal'
): string | undefined {
  const plan = PLAN_PRICE_IDS[planName.toLowerCase()]
  if (!plan) {
    throw new Error(`Unknown plan: ${planName}`)
  }

  const currencyPrices = plan[currency.toLowerCase()]
  if (!currencyPrices) {
    // Fallback to USD if currency not found
    const usdPrices = plan.usd
    return usdPrices?.[gateway]
  }

  return currencyPrices[gateway]
}

// Webhook retry configuration
export const WEBHOOK_RETRY_CONFIG = {
  maxRetries: 3,
  backoffMultiplier: 2,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  jitterMs: 1000
}

// Gateway timeout configuration
export const GATEWAY_TIMEOUT_CONFIG = {
  stripe: {
    timeout: 10000,
    maxNetworkRetries: 2
  },
  cashier: {
    timeout: 15000,
    maxRetries: 3
  },
  paypal: {
    timeout: 12000,
    maxRetries: 2
  }
}
