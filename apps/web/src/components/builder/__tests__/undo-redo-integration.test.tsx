import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, renderHook } from '@testing-library/react'
import { act } from 'react'
import userEvent from '@testing-library/user-event'
import { usePerSectionHistoryStore } from '@/stores/per-section-history-store'
import { logger } from '@/utils/logger';

// Mock the complex dependencies
vi.mock('@/hooks/use-workspace-project', () => ({
  useWorkspaceProject: () => ({
    project: { name: 'Test Project' },
    isLoading: false,
    error: null
  })
}))

vi.mock('@/store/question-flow-store', () => ({
  useCurrentQuestion: () => null,
  useQuestionHistory: () => [],
  useFlowProgress: () => ({ engagementScore: 0, flowPhase: 'initial' }),
  useQuestionFlowActions: () => ({ startQuestionFlow: vi.fn() }),
  useQuestionFlowStore: {
    getState: () => ({ businessContext: null })
  }
}))

vi.mock('@/store/auth-store', () => ({
  useAuthStore: () => ({
    canPerformAction: () => true,
    requestUpgrade: vi.fn()
  })
}))

vi.mock('@/store/preview-generation-store', () => ({
  usePreviewGenerationStore: () => ({
    getCurrentLayoutId: () => 'test-layout',
    currentPreview: 'test-preview',
    switchToLayout: vi.fn()
  })
}))

vi.mock('@/services/preview/live-preview-engine', () => ({
  LivePreviewEngine: vi.fn().mockImplementation(() => ({
    applyPreviewImpact: vi.fn(),
    applyComponentToPreview: vi.fn(),
    suspendMonitoringFor: vi.fn()
  }))
}))

// Simple test component that simulates the workspace behavior
function TestWorkspace() {
  const {
    recordEdit: perSectionRecordEdit,
    canUndo: perSectionCanUndo,
    canRedo: perSectionCanRedo,
    undo: perSectionUndo,
    redo: perSectionRedo
  } = usePerSectionHistoryStore()

  const handleEdit = () => {
    const layoutId = 'test-layout'
    const sectionType = 'hero'
    const sectionKey = 'hero'
    
    // Simulate first edit (record original + new)
    perSectionRecordEdit(layoutId, sectionType, sectionKey, 
      { content: 'original' }, 'original')
    perSectionRecordEdit(layoutId, sectionType, sectionKey, 
      { content: 'edited' }, 'user edit')
  }

  const handleUndo = () => {
    const layoutId = 'test-layout'
    const sectionType = 'hero'
    const sectionKey = 'hero'
    
    const result = perSectionUndo(layoutId, sectionType, sectionKey)
    if (result) {
      logger.info('Undo successful:', result.content);
    }
  }

  const handleRedo = () => {
    const layoutId = 'test-layout'
    const sectionType = 'hero'
    const sectionKey = 'hero'
    
    const result = perSectionRedo(layoutId, sectionType, sectionKey)
    if (result) {
      logger.info('Redo successful:', result.content);
    }
  }

  const layoutId = 'test-layout'
  const sectionType = 'hero'
  const sectionKey = 'hero'
  
  const canUndo = perSectionCanUndo(layoutId, sectionType, sectionKey)
  const canRedo = perSectionCanRedo(layoutId, sectionType, sectionKey)

  return (
    <div>
      <button onClick={handleEdit} data-testid="edit-button">
        Edit Section
      </button>
      <button 
        onClick={handleUndo} 
        disabled={!canUndo}
        data-testid="undo-button"
      >
        Undo {canUndo ? '(enabled)' : '(disabled)'}
      </button>
      <button 
        onClick={handleRedo} 
        disabled={!canRedo}
        data-testid="redo-button"
      >
        Redo {canRedo ? '(enabled)' : '(disabled)'}
      </button>
      <div data-testid="undo-state">{canUndo ? 'can-undo' : 'cannot-undo'}</div>
      <div data-testid="redo-state">{canRedo ? 'can-redo' : 'cannot-redo'}</div>
    </div>
  )
}

