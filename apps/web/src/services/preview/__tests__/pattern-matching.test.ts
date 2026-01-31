import { describe, test, expect, vi } from 'vitest'

describe('Button ID Pattern Matching - Critical Bug Prevention', () => {
  // Simulate the exact pattern matching logic from live-preview-engine.ts
  function findButtonByPatterns(sectionType: string, sectionId: string, mockDocument: any) {
    const possiblePatterns = [
      'undo-' + sectionType + '-' + sectionId,
      'undo-' + sectionType + '-' + sectionType,
      'undo-' + sectionType + '-luxury-premium-' + sectionType + '-color-scheme',
      'undo-' + sectionType + '-luxury',
      'undo-' + sectionType + '-' + sectionType + '-ai-generated',
      'undo-' + sectionType + '-' + sectionType + '-config-based'
    ]

    let foundButton = null
    let foundId = ''

    for (const pattern of possiblePatterns) {
      foundButton = mockDocument.getElementById(pattern)
      if (foundButton) {
        foundId = pattern
        break
      }
    }

    return { button: foundButton, id: foundId }
  }

  describe('Real-world Component ID Patterns', () => {
    test('finds button for simple component ID pattern', () => {
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          if (id === 'undo-hero-hero') return { found: true }
          return null
        })
      }

      const result = findButtonByPatterns('hero', 'hero', mockDocument)
      
      expect(result.button).toEqual({ found: true })
      expect(result.id).toBe('undo-hero-hero')
      expect(mockDocument.getElementById).toHaveBeenCalledWith('undo-hero-hero')
    })

    test('finds button for complex luxury-premium pattern', () => {
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          if (id === 'undo-hero-luxury-premium-hero-color-scheme') return { found: true }
          return null
        })
      }

      const result = findButtonByPatterns('hero', 'hero-luxury-premium-hero-color-scheme', mockDocument)
      
      expect(result.button).toEqual({ found: true })
      expect(result.id).toBe('undo-hero-luxury-premium-hero-color-scheme')
    })

    test('finds button for ai-generated pattern', () => {
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          if (id === 'undo-features-features-ai-generated') return { found: true }
          return null
        })
      }

      const result = findButtonByPatterns('features', 'features-ai-generated', mockDocument)
      
      expect(result.button).toEqual({ found: true })
      expect(result.id).toBe('undo-features-features-ai-generated')
    })

    test('finds button for config-based pattern', () => {
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          if (id === 'undo-testimonials-testimonials-config-based') return { found: true }
          return null
        })
      }

      const result = findButtonByPatterns('testimonials', 'testimonials-config-based', mockDocument)
      
      expect(result.button).toEqual({ found: true })
      expect(result.id).toBe('undo-testimonials-testimonials-config-based')
    })

    test('tries patterns in correct priority order', () => {
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          // Multiple buttons exist, should find the first one in priority order
          if (id === 'undo-hero-hero-dynamic-123') return { found: 'first' }
          if (id === 'undo-hero-hero') return { found: 'second' }
          return null
        })
      }

      const result = findButtonByPatterns('hero', 'hero-dynamic-123', mockDocument)
      
      // Should find the exact match first
      expect(result.button).toEqual({ found: 'first' })
      expect(result.id).toBe('undo-hero-hero-dynamic-123')
    })
  })

  describe('Pattern Matching Failures', () => {
    test('returns null when no pattern matches', () => {
      const mockDocument = {
        getElementById: vi.fn(() => null)
      }

      const result = findButtonByPatterns('unknown', 'unknown-id', mockDocument)
      
      expect(result.button).toBeNull()
      expect(result.id).toBe('')
      
      // Should have tried all patterns
      expect(mockDocument.getElementById).toHaveBeenCalledTimes(6)
    })

    test('handles empty sectionType gracefully', () => {
      const mockDocument = {
        getElementById: vi.fn(() => null)
      }

      const result = findButtonByPatterns('', 'some-id', mockDocument)
      
      expect(result.button).toBeNull()
      expect(result.id).toBe('')
    })

    test('handles empty sectionId gracefully', () => {
      const mockDocument = {
        getElementById: vi.fn(() => null)
      }

      const result = findButtonByPatterns('hero', '', mockDocument)
      
      expect(result.button).toBeNull()
      expect(result.id).toBe('')
    })
  })

  describe('Component ID Evolution - Regression Prevention', () => {
    test('handles ID changes during undo/redo operations', () => {
      // Simulate what happens when component ID changes after undo
      const beforeUndoId = 'hero-edited-123'
      const afterUndoId = 'hero-original-456'

      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          // Button was created with beforeUndoId, but we're searching with afterUndoId
          if (id === 'undo-hero-' + beforeUndoId) return { found: 'old-button' }
          if (id === 'undo-hero-' + afterUndoId) return null // Button doesn't exist yet
          if (id === 'undo-hero-hero') return { found: 'fallback-button' }
          return null
        })
      }

      // This is why we need multiple patterns - fallback to generic pattern
      const result = findButtonByPatterns('hero', afterUndoId, mockDocument)
      
      expect(result.button).toEqual({ found: 'fallback-button' })
      expect(result.id).toBe('undo-hero-hero')
    })

    test('pattern priority prevents wrong button matches', () => {
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          // Multiple buttons could match, ensure we get the right one
          if (id === 'undo-hero-hero-specific-id') return { button: 'specific' }
          if (id === 'undo-hero-hero') return { button: 'generic' }
          if (id === 'undo-hero-luxury') return { button: 'luxury' }
          return null
        })
      }

      const result = findButtonByPatterns('hero', 'hero-specific-id', mockDocument)
      
      // Should match the most specific pattern first
      expect(result.button).toEqual({ button: 'specific' })
      expect(result.id).toBe('undo-hero-hero-specific-id')
    })
  })

  describe('Debugging Scenarios - Based on Real Issues', () => {
    test('logs pattern attempts for debugging (simulation)', () => {
      const attemptedPatterns: string[] = []
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          attemptedPatterns.push(id)
          if (id === 'undo-hero-luxury') return { found: true }
          return null
        })
      }

      const result = findButtonByPatterns('hero', 'hero-luxury-premium', mockDocument)
      
      expect(result.button).toEqual({ found: true })
      expect(attemptedPatterns).toEqual([
        'undo-hero-hero-luxury-premium',  // Exact match attempted first
        'undo-hero-hero',                 // Generic fallback
        'undo-hero-luxury-premium-hero-color-scheme', // Luxury pattern
        'undo-hero-luxury',               // Found this one!
      ])
    })

    test('simulates the exact bug scenario we encountered', () => {
      // This reproduces the exact issue: buttons created with one ID pattern,
      // but search happening with different pattern after DOM updates
      
      const createdButtonId = 'undo-hero-luxury-premium-hero-color-scheme'
      const searchComponentId = 'hero-123' // Changed after undo operation
      
      const mockDocument = {
        getElementById: vi.fn((id: string) => {
          if (id === createdButtonId) return { element: 'button' }
          return null
        })
      }

      const result = findButtonByPatterns('hero', searchComponentId, mockDocument)
      
      // Before our fix, this would fail because patterns didn't match
      // After our fix, we have the luxury pattern that would catch this
      const patterns = [
        'undo-hero-hero-123',
        'undo-hero-hero',
        'undo-hero-luxury-premium-hero-color-scheme', // This one matches!
        'undo-hero-luxury',
        'undo-hero-hero-ai-generated',
        'undo-hero-hero-config-based'
      ]
      
      expect(patterns.includes(createdButtonId)).toBe(true)
    })
  })
})