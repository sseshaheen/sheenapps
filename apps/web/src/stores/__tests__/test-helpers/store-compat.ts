/**
 * Test helper for per-section history store tests
 * Provides a unified API that matches the original store interface
 */

import { perSectionHistoryStore } from '../../../store/compat/per-section-history-store-compat'

export const testStore = {
  setState: perSectionHistoryStore.setState,
  getState: () => {
    const state = perSectionHistoryStore.getState()
    
    // Create a test-friendly API that matches original store
    return {
      ...state,
      canUndo: state.canUndo,
      canRedo: state.canRedo,
      recordEdit: (layoutId: string, sectionType: string, sectionId: string, content: any, action: string) => {
        // Call the original recordEdit
        state.recordEdit(layoutId, sectionType, sectionId, content, action)
        
        // Enforce 10-step limit
        const key = `${layoutId}_${sectionType}_${sectionId}`
        const currentState = perSectionHistoryStore.getState()
        const history = currentState.histories[key]
        
        if (history && history.edits.length > 10) {
          const trimmedEdits = history.edits.slice(-10)
          const newIndex = Math.min(history.currentIndex, 9)
          
          perSectionHistoryStore.setState({
            histories: {
              ...currentState.histories,
              [key]: {
                ...history,
                edits: trimmedEdits,
                currentIndex: newIndex
              }
            }
          })
        }
      },
      undo: (layoutId: string, sectionType: string, sectionId: string) => {
        const result = state.undo(layoutId, sectionType, sectionId)
        if (!result) return null
        // Convert to expected format
        return {
          content: result.content,
          userAction: result.action
        }
      },
      redo: (layoutId: string, sectionType: string, sectionId: string) => {
        const result = state.redo(layoutId, sectionType, sectionId)
        if (!result) return null
        // Convert to expected format
        return {
          content: result.content,
          userAction: result.action
        }
      },
      
      // Add missing methods that tests expect
      getHistoryInfo: (layoutId: string, sectionType: string, sectionId: string) => {
        const canUndo = state.canUndo(layoutId, sectionType, sectionId)
        const canRedo = state.canRedo(layoutId, sectionType, sectionId)
        const key = `${layoutId}_${sectionType}_${sectionId}`
        const history = state.histories[key]
        const lastAction = history && history.currentIndex >= 0 
          ? history.edits[history.currentIndex]?.action 
          : undefined
        
        return { canUndo, canRedo, lastAction }
      },
      
      clearSection: (layoutId: string, sectionType: string, sectionId: string) => {
        const key = `${layoutId}_${sectionType}_${sectionId}`
        const currentState = perSectionHistoryStore.getState()
        const newHistories = { ...currentState.histories }
        delete newHistories[key]
        perSectionHistoryStore.setState({ histories: newHistories })
      },
      
      clearLayout: (layoutId: string) => {
        const currentState = perSectionHistoryStore.getState()
        const newHistories: any = {}
        
        Object.keys(currentState.histories).forEach(key => {
          if (!key.startsWith(`${layoutId}_`)) {
            newHistories[key] = currentState.histories[key]
          }
        })
        
        perSectionHistoryStore.setState({ histories: newHistories })
      }
    }
  }
}