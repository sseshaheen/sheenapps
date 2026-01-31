import { notFound } from 'next/navigation'
import { locales, defaultLocale } from './config'
import { loadNamespace } from './message-loader'

// Translation section types
export type TranslationSection = 
  | 'navigation' 
  | 'hero' 
  | 'features' 
  | 'pricing' 
  | 'footer'
  | 'auth'
  | 'workspace'
  | 'builder'
  | 'common'
  | 'errors'

// Cache for loaded translation sections
const translationCache = new Map<string, any>()

/**
 * Load a specific translation section on-demand
 */
export async function getMessageSection(locale: string, section: TranslationSection) {
  // Ensure that a valid locale is used
  if (!locale || !locales.includes(locale as typeof locales[number])) {
    locale = defaultLocale
  }

  const cacheKey = `${locale}-${section}`
  
  // Return cached section if available
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)
  }

  try {
    const sectionData = await loadNamespace(locale, section)

    if (!sectionData || Object.keys(sectionData).length === 0) {
      console.warn(`Translation section '${section}' not found for locale '${locale}'`)
      // Try loading English as fallback
      if (locale !== 'en') {
        return getMessageSection('en', section)
      }
      return {}
    }

    // Cache the section
    translationCache.set(cacheKey, sectionData)

    return sectionData
  } catch (error) {
    console.error(`Failed to load translation section '${section}' for locale '${locale}':`, error)
    if (locale !== 'en') {
      return getMessageSection('en', section)
    }
    return {}
  }
}

/**
 * Load multiple translation sections at once
 */
export async function getMessageSections(locale: string, sections: TranslationSection[]) {
  const results: Record<string, any> = {}
  
  await Promise.all(
    sections.map(async (section) => {
      results[section] = await getMessageSection(locale, section)
    })
  )
  
  return results
}

/**
 * Preload critical translation sections
 */
export async function preloadCriticalSections(locale: string) {
  const criticalSections: TranslationSection[] = ['navigation', 'hero', 'common']
  return getMessageSections(locale, criticalSections)
}

/**
 * Clear translation cache (useful for development/testing)
 */
export function clearTranslationCache() {
  translationCache.clear()
}