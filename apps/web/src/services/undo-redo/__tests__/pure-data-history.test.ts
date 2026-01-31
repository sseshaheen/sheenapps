/**
 * Pure Data History Tests - Sprint 3 Validation
 * Expert requirement: "No DOM manipulation for history"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PureDataHistoryManager } from '../PureDataHistoryManager'
import { useBuilderStore, selectors } from '@/store/builder-store'

// Mock the event logger
vi.mock('@/utils/event-logger', () => ({
  events: {
    emit: vi.fn()
  }
}))

// Mock the builder store
vi.mock('@/store/builder-store', () => ({
  useBuilderStore: vi.fn(),
  selectors: {
    canUndo: vi.fn(),
    canRedo: vi.fn(),
    currentSections: vi.fn(),
    currentLayout: vi.fn()
  }
}))

describe('Pure Data History Manager', () => {
  let historyManager: PureDataHistoryManager
  let mockState: any
  let mockStore: any
  let mockUseBuilderStore: any

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks()
    
    // Setup mocks
    mockStore = {
      getState: vi.fn(),
      setState: vi.fn(),
      subscribe: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn()
    }
    
    // Create mock state
    mockState = {
      layouts: {
        'layout-1': {
          id: 'layout-1',
          name: 'Test Layout',
          sections: {
            'hero-1': {
              id: 'hero-1',
              type: 'hero',
              content: { html: '<div>Hero</div>', props: {} },
              styles: { css: '', variables: {} },
              metadata: { lastModified: Date.now(), userAction: 'test', aiGenerated: false }
            }
          }
        }
      },
      history: {
        stack: [
          {
            id: 'snapshot-1',
            timestamp: Date.now() - 1000,
            userAction: 'edit_hero',
            layoutId: 'layout-1',
            sectionsState: {
              'hero-1': {
                id: 'hero-1',
                type: 'hero',
                content: { html: '<div>Old Hero</div>', props: {} },
                styles: { css: '', variables: {} },
                metadata: { lastModified: Date.now() - 1000, userAction: 'initial', aiGenerated: false }
              }
            }
          }
        ],
        index: 0
      },
      ui: {
        currentLayoutId: 'layout-1',
        modal: null,
        activeEditSection: null
      }
    }

    // Setup store mocks
    mockStore.getState.mockReturnValue(mockState)
    
    // Cast mocked functions to access mock methods
    mockUseBuilderStore = useBuilderStore as any
    const mockSelectors = selectors as any
    
    // Mock the useBuilderStore to have both hook functionality and store methods
    mockUseBuilderStore.mockImplementation((selector: any) => {
      if (selector) {
        return selector(mockState)
      }
      return mockStore
    })
    
    // Add getState method to the mocked store
    mockUseBuilderStore.getState = vi.fn().mockReturnValue({
      ...mockState,
      undo: vi.fn(),
      redo: vi.fn()
    })
    mockUseBuilderStore.setState = vi.fn()
    mockUseBuilderStore.subscribe = vi.fn()
    
    // Mock the store actions
    mockStore.undo = vi.fn()
    mockStore.redo = vi.fn()

    mockSelectors.canUndo.mockReturnValue(true)
    mockSelectors.canRedo.mockReturnValue(false)
    mockSelectors.currentSections.mockReturnValue(mockState.layouts['layout-1'].sections)
    mockSelectors.currentLayout.mockReturnValue(mockState.layouts['layout-1'])

    historyManager = new PureDataHistoryManager()
  })

  describe('Pure Data Undo Operations', () => {
    it('performs undo using pure data operations only', () => {
      const result = historyManager.undo()

      expect(result.success).toBe(true)
      expect(result.operation).toBe('undo')
      expect(result.sectionsAffected).toContain('hero-1')
      // The undo function should be called on the store state
      const storeState = mockUseBuilderStore.getState()
      expect(storeState.undo).toHaveBeenCalled()
    })

    it('prevents undo when no history available', () => {
      const mockSelectors = selectors as any
      mockSelectors.canUndo.mockReturnValue(false)

      const result = historyManager.undo()

      expect(result.success).toBe(false)
      expect(result.error).toContain('No history available')
      // The undo function should not be called when canUndo is false
      const storeState = mockUseBuilderStore.getState()
      expect(storeState.undo).not.toHaveBeenCalled()
    })

    it('tracks performance metrics for undo operations', async () => {
      const startTime = Date.now() - 1000 // Use a time in the past
      
      const result = historyManager.undo()
      
      expect(result.success).toBe(true)
      expect(result.timestamp).toBeGreaterThan(startTime)
      
      // Verify tracking was called  
      // Event logger is mocked at the top of the file, so we can access it directly
      const { events } = await vi.importMock('@/utils/event-logger') as any
      expect(events.emit).toHaveBeenCalledWith('builder:undo', {
        duration: expect.any(Number),
        sectionsAffected: 1,
        method: 'pure_data',
        timestamp: expect.any(Number)
      })
    })
  })

  describe('Pure Data Redo Operations', () => {
    it('performs redo using pure data operations only', () => {
      const mockSelectors = selectors as any
      mockSelectors.canRedo.mockReturnValue(true)

      const result = historyManager.redo()

      expect(result.success).toBe(true)
      expect(result.operation).toBe('redo')
      // The redo function should be called on the store state
      const storeState = mockUseBuilderStore.getState()
      expect(storeState.redo).toHaveBeenCalled()
    })

    it('prevents redo when no forward history available', () => {
      const mockSelectors = selectors as any
      mockSelectors.canRedo.mockReturnValue(false)

      const result = historyManager.redo()

      expect(result.success).toBe(false)
      expect(result.error).toContain('No forward history available')
      // The redo function should not be called when canRedo is false
      const storeState = mockUseBuilderStore.getState()
      expect(storeState.redo).not.toHaveBeenCalled()
    })
  })

  describe('History State Management', () => {
    it('gets history state using pure selectors', () => {
      const historyState = historyManager.getHistoryState()

      expect(historyState).toEqual({
        canUndo: true,
        canRedo: false,
        sectionsCount: 1,
        currentLayoutId: 'layout-1',
        historyLength: 1,
        currentIndex: 0
      })
    })

    it('validates history integrity without DOM access', () => {
      const validation = historyManager.validateHistoryIntegrity()

      expect(validation.isValid).toBe(true)
      expect(validation.issues).toHaveLength(0)
      expect(validation.metrics).toEqual({
        totalSnapshots: 1,
        indexInBounds: true,
        allSnapshotsValid: true
      })
    })

    it('detects invalid history state', () => {
      // Corrupt the history
      mockState.history.index = 99 // Out of bounds
      mockState.history.stack[0].sectionsState = null // Invalid snapshot

      const validation = historyManager.validateHistoryIntegrity()

      expect(validation.isValid).toBe(false)
      expect(validation.issues.length).toBeGreaterThan(0)
      expect(validation.issues.some(issue => issue.includes('out of bounds'))).toBe(true)
      expect(validation.issues.some(issue => issue.includes('invalid sectionsState'))).toBe(true)
    })
  })

  describe('Performance Metrics', () => {
    it('calculates performance metrics without DOM queries', () => {
      const metrics = historyManager.getPerformanceMetrics()

      expect(metrics).toMatchObject({
        historySize: expect.any(Number),
        currentIndex: expect.any(Number),
        sectionsCount: expect.any(Number),
        memoryEstimate: expect.any(Number),
        lastOperation: expect.any(Number)
      })
    })

    it('estimates memory usage from pure data', () => {
      const metrics = historyManager.getPerformanceMetrics()

      // Memory estimate should be reasonable (less than 1MB for small state)
      expect(metrics.memoryEstimate).toBeLessThan(1024 * 1024)
      expect(metrics.memoryEstimate).toBeGreaterThan(0)
    })
  })

  describe('Error Handling', () => {
    it('handles store errors gracefully', () => {
      // Mock the store's getState to return a state with an undo function that throws
      mockUseBuilderStore.getState = vi.fn().mockReturnValue({
        ...mockState,
        undo: vi.fn().mockImplementation(() => {
          throw new Error('Store error')
        }),
        redo: vi.fn()
      })

      const result = historyManager.undo()

      expect(result.success).toBe(false)
      expect(result.error).toBe('Store error')
    })

    it('handles missing layout gracefully', () => {
      // Modify the mock state to have missing layout
      const modifiedState = {
        ...mockState,
        layouts: {}, // Empty layouts object
        ui: {
          currentLayoutId: 'layout-1', // Layout that doesn't exist
          modal: null,
          activeEditSection: null
        }
      }
      
      mockUseBuilderStore.getState = vi.fn().mockReturnValue({
        ...modifiedState,
        undo: vi.fn(),
        redo: vi.fn()
      })

      const validation = historyManager.validateHistoryIntegrity()

      expect(validation.isValid).toBe(false)
      expect(validation.issues.some(issue => 
        issue.includes('Current layout layout-1 not found')
      )).toBe(true)
    })
  })

  describe('Pure Data vs DOM Comparison', () => {
    it('operates without any DOM dependencies', () => {
      // Mock DOM to ensure it's not accessed
      const originalDocument = global.document
      const originalWindow = global.window
      
      // Remove DOM access
      delete (global as any).document
      delete (global as any).window

      try {
        // All operations should still work
        const historyState = historyManager.getHistoryState()
        const validation = historyManager.validateHistoryIntegrity()
        const metrics = historyManager.getPerformanceMetrics()

        expect(historyState).toBeDefined()
        expect(validation).toBeDefined()
        expect(metrics).toBeDefined()

        // Undo/redo should work without DOM
        const undoResult = historyManager.undo()
        expect(undoResult).toBeDefined()
        
      } finally {
        // Restore DOM
        global.document = originalDocument
        global.window = originalWindow
      }
    })

    it('provides better performance than DOM-based operations', () => {
      const iterations = 100
      const startTime = performance.now()

      // Perform multiple history operations
      for (let i = 0; i < iterations; i++) {
        historyManager.getHistoryState()
        historyManager.validateHistoryIntegrity()
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      // Should be very fast (less than 10ms for 100 operations)
      expect(duration).toBeLessThan(10)
      console.log(`Pure data operations: ${duration.toFixed(2)}ms for ${iterations} iterations`)
    })
  })

  describe('Layout Switching', () => {
    it('maintains history state during layout switches', () => {
      // Add another layout
      mockState.layouts['layout-2'] = {
        id: 'layout-2',
        name: 'Layout 2',
        sections: {}
      }

      // Switch layout
      mockState.ui.currentLayoutId = 'layout-2'
      const mockSelectors = selectors as any
      mockSelectors.currentLayout.mockReturnValue(mockState.layouts['layout-2'])
      mockSelectors.currentSections.mockReturnValue({})

      const historyState = historyManager.getHistoryState()

      expect(historyState.currentLayoutId).toBe('layout-2')
      expect(historyState.sectionsCount).toBe(0)
      expect(historyState.historyLength).toBe(1) // History preserved
    })
  })
})