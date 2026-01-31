// Language name mappings for superior UX
export const LANGUAGE_NAMES = {
  // English variants
  'en': 'English',
  'en-XA': 'English',

  // Arabic variants
  'ar': 'العربية',
  'ar-eg': 'عربي مصري',
  'ar-sa': 'عربي سعودي',
  'ar-ae': 'عربي إماراتي',

  // French variants
  'fr': 'Français',
  'fr-ma': 'Français (Maroc)',

  // Other languages
  'es': 'Español',
  'de': 'Deutsch'
} as const

// Get native language name
export function getLanguageName(locale: string): string {
  return LANGUAGE_NAMES[locale as keyof typeof LANGUAGE_NAMES] || locale
}

// Get language name in the current locale context
export function getLocalizedLanguageName(targetLocale: string, currentLocale: string): string {
  // For now, always show in native script for clarity
  // Could be enhanced later to show translated names
  return getLanguageName(targetLocale)
}

// Language direction helper
export function getLanguageDirection(locale: string): 'ltr' | 'rtl' {
  return locale.startsWith('ar') ? 'rtl' : 'ltr'
}

// Get language flag emoji (optional visual enhancement)
export function getLanguageFlag(locale: string): string {
  const flags = {
    'en': '🇺🇸',
    'ar-eg': '🇪🇬',
    'ar-sa': '🇸🇦',
    'ar-ae': '🇦🇪',
    'ar': '🌍', // Generic for standard Arabic
    'fr': '🇫🇷',
    'fr-ma': '🇲🇦',
    'es': '🇪🇸',
    'de': '🇩🇪'
  }

  return flags[locale as keyof typeof flags] || '🌐'
}
