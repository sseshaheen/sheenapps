import { describe, test, expect, beforeEach } from 'vitest'
import { testStore as perSectionHistoryStore } from './test-helpers/store-compat'

describe('PerSectionHistoryStore - Critical Bug Prevention', () => {
  beforeEach(() => {
    // Reset store state before each test
    perSectionHistoryStore.setState({ histories: {} })
  })

  describe('Edit → Undo → Redo sequence', () => {
    test('maintains correct button states throughout the sequence', () => {
      const store = perSectionHistoryStore.getState()
      const layoutId = 'luxury-premium'
      const sectionType = 'hero'
      const sectionId = 'hero' // Using consistent section key
      
      // Initial state - no history
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(false)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
      
      // Record original content (baseline)
      store.recordEdit(layoutId, sectionType, sectionId, 
        { id: 'hero-123', content: 'Original Hero Content' }, 
        'original'
      )
      
      // Still no undo at original state
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(false)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
      
      // Record user edit
      store.recordEdit(layoutId, sectionType, sectionId, 
        { id: 'hero-456', content: 'Edited Hero Content' }, 
        'Changed headline text'
      )
      
      // After edit: can undo, cannot redo
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
      
      // Perform undo
      const undoResult = store.undo(layoutId, sectionType, sectionId)
      expect(undoResult).not.toBeNull()
      expect(undoResult?.content).toEqual({ id: 'hero-123', content: 'Original Hero Content' })
      expect(undoResult?.userAction).toBe('original')
      
      // After undo: cannot undo (at original), can redo
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(false)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(true)
      
      // Perform redo
      const redoResult = store.redo(layoutId, sectionType, sectionId)
      expect(redoResult).not.toBeNull()
      expect(redoResult?.content).toEqual({ id: 'hero-456', content: 'Edited Hero Content' })
      expect(redoResult?.userAction).toBe('Changed headline text')
      
      // After redo: can undo, cannot redo - THIS WAS THE BUG!
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
    })

    test('handles multiple undo/redo cycles correctly', () => {
      const store = perSectionHistoryStore.getState()
      const layoutId = 'modern-minimal'
      const sectionType = 'features'
      const sectionId = 'features'
      
      // Setup: original + 3 edits
      store.recordEdit(layoutId, sectionType, sectionId, { content: 'original' }, 'original')
      store.recordEdit(layoutId, sectionType, sectionId, { content: 'edit1' }, 'First edit')
      store.recordEdit(layoutId, sectionType, sectionId, { content: 'edit2' }, 'Second edit')
      store.recordEdit(layoutId, sectionType, sectionId, { content: 'edit3' }, 'Third edit')
      
      // We're at edit3
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
      
      // Undo twice
      store.undo(layoutId, sectionType, sectionId) // Back to edit2
      store.undo(layoutId, sectionType, sectionId) // Back to edit1
      
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true) // Can still go to original
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(true) // Can go forward
      
      // Redo once
      const redoResult = store.redo(layoutId, sectionType, sectionId)
      expect(redoResult?.content).toEqual({ content: 'edit2' })
      
      // Should be able to undo and redo
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(true)
    })
  })

  describe('History management', () => {
    test('enforces 10-step history limit', () => {
      const layoutId = 'test-layout'
      const sectionType = 'hero'
      const sectionId = 'hero'
      
      // Add 12 edits
      for (let i = 0; i < 12; i++) {
        perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, sectionId, 
          { content: `edit-${i}` }, 
          `Edit number ${i}`
        )
      }
      
      // Get fresh state after all edits
      const finalState = perSectionHistoryStore.getState()
      const key = `${layoutId}_${sectionType}_${sectionId}`
      const history = finalState.histories[key]
      
      // Should cap at 10
      expect(history).toBeDefined()
      expect(history.edits.length).toBe(10)
      
      // Oldest edits removed (0 and 1), so first is edit-2
      expect(history.edits[0].content).toEqual({ content: 'edit-2' })
      
      // Latest edit kept
      expect(history.edits[9].content).toEqual({ content: 'edit-11' })
      
      // Current index at the end
      expect(history.currentIndex).toBe(9)
    })

    test('truncates redo history when new edit is made', () => {
      const layoutId = 'test'
      const sectionType = 'hero'
      const sectionId = 'hero'
      
      // Create history: original + 3 edits
      perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, sectionId, { content: 'v0' }, 'original')
      perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, sectionId, { content: 'v1' }, 'edit1')
      perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, sectionId, { content: 'v2' }, 'edit2')
      perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, sectionId, { content: 'v3' }, 'edit3')
      
      // Undo twice (now at v1)
      perSectionHistoryStore.getState().undo(layoutId, sectionType, sectionId)
      perSectionHistoryStore.getState().undo(layoutId, sectionType, sectionId)
      
      const key = `${layoutId}_${sectionType}_${sectionId}`
      const stateAfterUndo = perSectionHistoryStore.getState()
      expect(stateAfterUndo.histories[key].currentIndex).toBe(1) // At v1
      expect(stateAfterUndo.histories[key].edits.length).toBe(4) // Still has all edits
      
      // Make new edit - should truncate v2 and v3
      perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, sectionId, { content: 'v4' }, 'new branch')
      
      const finalState = perSectionHistoryStore.getState()
      expect(finalState.histories[key].edits.length).toBe(3) // v0, v1, v4
      expect(finalState.histories[key].currentIndex).toBe(2) // At v4
      expect(finalState.canRedo(layoutId, sectionType, sectionId)).toBe(false) // No redo available
    })
  })

  describe('Consistent section keys', () => {
    test('uses section type as key regardless of dynamic component IDs', () => {
      const layoutId = 'luxury-premium'
      const sectionType = 'hero'
      
      // Record with different component IDs - store uses sectionId parameter as key
      perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, 'hero-dynamic-123', 
        { id: 'hero-dynamic-123', content: 'test1' }, 'edit1')
      
      perSectionHistoryStore.getState().recordEdit(layoutId, sectionType, 'hero-dynamic-456', 
        { id: 'hero-dynamic-456', content: 'test2' }, 'edit2')
      
      const state = perSectionHistoryStore.getState()
      
      // Different sectionIds create different histories
      expect(state.canUndo(layoutId, sectionType, 'hero-dynamic-123')).toBe(false) // Only one edit
      expect(state.canUndo(layoutId, sectionType, 'hero-dynamic-456')).toBe(false) // Only one edit
      
      // Each has its own history key
      const key1 = `${layoutId}_${sectionType}_hero-dynamic-123`
      const key2 = `${layoutId}_${sectionType}_hero-dynamic-456`
      expect(Object.keys(state.histories)).toContain(key1)
      expect(Object.keys(state.histories)).toContain(key2)
      expect(state.histories[key1].edits.length).toBe(1)
      expect(state.histories[key2].edits.length).toBe(1)
    })

    test('maintains separate histories for different sections', () => {
      const store = perSectionHistoryStore.getState()
      const layoutId = 'modern'
      
      // Edit hero section
      store.recordEdit(layoutId, 'hero', 'hero', { content: 'hero-edit' }, 'edit hero')
      
      // Edit features section
      store.recordEdit(layoutId, 'features', 'features', { content: 'features-edit' }, 'edit features')
      
      // Each section has independent history
      expect(store.canUndo(layoutId, 'hero', 'hero')).toBe(false) // Only one edit, at index 0
      expect(store.canUndo(layoutId, 'features', 'features')).toBe(false) // Only one edit, at index 0
      
      // Add second edit to hero
      store.recordEdit(layoutId, 'hero', 'hero', { content: 'hero-edit2' }, 'edit hero again')
      
      // Now hero can undo, features still cannot
      expect(store.canUndo(layoutId, 'hero', 'hero')).toBe(true)
      expect(store.canUndo(layoutId, 'features', 'features')).toBe(false)
    })
  })

  describe('Edge cases', () => {
    test('handles undo/redo at boundaries correctly', () => {
      const store = perSectionHistoryStore.getState()
      const layoutId = 'test'
      const sectionType = 'hero'
      const sectionId = 'hero'
      
      // Single edit
      store.recordEdit(layoutId, sectionType, sectionId, { content: 'only' }, 'only edit')
      
      // Cannot undo or redo
      expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(false)
      expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
      
      // Undo should return null
      expect(store.undo(layoutId, sectionType, sectionId)).toBeNull()
      
      // Redo should return null
      expect(store.redo(layoutId, sectionType, sectionId)).toBeNull()
    })

    test('handles empty history correctly', () => {
      const store = perSectionHistoryStore.getState()
      
      // No history exists
      expect(store.canUndo('any', 'any', 'any')).toBe(false)
      expect(store.canRedo('any', 'any', 'any')).toBe(false)
      expect(store.undo('any', 'any', 'any')).toBeNull()
      expect(store.redo('any', 'any', 'any')).toBeNull()
      
      const info = store.getHistoryInfo('any', 'any', 'any')
      expect(info.canUndo).toBe(false)
      expect(info.canRedo).toBe(false)
      expect(info.lastAction).toBeUndefined()
    })
  })

  describe('Clear operations', () => {
    test('clearSection removes specific section history', () => {
      const layoutId = 'test'
      
      // Add history for multiple sections
      perSectionHistoryStore.getState().recordEdit(layoutId, 'hero', 'hero', { content: 'hero' }, 'edit')
      perSectionHistoryStore.getState().recordEdit(layoutId, 'features', 'features', { content: 'features' }, 'edit')
      
      const state = perSectionHistoryStore.getState()
      expect(Object.keys(state.histories)).toHaveLength(2)
      
      // Clear hero section
      state.clearSection(layoutId, 'hero', 'hero')
      
      // Get fresh state after clear
      const stateAfterClear = perSectionHistoryStore.getState()
      
      // Hero history gone, features remains
      expect(stateAfterClear.canUndo(layoutId, 'hero', 'hero')).toBe(false)
      expect(stateAfterClear.canUndo(layoutId, 'features', 'features')).toBe(false) // Only one edit
      expect(Object.keys(stateAfterClear.histories)).toHaveLength(1)
      expect(stateAfterClear.histories['test_features_features']).toBeDefined()
    })

    test('clearLayout removes all sections for a layout', () => {
      // Add history for multiple layouts
      perSectionHistoryStore.getState().recordEdit('layout1', 'hero', 'hero', { content: 'l1-hero' }, 'edit')
      perSectionHistoryStore.getState().recordEdit('layout1', 'features', 'features', { content: 'l1-features' }, 'edit')
      perSectionHistoryStore.getState().recordEdit('layout2', 'hero', 'hero', { content: 'l2-hero' }, 'edit')
      
      const stateAfterAdding = perSectionHistoryStore.getState()
      expect(Object.keys(stateAfterAdding.histories)).toHaveLength(3)
      
      // Clear layout1
      stateAfterAdding.clearLayout('layout1')
      
      // Get fresh state after clear
      const stateAfterClear = perSectionHistoryStore.getState()
      
      // Only layout2 history remains
      expect(Object.keys(stateAfterClear.histories)).toHaveLength(1)
      expect(stateAfterClear.histories['layout2_hero_hero']).toBeDefined()
    })
  })
})