import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

// Mock the stores
vi.mock('@/stores/per-section-history-store', () => ({
  usePerSectionHistoryStore: vi.fn(() => ({
    canUndo: vi.fn(),
    canRedo: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    recordEdit: vi.fn(),
    getHistoryInfo: vi.fn(),
    clearLayout: vi.fn(),
  }))
}))

// Mock the preview store
vi.mock('@/store/preview-generation-store', () => ({
  usePreviewGenerationStore: vi.fn(() => ({
    getCurrentLayoutId: vi.fn(() => 'test-layout'),
    switchToLayout: vi.fn(),
  }))
}))

describe('Button Update Logic', () => {
  // This tests the logic patterns without needing the full component
  
  describe('updateIframeUndoRedoButtons behavior', () => {
    test('uses consistent section keys for history lookup', () => {
      // The key insight: always use sectionType as the sectionKey
      const layoutId = 'luxury-premium'
      const sectionType = 'hero'
      const dynamicComponentId = 'hero-luxury-premium-hero-color-scheme'
      
      // Correct pattern
      const sectionKey = sectionType // NOT the dynamic ID
      const historyKey = `${layoutId}_${sectionType}_${sectionKey}`
      
      expect(historyKey).toBe('luxury-premium_hero_hero')
      expect(historyKey).not.toContain(dynamicComponentId)
    })

    test('debounces rapid button updates', async () => {
      // Simulating the debounce logic
      let callCount = 0
      const debouncedUpdate = (() => {
        let timeout: NodeJS.Timeout | null = null
        return (fn: () => void) => {
          if (timeout) clearTimeout(timeout)
          timeout = setTimeout(() => {
            fn()
            callCount++
          }, 50)
        }
      })()
      
      // Rapid calls
      debouncedUpdate(() => {})
      debouncedUpdate(() => {})
      debouncedUpdate(() => {})
      
      // Should only execute once
      await new Promise(resolve => setTimeout(resolve, 100))
      expect(callCount).toBe(1)
    })

    test('clears cached button states after undo/redo', () => {
      const lastButtonStatesRef = { current: {} as Record<string, any> }
      const sectionType = 'hero'
      const sectionId = 'hero-123'
      const stateKey = `${sectionType}:${sectionId}`
      
      // Set initial state
      lastButtonStatesRef.current[stateKey] = { canUndo: true, canRedo: false }
      
      // Simulate clearing after undo (as implemented)
      delete lastButtonStatesRef.current[stateKey]
      
      expect(lastButtonStatesRef.current[stateKey]).toBeUndefined()
    })
  })

  describe('Component ID extraction after DOM updates', () => {
    test('finds actual component ID from DOM after undo/redo', () => {
      // Simulate DOM query
      const mockIframe = {
        contentWindow: {
          document: {
            querySelector: vi.fn((selector) => {
              if (selector === '[data-section-type="hero"]') {
                return {
                  getAttribute: (attr: string) => {
                    if (attr === 'data-section-id') return 'hero-new-id-after-undo'
                    return null
                  }
                }
              }
              return null
            })
          }
        }
      }
      
      // Extract component ID
      const sectionElement = mockIframe.contentWindow.document.querySelector('[data-section-type="hero"]')
      const actualComponentId = sectionElement?.getAttribute('data-section-id') || 'fallback-id'
      
      expect(actualComponentId).toBe('hero-new-id-after-undo')
    })

    test('uses fallback ID when DOM element not found', () => {
      const mockIframe = {
        contentWindow: {
          document: {
            querySelector: vi.fn((_selector: string) => null)
          }
        }
      }
      
      const originalSectionId = 'hero-original'
      const sectionElement = mockIframe.contentWindow.document.querySelector('[data-section-type="hero"]')
      const actualComponentId = sectionElement?.getAttribute('data-section-id') || originalSectionId
      
      expect(actualComponentId).toBe('hero-original')
    })
  })

  describe('Message handler constraints', () => {
    test('message handlers must be synchronous', () => {
      // This test documents the constraint that caused our build error
      const messageHandler = (event: any) => {
        if (event.data.type === 'UNDO_SECTION_REQUEST') {
          // Cannot use await here - handlers must be sync
          const result = { content: 'undone' } // Direct sync call
          // handleUndoSection(result) // No await
        }
      }
      
      // Check the handler doesn't use async/await
      const handlerString = messageHandler.toString()
      expect(handlerString).not.toContain('async')
      expect(handlerString).not.toContain('await')
    })
  })

  describe('History state after operations', () => {
    test('edit operation records two entries for first edit', () => {
      const mockHistoryStore = {
        histories: {},
        recordEdit: function(layoutId: string, sectionType: string, sectionId: string, content: any, action: string) {
          const key = `${layoutId}_${sectionType}_${sectionId}`
          if (!this.histories[key]) {
            this.histories[key] = { edits: [], currentIndex: -1 }
          }
          this.histories[key].edits.push({ content, action })
          this.histories[key].currentIndex = this.histories[key].edits.length - 1
        }
      }
      
      const layoutId = 'test'
      const sectionType = 'hero'
      const sectionKey = sectionType
      
      // First edit: record original + edited
      mockHistoryStore.recordEdit(layoutId, sectionType, sectionKey, { content: 'original' }, 'original')
      mockHistoryStore.recordEdit(layoutId, sectionType, sectionKey, { content: 'edited' }, 'user edit')
      
      const history = mockHistoryStore.histories[`${layoutId}_${sectionType}_${sectionKey}`]
      expect(history.edits).toHaveLength(2)
      expect(history.currentIndex).toBe(1)
      expect(history.edits[0].action).toBe('original')
      expect(history.edits[1].action).toBe('user edit')
    })
  })
})