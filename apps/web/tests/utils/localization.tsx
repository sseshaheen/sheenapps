import { describe, test, expect, vi } from 'vitest'
import React, { type ReactElement } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { factories } from '../factories'

// All supported locales from CLAUDE.md
export const SUPPORTED_LOCALES = [
  'en',
  'ar-eg',
  'ar-sa', 
  'ar-ae',
  'ar',
  'fr',
  'fr-ma',
  'es',
  'de'
] as const

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]

// RTL locales
export const RTL_LOCALES = ['ar', 'ar-eg', 'ar-sa', 'ar-ae'] as const
export const isRTL = (locale: string): boolean => RTL_LOCALES.includes(locale as any)

// Test helper to run tests for all locales
export const withAllLocales = (
  testName: string,
  testFn: (locale: SupportedLocale) => void | Promise<void>
) => {
  SUPPORTED_LOCALES.forEach(locale => {
    test(`${testName} - ${locale}`, async () => {
      await testFn(locale)
    })
  })
}

// Test helper to run tests for RTL locales only
export const withRTLLocales = (
  testName: string,
  testFn: (locale: SupportedLocale) => void | Promise<void>
) => {
  RTL_LOCALES.forEach(locale => {
    test(`${testName} - ${locale} (RTL)`, async () => {
      await testFn(locale)
    })
  })
}

// Mock translation loader
export const mockTranslationLoader = (locale: string) => {
  return vi.fn().mockImplementation(async () => {
    return {
      default: factories.translation.createComplete(locale)
    }
  })
}

// Translation key validator
export const validateTranslationKeys = (
  translations: Record<string, any>,
  referenceKeys: string[],
  locale: string
) => {
  const flattenKeys = (obj: any, prefix = ''): string[] => {
    return Object.keys(obj).reduce((acc: string[], key) => {
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        return [...acc, ...flattenKeys(obj[key], fullKey)]
      }
      return [...acc, fullKey]
    }, [])
  }
  
  const actualKeys = flattenKeys(translations)
  const missingKeys = referenceKeys.filter(key => !actualKeys.includes(key))
  const extraKeys = actualKeys.filter(key => !referenceKeys.includes(key))
  
  return {
    isValid: missingKeys.length === 0 && extraKeys.length === 0,
    missingKeys,
    extraKeys,
    locale
  }
}

// Custom render function with i18n context
interface I18nRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  locale?: SupportedLocale
  translations?: Record<string, any>
}

export const renderWithI18n = (
  ui: ReactElement,
  { locale = 'en', translations, ...options }: I18nRenderOptions = {}
) => {
  const defaultTranslations = factories.translation.createComplete(locale)
  
  // Mock the locale context
  const I18nWrapper = ({ children }: { children: React.ReactNode }) => {
    return (
      <div dir={isRTL(locale) ? 'rtl' : 'ltr'} lang={locale}>
        {children}
      </div>
    )
  }
  
  return render(ui, {
    wrapper: I18nWrapper,
    ...options
  })
}

// Helper to test translation loading pattern from CLAUDE.md
export const testTranslationLoadingPattern = async (
  componentPath: string,
  locale: SupportedLocale
) => {
  // This matches the pattern from CLAUDE.md:
  // messages = (await import(`../../messages/${locale}.json`)).default;
  
  const loadTranslation = async (locale: string) => {
    try {
      const messages = (await import(`../../messages/${locale}.json`)).default
      return { success: true, messages }
    } catch (error) {
      return { success: false, error }
    }
  }
  
  const result = await loadTranslation(locale)
  expect(result.success).toBe(true)
  expect(result.messages).toBeDefined()
  
  return result.messages
}

// Helper to validate translation structure matches CLAUDE.md requirements
export const validateTranslationStructure = (translations: any) => {
  // Required top-level keys from CLAUDE.md
  const requiredSections = ['navigation', 'hero', 'common']
  
  // Required hero subsections from CLAUDE.md
  const requiredHeroKeys = ['badge', 'floatingBadges', 'trustBar']
  
  const errors: string[] = []
  
  // Check top-level sections
  requiredSections.forEach(section => {
    if (!translations[section]) {
      errors.push(`Missing required section: ${section}`)
    }
  })
  
  // Check hero subsections
  if (translations.hero) {
    requiredHeroKeys.forEach(key => {
      if (!translations.hero[key]) {
        errors.push(`Missing required hero.${key}`)
      }
    })
  }
  
  return {
    isValid: errors.length === 0,
    errors
  }
}

// Helper to test locale persistence
export const testLocalePersistence = (
  getLocale: () => string,
  setLocale: (locale: string) => void
) => {
  const initialLocale = getLocale()
  
  // Test setting each locale
  SUPPORTED_LOCALES.forEach(locale => {
    setLocale(locale)
    expect(getLocale()).toBe(locale)
  })
  
  // Restore initial locale
  setLocale(initialLocale)
}

// Helper to generate test IDs for i18n components
export const i18nTestId = (key: string, locale?: string) => {
  return locale ? `i18n-${key}-${locale}` : `i18n-${key}`
}

// Mock for Next.js dynamic imports
export const mockNextDynamicImport = () => {
  return vi.fn().mockImplementation((importFn: () => Promise<any>) => {
    const Component = ({ locale }: { locale: string }) => {
      return <div>{JSON.stringify(factories.translation.create(locale))}</div>
    }
    Component.displayName = 'MockDynamicComponent'
    return Component
  })
}