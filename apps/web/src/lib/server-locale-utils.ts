/**
 * Server Locale Detection Utilities
 * Smart locale detection for server-side functions in both API and page contexts
 */

import 'server-only'
import { headers } from 'next/headers'
import { locales, defaultLocale } from '@/i18n/config'
import type { Locale } from '@/i18n/config'

/**
 * Smart locale detection for server functions
 * Works in both API route context (with NextRequest) and page/server action context
 * 
 * Priority order:
 * 1. Explicit locale parameter (highest priority)
 * 2. x-sheen-locale header (set by client)
 * 3. Accept-Language header parsing
 * 4. Default to 'en' (fallback)
 */
export async function detectServerLocale(
  explicitLocale?: string,
  request?: Request
): Promise<Locale> {
  // 1. Use explicit locale if provided and valid
  if (explicitLocale && isSupportedLocale(explicitLocale)) {
    return explicitLocale as Locale
  }

  try {
    let headersList: Headers

    // 2. Get headers from either request or Next.js headers()
    if (request) {
      headersList = request.headers
    } else {
      // Server action/page context - use Next.js headers()
      headersList = await headers()
    }

    // 3. Try x-sheen-locale header first (explicit client preference)
    const clientLocale = headersList.get('x-sheen-locale')
    if (clientLocale && isSupportedLocale(clientLocale)) {
      return clientLocale as Locale
    }

    // 4. Parse Accept-Language header (browser preference)
    const acceptLanguage = headersList.get('accept-language')
    const parsedLocale = parseAcceptLanguage(acceptLanguage)
    if (parsedLocale && isSupportedLocale(parsedLocale)) {
      return parsedLocale as Locale
    }

  } catch (error) {
    // Headers access failed (edge case) - fall back to default
    console.warn('Failed to access server headers for locale detection:', error)
  }

  // 5. Fallback to default locale
  return defaultLocale
}

/**
 * Parse Accept-Language header with full BCP-47 locale support
 * Preserves regional variants like ar-eg, fr-ma instead of collapsing them
 * 
 * Example: "ar-EG,ar;q=0.9,en;q=0.8" → "ar-eg"
 */
function parseAcceptLanguage(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null

  const localePreferences = acceptLanguage
    .split(',')
    .map(lang => {
      const [locale] = lang.trim().split(';')
      return locale.toLowerCase()
    })

  // First pass: Check for exact full locale matches (ar-eg, fr-ma, etc.)
  for (const locale of localePreferences) {
    if (locales.includes(locale as Locale)) {
      return locale
    }
  }

  // Second pass: Fallback to base locale matching (ar-eg → ar)
  for (const locale of localePreferences) {
    const baseLocale = locale.split('-')[0]
    if (locales.includes(baseLocale as Locale)) {
      return baseLocale
    }
  }

  return null
}

/**
 * Check if locale is supported by our system
 */
export function isSupportedLocale(locale: string): boolean {
  return locales.includes(locale.toLowerCase() as Locale)
}

/**
 * Get supported locales list (for validation, etc.)
 */
export function getSupportedLocales(): readonly Locale[] {
  return locales
}

/**
 * Validate and normalize locale string
 * Returns normalized locale or default if invalid
 */
export function normalizeLocale(locale: string | null | undefined): Locale {
  if (!locale) return defaultLocale
  
  const normalized = locale.toLowerCase()
  return isSupportedLocale(normalized) ? normalized as Locale : defaultLocale
}

/**
 * For API routes with NextRequest - convenience wrapper
 * Usage: const locale = await getLocaleFromRequest(request)
 */
export async function getLocaleFromRequest(request: Request): Promise<Locale> {
  return detectServerLocale(undefined, request)
}

/**
 * For server actions/pages - convenience wrapper  
 * Usage: const locale = await getLocaleFromContext()
 */
export async function getLocaleFromContext(): Promise<Locale> {
  return detectServerLocale()
}

/**
 * Legacy compatibility - matches persistent-chat-server-utils pattern
 * @deprecated Use detectServerLocale instead for new code
 */
export async function getLocaleFromRequestLegacy(request: Request): Promise<string> {
  const locale = await getLocaleFromRequest(request)
  return locale
}