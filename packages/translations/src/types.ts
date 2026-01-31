/**
 * Translation Types
 *
 * Defines the shape of translation messages and namespaces.
 */

import type { SupportedLocale } from '@sheenapps/platform-tokens';

/**
 * Available translation namespaces.
 * Each namespace corresponds to a JSON file in src/base/{locale}/.
 */
export const NAMESPACES = [
  'common',
  'auth',
  'billing',
  'errors',
  'projects',
] as const;

export type Namespace = (typeof NAMESPACES)[number];

/**
 * Generic message object structure.
 * Messages can be nested objects with string values.
 */
export type Messages = {
  [key: string]: string | Messages;
};

/**
 * Locale messages for a specific namespace.
 */
export type NamespacedMessages = {
  [K in Namespace]?: Messages;
};

/**
 * Complete locale bundle with all namespaces.
 */
export type LocaleBundle = {
  locale: SupportedLocale;
  messages: NamespacedMessages;
};

/**
 * Full translation resources for all locales.
 * Used by i18next adapter.
 */
export type TranslationResources = {
  [L in SupportedLocale]?: NamespacedMessages;
};
