import { describe, it, expect, beforeEach } from 'vitest'

// Mock data generation utilities
interface MockSectionState {
  id: string
  type: 'hero' | 'features' | 'pricing'
  content: {
    html: string
    props: Record<string, any>
  }
  styles: {
    css: string
    variables: Record<string, string>
  }
  metadata: {
    lastModified: number
    userAction: string
    aiGenerated: boolean
  }
}

interface MockBuilderState {
  projectId: string
  layouts: Record<string, {
    id: string
    name: string
    sections: Record<string, MockSectionState>
  }>
  history: {
    stack: Array<{
      id: string
      timestamp: number
      userAction: string
      layoutId: string
      sectionsState: Record<string, MockSectionState>
    }>
    index: number
  }
  ui: {
    currentLayoutId: string
    modal: 'edit' | null
    activeEditSection: string | null
  }
}

// Mock pure reducers (will be implemented in actual store)
function applyEdit(
  state: MockBuilderState,
  sectionId: string,
  newContent: MockSectionState['content'],
  userAction: string
): MockBuilderState {
  const currentLayout = state.layouts[state.ui.currentLayoutId]
  if (!currentLayout) return state

  const newSection = {
    ...currentLayout.sections[sectionId],
    content: newContent,
    metadata: {
      ...currentLayout.sections[sectionId].metadata,
      lastModified: Date.now(),
      userAction
    }
  }

  // Create snapshot before applying edit
  const snapshot = {
    id: `snapshot-${Date.now()}`,
    timestamp: Date.now(),
    userAction,
    layoutId: state.ui.currentLayoutId,
    sectionsState: currentLayout.sections
  }

  return {
    ...state,
    layouts: {
      ...state.layouts,
      [state.ui.currentLayoutId]: {
        ...currentLayout,
        sections: {
          ...currentLayout.sections,
          [sectionId]: newSection
        }
      }
    },
    history: {
      stack: [...state.history.stack.slice(0, state.history.index + 1), snapshot],
      index: state.history.index + 1
    }
  }
}

function undo(state: MockBuilderState): MockBuilderState {
  if (state.history.index < 0) return state

  const snapshot = state.history.stack[state.history.index]
  const currentLayout = state.layouts[state.ui.currentLayoutId]

  return {
    ...state,
    layouts: {
      ...state.layouts,
      [state.ui.currentLayoutId]: {
        ...currentLayout,
        sections: snapshot.sectionsState
      }
    },
    history: {
      ...state.history,
      index: state.history.index - 1
    }
  }
}

function redo(state: MockBuilderState): MockBuilderState {
  if (state.history.index >= state.history.stack.length - 1) return state

  const snapshot = state.history.stack[state.history.index + 1]
  const currentLayout = state.layouts[state.ui.currentLayoutId]

  return {
    ...state,
    layouts: {
      ...state.layouts,
      [state.ui.currentLayoutId]: {
        ...currentLayout,
        sections: snapshot.sectionsState
      }
    },
    history: {
      ...state.history,
      index: state.history.index + 1
    }
  }
}

// Test utilities
function createMockState(): MockBuilderState {
  const heroSection: MockSectionState = {
    id: 'hero-1',
    type: 'hero',
    content: {
      html: '<div>Original Hero</div>',
      props: { title: 'Hero Title', subtitle: 'Hero Subtitle' }
    },
    styles: {
      css: '.hero { padding: 2rem; }',
      variables: { '--hero-bg': '#ffffff' }
    },
    metadata: {
      lastModified: Date.now(),
      userAction: 'initial',
      aiGenerated: true
    }
  }

  return {
    projectId: 'test-project',
    layouts: {
      'layout-1': {
        id: 'layout-1',
        name: 'Test Layout',
        sections: {
          'hero-1': heroSection
        }
      }
    },
    history: {
      stack: [],
      index: -1
    },
    ui: {
      currentLayoutId: 'layout-1',
      modal: null,
      activeEditSection: null
    }
  }
}

function generateMockContent(): MockSectionState['content'] {
  const randomId = Math.random().toString(36).substring(7)
  return {
    html: `<div>Generated Content ${randomId}</div>`,
    props: { 
      title: `Title ${randomId}`,
      subtitle: `Subtitle ${randomId}`,
      content: `Content ${randomId}`.repeat(10) // Larger content
    }
  }
}

