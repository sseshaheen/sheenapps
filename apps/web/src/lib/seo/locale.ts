/**
 * SEO Locale Helpers
 * Single source of truth for locale transformations
 */

/**
 * OpenGraph locale mapping
 * OG requires underscore format: en_US, ar_EG, etc.
 */
const OG_LOCALE_MAP: Record<string, string> = {
  en: 'en_US',
  ar: 'ar_EG', // OpenGraph doesn't have ar_AR; use ar_EG as Arabic fallback
  'ar-eg': 'ar_EG',
  'ar-sa': 'ar_SA',
  'ar-ae': 'ar_AE',
  fr: 'fr_FR',
  'fr-ma': 'fr_MA',
  es: 'es_ES',
  de: 'de_DE',
}

/**
 * Convert locale to OpenGraph format (underscore)
 * @example toOgLocale('ar-eg') => 'ar_EG'
 */
export function toOgLocale(locale: string): string {
  return OG_LOCALE_MAP[locale] ?? (locale.startsWith('ar') ? 'ar_EG' : 'en_US')
}

/**
 * Convert locale to BCP-47 format (hyphen with uppercase region)
 * @example toBCP47('ar-eg') => 'ar-EG'
 */
export function toBCP47(tag: string): string {
  if (tag === 'x-default') return tag
  return tag.replace(/-([a-z]{2})$/i, (_, region) => `-${region.toUpperCase()}`)
}

/**
 * Check if locale is RTL (Arabic)
 */
export function isRtlLocale(locale: string): boolean {
  return locale === 'ar' || locale.startsWith('ar-')
}

/**
 * Get canonical URL path (English at root, others with locale prefix)
 * @example getCanonicalPath('/blog', 'en') => '/blog'
 * @example getCanonicalPath('/blog', 'ar') => '/ar/blog'
 */
export function getCanonicalPath(path: string, locale: string): string {
  return locale === 'en' ? path : `/${locale}${path}`
}

/**
 * Get full canonical URL
 */
export function getCanonicalUrl(path: string, locale: string, baseUrl = 'https://www.sheenapps.com'): string {
  return `${baseUrl}${getCanonicalPath(path, locale)}`
}
