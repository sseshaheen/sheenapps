import { localeConfig, regionalPricing, type Locale } from '@/i18n/config'

export interface Price {
  amount: number
  currency: string
  locale: Locale
}

export function formatPrice(
  baseAmount: number,
  locale: Locale,
  options?: {
    showSymbol?: boolean
    precision?: number
  }
): string {
  const config = localeConfig[locale]
  const pricing = regionalPricing[locale]
  
  // Calculate localized price
  const localizedAmount = Math.round(baseAmount * pricing.multiplier)
  const discountedAmount = pricing.discount > 0 
    ? Math.round(localizedAmount * (1 - pricing.discount))
    : localizedAmount

  const { showSymbol = true, precision = 0 } = options || {}

  // Format according to locale
  try {
    const formatted = new Intl.NumberFormat(getIntlLocale(locale), {
      style: showSymbol ? 'currency' : 'decimal',
      currency: config.currency,
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    }).format(discountedAmount)

    return formatted
  } catch {
    // Fallback for unsupported locales
    return showSymbol 
      ? `${config.currencySymbol}${discountedAmount}`
      : discountedAmount.toString()
  }
}

export function getDiscountInfo(locale: Locale) {
  const pricing = regionalPricing[locale]
  return {
    hasDiscount: pricing.discount > 0,
    discountPercent: Math.round(pricing.discount * 100),
    multiplier: pricing.multiplier
  }
}

export function formatPercentage(value: number, locale: Locale): string {
  try {
    return new Intl.NumberFormat(getIntlLocale(locale), {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value / 100)
  } catch {
    return `${value}%`
  }
}

function getIntlLocale(locale: Locale): string {
  // Map our custom locales to standard Intl locales
  const localeMap: Record<Locale, string> = {
    'en': 'en-US',
    'ar-eg': 'ar-EG',
    'ar-sa': 'ar-SA', 
    'ar-ae': 'ar-AE',
    'ar': 'ar',
    'fr': 'fr-FR',
    'fr-ma': 'fr-MA',
    'es': 'es-ES',
    'de': 'de-DE',
    'en-XA': 'en-US' // Pseudo-locale uses US formatting
  }
  
  return localeMap[locale] || 'en-US'
}

// Predefined pricing tiers in USD (base currency)
export const basePricing = {
  starter: 9,
  growth: 29,
  scale: 59,
} as const

export function getLocalizedPricing(locale: Locale) {
  return {
    starter: formatPrice(basePricing.starter, locale),
    growth: formatPrice(basePricing.growth, locale),
    scale: formatPrice(basePricing.scale, locale),
  }
}

export function calculateYearlySavings(monthlyPrice: number, locale: Locale): string {
  const yearlyPrice = monthlyPrice * 12 * 0.8 // 20% discount
  const savings = (monthlyPrice * 12) - yearlyPrice
  return formatPrice(savings, locale)
}