/**
 * next-intl Adapter
 *
 * Provides translation messages in the format expected by next-intl.
 * Used by the web app (apps/web).
 */

import type { SupportedLocale } from '@sheenapps/platform-tokens';
import { DEFAULT_LOCALE, normalizeLocale } from '@sheenapps/platform-tokens';
import type { Messages, Namespace, NamespacedMessages } from './types.js';

// Import generated locale bundles
// These are built at compile-time by scripts/build-locales.ts
// For now, we'll use dynamic imports since the files may not exist yet

type LocaleMessages = NamespacedMessages;

const messageCache = new Map<SupportedLocale, LocaleMessages>();

/**
 * Load messages for a locale.
 * Returns cached messages if already loaded.
 */
async function loadMessages(locale: SupportedLocale): Promise<LocaleMessages> {
  if (messageCache.has(locale)) {
    return messageCache.get(locale)!;
  }

  try {
    // Try to load from generated bundle
    const bundle = await import(`./generated/${locale}.json`, {
      with: { type: 'json' }
    });
    const messages = bundle.default as LocaleMessages;
    messageCache.set(locale, messages);
    return messages;
  } catch {
    // Fallback to default locale
    if (locale !== DEFAULT_LOCALE) {
      console.warn(
        `[translations] Missing locale bundle for "${locale}", falling back to "${DEFAULT_LOCALE}"`
      );
      return loadMessages(DEFAULT_LOCALE);
    }
    // Return empty if even default fails
    return {};
  }
}

/**
 * Get messages for a locale and specific namespaces.
 * This is the main entry point for next-intl integration.
 *
 * @example
 * // In your next-intl request config:
 * export default async function getRequestConfig({ locale }) {
 *   const messages = await getMessages(locale, ['common', 'auth']);
 *   return { locale, messages };
 * }
 */
export async function getMessages(
  localeInput: string,
  namespaces?: Namespace[]
): Promise<Messages> {
  const locale = normalizeLocale(localeInput);
  const allMessages = await loadMessages(locale);

  if (!namespaces) {
    // Return all namespaces flattened
    return allMessages as Messages;
  }

  // Return only requested namespaces
  const result: Messages = {};
  for (const ns of namespaces) {
    if (allMessages[ns]) {
      result[ns] = allMessages[ns];
    }
  }
  return result;
}

/**
 * Get messages synchronously (requires pre-loading).
 * Use this only if you've already called getMessages() to populate the cache.
 */
export function getMessagesSync(
  localeInput: string,
  namespaces?: Namespace[]
): Messages {
  const locale = normalizeLocale(localeInput);
  const allMessages = messageCache.get(locale);

  if (!allMessages) {
    console.warn(
      `[translations] Messages for "${locale}" not loaded. Call getMessages() first.`
    );
    return {};
  }

  if (!namespaces) {
    return allMessages as Messages;
  }

  const result: Messages = {};
  for (const ns of namespaces) {
    if (allMessages[ns]) {
      result[ns] = allMessages[ns];
    }
  }
  return result;
}
