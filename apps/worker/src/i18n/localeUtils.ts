import path from 'path'
import type { LocaleInfo } from '../types/fastify-i18n'

/**
 * Supported base locales for the worker.
 * These map to the message catalog directories.
 */
export const SUPPORTED_LOCALES = ['en', 'ar', 'fr', 'es', 'de'] as const
export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

/**
 * Regional variants that map to base locales.
 * Frontend sends these; backend maps to base locale.
 */
export const REGIONAL_VARIANTS: Record<string, SupportedLocale> = {
  // Arabic variants
  'ar-eg': 'ar',
  'ar-sa': 'ar',
  'ar-ae': 'ar',
  // French variants
  'fr-ma': 'fr',
  'fr-fr': 'fr',
  'fr-ca': 'fr',
  // Spanish variants
  'es-es': 'es',
  'es-mx': 'es',
  // German variants
  'de-de': 'de',
  'de-at': 'de',
  // English variants
  'en-us': 'en',
  'en-gb': 'en',
  'en-au': 'en',
}

/**
 * Default locale when no match is found.
 */
export const DEFAULT_LOCALE: SupportedLocale = 'en'

/**
 * Fixed catalog root directory for security.
 */
export const I18N_DIR = process.env.I18N_DIR || path.join(process.cwd(), 'compiled')

/**
 * Locale fallback chain result.
 * Includes the resolution path for debugging.
 */
export interface LocaleFallbackResult extends LocaleInfo {
  /** How the locale was resolved */
  resolution: 'exact' | 'regional' | 'base' | 'default'
  /** The original input before resolution */
  original: string | null
}

/**
 * Resolve a locale with proper fallback chain:
 * 1. Exact match (if input is a supported base locale)
 * 2. Regional variant mapping (ar-eg → ar)
 * 3. Base locale extraction (unknown-XX → unknown base check)
 * 4. Default locale fallback (unknown → en)
 *
 * @param headerLocale - x-sheen-locale header value
 * @param cookieLocale - Cookie-based locale (optional)
 * @param acceptLanguage - Accept-Language header (optional)
 * @returns Resolved locale info with fallback chain result
 */
export function resolveLocale(
  headerLocale?: string,
  cookieLocale?: string,
  acceptLanguage?: string
): LocaleInfo {
  const result = resolveLocaleWithChain(headerLocale, cookieLocale, acceptLanguage)
  return {
    base: result.base,
    tag: result.tag,
    region: result.region
  }
}

/**
 * Resolve locale with full fallback chain information.
 * Use this when you need to know how the locale was resolved.
 */
export function resolveLocaleWithChain(
  headerLocale?: string,
  cookieLocale?: string,
  acceptLanguage?: string
): LocaleFallbackResult {
  const candidate = headerLocale || cookieLocale || parseAcceptLanguage(acceptLanguage) || null

  if (!candidate) {
    return {
      base: DEFAULT_LOCALE,
      tag: DEFAULT_LOCALE,
      region: null,
      resolution: 'default',
      original: null
    }
  }

  const normalized = candidate.toLowerCase().trim()

  // 1. Exact match against supported base locales
  if (SUPPORTED_LOCALES.includes(normalized as SupportedLocale)) {
    return {
      base: normalized as SupportedLocale,
      tag: normalized,
      region: null,
      resolution: 'exact',
      original: candidate
    }
  }

  // 2. Check regional variants mapping
  if (normalized in REGIONAL_VARIANTS) {
    // Non-null assertion safe: we've verified key exists via `in` check
    const base = REGIONAL_VARIANTS[normalized]!
    const parts = normalized.split('-')
    return {
      base,
      tag: normalized,
      region: parts[1]?.toUpperCase() || null,
      resolution: 'regional',
      original: candidate
    }
  }

  // 3. Extract base locale from unknown regional format (e.g., "ar-XY" → "ar")
  const parts = normalized.split('-')
  const basePart = parts[0]
  if (basePart && SUPPORTED_LOCALES.includes(basePart as SupportedLocale)) {
    return {
      base: basePart as SupportedLocale,
      tag: normalized,
      region: parts[1]?.toUpperCase() || null,
      resolution: 'base',
      original: candidate
    }
  }

  // 4. Default fallback
  console.warn(`[LocaleUtils] Unknown locale "${candidate}", falling back to "${DEFAULT_LOCALE}"`)
  return {
    base: DEFAULT_LOCALE,
    tag: DEFAULT_LOCALE,
    region: null,
    resolution: 'default',
    original: candidate
  }
}

// Legacy function for backward compatibility
export function resolveLocaleLegacy(
  headerLocale?: string,
  cookieLocale?: string,
  acceptLanguage?: string
): string {
  return resolveLocale(headerLocale, cookieLocale, acceptLanguage).base
}

export function isRTL(locale: string): boolean {
  return locale.startsWith('ar')
}

// **EXPERT ENHANCEMENT**: Enhanced Accept-Language parsing with q-value support
function parseAcceptLanguage(header?: string): string | undefined {
  if (!header) return undefined
  
  // Parse Accept-Language with q-weights
  const languages = header
    .split(',')
    .map(lang => {
      const parts = lang.trim().split(';q=')
      const localePart = parts[0]
      const qValue = parts[1]
      return {
        locale: localePart ? localePart.trim().toLowerCase() : '',
        quality: qValue ? parseFloat(qValue) : 1.0
      }
    })
    .filter(l => l.locale) // Filter out empty locales
    .sort((a, b) => b.quality - a.quality)

  // Return first supported locale
  for (const { locale } of languages) {
    if (SUPPORTED_LOCALES.includes(locale as any)) {
      return locale
    }
    const basePart = locale.split('-')[0]
    if (basePart && SUPPORTED_LOCALES.includes(basePart as any)) {
      return basePart
    }
  }
  
  return undefined
}

// **EXPERT ENHANCEMENT**: Filesystem path security validation
// Uses path.relative pattern to prevent path traversal attacks
// Accepts regional tags like 'ar-eg' and normalizes to base locale 'ar'
export function validateLocalePath(locale: string, namespace: string): string | null {
  // Normalize regional tags to base locale (ar-eg → ar, fr-ma → fr)
  // This makes the function foolproof - callers can pass either base or regional
  const resolved = resolveLocaleWithChain(locale)
  const baseLocale = resolved.base

  // Security: validate normalized locale against whitelist
  if (!SUPPORTED_LOCALES.includes(baseLocale as any)) {
    console.warn(`⚠️  Rejecting non-whitelisted locale: ${locale} (resolved to: ${baseLocale})`)
    return null
  }

  // Security: validate namespace format (alphanumeric, dots, hyphens, underscores only)
  // This prevents path traversal via namespace like "../../../etc/passwd"
  if (!/^[a-z0-9_.-]{1,64}$/i.test(namespace)) {
    console.error(`🚨 SECURITY: Invalid namespace format rejected: ${namespace}`)
    return null
  }

  // Use fixed root and resolve paths with normalized base locale
  const root = path.resolve(I18N_DIR)
  const filePath = path.resolve(root, baseLocale, `${namespace}.json`)

  // Security: use path.relative to detect escape attempts
  // If the relative path starts with ".." or is absolute, it escaped the root
  const rel = path.relative(root, filePath)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    console.error(`🚨 SECURITY: Path escape attempted: ${locale}/${namespace}`)
    return null
  }

  return filePath
}