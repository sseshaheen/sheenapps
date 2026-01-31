/**
 * Pure Data History Manager - Sprint 3 Implementation
 * Expert requirement: Eliminate all DOM dependencies from undo/redo operations
 */

import { useBuilderStore, selectors } from '@/store/builder-store'
import { events } from '@/utils/event-logger'

export interface HistoryOperationResult {
  success: boolean
  operation: 'undo' | 'redo'
  sectionsAffected: string[]
  timestamp: number
  error?: string
}

/**
 * Pure Data History Manager
 * 
 * Replaces DOM-dependent UndoRedoButtonManager with pure data operations.
 * All operations work via store state only - no DOM manipulation.
 */
export class PureDataHistoryManager {
  private store = useBuilderStore

  /**
   * Perform undo operation using pure data
   * Expert requirement: "Undo via index math only"
   */
  public undo(): HistoryOperationResult {
    const startTime = performance.now()
    
    try {
      // Check if undo is possible using pure selector
      const canUndo = selectors.canUndo(this.store.getState())
      
      if (!canUndo) {
        return {
          success: false,
          operation: 'undo',
          sectionsAffected: [],
          timestamp: Date.now(),
          error: 'No history available for undo'
        }
      }

      // Get sections before undo for tracking
      const sectionsBeforeUndo = Object.keys(selectors.currentSections(this.store.getState()))

      // Perform pure data undo (no DOM manipulation)
      this.store.getState().undo()

      // Get sections after undo for comparison
      const sectionsAfterUndo = Object.keys(selectors.currentSections(this.store.getState()))

      // Track performance and analytics
      const duration = performance.now() - startTime
      events.emit('builder:undo', {
        duration,
        sectionsAffected: sectionsBeforeUndo.length,
        method: 'pure_data',
        timestamp: Date.now()
      })

      return {
        success: true,
        operation: 'undo',
        sectionsAffected: sectionsBeforeUndo,
        timestamp: Date.now()
      }

    } catch (error) {
      console.error('Pure data undo failed:', error)
      return {
        success: false,
        operation: 'undo',
        sectionsAffected: [],
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Perform redo operation using pure data
   * Expert requirement: "Redo via index math only"
   */
  public redo(): HistoryOperationResult {
    const startTime = performance.now()
    
    try {
      // Check if redo is possible using pure selector
      const canRedo = selectors.canRedo(this.store.getState())
      
      if (!canRedo) {
        return {
          success: false,
          operation: 'redo',
          sectionsAffected: [],
          timestamp: Date.now(),
          error: 'No forward history available for redo'
        }
      }

      // Get sections before redo for tracking
      const sectionsBeforeRedo = Object.keys(selectors.currentSections(this.store.getState()))

      // Perform pure data redo (no DOM manipulation)
      this.store.getState().redo()

      // Get sections after redo for comparison
      const sectionsAfterRedo = Object.keys(selectors.currentSections(this.store.getState()))

      // Track performance and analytics
      const duration = performance.now() - startTime
      events.emit('builder:redo', {
        duration,
        sectionsAffected: sectionsAfterRedo.length,
        method: 'pure_data',
        timestamp: Date.now()
      })

      return {
        success: true,
        operation: 'redo',
        sectionsAffected: sectionsAfterRedo,
        timestamp: Date.now()
      }

    } catch (error) {
      console.error('Pure data redo failed:', error)
      return {
        success: false,
        operation: 'redo',
        sectionsAffected: [],
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Get current history state using pure selectors
   * No DOM queries - all data from store
   */
  public getHistoryState() {
    const state = this.store.getState()
    const canUndo = selectors.canUndo(state)
    const canRedo = selectors.canRedo(state)
    const currentSections = selectors.currentSections(state)
    const currentLayout = selectors.currentLayout(state)
    
    return {
      canUndo,
      canRedo,
      sectionsCount: Object.keys(currentSections).length,
      currentLayoutId: currentLayout?.id,
      historyLength: state.history.stack.length,
      currentIndex: state.history.index
    }
  }

  /**
   * Validate history integrity using pure data
   * Expert requirement: Comprehensive validation
   */
  public validateHistoryIntegrity(): {
    isValid: boolean
    issues: string[]
    metrics: {
      totalSnapshots: number
      indexInBounds: boolean
      allSnapshotsValid: boolean
    }
  } {
    const state = this.store.getState()
    const issues: string[] = []

    // Check basic history structure
    const totalSnapshots = state.history.stack.length
    const currentIndex = state.history.index
    const indexInBounds = currentIndex >= -1 && currentIndex < totalSnapshots

    if (!indexInBounds) {
      issues.push(`History index ${currentIndex} out of bounds for stack length ${totalSnapshots}`)
    }

    // Validate each snapshot
    let allSnapshotsValid = true
    for (let i = 0; i < state.history.stack.length; i++) {
      const snapshot = state.history.stack[i]
      
      if (!snapshot.id || !snapshot.timestamp || !snapshot.layoutId) {
        issues.push(`Snapshot ${i} missing required fields`)
        allSnapshotsValid = false
      }

      if (!snapshot.sectionsState || typeof snapshot.sectionsState !== 'object') {
        issues.push(`Snapshot ${i} has invalid sectionsState`)
        allSnapshotsValid = false
      }
    }

    // Check layout consistency
    const currentLayoutId = state.ui.currentLayoutId
    if (!state.layouts[currentLayoutId]) {
      issues.push(`Current layout ${currentLayoutId} not found in layouts`)
    }

    return {
      isValid: issues.length === 0,
      issues,
      metrics: {
        totalSnapshots,
        indexInBounds,
        allSnapshotsValid
      }
    }
  }

  /**
   * Clear history for current layout (pure data operation)
   */
  public clearHistory(): void {
    // This would need to be implemented as a store action
    // For now, we can emit an event for external handling
    const state = this.store.getState()
    events.emit('builder:clear_history', {
      layoutId: selectors.currentLayout(state)?.id,
      clearedSnapshots: state.history.stack.length,
      timestamp: Date.now()
    })
    
    console.warn('clearHistory: This operation needs to be implemented as a store reducer')
  }

  /**
   * Get performance metrics for history operations
   */
  public getPerformanceMetrics() {
    const state = this.store.getState()
    
    return {
      historySize: state.history.stack.length,
      currentIndex: state.history.index,
      sectionsCount: Object.keys(selectors.currentSections(state)).length,
      memoryEstimate: this.estimateMemoryUsage(state),
      lastOperation: this.getLastOperationTime()
    }
  }

  private estimateMemoryUsage(state: any): number {
    // Rough estimate of memory usage in bytes
    return JSON.stringify(state.history).length * 2 // UTF-16 characters
  }

  private getLastOperationTime(): number | null {
    const stack = this.store.getState().history.stack
    if (stack.length === 0) return null
    
    return stack[stack.length - 1].timestamp
  }
}

/**
 * Singleton instance for use throughout the application
 */
export const pureDataHistoryManager = new PureDataHistoryManager()

/**
 * React hook for pure data history operations
 * Replaces DOM-dependent useUndoRedoManager
 */
export function usePureDataHistory() {
  const canUndo = useBuilderStore(selectors.canUndo)
  const canRedo = useBuilderStore(selectors.canRedo)
  const historyState = pureDataHistoryManager.getHistoryState()

  return {
    // Actions
    undo: () => pureDataHistoryManager.undo(),
    redo: () => pureDataHistoryManager.redo(),
    
    // State
    canUndo,
    canRedo,
    historyState,
    
    // Utilities
    validateIntegrity: () => pureDataHistoryManager.validateHistoryIntegrity(),
    getMetrics: () => pureDataHistoryManager.getPerformanceMetrics()
  }
}

/**
 * Pure data history provider for components
 * Expert requirement: "Remove all DOM-based undo/redo logic"
 */
export interface PureHistoryActions {
  undo: () => HistoryOperationResult
  redo: () => HistoryOperationResult
  canUndo: boolean
  canRedo: boolean
  historyLength: number
  currentIndex: number
}

export function createPureHistoryActions(): PureHistoryActions {
  const manager = pureDataHistoryManager
  const state = manager.getHistoryState()
  
  return {
    undo: () => manager.undo(),
    redo: () => manager.redo(),
    canUndo: state.canUndo,
    canRedo: state.canRedo,
    historyLength: state.historyLength,
    currentIndex: state.currentIndex
  }
}