// Performance Tests
describe('Performance Tests', () => {
  let initialState: MockBuilderState

  beforeEach(() => {
    initialState = createMockState()
  })

  it('handles 50 history operations under 100ms', () => {
    const start = performance.now()
    let state = initialState

    // 50 edits (create large history)
    for (let i = 0; i < 50; i++) {
      state = applyEdit(state, 'hero-1', generateMockContent(), `Edit ${i}`)
    }

    // 25 undos
    for (let i = 0; i < 25; i++) {
      state = undo(state)
    }

    // 25 redos
    for (let i = 0; i < 25; i++) {
      state = redo(state)
    }

    const duration = performance.now() - start
    
    // Expert requirement: <100ms for 50 operations
    expect(duration).toBeLessThan(100)
    
    // Verify state integrity
    expect(state.history.stack).toHaveLength(50)
    expect(state.history.index).toBe(49) // Back to latest
  })

  it('maintains memory efficiency with large history', () => {
    const memoryBefore = performance.memory?.usedJSHeapSize || 0
    let state = initialState

    // Create 100 history entries with large content
    for (let i = 0; i < 100; i++) {
      state = applyEdit(state, 'hero-1', generateMockContent(), `Large Edit ${i}`)
    }

    const memoryAfter = performance.memory?.usedJSHeapSize || 0
    const memoryGrowth = memoryAfter - memoryBefore

    // Max 5MB growth for 100 large operations
    expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024)
    
    // Verify history is properly maintained
    expect(state.history.stack).toHaveLength(100)
  })

  it('performs fast lookups on large state', () => {
    const state = initialState

    // Create complex state with multiple layouts and sections
    for (let layoutIndex = 0; layoutIndex < 10; layoutIndex++) {
      const layoutId = `layout-${layoutIndex}`
      state.layouts[layoutId] = {
        id: layoutId,
        name: `Layout ${layoutIndex}`,
        sections: {}
      }

      // 20 sections per layout
      for (let sectionIndex = 0; sectionIndex < 20; sectionIndex++) {
        const sectionId = `section-${layoutIndex}-${sectionIndex}`
        state.layouts[layoutId].sections[sectionId] = {
          id: sectionId,
          type: 'hero',
          content: generateMockContent(),
          styles: { css: '', variables: {} },
          metadata: {
            lastModified: Date.now(),
            userAction: 'generated',
            aiGenerated: true
          }
        }
      }
    }

    // Test lookup performance
    const start = performance.now()

    // 1000 state lookups
    for (let i = 0; i < 1000; i++) {
      const layoutId = `layout-${i % 10}`
      const sectionId = `section-${i % 10}-${i % 20}`
      const section = state.layouts[layoutId]?.sections[sectionId]
      expect(section).toBeDefined()
    }

    const duration = performance.now() - start
    
    // Lookups should be very fast
    expect(duration).toBeLessThan(10) // Under 10ms for 1000 lookups
  })

  it('handles concurrent state updates efficiently', () => {
    let state = initialState
    const start = performance.now()

    // Simulate rapid user interactions
    for (let i = 0; i < 20; i++) {
      // Edit
      state = applyEdit(state, 'hero-1', generateMockContent(), `Rapid Edit ${i}`)
      
      // Immediate undo
      state = undo(state)
      
      // Immediate redo
      state = redo(state)
      
      // Another edit
      state = applyEdit(state, 'hero-1', generateMockContent(), `Rapid Edit ${i}b`)
    }

    const duration = performance.now() - start
    
    // Rapid interactions should complete quickly
    expect(duration).toBeLessThan(50) // Under 50ms for 80 operations
    
    // Final state should be consistent
    expect(state.history.index).toBeGreaterThan(-1)
    expect(state.layouts['layout-1'].sections['hero-1']).toBeDefined()
  })

  it('maintains performance with deep object structures', () => {
    let state = initialState
    
    // Create deeply nested content
    const deepContent = {
      html: '<div>Deep Content</div>',
      props: {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  data: 'deep value',
                  array: new Array(1000).fill(0).map((_, i) => ({ id: i, value: `item-${i}` }))
                }
              }
            }
          }
        }
      }
    }

    const start = performance.now()

    // Apply edits with deep structures
    for (let i = 0; i < 10; i++) {
      state = applyEdit(state, 'hero-1', {
        ...deepContent,
        props: {
          ...deepContent.props,
          iteration: i
        }
      }, `Deep Edit ${i}`)
    }

    const duration = performance.now() - start
    
    // Deep structure operations should still be fast
    expect(duration).toBeLessThan(100)
    
    // Verify deep data is preserved
    const currentSection = state.layouts['layout-1'].sections['hero-1']
    expect(currentSection.content.props.level1.level2.level3.level4.level5.data).toBe('deep value')
  })
})