/**
 * Compatibility layer for per-section-history-store.ts
 * Maps the original per-section history store API to the unified store
 */

import { 
  useUnifiedBuilderStore,
  useCanUndo,
  useCanRedo,
  useBuilderActions
} from '../unified-builder-store'
import { logger } from '@/utils/logger'

// Helper to create composite key
const createSectionKey = (layoutId: string, sectionType: string, sectionId: string): string => {
  return `${layoutId}_${sectionType}_${sectionId}`
}

// Non-hook version for use in services
export const perSectionHistoryStoreAPI = {
  hasLayoutEdits: (layoutId: string) => {
    try {
      if (!layoutId || typeof layoutId !== 'string') {
        logger.warn('⚠️ Invalid layoutId provided to hasLayoutEdits', 'layout-restoration')
        return false
      }

      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      
      logger.info(`🔍 hasLayoutEdits debug for ${layoutId}:`, {
        layoutId,
        totalHistories: Object.keys(currentHistories).length,
        historyKeys: Object.keys(currentHistories),
        lookingForPrefix: `${layoutId}_`
      }, 'layout-restoration')
      
      // Check if any section for this layout has edits
      const hasEdits = Object.keys(currentHistories).some(key => {
        const matches = key.startsWith(`${layoutId}_`)
        if (!matches) return false
        
        const history = currentHistories[key]
        const hasEditsInHistory = history && Array.isArray(history.edits) && history.edits.length > 0
        
        logger.info(`🔧 History key ${key}:`, {
          matches,
          hasHistory: !!history,
          editsCount: history?.edits?.length || 0,
          hasEditsInHistory
        }, 'layout-restoration')
        
        return hasEditsInHistory
      })
      
      logger.info(`📊 Layout ${layoutId} has edits: ${hasEdits}`, undefined, 'layout-restoration')
      return hasEdits

    } catch (error) {
      logger.error('❌ Error checking layout edits:', error, 'layout-restoration')
      return false
    }
  },

  getLayoutFinalComponents: (layoutId: string) => {
    try {
      if (!layoutId || typeof layoutId !== 'string') {
        logger.warn('⚠️ Invalid layoutId provided to getLayoutFinalComponents', 'layout-restoration')
        return null
      }

      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const finalComponents: Record<string, any> = {}
      
      // Find all sections for this layout and get their final state
      Object.entries(currentHistories).forEach(([key, history]) => {
        if (!key.startsWith(`${layoutId}_`)) return
        
        if (history && Array.isArray(history.edits) && history.edits.length > 0) {
          // Get the current edit (final state)
          const currentEdit = history.edits[history.currentIndex]
          if (currentEdit && currentEdit.content) {
            // Extract section type from key (layoutId_sectionType_sectionId)
            const parts = key.split('_')
            const sectionType = parts[1] || 'unknown'
            
            finalComponents[sectionType] = {
              id: currentEdit.content.id || `${sectionType}-component`,
              type: sectionType,
              name: currentEdit.content.name || sectionType,
              html: currentEdit.content.html || '',
              css: currentEdit.content.css || '',
              props: currentEdit.content.props || {}
            }
          }
        }
      })
      
      logger.info(`🎯 Retrieved ${Object.keys(finalComponents).length} final components for layout ${layoutId}`, undefined, 'layout-restoration')
      return Object.keys(finalComponents).length > 0 ? finalComponents : null

    } catch (error) {
      logger.error('❌ Error retrieving layout final components:', error, 'layout-restoration')
      return null
    }
  }
}

