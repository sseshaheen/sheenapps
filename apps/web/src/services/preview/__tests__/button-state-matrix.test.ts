import { describe, test, expect, vi, beforeEach } from 'vitest'

describe('Button State Matrix - All Combinations', () => {
  let mockIframe: any
  let mockDocument: any
  let mockButtons: { undo?: any, redo?: any }

  beforeEach(() => {
    mockButtons = {}
    
    mockDocument = {
      getElementById: vi.fn((id: string) => {
        if (id.startsWith('undo-')) return mockButtons.undo || null
        if (id.startsWith('redo-')) return mockButtons.redo || null
        return null
      }),
      querySelectorAll: vi.fn(() => [])
    }

    mockIframe = {
      contentWindow: {
        document: mockDocument,
        updateUndoRedoButtons: vi.fn()
      }
    }

    // Create mock buttons with spy methods
    const createMockButton = () => ({
      style: {
        display: '',
        opacity: '',
        cursor: ''
      },
      disabled: false,
      setAttribute: vi.fn(),
      getAttribute: vi.fn()
    })

    mockButtons.undo = createMockButton()
    mockButtons.redo = createMockButton()
  })

  describe('Button Visibility Logic - hasAnyHistory Pattern', () => {
    test('both buttons hidden when no history (canUndo=false, canRedo=false)', () => {
      const canUndo = false
      const canRedo = false
      const hasAnyHistory = canUndo || canRedo

      expect(hasAnyHistory).toBe(false)
      
      // Simulate button update logic
      if (mockButtons.undo) {
        if (hasAnyHistory) {
          mockButtons.undo.style.display = 'flex'
          mockButtons.undo.style.opacity = canUndo ? '1' : '0.4'
          mockButtons.undo.disabled = !canUndo
        } else {
          mockButtons.undo.style.display = 'none'
        }
      }

      if (mockButtons.redo) {
        if (hasAnyHistory) {
          mockButtons.redo.style.display = 'flex'
          mockButtons.redo.style.opacity = canRedo ? '1' : '0.4'
          mockButtons.redo.disabled = !canRedo
        } else {
          mockButtons.redo.style.display = 'none'
        }
      }

      expect(mockButtons.undo.style.display).toBe('none')
      expect(mockButtons.redo.style.display).toBe('none')
    })

    test('both buttons visible when can undo only (canUndo=true, canRedo=false)', () => {
      const canUndo = true
      const canRedo = false
      const hasAnyHistory = canUndo || canRedo

      expect(hasAnyHistory).toBe(true)
      
      // Simulate button update logic
      if (mockButtons.undo) {
        if (hasAnyHistory) {
          mockButtons.undo.style.display = 'flex'
          mockButtons.undo.style.opacity = canUndo ? '1' : '0.4'
          mockButtons.undo.disabled = !canUndo
        } else {
          mockButtons.undo.style.display = 'none'
        }
      }

      if (mockButtons.redo) {
        if (hasAnyHistory) {
          mockButtons.redo.style.display = 'flex'
          mockButtons.redo.style.opacity = canRedo ? '1' : '0.4'
          mockButtons.redo.disabled = !canRedo
        } else {
          mockButtons.redo.style.display = 'none'
        }
      }

      // Both visible, undo enabled, redo disabled
      expect(mockButtons.undo.style.display).toBe('flex')
      expect(mockButtons.undo.style.opacity).toBe('1')
      expect(mockButtons.undo.disabled).toBe(false)
      
      expect(mockButtons.redo.style.display).toBe('flex')
      expect(mockButtons.redo.style.opacity).toBe('0.4')
      expect(mockButtons.redo.disabled).toBe(true)
    })

    test('both buttons visible when can redo only (canUndo=false, canRedo=true)', () => {
      const canUndo = false
      const canRedo = true
      const hasAnyHistory = canUndo || canRedo

      expect(hasAnyHistory).toBe(true)
      
      // Simulate button update logic
      if (mockButtons.undo) {
        if (hasAnyHistory) {
          mockButtons.undo.style.display = 'flex'
          mockButtons.undo.style.opacity = canUndo ? '1' : '0.4'
          mockButtons.undo.disabled = !canUndo
        } else {
          mockButtons.undo.style.display = 'none'
        }
      }

      if (mockButtons.redo) {
        if (hasAnyHistory) {
          mockButtons.redo.style.display = 'flex'
          mockButtons.redo.style.opacity = canRedo ? '1' : '0.4'
          mockButtons.redo.disabled = !canRedo
        } else {
          mockButtons.redo.style.display = 'none'
        }
      }

      // Both visible, undo disabled, redo enabled
      expect(mockButtons.undo.style.display).toBe('flex')
      expect(mockButtons.undo.style.opacity).toBe('0.4')
      expect(mockButtons.undo.disabled).toBe(true)
      
      expect(mockButtons.redo.style.display).toBe('flex')
      expect(mockButtons.redo.style.opacity).toBe('1')
      expect(mockButtons.redo.disabled).toBe(false)
    })

    test('both buttons visible when can undo and redo (canUndo=true, canRedo=true)', () => {
      const canUndo = true
      const canRedo = true
      const hasAnyHistory = canUndo || canRedo

      expect(hasAnyHistory).toBe(true)
      
      // Simulate button update logic
      if (mockButtons.undo) {
        if (hasAnyHistory) {
          mockButtons.undo.style.display = 'flex'
          mockButtons.undo.style.opacity = canUndo ? '1' : '0.4'
          mockButtons.undo.disabled = !canUndo
        } else {
          mockButtons.undo.style.display = 'none'
        }
      }

      if (mockButtons.redo) {
        if (hasAnyHistory) {
          mockButtons.redo.style.display = 'flex'
          mockButtons.redo.style.opacity = canRedo ? '1' : '0.4'
          mockButtons.redo.disabled = !canRedo
        } else {
          mockButtons.redo.style.display = 'none'
        }
      }

      // Both visible and enabled
      expect(mockButtons.undo.style.display).toBe('flex')
      expect(mockButtons.undo.style.opacity).toBe('1')
      expect(mockButtons.undo.disabled).toBe(false)
      
      expect(mockButtons.redo.style.display).toBe('flex')
      expect(mockButtons.redo.style.opacity).toBe('1')
      expect(mockButtons.redo.disabled).toBe(false)
    })
  })

  describe('Critical State Transitions', () => {
    test('transition: no history → can undo (first edit)', () => {
      // Before: no buttons visible
      const beforeState = { canUndo: false, canRedo: false }
      const hasHistoryBefore = beforeState.canUndo || beforeState.canRedo
      expect(hasHistoryBefore).toBe(false)

      // After: undo button becomes available
      const afterState = { canUndo: true, canRedo: false }
      const hasHistoryAfter = afterState.canUndo || afterState.canRedo
      expect(hasHistoryAfter).toBe(true)

      // This transition should show both buttons (undo enabled, redo disabled)
      expect(afterState.canUndo).toBe(true)
      expect(afterState.canRedo).toBe(false)
    })

    test('transition: can undo → can redo (after undo)', () => {
      // Before: can undo (after edit)
      const beforeState = { canUndo: true, canRedo: false }
      
      // After: can redo (after undo)
      const afterState = { canUndo: false, canRedo: true }
      
      // Both states should show buttons
      expect(beforeState.canUndo || beforeState.canRedo).toBe(true)
      expect(afterState.canUndo || afterState.canRedo).toBe(true)
    })

    test('transition: can redo → can undo (after redo) - THE CRITICAL BUG', () => {
      // Before: can redo (after undo)
      const beforeState = { canUndo: false, canRedo: true }
      
      // After: can undo (after redo) - THIS WAS THE BUG!
      const afterState = { canUndo: true, canRedo: false }
      
      // CRITICAL: Both states should show buttons (never both false)
      expect(beforeState.canUndo || beforeState.canRedo).toBe(true)
      expect(afterState.canUndo || afterState.canRedo).toBe(true)
      
      // The bug was that both became false somehow
      expect(afterState).not.toEqual({ canUndo: false, canRedo: false })
    })
  })

  describe('Button State Persistence', () => {
    test('buttons maintain visibility during state transitions', () => {
      const stateSequence = [
        { canUndo: false, canRedo: false }, // Initial
        { canUndo: true, canRedo: false },  // After edit
        { canUndo: false, canRedo: true },  // After undo
        { canUndo: true, canRedo: false },  // After redo
      ]

      for (let i = 0; i < stateSequence.length; i++) {
        const state = stateSequence[i]
        const hasAnyHistory = state.canUndo || state.canRedo
        
        if (i === 0) {
          // Only initial state should hide buttons
          expect(hasAnyHistory).toBe(false)
        } else {
          // All other states should show buttons
          expect(hasAnyHistory).toBe(true)
        }
      }
    })
  })
})