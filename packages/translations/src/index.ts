/**
 * @sheenapps/translations
 *
 * Shared translation strings for all apps.
 * Use the framework-specific adapters for integration:
 * - @sheenapps/translations/next-intl (web)
 * - @sheenapps/translations/i18next (mobile)
 */

export {
  NAMESPACES,
  type Namespace,
  type Messages,
  type NamespacedMessages,
  type LocaleBundle,
  type TranslationResources,
} from './types.js';

// Re-export locale utilities for convenience
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  type SupportedLocale,
  normalizeLocale,
  getBaseLocale,
} from '@sheenapps/platform-tokens';
