/**
 * Currency Registry
 *
 * Maps locales to their default currencies and provides currency metadata.
 */

import type { SupportedLocale } from './locales.js';

// =============================================================================
// Currency Constants
// =============================================================================

export const CURRENCIES = [
  'USD', // US Dollar
  'EUR', // Euro
  'SAR', // Saudi Riyal
  'AED', // UAE Dirham
  'EGP', // Egyptian Pound
  'MAD', // Moroccan Dirham
] as const;

export type Currency = (typeof CURRENCIES)[number];

// =============================================================================
// Locale to Currency Mapping
// =============================================================================

/**
 * Default currency for each locale.
 * Used for display and initial pricing.
 */
export const LOCALE_CURRENCY: Record<SupportedLocale, Currency> = {
  en: 'USD',
  ar: 'USD',      // MENA general - use USD as neutral
  'ar-eg': 'EGP',
  'ar-sa': 'SAR',
  'ar-ae': 'AED',
  fr: 'EUR',
  'fr-ma': 'MAD',
  es: 'EUR',
  de: 'EUR',
} as const;

// =============================================================================
// Currency Metadata
// =============================================================================

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  name: string;
  nameNative: string;
  decimalPlaces: number;
  symbolPosition: 'before' | 'after';
}

export const CURRENCY_CONFIG: Record<Currency, CurrencyConfig> = {
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    nameNative: 'US Dollar',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    nameNative: 'Euro',
    decimalPlaces: 2,
    symbolPosition: 'after', // In most European countries
  },
  SAR: {
    code: 'SAR',
    symbol: 'ر.س',
    name: 'Saudi Riyal',
    nameNative: 'ريال سعودي',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  AED: {
    code: 'AED',
    symbol: 'د.إ',
    name: 'UAE Dirham',
    nameNative: 'درهم إماراتي',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  EGP: {
    code: 'EGP',
    symbol: 'ج.م',
    name: 'Egyptian Pound',
    nameNative: 'جنيه مصري',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  MAD: {
    code: 'MAD',
    symbol: 'د.م',
    name: 'Moroccan Dirham',
    nameNative: 'درهم مغربي',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get the default currency for a locale
 */
export function getCurrencyForLocale(locale: SupportedLocale): Currency {
  return LOCALE_CURRENCY[locale];
}

/**
 * Get currency configuration
 */
export function getCurrencyConfig(currency: Currency): CurrencyConfig {
  return CURRENCY_CONFIG[currency];
}

/**
 * Format an amount with the currency symbol.
 * Note: For proper formatting, use Intl.NumberFormat in the app.
 * This is a simple helper for display purposes.
 */
export function formatCurrencySimple(
  amount: number,
  currency: Currency
): string {
  const config = CURRENCY_CONFIG[currency];
  const formatted = amount.toFixed(config.decimalPlaces);

  return config.symbolPosition === 'before'
    ? `${config.symbol}${formatted}`
    : `${formatted} ${config.symbol}`;
}
