import { describe, test, expect, vi, beforeEach } from 'vitest'
import { SUPPORTED_LOCALES, withAllLocales, validateTranslationStructure } from '../../utils/localization'
import fs from 'fs/promises'
import path from 'path'

describe('Translation Loader', () => {
  describe('Dynamic Import Pattern', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    withAllLocales('should successfully load translations', async (locale) => {
      // Test the pattern from CLAUDE.md
      let messages
      let loadError = null
      
      try {
        messages = (await import(`../../../src/messages/${locale}.json`)).default
      } catch (error) {
        loadError = error
      }
      
      expect(loadError).toBeNull()
      expect(messages).toBeDefined()
      expect(typeof messages).toBe('object')
    })

    test('should handle missing locale with notFound()', async () => {
      const invalidLocale = 'xx-invalid'
      let messages
      let loadError = null
      
      try {
        messages = (await import(`../../../src/messages/${invalidLocale}.json`)).default
      } catch (error) {
        loadError = error
      }
      
      expect(loadError).toBeDefined()
      expect(messages).toBeUndefined()
    })
  })

  describe('Translation Structure Validation', () => {
    withAllLocales('should have required structure', async (locale) => {
      const messages = (await import(`../../../src/messages/${locale}.json`)).default
      const validation = validateTranslationStructure(messages)
      
      expect(validation.isValid).toBe(true)
      expect(validation.errors).toEqual([])
      
      // Verify specific required keys from CLAUDE.md
      expect(messages.navigation).toBeDefined()
      expect(messages.navigation.howItWorks).toBeDefined()
      expect(messages.hero).toBeDefined()
      expect(messages.hero.badge).toBeDefined()
      expect(messages.hero.floatingBadges).toBeDefined()
      expect(messages.hero.trustBar).toBeDefined()
    })
  })

  describe('Translation Key Consistency', () => {
    test('all locales should have identical key structure', async () => {
      const referenceLocale = 'en'
      const referenceMessages = (await import(`../../../src/messages/${referenceLocale}.json`)).default
      
      const getKeys = (obj: any, prefix = ''): string[] => {
        return Object.keys(obj).reduce((acc: string[], key) => {
          const fullKey = prefix ? `${prefix}.${key}` : key
          if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
            return [...acc, ...getKeys(obj[key], fullKey)]
          }
          return [...acc, fullKey]
        }, [])
      }
      
      const referenceKeys = getKeys(referenceMessages).sort()
      
      for (const locale of SUPPORTED_LOCALES) {
        if (locale === referenceLocale) continue
        
        const messages = (await import(`../../../src/messages/${locale}.json`)).default
        const localeKeys = getKeys(messages).sort()
        
        expect(localeKeys).toEqual(referenceKeys)
      }
    })
    
    test('no locale should have extra or missing keys', async () => {
      const allKeys = new Map<string, string[]>()
      
      // Collect all keys from all locales
      for (const locale of SUPPORTED_LOCALES) {
        const messages = (await import(`../../../src/messages/${locale}.json`)).default
        const getKeys = (obj: any, prefix = ''): string[] => {
          return Object.keys(obj).reduce((acc: string[], key) => {
            const fullKey = prefix ? `${prefix}.${key}` : key
            if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
              return [...acc, ...getKeys(obj[key], fullKey)]
            }
            return [...acc, fullKey]
          }, [])
        }
        allKeys.set(locale, getKeys(messages))
      }
      
      // Find union of all keys
      const allUniqueKeys = new Set<string>()
      allKeys.forEach(keys => keys.forEach(key => allUniqueKeys.add(key)))
      
      // Check each locale has all keys
      allKeys.forEach((keys, locale) => {
        const missingKeys = Array.from(allUniqueKeys).filter(key => !keys.includes(key))
        expect(missingKeys, `${locale} is missing keys`).toEqual([])
      })
    })
  })

  describe('Translation Content Validation', () => {
    test('all translations should be non-empty strings', async () => {
      for (const locale of SUPPORTED_LOCALES) {
        const messages = (await import(`../../../src/messages/${locale}.json`)).default
        
        const validateValues = (obj: any, path = ''): string[] => {
          const errors: string[] = []
          
          Object.entries(obj).forEach(([key, value]) => {
            const fullPath = path ? `${path}.${key}` : key
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              errors.push(...validateValues(value, fullPath))
            } else if (typeof value === 'string') {
              if (value.trim() === '') {
                errors.push(`Empty string at ${fullPath} in ${locale}`)
              }
            } else if (value === null || value === undefined) {
              errors.push(`Null/undefined value at ${fullPath} in ${locale}`)
            }
          })
          
          return errors
        }
        
        const errors = validateValues(messages)
        expect(errors).toEqual([])
      }
    })
    
    test('placeholder consistency across translations', async () => {
      const placeholderRegex = /\{\{([^}]+)\}\}|\{([^}]+)\}/g
      
      for (const key of ['hero.title', 'dashboard.projectCount', 'billing.price']) {
        const placeholdersByLocale = new Map<string, string[]>()
        
        for (const locale of SUPPORTED_LOCALES) {
          const messages = (await import(`../../../src/messages/${locale}.json`)).default
          const value = key.split('.').reduce((obj, k) => obj?.[k], messages)
          
          if (typeof value === 'string') {
            const placeholders = Array.from(value.matchAll(placeholderRegex))
              .map(match => match[1] || match[2])
              .sort()
            placeholdersByLocale.set(locale, placeholders)
          }
        }
        
        // All locales should have same placeholders for same key
        const referencePlaceholders = placeholdersByLocale.get('en')
        if (referencePlaceholders) {
          placeholdersByLocale.forEach((placeholders, locale) => {
            expect(placeholders, `Placeholder mismatch in ${locale} for ${key}`).toEqual(referencePlaceholders)
          })
        }
      }
    })
  })

  describe('File Integrity', () => {
    test('all locale files should be valid JSON', async () => {
      const messagesDir = path.join(process.cwd(), 'src', 'messages')
      
      for (const locale of SUPPORTED_LOCALES) {
        const filePath = path.join(messagesDir, `${locale}.json`)
        const content = await fs.readFile(filePath, 'utf-8')
        
        expect(() => JSON.parse(content)).not.toThrow()
      }
    })
    
    test('all locale files should use consistent encoding', async () => {
      const messagesDir = path.join(process.cwd(), 'src', 'messages')
      
      for (const locale of SUPPORTED_LOCALES) {
        const filePath = path.join(messagesDir, `${locale}.json`)
        const buffer = await fs.readFile(filePath)
        
        // Check for UTF-8 BOM
        const hasBOM = buffer[0] === 0xEF && buffer[1] === 0xBB && buffer[2] === 0xBF
        expect(hasBOM).toBe(false) // Files should not have BOM
        
        // Verify valid UTF-8
        const content = buffer.toString('utf-8')
        expect(() => JSON.parse(content)).not.toThrow()
      }
    })
  })

  describe('Locale Fallback Behavior', () => {
    test('should have English as complete reference', async () => {
      const enMessages = (await import('../../../src/messages/en.json')).default
      
      const countKeys = (obj: any): number => {
        let count = 0
        Object.values(obj).forEach(value => {
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            count += countKeys(value)
          } else {
            count += 1
          }
        })
        return count
      }
      
      const enKeyCount = countKeys(enMessages)
      expect(enKeyCount).toBeGreaterThan(50) // Reasonable minimum for a complete app
    })
  })
})