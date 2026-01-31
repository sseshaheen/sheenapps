/**
 * Selector Tests - Derived State Validation
 * Expert requirement: Button enable/disable is just canUndo selector
 */

import { describe, it, expect } from 'vitest'
import { selectors, type BuilderState, type SectionState, type Layout } from '../builder-store'

// Helper to create a valid BuilderState with all required properties
function createTestState(overrides: Partial<BuilderState> = {}): BuilderState {
  return {
    projectId: 'test',
    layouts: {},
    history: { stack: [], index: -1 },
    sectionHistory: {},
    ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null },
    ...overrides
  }
}

// Test data helpers
function createMockSection(id: string): SectionState {
  return {
    id,
    type: 'hero',
    content: { html: '<div>Test</div>', props: {} },
    styles: { css: '', variables: {} },
    metadata: { lastModified: Date.now(), userAction: 'test', aiGenerated: true }
  }
}

function createMockLayout(id: string): Layout {
  return {
    id,
    name: `Layout ${id}`,
    sections: {
      [`${id}-hero`]: createMockSection(`${id}-hero`),
      [`${id}-features`]: createMockSection(`${id}-features`)
    }
  }
}

describe('canUndo selector', () => {
  it('returns true when history index >= 0', () => {
    const state = createTestState({
      history: { stack: [{ id: '1', timestamp: 1, userAction: 'test', layoutId: 'layout-1', sectionsState: {} }], index: 0 }
    })
    
    expect(selectors.canUndo(state)).toBe(true)
  })

  it('returns false when history index is -1', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canUndo(state)).toBe(false)
  })

  it('returns false when history index is negative', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -5 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canUndo(state)).toBe(false)
  })
})

describe('canRedo selector', () => {
  it('returns true when there is forward history available', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { 
        stack: [
          { id: '1', timestamp: 1, userAction: 'test1', layoutId: 'layout-1', sectionsState: {} },
          { id: '2', timestamp: 2, userAction: 'test2', layoutId: 'layout-1', sectionsState: {} }
        ], 
        index: 0 // Can redo to index 1
      },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canRedo(state)).toBe(true)
  })

  it('returns false when at end of history', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { 
        stack: [
          { id: '1', timestamp: 1, userAction: 'test1', layoutId: 'layout-1', sectionsState: {} },
          { id: '2', timestamp: 2, userAction: 'test2', layoutId: 'layout-1', sectionsState: {} }
        ], 
        index: 1 // At end - cannot redo
      },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canRedo(state)).toBe(false)
  })

  it('returns false when no history exists', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canRedo(state)).toBe(false)
  })
})

describe('currentLayout selector', () => {
  it('returns layout when currentLayoutId exists', () => {
    const layout = createMockLayout('layout-1')
    const state: BuilderState = {
      projectId: 'test',
      layouts: { 'layout-1': layout, 'layout-2': createMockLayout('layout-2') },
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.currentLayout(state)).toBe(layout)
  })

  it('returns null when currentLayoutId does not exist', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: { 'layout-1': createMockLayout('layout-1') },
      history: { stack: [], index: -1 },
      ui: { currentLayoutId: 'non-existent', modal: null, activeEditSection: null }
    }
    
    expect(selectors.currentLayout(state)).toBe(null)
  })

  it('returns null when no layouts exist', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.currentLayout(state)).toBe(null)
  })
})

describe('currentSections selector', () => {
  it('returns sections when currentLayoutId exists', () => {
    const layout = createMockLayout('layout-1')
    const state: BuilderState = {
      projectId: 'test',
      layouts: { 'layout-1': layout },
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.currentSections(state)).toBe(layout.sections)
  })

  it('returns empty object when currentLayoutId does not exist', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: { 'layout-1': createMockLayout('layout-1') },
      history: { stack: [], index: -1 },
      ui: { currentLayoutId: 'non-existent', modal: null, activeEditSection: null }
    }
    
    expect(selectors.currentSections(state)).toEqual({})
  })

  it('returns empty object when no layouts exist', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.currentSections(state)).toEqual({})
  })
})

