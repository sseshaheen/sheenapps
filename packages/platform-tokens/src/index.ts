/**
 * @sheenapps/platform-tokens
 *
 * Single source of truth for platform-wide constants and utilities.
 * All apps and packages import locale/currency definitions from here.
 */

// Locale exports
export {
  // Constants
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  RTL_LOCALES,
  BASE_LOCALE_MAP,
  LOCALE_CONFIG,
  // Types
  type SupportedLocale,
  type LocaleConfig,
  // Functions
  isSupportedLocale,
  getBaseLocale,
  getDirection,
  isRTL,
  normalizeLocale,
  resolveLocaleWithChain,
} from './locales.js';

// Currency exports
export {
  // Constants
  CURRENCIES,
  LOCALE_CURRENCY,
  CURRENCY_CONFIG,
  // Types
  type Currency,
  type CurrencyConfig,
  // Functions
  getCurrencyForLocale,
  getCurrencyConfig,
  formatCurrencySimple,
} from './currencies.js';
