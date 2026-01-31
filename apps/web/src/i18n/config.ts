// Import core locale constants from platform-tokens (single source of truth)
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type SupportedLocale,
  RTL_LOCALES,
  isRTL,
  getDirection,
  LOCALE_CONFIG as BASE_LOCALE_CONFIG,
} from '@sheenapps/platform-tokens'

// Re-export core constants for backward compatibility
export { SUPPORTED_LOCALES, RTL_LOCALES, isRTL, getDirection }

// Web-specific: Add pseudo-locale for dev testing
export const locales = [
  ...SUPPORTED_LOCALES,
  ...(process.env.NODE_ENV === 'development' ? ['en-XA' as const] : []),
] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = DEFAULT_LOCALE

// Web-specific currency configuration (extends platform-tokens base config)
const CURRENCY_CONFIG: Record<SupportedLocale, { currency: string; currencySymbol: string }> = {
  en: { currency: 'USD', currencySymbol: '$' },
  ar: { currency: 'USD', currencySymbol: '$' },
  'ar-eg': { currency: 'EGP', currencySymbol: 'ج.م' },
  'ar-sa': { currency: 'SAR', currencySymbol: 'ر.س' },
  'ar-ae': { currency: 'AED', currencySymbol: 'د.إ' },
  fr: { currency: 'EUR', currencySymbol: '€' },
  'fr-ma': { currency: 'MAD', currencySymbol: 'د.م' },
  es: { currency: 'EUR', currencySymbol: '€' },
  de: { currency: 'EUR', currencySymbol: '€' },
}

// Merge base locale config with web-specific currency fields
type WebLocaleConfig = typeof BASE_LOCALE_CONFIG[SupportedLocale] & { currency: string; currencySymbol: string }

const baseLocaleConfigWithCurrency = Object.fromEntries(
  SUPPORTED_LOCALES.map(locale => [
    locale,
    { ...BASE_LOCALE_CONFIG[locale], ...CURRENCY_CONFIG[locale] }
  ])
) as Record<SupportedLocale, WebLocaleConfig>

// Locale-specific configurations (includes base + currency + pseudo-locale)
export const localeConfig: Record<Locale, WebLocaleConfig> = {
  ...baseLocaleConfigWithCurrency,
  // Pseudo-locale for development testing (web-only)
  'en-XA': {
    label: '[Ƥşḗŭḓȯ-Ḗƞɠŀḯşħ]',
    labelEnglish: 'Pseudo-English',
    flag: '🎭',
    direction: 'ltr' as const,
    region: 'TEST',
    currency: 'USD',
    currencySymbol: '$',
  },
}

// Regional pricing adjustments (relative to USD base)
export const regionalPricing = {
  en: { multiplier: 1, discount: 0 },
  'ar-eg': { multiplier: 0.15, discount: 0.2 }, // Lower costs, 20% launch discount
  'ar-sa': { multiplier: 1.1, discount: 0 },   // Premium market
  'ar-ae': { multiplier: 1.2, discount: 0 },   // Premium market
  ar: { multiplier: 0.8, discount: 0.1 },      // Regional discount
  fr: { multiplier: 1, discount: 0 },          // Same as USD
  'fr-ma': { multiplier: 0.7, discount: 0.1 }, // Lower costs, regional discount
  es: { multiplier: 0.95, discount: 0 },       // Slightly lower than EUR base
  de: { multiplier: 1.05, discount: 0 },       // Premium market
  'en-XA': { multiplier: 1, discount: 0 },     // Test locale, same as USD
} as const

// Locale fallback configuration to avoid duplicate strings
export const localeFallbacks = {
  'ar-EG': ['ar', 'en'],
  'ar-SA': ['ar', 'en'], 
  'ar-AE': ['ar', 'en'],
  'fr-MA': ['fr', 'en'],
  default: ['en']
};

// BCP-47 normalization helper
export function normalizeLocale(locale: string): string {
  const [lang, region] = locale.toLowerCase().split('-');
  return region ? `${lang}-${region.toUpperCase()}` : lang;
}
