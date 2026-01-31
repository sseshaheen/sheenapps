import { describe, test, expect, beforeEach } from 'vitest'
import { testStore as perSectionHistoryStore } from './test-helpers/store-compat'

describe('PerSectionHistoryStore - Core Functionality', () => {
  beforeEach(() => {
    // Reset store state before each test
    perSectionHistoryStore.setState({ histories: {} })
  })

  test('CRITICAL: edit → undo → redo maintains correct button states', () => {
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

  test('handles edge cases correctly', () => {
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

  test('new edit at middle of history truncates future', () => {
    const store = perSectionHistoryStore.getState()
    const layoutId = 'test'
    const sectionType = 'hero'
    const sectionId = 'hero'
    
    // Create history: original + 3 edits
    store.recordEdit(layoutId, sectionType, sectionId, { content: 'v0' }, 'original')
    store.recordEdit(layoutId, sectionType, sectionId, { content: 'v1' }, 'edit1')
    store.recordEdit(layoutId, sectionType, sectionId, { content: 'v2' }, 'edit2')
    store.recordEdit(layoutId, sectionType, sectionId, { content: 'v3' }, 'edit3')
    
    // Undo twice (now at v1)
    store.undo(layoutId, sectionType, sectionId)
    store.undo(layoutId, sectionType, sectionId)
    
    // Should be able to redo
    expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(true)
    
    // Make new edit - should truncate v2 and v3
    store.recordEdit(layoutId, sectionType, sectionId, { content: 'v4' }, 'new branch')
    
    // No redo available after new edit
    expect(store.canRedo(layoutId, sectionType, sectionId)).toBe(false)
    expect(store.canUndo(layoutId, sectionType, sectionId)).toBe(true)
  })
})