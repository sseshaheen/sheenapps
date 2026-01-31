/**
 * Persistent Chat Server Utilities
 * Server-side helper functions for persistent chat functionality
 */

import 'server-only'
import crypto from 'crypto'

/**
 * EXPERT FIX: Get full BCP-47 locale from request headers
 * Preserves regional variants like ar-eg, fr-ma instead of collapsing them
 */
export async function getLocaleFromRequest(request: Request): Promise<string> {
  // First try to get locale from x-sheen-locale header (from client)
  const explicitLocale = request.headers.get('x-sheen-locale')
  if (explicitLocale && isSupportedLocale(explicitLocale)) {
    return explicitLocale
  }
  
  // Fallback to Accept-Language but preserve full locales
  const acceptLanguage = request.headers.get('accept-language')
  return parseFullLocaleServer(acceptLanguage) || 'en'
}

/**
 * EXPERT FIX: Parse Accept-Language header preserving full BCP-47 locales
 * Backend now supports ar-eg, ar-sa, ar-ae, fr-ma - don't collapse them!
 */
function parseFullLocaleServer(acceptLanguage: string | null): string | null {
  if (!acceptLanguage) return null
  
  const locales = acceptLanguage.split(',').map(lang => {
    const [locale] = lang.trim().split(';')
    return locale.toLowerCase()
  })
  
  // Check for full locale matches first (ar-eg, fr-ma, etc.)
  const supportedFullLocales = [
    'en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 
    'fr', 'fr-ma', 'es', 'de'
  ]
  
  for (const locale of locales) {
    if (supportedFullLocales.includes(locale)) {
      return locale
    }
  }
  
  // Fallback to base locale matching
  for (const locale of locales) {
    const base = locale.split('-')[0]
    if (['en', 'ar', 'fr', 'es', 'de'].includes(base)) {
      return base
    }
  }
  
  return 'en'
}

/**
 * Check if locale is supported by our system
 */
function isSupportedLocale(locale: string): boolean {
  const supportedLocales = [
    'en', 'ar', 'ar-eg', 'ar-sa', 'ar-ae', 
    'fr', 'fr-ma', 'es', 'de'
  ]
  return supportedLocales.includes(locale.toLowerCase())
}

/**
 * DEPRECATED: Old function that collapses locales - DO NOT USE
 * Kept for backward compatibility but should be replaced
 */
function parseLocaleServer(acceptLanguage: string | null): string | null {
  console.warn('parseLocaleServer is deprecated - use parseFullLocaleServer instead')
  return parseFullLocaleServer(acceptLanguage)
}

/**
 * Sign HMAC for backend authentication
 */
export function signHmac(secret: string, canonical: string): string {
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex')
}