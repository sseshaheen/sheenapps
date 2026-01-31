/**
 * Pure Reducer Tests - 100% coverage target
 * Expert requirement: Test business logic before UI integration
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { reducers, type BuilderState, type SectionState, type Layout } from '../builder-store'

// Mock data helpers
const MOCK_TIMESTAMP = 1000000000000 // Fixed timestamp for tests

function createMockSection(id: string, type: SectionState['type'] = 'hero'): SectionState {
  return {
    id,
    type,
    content: {
      html: `<div class="${type}-section">Mock ${type} content</div>`,
      props: {
        title: `Mock ${type} Title`,
        subtitle: `Mock ${type} subtitle`
      }
    },
    styles: {
      css: `.${type}-section { padding: 2rem; }`,
      variables: {
        '--primary': '#3b82f6',
        '--text': '#1f2937'
      }
    },
    metadata: {
      lastModified: MOCK_TIMESTAMP,
      userAction: 'initial',
      aiGenerated: true
    }
  }
}

function createMockLayout(id: string, sectionIds: string[]): Layout {
  const sections: Record<string, SectionState> = {}
  sectionIds.forEach(sectionId => {
    sections[sectionId] = createMockSection(sectionId)
  })
  
  return {
    id,
    name: `Layout ${id}`,
    sections
  }
}

function createMockState(): BuilderState {
  const layout1 = createMockLayout('layout-1', ['hero-1', 'features-1'])
  const layout2 = createMockLayout('layout-2', ['hero-2', 'pricing-2'])
  
  return {
    projectId: 'test-project',
    layouts: {
      'layout-1': layout1,
      'layout-2': layout2
    },
    history: {
      stack: [],
      index: -1
    },
    sectionHistory: {},
    ui: {
      currentLayoutId: 'layout-1',
      modal: null,
      activeEditSection: null
    }
  }
}

describe('applyEdit reducer', () => {
  let mockState: BuilderState
  
  beforeEach(() => {
    mockState = createMockState()
  })

  it('creates snapshot before applying edit', () => {
    const newContent = {
      html: '<div>Updated content</div>',
      props: { title: 'Updated Title' }
    }
    
    const result = reducers.applyEdit(mockState, 'hero-1', newContent, 'User Edit')
    
    // Should create one snapshot
    expect(result.history.stack).toHaveLength(1)
    expect(result.history.index).toBe(0)
    
    // Snapshot should contain original state
    const snapshot = result.history.stack[0]
    expect(snapshot.userAction).toBe('User Edit')
    expect(snapshot.layoutId).toBe('layout-1')
    expect(snapshot.sectionsState).toEqual(mockState.layouts['layout-1'].sections)
  })

  it('applies edit to correct section', () => {
    const newContent = {
      html: '<div class="updated">Updated HTML</div>',
      props: { title: 'Updated Title', subtitle: 'Updated Subtitle' }
    }
    
    const result = reducers.applyEdit(mockState, 'hero-1', newContent, 'AI Generated')
    
    // Section should be updated
    const updatedSection = result.layouts['layout-1'].sections['hero-1']
    expect(updatedSection.content).toEqual(newContent)
    expect(updatedSection.metadata.userAction).toBe('AI Generated')
    expect(updatedSection.metadata.lastModified).toBeGreaterThan(MOCK_TIMESTAMP)
    
    // Other sections should remain unchanged
    expect(result.layouts['layout-1'].sections['features-1']).toEqual(mockState.layouts['layout-1'].sections['features-1'])
  })

  it('preserves other layouts unchanged', () => {
    const newContent = { html: '<div>Updated</div>', props: {} }
    
    const result = reducers.applyEdit(mockState, 'hero-1', newContent, 'Test Edit')
    
    // Layout-2 should be completely unchanged
    expect(result.layouts['layout-2']).toBe(mockState.layouts['layout-2'])
  })

  it('truncates history when editing from middle of stack', () => {
    // Create state with existing history
    const stateWithHistory = {
      ...mockState,
      history: {
        stack: [
          { id: 'snap-1', timestamp: 1, userAction: 'Edit 1', layoutId: 'layout-1', sectionsState: {} },
          { id: 'snap-2', timestamp: 2, userAction: 'Edit 2', layoutId: 'layout-1', sectionsState: {} },
          { id: 'snap-3', timestamp: 3, userAction: 'Edit 3', layoutId: 'layout-1', sectionsState: {} }
        ],
        index: 1 // In middle of history
      },
      sectionHistory: {}
    }
    
    const newContent = { html: '<div>Branch edit</div>', props: {} }
    const result = reducers.applyEdit(stateWithHistory, 'hero-1', newContent, 'Branch Edit')
    
    // Should truncate history after index 1 and add new snapshot
    expect(result.history.stack).toHaveLength(3) // Original 2 + 1 new
    expect(result.history.index).toBe(2)
    expect(result.history.stack[2].userAction).toBe('Branch Edit')
  })

  it('returns unchanged state when layout not found', () => {
    const stateWithInvalidLayout = {
      ...mockState,
      ui: { ...mockState.ui, currentLayoutId: 'non-existent' }
    }
    
    const result = reducers.applyEdit(stateWithInvalidLayout, 'hero-1', { html: '', props: {} }, 'Test')
    
    expect(result).toBe(stateWithInvalidLayout) // Same reference = unchanged
  })

  it('returns unchanged state when section not found', () => {
    const result = reducers.applyEdit(mockState, 'non-existent-section', { html: '', props: {} }, 'Test')
    
    expect(result).toBe(mockState) // Same reference = unchanged
  })
})

describe('undo reducer', () => {
  let stateWithHistory: BuilderState
  
  beforeEach(() => {
    const baseState = createMockState()
    
    // Create original sections for snapshot
    const originalSections = {
      'hero-1': createMockSection('hero-1', 'hero'),
      'features-1': createMockSection('features-1', 'features')
    }
    
    // Create modified sections
    const modifiedSections = {
      'hero-1': { ...createMockSection('hero-1', 'hero'), content: { html: 'Modified', props: {} } },
      'features-1': createMockSection('features-1', 'features')
    }
    
    // Create state with history
    stateWithHistory = {
      ...baseState,
      layouts: {
        ...baseState.layouts,
        'layout-1': {
          ...baseState.layouts['layout-1'],
          sections: modifiedSections // Current state is modified
        }
      },
      history: {
        stack: [
          {
            id: 'snapshot-1',
            timestamp: Date.now() - 2000,
            userAction: 'First Edit',
            layoutId: 'layout-1',
            sectionsState: originalSections
          },
          {
            id: 'snapshot-2', 
            timestamp: Date.now() - 1000,
            userAction: 'Second Edit',
            layoutId: 'layout-1',
            sectionsState: modifiedSections
          }
        ],
        index: 1 // At latest edit
      },
      sectionHistory: {}
    }
  })

  it('restores previous section state', () => {
    const result = reducers.undo(stateWithHistory)
    
    // History index should move back
    expect(result.history.index).toBe(0)
    
    // Sections should be restored to snapshot state
    const snapshot = stateWithHistory.history.stack[0]
    expect(result.layouts['layout-1'].sections).toEqual(snapshot.sectionsState)
  })

  it('preserves history stack', () => {
    const result = reducers.undo(stateWithHistory)
    
    // History stack should remain unchanged
    expect(result.history.stack).toBe(stateWithHistory.history.stack)
    expect(result.history.stack).toHaveLength(2)
  })

  it('returns unchanged state when no history available', () => {
    const stateWithoutHistory = {
      ...createMockState(),
      history: { stack: [], index: -1 },
      sectionHistory: {}
    }
    
    const result = reducers.undo(stateWithoutHistory)
    
    expect(result).toBe(stateWithoutHistory) // Same reference = unchanged
  })

  it('returns unchanged state when layout not found', () => {
    const stateWithInvalidLayout = {
      ...stateWithHistory,
      ui: { ...stateWithHistory.ui, currentLayoutId: 'non-existent' }
    }
    
    const result = reducers.undo(stateWithInvalidLayout)
    
    expect(result).toBe(stateWithInvalidLayout) // Same reference = unchanged
  })

  it('handles undo from beginning of history', () => {
    const stateAtBeginning = {
      ...stateWithHistory,
      history: { ...stateWithHistory.history, index: 0 },
      sectionHistory: {}
    }
    
    const result = reducers.undo(stateAtBeginning)
    
    // Should move to index -1 (no history)
    expect(result.history.index).toBe(-1)
  })
})

describe('redo reducer', () => {
  let stateWithHistory: BuilderState
  
  beforeEach(() => {
    const baseState = createMockState()
    
    stateWithHistory = {
      ...baseState,
      history: {
        stack: [
          {
            id: 'snapshot-1',
            timestamp: Date.now() - 2000,
            userAction: 'First Edit',
            layoutId: 'layout-1',
            sectionsState: {
              'hero-1': createMockSection('hero-1', 'hero'),
              'features-1': createMockSection('features-1', 'features')
            }
          },
          {
            id: 'snapshot-2',
            timestamp: Date.now() - 1000,
            userAction: 'Second Edit',
            layoutId: 'layout-1',
            sectionsState: {
              'hero-1': { ...createMockSection('hero-1', 'hero'), content: { html: 'Redone', props: {} } },
              'features-1': createMockSection('features-1', 'features')
            }
          }
        ],
        index: 0 // After undo - can redo
      },
      sectionHistory: {}
    }
  })

  it('restores next section state', () => {
    const result = reducers.redo(stateWithHistory)
    
    // History index should move forward
    expect(result.history.index).toBe(1)
    
    // Sections should be restored to next snapshot
    const nextSnapshot = stateWithHistory.history.stack[1]
    expect(result.layouts['layout-1'].sections).toEqual(nextSnapshot.sectionsState)
  })

  it('preserves history stack', () => {
    const result = reducers.redo(stateWithHistory)
    
    // History stack should remain unchanged
    expect(result.history.stack).toBe(stateWithHistory.history.stack)
    expect(result.history.stack).toHaveLength(2)
  })

  it('returns unchanged state when no forward history available', () => {
    const stateAtEnd = {
      ...stateWithHistory,
      history: { ...stateWithHistory.history, index: 1 } // At end
    }
    
    const result = reducers.redo(stateAtEnd)
    
    expect(result).toBe(stateAtEnd) // Same reference = unchanged
  })

  it('returns unchanged state when layout not found', () => {
    const stateWithInvalidLayout = {
      ...stateWithHistory,
      ui: { ...stateWithHistory.ui, currentLayoutId: 'non-existent' }
    }
    
    const result = reducers.redo(stateWithInvalidLayout)
    
    expect(result).toBe(stateWithInvalidLayout) // Same reference = unchanged
  })
})

describe('switchLayout reducer', () => {
  let mockState: BuilderState
  
  beforeEach(() => {
    mockState = createMockState()
  })

  it('switches to valid layout', () => {
    const result = reducers.switchLayout(mockState, 'layout-2')
    
    expect(result.ui.currentLayoutId).toBe('layout-2')
  })

  it('clears modal and active edit section', () => {
    const stateWithUI = {
      ...mockState,
      ui: {
        ...mockState.ui,
        modal: 'edit' as const,
        activeEditSection: 'hero-1'
      },
      sectionHistory: {}
    }
    
    const result = reducers.switchLayout(stateWithUI, 'layout-2')
    
    expect(result.ui.modal).toBe(null)
    expect(result.ui.activeEditSection).toBe(null)
  })

  it('preserves history when switching layouts', () => {
    const stateWithHistory = {
      ...mockState,
      history: {
        stack: [{ id: 'test', timestamp: 1, userAction: 'test', layoutId: 'layout-1', sectionsState: {} }],
        index: 0
      },
      sectionHistory: {}
    }
    
    const result = reducers.switchLayout(stateWithHistory, 'layout-2')
    
    // History should be preserved exactly
    expect(result.history).toBe(stateWithHistory.history)
  })

  it('preserves other layouts unchanged', () => {
    const result = reducers.switchLayout(mockState, 'layout-2')
    
    expect(result.layouts['layout-1']).toBe(mockState.layouts['layout-1'])
    expect(result.layouts['layout-2']).toBe(mockState.layouts['layout-2'])
  })

  it('returns unchanged state when layout not found', () => {
    const result = reducers.switchLayout(mockState, 'non-existent-layout')
    
    expect(result).toBe(mockState) // Same reference = unchanged
  })
})

describe('reducer integration scenarios', () => {
  it('handles complex edit � undo � redo � edit flow', () => {
    let state = createMockState()
    
    // Apply first edit
    const content1 = { html: '<div>Edit 1</div>', props: { title: 'Title 1' } }
    state = reducers.applyEdit(state, 'hero-1', content1, 'First Edit')
    expect(state.history.stack).toHaveLength(1)
    expect(state.history.index).toBe(0)
    
    // Apply second edit
    const content2 = { html: '<div>Edit 2</div>', props: { title: 'Title 2' } }
    state = reducers.applyEdit(state, 'hero-1', content2, 'Second Edit')
    expect(state.history.stack).toHaveLength(2)
    expect(state.history.index).toBe(1)
    
    // Undo to first edit state
    state = reducers.undo(state)
    expect(state.history.index).toBe(0)
    // After undo, current content should be restored to the state stored in history[0]
    const restoredContent = state.history.stack[0].sectionsState['hero-1'].content
    expect(state.layouts['layout-1'].sections['hero-1'].content).toEqual(restoredContent)
    
    // Redo to second edit state  
    state = reducers.redo(state)
    expect(state.history.index).toBe(1)
    // After redo, current content should be restored to the state stored in history[1]
    const redoContent = state.history.stack[1].sectionsState['hero-1'].content
    expect(state.layouts['layout-1'].sections['hero-1'].content).toEqual(redoContent)
    
    // Apply third edit (should truncate history)
    const content3 = { html: '<div>Edit 3</div>', props: { title: 'Title 3' } }
    state = reducers.applyEdit(state, 'hero-1', content3, 'Third Edit')
    expect(state.history.stack).toHaveLength(3)
    expect(state.history.index).toBe(2)
  })

  it('handles layout switching with preserved history per layout', () => {
    let state = createMockState()
    
    // Edit layout-1
    const content1 = { html: '<div>Layout 1 Edit</div>', props: {} }
    state = reducers.applyEdit(state, 'hero-1', content1, 'Layout 1 Edit')
    
    // Switch to layout-2
    state = reducers.switchLayout(state, 'layout-2')
    expect(state.ui.currentLayoutId).toBe('layout-2')
    
    // Edit layout-2
    const content2 = { html: '<div>Layout 2 Edit</div>', props: {} }
    state = reducers.applyEdit(state, 'hero-2', content2, 'Layout 2 Edit')
    
    // Switch back to layout-1 - history should be preserved
    state = reducers.switchLayout(state, 'layout-1')
    expect(state.layouts['layout-1'].sections['hero-1'].content).toEqual(content1)
    expect(state.layouts['layout-2'].sections['hero-2'].content).toEqual(content2)
  })

  it('handles edge case: multiple undos beyond history', () => {
    let state = createMockState()
    
    // Apply one edit
    state = reducers.applyEdit(state, 'hero-1', { html: '<div>Edit</div>', props: {} }, 'Edit')
    expect(state.history.index).toBe(0)
    
    // Undo once
    state = reducers.undo(state)
    expect(state.history.index).toBe(-1)
    
    // Try to undo again (should be no-op)
    const previousState = state
    state = reducers.undo(state)
    expect(state).toBe(previousState) // Same reference = no change
    expect(state.history.index).toBe(-1)
  })

  it('handles edge case: multiple redos beyond history', () => {
    let state = createMockState()
    
    // Apply edit and undo
    state = reducers.applyEdit(state, 'hero-1', { html: '<div>Edit</div>', props: {} }, 'Edit')
    state = reducers.undo(state)
    
    // Redo once
    state = reducers.redo(state)
    expect(state.history.index).toBe(0)
    
    // Try to redo again (should be no-op)
    const previousState = state
    state = reducers.redo(state)
    expect(state).toBe(previousState) // Same reference = no change
    expect(state.history.index).toBe(0)
  })
})