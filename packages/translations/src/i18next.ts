/**
 * i18next Adapter
 *
 * Provides translation resources in the format expected by i18next.
 * Used by the mobile app (apps/mobile).
 */

import type { SupportedLocale } from '@sheenapps/platform-tokens';
import {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  normalizeLocale,
} from '@sheenapps/platform-tokens';
import type { NamespacedMessages, TranslationResources } from './types.js';

/**
 * Pre-built resources for i18next.
 * This object is populated at build time by importing generated bundles.
 *
 * Usage in mobile app:
 * @example
 * import i18n from 'i18next';
 * import { resources, DEFAULT_LOCALE } from '@sheenapps/translations/i18next';
 *
 * i18n.init({
 *   resources,
 *   lng: DEFAULT_LOCALE,
 *   fallbackLng: DEFAULT_LOCALE,
 *   interpolation: { escapeValue: false },
 * });
 */
export const resources: TranslationResources = {};

/**
 * Load a specific locale's resources.
 * Call this to dynamically load a locale bundle.
 */
export async function loadLocale(
  localeInput: string
): Promise<NamespacedMessages> {
  const locale = normalizeLocale(localeInput);

  // Check if already loaded
  if (resources[locale]) {
    return resources[locale]!;
  }

  try {
    const bundle = await import(`./generated/${locale}.json`, {
      with: { type: 'json' }
    });
    const messages = bundle.default as NamespacedMessages;
    resources[locale] = messages;
    return messages;
  } catch {
    console.warn(
      `[translations] Failed to load locale "${locale}", using fallback`
    );
    if (locale !== DEFAULT_LOCALE) {
      return loadLocale(DEFAULT_LOCALE);
    }
    return {};
  }
}

/**
 * Preload all locales.
 * Call this at app startup if you want all locales available immediately.
 */
export async function preloadAllLocales(): Promise<void> {
  await Promise.all(
    SUPPORTED_LOCALES.map((locale) => loadLocale(locale))
  );
}

/**
 * Get i18next configuration preset.
 * Returns a partial i18next init config with recommended settings.
 */
export function getI18nextConfig() {
  return {
    resources,
    lng: DEFAULT_LOCALE,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: {
      escapeValue: false, // React Native handles escaping
    },
    react: {
      useSuspense: false, // Avoid suspense issues in RN
    },
  } as const;
}

// Re-export for convenience
export { DEFAULT_LOCALE, SUPPORTED_LOCALES, normalizeLocale };
export type { SupportedLocale };
