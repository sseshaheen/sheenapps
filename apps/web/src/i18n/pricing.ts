// Pricing localization configuration - Updated for Free + Lite structure
export const pricingConfig = {
  'en': {
    currency: 'USD',
    symbol: '$',
    position: 'before', // $12
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 12, yearly: 115 } // ~20% yearly discount
  },
  'ar': {
    currency: 'USD',
    symbol: '$',
    position: 'before',
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 12, yearly: 115 }
  },
  'ar-eg': {
    currency: 'EGP',
    symbol: 'ج.م',
    position: 'after', // 435 ج.م
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 435, yearly: 4200 } // Based on API response
  },
  'ar-sa': {
    currency: 'SAR',
    symbol: 'ر.س',
    position: 'after',
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 45, yearly: 432 }
  },
  'ar-ae': {
    currency: 'AED',
    symbol: 'د.إ',
    position: 'after',
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 44, yearly: 422 }
  },
  'fr': {
    currency: 'EUR',
    symbol: '€',
    position: 'after',
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 11, yearly: 106 }
  },
  'fr-ma': {
    currency: 'MAD',
    symbol: 'د.م',
    position: 'after',
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 120, yearly: 1152 }
  },
  'es': {
    currency: 'EUR',
    symbol: '€',
    position: 'after',
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 11, yearly: 106 }
  },
  'de': {
    currency: 'EUR',
    symbol: '€',
    position: 'after',
    free: { monthly: 0, yearly: 0 },
    lite: { monthly: 11, yearly: 106 }
  },
} as const

export type Locale = keyof typeof pricingConfig
export type PricingData = typeof pricingConfig[Locale]

export function formatPrice(amount: number, locale: Locale): string {
  const config = pricingConfig[locale]
  if (config.position === 'before') {
    return `${config.symbol}${amount}`
  } else {
    return `${amount} ${config.symbol}`
  }
}

export function getPricingForLocale(locale: string): PricingData {
  return pricingConfig[locale as Locale] || pricingConfig['en']
}