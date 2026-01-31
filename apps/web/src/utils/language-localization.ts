/**
 * Language name localization utility
 * Maps English language names to their localized equivalents
 */

type LanguageMap = Record<string, string>;

const languageTranslations: Record<string, LanguageMap> = {
  ar: {
    'Arabic': 'العربية',
    'English': 'الإنجليزية', 
    'French': 'الفرنسية',
    'Spanish': 'الإسبانية',
    'German': 'الألمانية',
    'Italian': 'الإيطالية',
    'Portuguese': 'البرتغالية',
    'Russian': 'الروسية',
    'Chinese': 'الصينية',
    'Japanese': 'اليابانية',
    'Korean': 'الكورية',
    'Hindi': 'الهندية',
    'Urdu': 'الأردية',
    'Turkish': 'التركية',
    'Persian': 'الفارسية',
    'Hebrew': 'العبرية'
  },
  en: {
    'Arabic': 'Arabic',
    'English': 'English', 
    'French': 'French',
    'Spanish': 'Spanish',
    'German': 'German',
    'Italian': 'Italian',
    'Portuguese': 'Portuguese',
    'Russian': 'Russian',
    'Chinese': 'Chinese',
    'Japanese': 'Japanese',
    'Korean': 'Korean',
    'Hindi': 'Hindi',
    'Urdu': 'Urdu',
    'Turkish': 'Turkish',
    'Persian': 'Persian',
    'Hebrew': 'Hebrew'
  },
  fr: {
    'Arabic': 'Arabe',
    'English': 'Anglais', 
    'French': 'Français',
    'Spanish': 'Espagnol',
    'German': 'Allemand',
    'Italian': 'Italien',
    'Portuguese': 'Portugais',
    'Russian': 'Russe',
    'Chinese': 'Chinois',
    'Japanese': 'Japonais',
    'Korean': 'Coréen',
    'Hindi': 'Hindi',
    'Urdu': 'Ourdou',
    'Turkish': 'Turc',
    'Persian': 'Persan',
    'Hebrew': 'Hébreu'
  },
  es: {
    'Arabic': 'Árabe',
    'English': 'Inglés', 
    'French': 'Francés',
    'Spanish': 'Español',
    'German': 'Alemán',
    'Italian': 'Italiano',
    'Portuguese': 'Portugués',
    'Russian': 'Ruso',
    'Chinese': 'Chino',
    'Japanese': 'Japonés',
    'Korean': 'Coreano',
    'Hindi': 'Hindi',
    'Urdu': 'Urdu',
    'Turkish': 'Turco',
    'Persian': 'Persa',
    'Hebrew': 'Hebreo'
  },
  de: {
    'Arabic': 'Arabisch',
    'English': 'Englisch', 
    'French': 'Französisch',
    'Spanish': 'Spanisch',
    'German': 'Deutsch',
    'Italian': 'Italienisch',
    'Portuguese': 'Portugiesisch',
    'Russian': 'Russisch',
    'Chinese': 'Chinesisch',
    'Japanese': 'Japanisch',
    'Korean': 'Koreanisch',
    'Hindi': 'Hindi',
    'Urdu': 'Urdu',
    'Turkish': 'Türkisch',
    'Persian': 'Persisch',
    'Hebrew': 'Hebräisch'
  }
};

/**
 * Localizes an array of language names to the target locale
 */
export function getLocalizedLanguageNames(languages: string[] = [], locale: string = 'en'): string[] {
  // Extract base locale (e.g., 'ar-SA' -> 'ar')
  const baseLocale = locale.split('-')[0];
  
  // Get translation map for the locale, fallback to English
  const translationMap = languageTranslations[baseLocale] || languageTranslations['en'];
  
  return languages.map(language => {
    // Try to find translation, fallback to original if not found
    return translationMap[language] || language;
  });
}

/**
 * Formats localized language names as a comma-separated string
 */
export function formatLocalizedLanguages(languages: string[] = [], locale: string = 'en'): string {
  const localizedNames = getLocalizedLanguageNames(languages, locale);
  return localizedNames.join(', ') || 'Not specified';
}

/**
 * Get single language name in target locale
 */
export function getLocalizedLanguageName(language: string, locale: string = 'en'): string {
  const baseLocale = locale.split('-')[0];
  const translationMap = languageTranslations[baseLocale] || languageTranslations['en'];
  return translationMap[language] || language;
}