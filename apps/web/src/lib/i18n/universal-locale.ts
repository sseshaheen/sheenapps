/**
 * Universal Locale Resolution Utilities
 * Works in both server and client contexts for consistent locale handling
 */

import { locales } from '@/i18n/config'

// Supported backend base locales (5 bases for 9 frontend locales)
export const SUPPORTED_BASES = ['en', 'ar', 'fr', 'es', 'de'] as const
export type SupportedBase = typeof SUPPORTED_BASES[number]

/**
 * Centralized base locale mapping (eliminates scattered split('-')[0])
 * Maps regional variants to backend base locales
 *
 * Examples:
 * - ar-eg → ar
 * - fr-ma → fr
 * - en → en
 */
export function toBaseLocale(fullLocale: string): SupportedBase {
  const base = fullLocale.toLowerCase().split('-')[0]
  return SUPPORTED_BASES.includes(base as SupportedBase) ? (base as SupportedBase) : 'en'
}

/**
 * Universal locale resolver (server-safe for Next.js 15+)
 * Priority: middleware cookie > DOM lang > fallback
 *
 * Server context: Uses middleware-set locale cookie (most reliable)
 * Client context: Uses DOM documentElement.lang (set by next-intl)
 */
export async function getCurrentLocale(): Promise<string> {
  if (typeof window === 'undefined') {
    // Server context: Use middleware-set locale cookie (most reliable)
    try {
      // Dynamic import to avoid bundling server-only code in client
      const { headers } = await import('next/headers')
      const headersList = await headers() // ✅ Next.js 15: headers() is async
      // Prefer explicit locale cookie set by middleware
      const cookieHeader = headersList.get('cookie')
      const localeFromCookie = cookieHeader?.match(/locale=([^;]+)/)?.[1]
      return localeFromCookie || 'en'
    } catch {
      // Fallback if headers() fails (edge case)
      return 'en'
    }
  } else {
    // Client context: read from DOM (set by next-intl)
    return document.documentElement.lang || document.cookie.match(/locale=([^;]+)/)?.[1] || 'en';
  }
}

/**
 * Synchronous locale resolver for client-side only
 * Use when you need immediate locale without async/await
 */
export function getCurrentLocaleSync(): string {
  if (typeof window === 'undefined') {
    throw new Error('getCurrentLocaleSync() can only be used in client context')
  }
  return document.documentElement.lang || document.cookie.match(/locale=([^;]+)/)?.[1] || 'en';
}

/**
 * Validate if locale is supported by the system
 */
export function isSupportedLocale(locale: string): boolean {
  return locales.includes(locale.toLowerCase() as typeof locales[number])
}

/**
 * Validate if base locale is supported by backend
 */
export function isSupportedBase(base: string): base is SupportedBase {
  return SUPPORTED_BASES.includes(base as SupportedBase)
}