// Export the store instance for tests with setState/getState for test compatibility
export const perSectionHistoryStore = {
  ...useUnifiedBuilderStore,
  setState: (newState: any) => {
    // For tests - reset the store
    if (newState.histories) {
      useUnifiedBuilderStore.setState(state => ({
        ...state,
        history: { ...state.history, sections: newState.histories }
      }))
    }
  },
  getState: () => ({
    histories: useUnifiedBuilderStore.getState().history.sections,
    canUndo: (layoutId: string, sectionType: string, sectionId: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key]
      return history ? history.currentIndex > 0 : false
    },
    canRedo: (layoutId: string, sectionType: string, sectionId: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key]
      return history ? history.currentIndex < history.edits.length - 1 : false
    },
    recordEdit: (layoutId: string, sectionType: string, sectionId: string, content: any, action: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key] || { edits: [], currentIndex: -1 }
      
      const newEdit = {
        timestamp: Date.now(),
        action,
        content,
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      }
      
      const newEdits = [...history.edits.slice(0, history.currentIndex + 1), newEdit]
      const newHistory = {
        edits: newEdits,
        currentIndex: newEdits.length - 1
      }
      
      useUnifiedBuilderStore.setState(state => ({
        ...state,
        history: {
          ...state.history,
          sections: {
            ...state.history.sections,
            [key]: newHistory
          }
        }
      }))
    },
    undo: (layoutId: string, sectionType: string, sectionId: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key]
      
      if (!history || history.currentIndex <= 0) return null
      
      const newIndex = history.currentIndex - 1
      useUnifiedBuilderStore.setState(state => ({
        ...state,
        history: {
          ...state.history,
          sections: {
            ...state.history.sections,
            [key]: { ...history, currentIndex: newIndex }
          }
        }
      }))
      
      return history.edits[newIndex]
    },
    redo: (layoutId: string, sectionType: string, sectionId: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key]
      
      if (!history || history.currentIndex >= history.edits.length - 1) return null
      
      const newIndex = history.currentIndex + 1
      useUnifiedBuilderStore.setState(state => ({
        ...state,
        history: {
          ...state.history,
          sections: {
            ...state.history.sections,
            [key]: { ...history, currentIndex: newIndex }
          }
        }
      }))
      
      return history.edits[newIndex]
    }
  }),
  // Add the API methods for non-hook usage
  ...perSectionHistoryStoreAPI
}

