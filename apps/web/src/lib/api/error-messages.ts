/**
 * API Error Message Localization Service
 * Provides localized error messages for API routes using existing locale utilities
 */

import 'server-only'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'
import { toBaseLocale } from '@/lib/i18n/universal-locale'
import { loadNamespace } from '@/i18n/message-loader'

/**
 * Simple message interpolation for basic parameter substitution
 * Supports {param} syntax for parameter replacement
 *
 * Example: interpolateMessage("Hello {name}", { name: "World" }) → "Hello World"
 */
function interpolateMessage(message: string, params?: Record<string, any>): string {
  if (!params) return message

  return Object.entries(params).reduce((result, [key, value]) => {
    return result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
  }, message)
}

/**
 * Load API error messages for a specific locale
 * Uses dynamic imports to load the appropriate translation file
 */
async function loadErrorMessages(locale: string): Promise<Record<string, any>> {
  // Try the full locale first
  let messages = await loadNamespace(locale, 'api-errors')

  if (Object.keys(messages).length > 0) {
    return messages
  }

  // Fallback to base locale if regional variant doesn't exist
  const baseLocale = toBaseLocale(locale)
  if (baseLocale !== locale) {
    messages = await loadNamespace(baseLocale, 'api-errors')
    if (Object.keys(messages).length > 0) {
      return messages
    }
  }

  // Final fallback to English
  if (locale !== 'en') {
    messages = await loadNamespace('en', 'api-errors')
    if (Object.keys(messages).length > 0) {
      return messages
    }
  }

  return {
    general: {
      internalError: "An unexpected error occurred"
    }
  }
}

/**
 * Get a localized error message by key
 * Supports nested keys using dot notation (e.g., "trials.planRequired")
 */
export async function getLocalizedError(
  key: string,
  locale: string,
  params?: Record<string, any>
): Promise<string> {
  const messages = await loadErrorMessages(locale)

  // Navigate nested object using key path
  const keyParts = key.split('.')
  let message: any = messages

  for (const part of keyParts) {
    if (message && typeof message === 'object' && part in message) {
      message = message[part]
    } else {
      // Key not found, return a fallback
      console.warn(`Error message key "${key}" not found for locale "${locale}"`)
      return `Error: ${key}` // Fallback that shows the key for debugging
    }
  }

  if (typeof message !== 'string') {
    console.warn(`Error message key "${key}" does not resolve to a string for locale "${locale}"`)
    return `Error: ${key}`
  }

  return interpolateMessage(message, params)
}

/**
 * Convenience function to get localized error message from a Request object
 * Automatically detects locale from request headers
 */
export async function getLocalizedErrorFromRequest(
  request: Request,
  key: string,
  params?: Record<string, any>
): Promise<string> {
  const locale = await getLocaleFromRequest(request)
  return getLocalizedError(key, locale, params)
}

/**
 * Create a standardized error response object with localization
 * Follows the lightweight error contract from the implementation plan
 */
export async function createLocalizedErrorResponse(
  request: Request,
  errorKey: string,
  errorCode: string,
  params?: Record<string, any>
): Promise<{
  error: {
    message: string
    code: string
    locale: string
  }
}> {
  const locale = await getLocaleFromRequest(request)
  const message = await getLocalizedError(errorKey, locale, params)

  return {
    error: {
      message,
      code: errorCode,
      locale
    }
  }
}