describe('Undo/Redo Integration', () => {
  beforeEach(() => {
    // Reset store before each test
    // Since we're using the unified store through compat layer, 
    // we need to clear all mocks to reset state
    vi.clearAllMocks()
  })

  test('complete edit → undo → redo flow maintains correct button states', async () => {
    const user = userEvent.setup()
    render(<TestWorkspace />)

    // Initial state: no buttons enabled
    expect(screen.getByTestId('undo-state')).toHaveTextContent('cannot-undo')
    expect(screen.getByTestId('redo-state')).toHaveTextContent('cannot-redo')
    expect(screen.getByTestId('undo-button')).toBeDisabled()
    expect(screen.getByTestId('redo-button')).toBeDisabled()

    // Step 1: Edit section
    await user.click(screen.getByTestId('edit-button'))

    // After edit: undo enabled, redo disabled
    await waitFor(() => {
      expect(screen.getByTestId('undo-state')).toHaveTextContent('can-undo')
    })
    expect(screen.getByTestId('redo-state')).toHaveTextContent('cannot-redo')
    expect(screen.getByTestId('undo-button')).toBeEnabled()
    expect(screen.getByTestId('redo-button')).toBeDisabled()

    // Step 2: Undo
    await user.click(screen.getByTestId('undo-button'))

    // After undo: undo disabled (at original), redo enabled
    await waitFor(() => {
      expect(screen.getByTestId('undo-state')).toHaveTextContent('cannot-undo')
    })
    expect(screen.getByTestId('redo-state')).toHaveTextContent('can-redo')
    expect(screen.getByTestId('undo-button')).toBeDisabled()
    expect(screen.getByTestId('redo-button')).toBeEnabled()

    // Step 3: Redo - THE CRITICAL TEST
    await user.click(screen.getByTestId('redo-button'))

    // After redo: undo enabled, redo disabled (THIS WAS THE BUG!)
    await waitFor(() => {
      expect(screen.getByTestId('undo-state')).toHaveTextContent('can-undo')
    })
    expect(screen.getByTestId('redo-state')).toHaveTextContent('cannot-redo')
    expect(screen.getByTestId('undo-button')).toBeEnabled()
    expect(screen.getByTestId('redo-button')).toBeDisabled()
  })

  test('multiple edit → undo → redo cycles work correctly', async () => {
    const user = userEvent.setup()
    render(<TestWorkspace />)

    // Perform 3 edit cycles
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByTestId('edit-button'))
    }

    // Should have undo available, no redo
    expect(screen.getByTestId('undo-button')).toBeEnabled()
    expect(screen.getByTestId('redo-button')).toBeDisabled()

    // Undo twice
    await user.click(screen.getByTestId('undo-button'))
    await user.click(screen.getByTestId('undo-button'))

    // Should be in middle of history
    await waitFor(() => {
      expect(screen.getByTestId('undo-button')).toBeEnabled()
      expect(screen.getByTestId('redo-button')).toBeEnabled()
    })

    // Redo once
    await user.click(screen.getByTestId('redo-button'))

    // Should still have both available
    await waitFor(() => {
      expect(screen.getByTestId('undo-button')).toBeEnabled()
      expect(screen.getByTestId('redo-button')).toBeEnabled()
    })
  })

  test('new edit truncates redo history', async () => {
    const user = userEvent.setup()
    render(<TestWorkspace />)

    // Edit twice
    await user.click(screen.getByTestId('edit-button'))
    await user.click(screen.getByTestId('edit-button'))

    // Undo once
    await user.click(screen.getByTestId('undo-button'))

    // Should have both undo and redo available
    await waitFor(() => {
      expect(screen.getByTestId('undo-button')).toBeEnabled()
      expect(screen.getByTestId('redo-button')).toBeEnabled()
    })

    // Make new edit (should truncate redo history)
    await user.click(screen.getByTestId('edit-button'))

    // Now should only have undo available
    await waitFor(() => {
      expect(screen.getByTestId('undo-button')).toBeEnabled()
    })
    expect(screen.getByTestId('redo-button')).toBeDisabled()
  })
})

describe('Button State Consistency', () => {
  test('button states reflect actual history store state', () => {
    // Use the unified store directly for testing
    const { result } = renderHook(() => usePerSectionHistoryStore())
    
    const layoutId = 'test'
    const sectionType = 'hero'
    const sectionKey = 'hero'

    // No history
    expect(result.current.canUndo(layoutId, sectionType, sectionKey)).toBe(false)
    expect(result.current.canRedo(layoutId, sectionType, sectionKey)).toBe(false)

    // Add one edit
    act(() => {
      result.current.recordEdit(layoutId, sectionType, sectionKey, { content: 'v1' }, 'edit1')
    })
    expect(result.current.canUndo(layoutId, sectionType, sectionKey)).toBe(false) // Only one entry
    expect(result.current.canRedo(layoutId, sectionType, sectionKey)).toBe(false)

    // Add second edit
    act(() => {
      result.current.recordEdit(layoutId, sectionType, sectionKey, { content: 'v2' }, 'edit2')
    })
    expect(result.current.canUndo(layoutId, sectionType, sectionKey)).toBe(true) // Can go back to v1
    expect(result.current.canRedo(layoutId, sectionType, sectionKey)).toBe(false) // At latest

    // Undo
    act(() => {
      result.current.undo(layoutId, sectionType, sectionKey)
    })
    expect(result.current.canUndo(layoutId, sectionType, sectionKey)).toBe(false) // At first entry
    expect(result.current.canRedo(layoutId, sectionType, sectionKey)).toBe(true) // Can go to v2

    // Redo
    act(() => {
      result.current.redo(layoutId, sectionType, sectionKey)
    })
    expect(result.current.canUndo(layoutId, sectionType, sectionKey)).toBe(true) // Can go to v1
    expect(result.current.canRedo(layoutId, sectionType, sectionKey)).toBe(false) // At latest again
  })
})