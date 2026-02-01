import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';
import * as Localization from 'expo-localization';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  isRTL,
  normalizeLocale,
  type SupportedLocale,
} from '@sheenapps/platform-tokens';

import en from './locales/en.json';
import ar from './locales/ar.json';

const resources = {
  en: { translation: en },
  ar: { translation: ar },
};

// Get device locale and normalize it
const deviceLocale = Localization.getLocales()[0]?.languageCode ?? DEFAULT_LOCALE;
const normalizedLocale = normalizeLocale(deviceLocale);
const initialLocale = SUPPORTED_LOCALES.includes(normalizedLocale as SupportedLocale)
  ? normalizedLocale
  : DEFAULT_LOCALE;

// Configure RTL
const shouldBeRTL = isRTL(initialLocale as SupportedLocale);
if (I18nManager.isRTL !== shouldBeRTL) {
  I18nManager.allowRTL(shouldBeRTL);
  I18nManager.forceRTL(shouldBeRTL);
}

i18n.use(initReactI18next).init({
  resources,
  lng: initialLocale,
  fallbackLng: DEFAULT_LOCALE,
  compatibilityJSON: 'v4',
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

export const changeLanguage = async (locale: SupportedLocale) => {
  const shouldBeRTL = isRTL(locale);

  // Update i18n
  await i18n.changeLanguage(locale);

  // Update RTL if needed (requires app restart on some platforms)
  if (I18nManager.isRTL !== shouldBeRTL) {
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
    // Note: RTL changes may require app restart to take effect
  }
};

export { i18n, SUPPORTED_LOCALES, isRTL };
export default i18n;