export const usePerSectionHistoryStore = () => {
  const histories = useUnifiedBuilderStore(state => state.history.sections)
  const actions = useBuilderActions()

  return {
    // State
    histories,
    
    // Actions
    recordEdit: actions.recordEdit,
    
    canUndo: (layoutId: string, sectionType: string, sectionId: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      // Get fresh state from store instance to avoid stale closures
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key]
      return history ? history.currentIndex > 0 : false
    },
    
    canRedo: (layoutId: string, sectionType: string, sectionId: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      // Get fresh state from store instance to avoid stale closures
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key]
      return history ? history.currentIndex < history.edits.length - 1 : false
    },
    
    undo: actions.undo,
    redo: actions.redo,
    
    clearSection: actions.clearSectionHistory,
    
    clearLayout: (layoutId: string) => {
      // Clear all sections for a layout
      Object.keys(histories).forEach(key => {
        if (key.startsWith(`${layoutId}_`)) {
          const [lid, sectionType, sectionId] = key.split('_')
          actions.clearSectionHistory(lid, sectionType, sectionId)
        }
      })
    },
    
    getHistoryInfo: (layoutId: string, sectionType: string, sectionId: string) => {
      const key = createSectionKey(layoutId, sectionType, sectionId)
      // Get fresh state from store instance to avoid stale closures
      const currentHistories = useUnifiedBuilderStore.getState().history.sections
      const history = currentHistories[key]
      
      if (!history) {
        return { canUndo: false, canRedo: false }
      }
      
      const canUndo = history.currentIndex > 0
      const canRedo = history.currentIndex < history.edits.length - 1
      const lastAction = history.currentIndex >= 0 
        ? history.edits[history.currentIndex]?.userAction 
        : undefined
      
      return { canUndo, canRedo, lastAction }
    },
    
    // Layout restoration methods
    hasLayoutEdits: (layoutId: string) => {
      try {
        if (!layoutId || typeof layoutId !== 'string') {
          logger.warn('⚠️ Invalid layoutId provided to hasLayoutEdits', 'layout-restoration')
          return false
        }

        const currentHistories = useUnifiedBuilderStore.getState().history.sections
        
        logger.info(`🔍 hasLayoutEdits (hook version) debug for ${layoutId}:`, {
          layoutId,
          totalHistories: Object.keys(currentHistories).length,
          historyKeys: Object.keys(currentHistories),
          lookingForPrefix: `${layoutId}_`
        }, 'layout-restoration')
        
        // Check if any section for this layout has edits
        const hasEdits = Object.keys(currentHistories).some(key => {
          const matches = key.startsWith(`${layoutId}_`)
          if (!matches) return false
          
          const history = currentHistories[key]
          const hasEditsInHistory = history && Array.isArray(history.edits) && history.edits.length > 0
          
          logger.info(`🔧 Hook history key ${key}:`, {
            matches,
            hasHistory: !!history,
            editsCount: history?.edits?.length || 0,
            hasEditsInHistory
          }, 'layout-restoration')
          
          return hasEditsInHistory
        })
        
        logger.info(`📊 Hook version - Layout ${layoutId} has edits: ${hasEdits}`, undefined, 'layout-restoration')
        return hasEdits

      } catch (error) {
        logger.error('❌ Error checking layout edits:', error, 'layout-restoration')
        return false
      }
    },

    getLayoutFinalComponents: (layoutId: string) => {
      try {
        if (!layoutId || typeof layoutId !== 'string') {
          logger.warn('⚠️ Invalid layoutId provided to getLayoutFinalComponents', 'layout-restoration')
          return null
        }

        const currentHistories = useUnifiedBuilderStore.getState().history.sections
        const finalComponents: Record<string, any> = {}
        
        // Find all sections for this layout and get their final state
        Object.entries(currentHistories).forEach(([key, history]) => {
          if (!key.startsWith(`${layoutId}_`)) return
          
          if (history && Array.isArray(history.edits) && history.edits.length > 0) {
            // Get the current edit (final state)
            const currentEdit = history.edits[history.currentIndex]
            if (currentEdit && currentEdit.content) {
              // Extract section type from key (layoutId_sectionType_sectionId)
              const parts = key.split('_')
              const sectionType = parts[1] || 'unknown'
              
              finalComponents[sectionType] = {
                id: currentEdit.content.id || `${sectionType}-component`,
                type: sectionType,
                name: currentEdit.content.name || sectionType,
                html: currentEdit.content.html || '',
                css: currentEdit.content.css || '',
                props: currentEdit.content.props || {}
              }
            }
          }
        })
        
        logger.info(`🎯 Retrieved ${Object.keys(finalComponents).length} final components for layout ${layoutId}`, undefined, 'layout-restoration')
        return Object.keys(finalComponents).length > 0 ? finalComponents : null

      } catch (error) {
        logger.error('❌ Error retrieving layout final components:', error, 'layout-restoration')
        return null
      }
    },

    // Additional method from original store
    getDebugInfo: () => {
      const totalHistories = Object.keys(histories).length
      const totalEdits = Object.values(histories).reduce((sum, h) => sum + h.edits.length, 0)
      
      logger.info('History Debug Info:', {
        totalHistories,
        totalEdits,
        histories: Object.entries(histories).map(([key, h]) => ({
          key,
          edits: h.edits.length,
          currentIndex: h.currentIndex
        }))
      })
      
      return { totalHistories, totalEdits }
    }
  }
}

// Add static methods for test compatibility
Object.assign(usePerSectionHistoryStore, {
  setState: (newState: any) => {
    if (newState.histories) {
      useUnifiedBuilderStore.setState(state => ({
        ...state,
        history: { ...state.history, sections: newState.histories }
      }))
    }
  },
  getState: () => ({
    histories: useUnifiedBuilderStore.getState().history.sections
  })
})

// Individual selector exports
export { useCanUndo, useCanRedo }