import { getRequestConfig } from 'next-intl/server'
import { hasLocale } from 'next-intl'
import { routing } from './routing'
import { loadNamespace } from './message-loader'

// Re-export hasLocale for convenience
export { hasLocale }

export default getRequestConfig(async ({ requestLocale }) => {
  // Get the requested locale from the request
  const requested = await requestLocale
  
  // Validate that the requested locale is supported
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale

  const messages = await loadMessages(locale)

  return {
    locale,
    messages,
    timeZone: getTimeZone(locale),
    now: new Date(),
    // Development: Show missing translations
    onError: process.env.NODE_ENV === 'development' 
      ? (error) => console.error('❌ Missing translation:', error)
      : undefined,
    getMessageFallback: ({ namespace, key }) => 
      process.env.NODE_ENV === 'development' ? `⚠️ ${namespace}.${key}` : key
  }
})

async function loadMessages(locale: string, requestedNamespaces?: string[]): Promise<any> {
  try {
    // Default namespaces if none specified (for unmigrated pages)
    const namespaces = requestedNamespaces || [
      'common', 'navigation', 'auth', 'builder', 'dashboard',
      'billing', 'errors', 'hero', 'techTeam', 'workflow',
      'pricing', 'features', 'workspace', 'userMenu',
      'success', 'footer', 'projects', 'toasts', 'chat',
      'advisor', 'github', 'pagination', 'referral', 'quickSuggestions',
      'run', 'project-email'
    ]
    const messages: any = {}

    let hasNamespaceFiles = false

    for (const ns of namespaces) {
      const nsMessages = await loadNamespace(locale, ns)
      if (Object.keys(nsMessages).length > 0) {
        messages[ns] = nsMessages
        hasNamespaceFiles = true
      }
    }

    // If we found namespace files, use them
    if (hasNamespaceFiles) {
      // Handle regional variants (ar-eg extends ar)
      if (locale.includes('-')) {
        const baseLocale = locale.split('-')[0]
        try {
          const baseMessages = await loadMessages(baseLocale, requestedNamespaces)
          // Merge base locale with regional variant (regional takes precedence)
          return deepMerge(baseMessages, messages)
        } catch {
          // Base locale not found, use regional only
        }
      }
      return messages
    }

    // If no namespaces found, return empty object
    return {}
  } catch (error) {
    console.error(`Failed to load messages for ${locale}:`, error)
    // Fallback to English
    if (locale !== 'en') {
      return loadMessages('en', requestedNamespaces)
    }
    return {}
  }
}

// Simple deep merge utility for merging base locale with regional variants
function deepMerge(target: any, source: any): any {
  const output = { ...target }
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] })
        } else {
          output[key] = deepMerge(target[key], source[key])
        }
      } else {
        Object.assign(output, { [key]: source[key] })
      }
    })
  }
  
  return output
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item)
}

function getTimeZone(locale: string): string {
  const timeZones: Record<string, string> = {
    'en': 'America/New_York',
    'ar-eg': 'Africa/Cairo',
    'ar-sa': 'Asia/Riyadh',
    'ar-ae': 'Asia/Dubai',
    'ar': 'Asia/Dubai',
    'fr-ma': 'Africa/Casablanca',
    'fr': 'Europe/Paris',
    'es': 'Europe/Madrid',
    'de': 'Europe/Berlin',
  }
  
  return timeZones[locale] || 'UTC'
}

// Legacy function for backward compatibility - can be removed once all components are migrated
// Renamed to avoid collision with next-intl's getMessages
export async function getAllMessagesForLocale(locale: string) {
  const { locales, defaultLocale } = routing
  
  // Ensure that a valid locale is used
  if (!locale || !locales.includes(locale as typeof locales[number])) {
    locale = defaultLocale
  }

  // Use the new loadMessages function that supports namespaces
  return loadMessages(locale)
}

// Export selective namespace loading for migrated pages
export async function getNamespacedMessages(locale: string, namespaces: string[]) {
  const { locales, defaultLocale } = routing
  
  // Ensure that a valid locale is used
  if (!locale || !locales.includes(locale as typeof locales[number])) {
    locale = defaultLocale
  }

  const messages = await loadMessages(locale, namespaces)
  
  // Debug logging
  if (!messages || Object.keys(messages).length === 0) {
    console.error(`⚠️ getNamespacedMessages returned empty for locale=${locale}, namespaces=${namespaces}`)
  }
  
  return messages
}

export { getTimeZone as getTimeZoneForLocale }