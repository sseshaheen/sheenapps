/**
 * i18n SEO utilities for proper BCP-47 formatting and canonical URLs
 * Based on expert recommendations for multilingual SEO
 */

/**
 * Convert locale to proper BCP-47 format (e.g., ar-eg → ar-EG, ar-sa → ar-SA)
 * Critical for proper hreflang tags
 */
export const toBCP47 = (tag: string): string => {
  if (tag === 'x-default') return tag
  return tag.replace(/-([a-z]{2})$/i, (_, region) => `-${region.toUpperCase()}`)
}

/**
 * Get stable build timestamp for consistent sitemap dates
 */
export const getBuildTime = (): Date => {
  // Use environment variable if available (set in CI/CD)
  if (process.env.NEXT_PUBLIC_BUILD_TIME) {
    return new Date(process.env.NEXT_PUBLIC_BUILD_TIME)
  }
  
  // Use Git commit timestamp if available
  if (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT) {
    return new Date('2025-01-01') // Fallback for now - could enhance with git timestamp
  }
  
  // Stable fallback date
  return new Date('2025-01-01')
}

/**
 * Generate multilingual alternates only for available locales
 * Prevents Google from crawling non-existent routes
 */
export function generateMultilingualAlternates(
  basePath: string,
  availableLocales: string[] = ['en']
): Array<{ hreflang: string; href: string }> {
  const baseUrl = 'https://www.sheenapps.com'
  
  return availableLocales
    .concat('x-default')
    .map(locale => {
      // Handle canonical English (no /en prefix)
      const pathSegment = locale === 'en' ? '' : `/${locale}`
      
      // x-default points to canonical root
      const href = locale === 'x-default'
        ? `${baseUrl}${basePath}`
        : `${baseUrl}${pathSegment}${basePath}`
      
      return { hreflang: locale, href }
    })
    .map(alternate => ({
      ...alternate,
      hreflang: toBCP47(alternate.hreflang)
    }))
}

/**
 * Get canonical URL for a given path and locale
 */
export function getCanonicalUrl(basePath: string, locale: string = 'en'): string {
  const baseUrl = 'https://www.sheenapps.com'
  
  // English is canonical at root (no /en prefix)
  if (locale === 'en') {
    return `${baseUrl}${basePath}`
  }
  
  return `${baseUrl}/${locale}${basePath}`
}

/**
 * Default available locales (filtered for production)
 */
export const getAvailableLocales = (): string[] => {
  return [
    'en',    // Canonical at root
    'ar-eg', 
    'ar-sa', 
    'ar-ae', 
    'ar',    
    'fr',    // fr-ma collapsed to fr
    'es',    
    'de'     
  ]
}