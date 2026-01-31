/**
 * Store Integration Test
 * Validates that the unified store works without infinite loops
 */

import { renderHook, act } from '@testing-library/react'
import { useBuilderStore, selectors, shallow, SectionState } from '@/store/builder-store'

describe('Store Integration', () => {
  beforeEach(() => {
    // Reset store before each test
    const { result } = renderHook(() => useBuilderStore())
    act(() => {
      result.current.resetState()
    })
  })

  it('should initialize store properly', () => {
    const { result } = renderHook(() => useBuilderStore())
    
    // Initialize with a project
    act(() => {
      result.current.initializeProject('test-project')
    })
    
    // Check that store is properly initialized
    const state = result.current
    expect(state.projectId).toBe('test-project')
    expect(state.ui.currentLayoutId).toBe('default-layout')
    expect(state.layouts['default-layout']).toBeDefined()
  })

  it('should use selectors without infinite loops', () => {
    const { result: storeResult } = renderHook(() => useBuilderStore())
    
    // Initialize store
    act(() => {
      storeResult.current.initializeProject('test-project')
    })
    
    // Test selectors with shallow comparison
    const { result: selectorResult } = renderHook(() => ({
      currentLayout: useBuilderStore(selectors.currentLayout),
      currentSections: useBuilderStore(selectors.currentSections, shallow),
      canUndo: useBuilderStore(selectors.canUndo),
      isReady: useBuilderStore(selectors.isStoreReady)
    }))
    
    expect(selectorResult.current.currentLayout).not.toBeNull()
    expect(selectorResult.current.currentSections).toEqual({})
    expect(selectorResult.current.canUndo).toBe(false)
    expect(selectorResult.current.isReady).toBe(true)
  })

  it('should handle store actions properly', () => {
    const { result } = renderHook(() => useBuilderStore())
    
    // Initialize store
    act(() => {
      result.current.initializeProject('test-project')
    })
    
    // Add a test section first
    const testSection: SectionState = {
      id: 'test-section',
      type: 'hero',
      content: {
        html: '<h1>Original Content</h1>',
        props: { title: 'Original' }
      },
      styles: {
        css: '',
        variables: {}
      },
      metadata: {
        lastModified: Date.now(),
        userAction: 'initial',
        aiGenerated: true
      }
    }
    
    act(() => {
      result.current.addSection(testSection)
    })
    
    // Test applying an edit
    const sectionContent = {
      html: '<h1>Test Content</h1>',
      props: { title: 'Test' }
    }
    
    // This should not cause infinite loops
    act(() => {
      result.current.applyEdit('test-section', sectionContent, 'test edit')
    })
    
    // Check that history was created
    // We should have 3 snapshots: baseline (from init) + addSection + applyEdit
    expect(result.current.history.stack.length).toBe(3)
    expect(result.current.history.index).toBe(2)
  })

  it('should handle undo/redo without errors', () => {
    const { result } = renderHook(() => useBuilderStore())
    
    // Initialize and add a section
    act(() => {
      result.current.initializeProject('test-project')
    })
    
    const testSection: SectionState = {
      id: 'test-section',
      type: 'hero',
      content: {
        html: '<h1>Original</h1>',
        props: { title: 'Original' }
      },
      styles: {
        css: '',
        variables: {}
      },
      metadata: {
        lastModified: Date.now(),
        userAction: 'initial',
        aiGenerated: true
      }
    }
    
    act(() => {
      result.current.addSection(testSection)
    })
    
    // Apply an edit
    act(() => {
      result.current.applyEdit('test-section', { html: '<p>Test</p>', props: {} }, 'edit 1')
    })
    
    // Test undo
    act(() => {
      result.current.undo()
    })
    
    // After undo, we go from index 2 to index 1
    expect(result.current.history.index).toBe(1)
    
    // Test redo
    act(() => {
      result.current.redo()
    })
    
    // After redo, we go back to index 2
    expect(result.current.history.index).toBe(2)
  })
})