describe('historyLength selector', () => {
  it('returns correct length for non-empty history', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { 
        stack: [
          { id: '1', timestamp: 1, userAction: 'test1', layoutId: 'layout-1', sectionsState: {} },
          { id: '2', timestamp: 2, userAction: 'test2', layoutId: 'layout-1', sectionsState: {} },
          { id: '3', timestamp: 3, userAction: 'test3', layoutId: 'layout-1', sectionsState: {} }
        ], 
        index: 1 
      },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.historyLength(state)).toBe(3)
  })

  it('returns 0 for empty history', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.historyLength(state)).toBe(0)
  })
})

describe('isEditMode selector', () => {
  it('returns true when modal is edit', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: 'edit', activeEditSection: null }
    }
    
    expect(selectors.isEditMode(state)).toBe(true)
  })

  it('returns false when modal is null', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.isEditMode(state)).toBe(false)
  })
})

describe('hasUnsavedChanges selector', () => {
  it('returns true when history exists', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { 
        stack: [{ id: '1', timestamp: 1, userAction: 'test', layoutId: 'layout-1', sectionsState: {} }], 
        index: 0 
      },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.hasUnsavedChanges(state)).toBe(true)
  })

  it('returns false when no history exists', () => {
    const state: BuilderState = {
      projectId: 'test',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.hasUnsavedChanges(state)).toBe(false)
  })
})

describe('selector composition and usage scenarios', () => {
  it('provides correct button states for empty project', () => {
    const emptyState: BuilderState = {
      projectId: 'new-project',
      layouts: {},
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: '', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canUndo(emptyState)).toBe(false)
    expect(selectors.canRedo(emptyState)).toBe(false)
    expect(selectors.hasUnsavedChanges(emptyState)).toBe(false)
    expect(selectors.currentLayout(emptyState)).toBe(null)
    expect(selectors.currentSections(emptyState)).toEqual({})
  })

  it('provides correct button states after single edit', () => {
    const stateAfterEdit: BuilderState = {
      projectId: 'test',
      layouts: { 'layout-1': createMockLayout('layout-1') },
      history: { 
        stack: [{ id: '1', timestamp: 1, userAction: 'first edit', layoutId: 'layout-1', sectionsState: {} }], 
        index: 0 
      },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canUndo(stateAfterEdit)).toBe(true)
    expect(selectors.canRedo(stateAfterEdit)).toBe(false)
    expect(selectors.hasUnsavedChanges(stateAfterEdit)).toBe(true)
    expect(selectors.historyLength(stateAfterEdit)).toBe(1)
  })

  it('provides correct button states after undo', () => {
    const stateAfterUndo: BuilderState = {
      projectId: 'test',
      layouts: { 'layout-1': createMockLayout('layout-1') },
      history: { 
        stack: [
          { id: '1', timestamp: 1, userAction: 'first edit', layoutId: 'layout-1', sectionsState: {} },
          { id: '2', timestamp: 2, userAction: 'second edit', layoutId: 'layout-1', sectionsState: {} }
        ], 
        index: 0 // After undo from index 1
      },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-1', modal: null, activeEditSection: null }
    }
    
    expect(selectors.canUndo(stateAfterUndo)).toBe(true)
    expect(selectors.canRedo(stateAfterUndo)).toBe(true)
    expect(selectors.hasUnsavedChanges(stateAfterUndo)).toBe(true)
    expect(selectors.historyLength(stateAfterUndo)).toBe(2)
  })

  it('provides correct layout information for multi-layout project', () => {
    const layout1 = createMockLayout('layout-1')
    const layout2 = createMockLayout('layout-2')
    
    const multiLayoutState: BuilderState = {
      projectId: 'test',
      layouts: { 'layout-1': layout1, 'layout-2': layout2 },
      history: { stack: [], index: -1 },
      sectionHistory: {},
      ui: { currentLayoutId: 'layout-2', modal: null, activeEditSection: null }
    }
    
    expect(selectors.currentLayout(multiLayoutState)).toBe(layout2)
    expect(selectors.currentSections(multiLayoutState)).toBe(layout2.sections)
    
    // Should return specific layout sections
    expect(Object.keys(selectors.currentSections(multiLayoutState))).toEqual(['layout-2-hero', 'layout-2-features'])
  })
})