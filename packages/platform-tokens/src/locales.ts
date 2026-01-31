/**
 * Locale Registry - Single Source of Truth
 *
 * All locale-related constants and utilities live here.
 * Other packages (@sheenapps/translations, apps) import from here.
 */

// =============================================================================
// Core Constants
// =============================================================================

/**
 * All supported locales in the platform.
 * Order matters for UI display (language picker).
 */
export const SUPPORTED_LOCALES = [
  'en',    // English (Default)
  'ar',    // Modern Standard Arabic
  'ar-eg', // Egyptian Arabic
  'ar-sa', // Saudi Arabic
  'ar-ae', // UAE Arabic
  'fr',    // French
  'fr-ma', // Moroccan French
  'es',    // Spanish
  'de',    // German
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Right-to-left locales
 */
export const RTL_LOCALES: readonly SupportedLocale[] = [
  'ar',
  'ar-eg',
  'ar-sa',
  'ar-ae',
] as const;

/**
 * Base locale inheritance map.
 * Regional locales inherit from their base locale for translations.
 * Used at build time to merge translation files.
 */
export const BASE_LOCALE_MAP: Partial<Record<SupportedLocale, SupportedLocale>> = {
  'ar-eg': 'ar',
  'ar-sa': 'ar',
  'ar-ae': 'ar',
  'fr-ma': 'fr',
} as const;

// =============================================================================
// Locale Metadata
// =============================================================================

export interface LocaleConfig {
  label: string;        // Display name in native language
  labelEnglish: string; // Display name in English
  flag: string;         // Emoji flag
  direction: 'ltr' | 'rtl';
  region: string;       // ISO region code or descriptive
}

export const LOCALE_CONFIG: Record<SupportedLocale, LocaleConfig> = {
  en: {
    label: 'English',
    labelEnglish: 'English',
    flag: '🇺🇸',
    direction: 'ltr',
    region: 'US',
  },
  ar: {
    label: 'العربية',
    labelEnglish: 'Arabic',
    flag: '🌍',
    direction: 'rtl',
    region: 'MENA',
  },
  'ar-eg': {
    label: 'العربية المصرية',
    labelEnglish: 'Egyptian Arabic',
    flag: '🇪🇬',
    direction: 'rtl',
    region: 'EG',
  },
  'ar-sa': {
    label: 'العربية السعودية',
    labelEnglish: 'Saudi Arabic',
    flag: '🇸🇦',
    direction: 'rtl',
    region: 'SA',
  },
  'ar-ae': {
    label: 'العربية الإماراتية',
    labelEnglish: 'Emirati Arabic',
    flag: '🇦🇪',
    direction: 'rtl',
    region: 'AE',
  },
  fr: {
    label: 'Français',
    labelEnglish: 'French',
    flag: '🇫🇷',
    direction: 'ltr',
    region: 'FR',
  },
  'fr-ma': {
    label: 'Français (Maroc)',
    labelEnglish: 'French (Morocco)',
    flag: '🇲🇦',
    direction: 'ltr',
    region: 'MA',
  },
  es: {
    label: 'Español',
    labelEnglish: 'Spanish',
    flag: '🇪🇸',
    direction: 'ltr',
    region: 'ES',
  },
  de: {
    label: 'Deutsch',
    labelEnglish: 'German',
    flag: '🇩🇪',
    direction: 'ltr',
    region: 'DE',
  },
} as const;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if a string is a valid supported locale
 */
export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(locale);
}

/**
 * Get the base locale for a regional variant.
 * Returns the locale itself if it's already a base locale.
 *
 * @example
 * getBaseLocale('ar-eg') // 'ar'
 * getBaseLocale('en')    // 'en'
 */
export function getBaseLocale(locale: SupportedLocale): SupportedLocale {
  return BASE_LOCALE_MAP[locale] ?? locale;
}

/**
 * Get text direction for a locale
 */
export function getDirection(locale: SupportedLocale): 'ltr' | 'rtl' {
  return LOCALE_CONFIG[locale].direction;
}

/**
 * Check if a locale is RTL
 */
export function isRTL(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Normalize various locale input formats to a SupportedLocale.
 * Handles: ar_EG, ar-eg, AR-EG, ar_EG_u_ca_gregory, etc.
 * Returns DEFAULT_LOCALE if input is not recognized.
 *
 * @example
 * normalizeLocale('ar_EG')  // 'ar-eg'
 * normalizeLocale('AR-eg')  // 'ar-eg'
 * normalizeLocale('en_US_u_ca_gregory') // 'en'
 * normalizeLocale('unknown') // 'en'
 */
export function normalizeLocale(input: string): SupportedLocale {
  // Strip Unicode extensions (e.g., "_u_ca_gregory" or "-u-ca-gregory")
  const stripped = input.replace(/[_-]u[_-].*/i, '');

  // Normalize: replace all underscores with hyphens, lowercase
  const normalized = stripped.toLowerCase().replace(/_/g, '-');

  // Direct match
  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  // Try base locale (e.g., 'ar-eg' -> 'ar')
  const [lang] = normalized.split('-');
  if (lang && isSupportedLocale(lang)) {
    return lang;
  }

  return DEFAULT_LOCALE;
}

/**
 * Resolve a locale with its fallback chain.
 * Returns both the resolved locale and the base locale for translation inheritance.
 *
 * @example
 * resolveLocaleWithChain('ar-eg') // { locale: 'ar-eg', base: 'ar' }
 * resolveLocaleWithChain('en')    // { locale: 'en', base: 'en' }
 */
export function resolveLocaleWithChain(input: string): {
  locale: SupportedLocale;
  base: SupportedLocale;
} {
  const locale = normalizeLocale(input);
  const base = getBaseLocale(locale);
  return { locale, base };
}
