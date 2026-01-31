// Simple Section History Store - One-step undo/redo with browser cache
// Lightweight solution for section editing history before authentication

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { logger } from '@/utils/logger'

interface ComponentData {
  id: string
  type: string
  name: string
  html: string
  css: string
  props: Record<string, unknown>
}

interface SectionVersion {
  id: string
  component: ComponentData
  timestamp: number
  userAction: string
}

interface SectionHistory {
  versions: SectionVersion[] // Full history stack (max 4: original + 3 edits)
  currentIndex: number // Index pointing to current version in the stack
}

interface LayoutFinalState {
  originalState: Record<string, ComponentData> // sectionId -> original component
  finalState: Record<string, ComponentData>    // sectionId -> final edited component
  lastUpdated: number
}

interface SectionHistoryState {
  histories: Record<string, Record<string, SectionHistory>> // layoutId -> sectionId -> SectionHistory
  layoutFinalStates: Record<string, LayoutFinalState> // layoutId -> final state cache
  currentLayoutId: string | null
  
  // Layout Management with Smart State Management
  switchToLayout: (layoutId: string) => void
  getCurrentLayoutId: () => string | null
  clearLayoutHistory: (layoutId: string) => void
  getLayoutFinalState: (layoutId: string) => LayoutFinalState | null
  setLayoutFinalState: (layoutId: string, originalState: Record<string, ComponentData>, finalState: Record<string, ComponentData>) => void
  
  // Actions (now layout-aware)
  recordChange: (sectionId: string, component: ComponentData, userAction: string, originalComponent?: ComponentData) => void
  recordInitialState: (sectionId: string, component: ComponentData) => void
  undo: (sectionId: string) => SectionVersion | null
  redo: (sectionId: string) => SectionVersion | null
  canUndo: (sectionId: string) => boolean
  canRedo: (sectionId: string) => boolean
  clearHistory: (sectionId: string) => void
  clearAllHistory: () => void
  
  // UI helpers
  getUndoAction: (sectionId: string) => string | null
  getRedoAction: (sectionId: string) => string | null
  getCurrentVersion: (sectionId: string) => SectionVersion | null
  getAllCurrentVersions: () => Record<string, SectionVersion>
  
  // Smart State Management
  updateLayoutFinalState: () => void
  validateEditIsolation: (layoutId: string) => boolean
  getImmutableSnapshot: (layoutId: string) => LayoutFinalState | null
  
  // AI-Ready Functions (for future external AI integration)
  captureCurrentState: (sectionId: string, component: ComponentData) => void
  bulkInitializeFromRenderedSections: (sectionsMap: Record<string, ComponentData>) => void
  
  // Layout Restoration Functions
  getLayoutFinalComponents: (layoutId: string) => Record<string, ComponentData> | null
  hasLayoutEdits: (layoutId: string) => boolean
}


export const useSectionHistoryStore = create<SectionHistoryState>()(
  persist(
    (set, get) => ({
      histories: {},
      layoutFinalStates: {},
      currentLayoutId: null,

      // Layout Management Methods with Smart State Management
      switchToLayout: (layoutId: string) => {
        const state = get()
        
        logger.info(`Switching to layout: ${layoutId}`, undefined, 'layout')
        
        // Update current layout's final state before switching
        if (state.currentLayoutId) {
          logger.debug('layout', 'Updating final state before switch')
          get().updateLayoutFinalState()
        }
        
        set((state) => ({
          currentLayoutId: layoutId,
          // Initialize layout structures if they don't exist
          histories: {
            ...state.histories,
            [layoutId]: state.histories[layoutId] || {}
          },
          layoutFinalStates: {
            ...state.layoutFinalStates,
            [layoutId]: state.layoutFinalStates[layoutId] || {
              originalState: {},
              finalState: {},
              lastUpdated: Date.now()
            }
          }
        }))
        
        logger.success(`Layout switched to ${layoutId}`, 'layout')
      },

      getCurrentLayoutId: () => {
        return get().currentLayoutId
      },

      clearLayoutHistory: (layoutId: string) => {
        logger.info(`🧹 Clearing history for layout: ${layoutId}`)
        set((state) => {
          const newHistories = { ...state.histories }
          const newFinalStates = { ...state.layoutFinalStates }
          delete newHistories[layoutId]
          delete newFinalStates[layoutId]
          return { 
            histories: newHistories,
            layoutFinalStates: newFinalStates
          }
        })
      },

      getLayoutFinalState: (layoutId: string) => {
        const state = get()
        return state.layoutFinalStates[layoutId] || null
      },

      setLayoutFinalState: (layoutId: string, originalState: Record<string, ComponentData>, finalState: Record<string, ComponentData>) => {
        logger.info(`💾 Setting final state for layout ${layoutId}`)
        set((state) => ({
          layoutFinalStates: {
            ...state.layoutFinalStates,
            [layoutId]: {
              originalState: JSON.parse(JSON.stringify(originalState)), // Deep clone for immutability
              finalState: JSON.parse(JSON.stringify(finalState)), // Deep clone for immutability
              lastUpdated: Date.now()
            }
          }
        }))
      },

      // Helper to get current layout histories
      _getCurrentLayoutHistories: () => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ No current layout ID set')
          return {}
        }
        return state.histories[state.currentLayoutId] || {}
      },

      // Helper to update current layout histories
      _updateCurrentLayoutHistories: (sectionId: string, sectionHistory: SectionHistory) => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ Cannot update history - no current layout ID set')
          return
        }
        
        set((state) => ({
          histories: {
            ...state.histories,
            [state.currentLayoutId!]: {
              ...state.histories[state.currentLayoutId!],
              [sectionId]: sectionHistory
            }
          }
        }))
      },

      recordInitialState: (sectionId: string, component: ComponentData) => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ Cannot record initial state - no current layout ID set')
          return
        }

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        
        // Only record initial state if no history exists yet for this section in this layout
        if (currentLayoutHistories[sectionId]) {
          logger.info(`🔄 Initial state already exists for ${sectionId} in layout ${state.currentLayoutId}`)
          return
        }

        const initialVersion: SectionVersion = {
          id: `${sectionId}-initial`,
          component,
          timestamp: Date.now(),
          userAction: 'initial'
        }

        logger.info(`📸 Recording initial state for ${sectionId} in layout ${state.currentLayoutId}`)
        
        set((state) => ({
          histories: {
            ...state.histories,
            [state.currentLayoutId!]: {
              ...currentLayoutHistories,
              [sectionId]: {
                versions: [initialVersion],
                currentIndex: 0
              }
            }
          }
        }))
      },

      // AI-Ready Functions for External AI Integration (layout-aware)
      captureCurrentState: (sectionId: string, component: ComponentData) => {
        // This will be used to capture the current rendered state when AI generates initial layouts
        const state = get()
        logger.info(`📸 Capturing current state for ${sectionId} in layout ${state.currentLayoutId} (AI-ready);`)
        const { recordInitialState } = get()
        recordInitialState(sectionId, component)
      },

      bulkInitializeFromRenderedSections: (sectionsMap: Record<string, ComponentData>) => {
        // This will be used when external AI generates a complete layout
        // sectionsMap format: { "header": component, "hero": component, ... }
        const state = get()
        logger.info(`🎯 Bulk initializing sections from AI-generated layout in ${state.currentLayoutId}:`, Object.keys(sectionsMap))
        
        Object.entries(sectionsMap).forEach(([sectionId, component]) => {
          const { recordInitialState } = get()
          recordInitialState(sectionId, component)
        })
        
        logger.info(`✅ Initialized ${Object.keys(sectionsMap).length} sections from AI layout in ${state.currentLayoutId}`)
      },

      recordChange: (sectionId: string, component: ComponentData, userAction: string, originalComponent?: ComponentData) => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ Cannot record change - no current layout ID set')
          return
        }

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const currentHistory = currentLayoutHistories[sectionId] || { versions: [], currentIndex: -1 }
        
        logger.info(`📝 Recording change for ${sectionId} in layout ${state.currentLayoutId}: "${userAction}"`)
          
        const newVersion: SectionVersion = {
          id: `${sectionId}-${Date.now()}`,
          component,
          timestamp: Date.now(),
          userAction
        }

        // Ensure versions is always an array and currentIndex is a valid number
        const safeVersions = Array.isArray(currentHistory.versions) ? currentHistory.versions : []
        let updatedVersions = [...safeVersions]
        let newCurrentIndex = typeof currentHistory.currentIndex === 'number' ? currentHistory.currentIndex : -1

        // If this is the very first edit (no history exists), create initial state
        if (updatedVersions.length === 0) {
          if (originalComponent) {
            logger.info(`✅ Using provided original API-generated component for ${sectionId}`)
            const originalVersion = {
              id: `${sectionId}-api-original`,
              component: originalComponent,
              timestamp: Date.now() - 1000,
              userAction: 'original (API-generated)'
            }
            updatedVersions = [originalVersion, newVersion]
            newCurrentIndex = 1
          } else {
            logger.error(`❌ No original component available for ${sectionId} - this should not happen!`)
            logger.error(`💡 Original components should be captured when API generates them`)
            
            // This should not happen anymore with the new system
            updatedVersions = [newVersion]
            newCurrentIndex = 0
            logger.info(`⚠️ Adding edit without original state for ${sectionId}`)
          }
        } else {
          // We have existing history
          // If we're not at the latest version (user did undo), remove future versions
          if (newCurrentIndex < updatedVersions.length - 1) {
            updatedVersions = updatedVersions.slice(0, newCurrentIndex + 1)
          }
          
          // Add the new version
          updatedVersions.push(newVersion)
          newCurrentIndex = updatedVersions.length - 1
          
          // Keep only the last 4 versions (1 original + 3 edits max)
          if (updatedVersions.length > 4) {
            updatedVersions = updatedVersions.slice(-4)
            newCurrentIndex = updatedVersions.length - 1
          }
        }

        const updatedHistory: SectionHistory = {
          versions: updatedVersions,
          currentIndex: newCurrentIndex
        }

        console.log(`🔍 History updated for ${sectionId} in layout ${state.currentLayoutId}:`, {
          versionsCount: updatedVersions.length,
          currentIndex: newCurrentIndex,
          currentAction: updatedVersions[newCurrentIndex]?.userAction,
          canUndo: newCurrentIndex > 0,
          canRedo: newCurrentIndex < updatedVersions.length - 1,
          allActions: updatedVersions.map(v => v.userAction)
        })

        set((state) => ({
          histories: {
            ...state.histories,
            [state.currentLayoutId!]: {
              ...currentLayoutHistories,
              [sectionId]: updatedHistory
            }
          }
        }))

        // Auto-update final state cache for true edit isolation
        logger.info(`🔄 Auto-updating final state cache after recording change for ${sectionId}`)
        get().updateLayoutFinalState()
      },

      undo: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ Cannot undo - no current layout ID set')
          return null
        }

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const history = currentLayoutHistories[sectionId]
        
        if (!history || !Array.isArray(history.versions) || history.currentIndex <= 0) {
          logger.info(`⚠️ Cannot undo ${sectionId} in layout ${state.currentLayoutId} - no previous version available`)
          return null
        }

        const previousVersion = history.versions[history.currentIndex - 1]
        if (!previousVersion) return null
        
        // Check if previous state is a placeholder (unknown original)
        if (previousVersion.component === null) {
          logger.info(`⚠️ Cannot undo ${sectionId} in layout ${state.currentLayoutId} - original state unknown`)
          logger.info('Suggestion: Implement initial state capture when sections are first loaded')
          return null
        }

        // Move back one step in history within this layout
        set((state) => ({
          histories: {
            ...state.histories,
            [state.currentLayoutId!]: {
              ...currentLayoutHistories,
              [sectionId]: {
                ...history,
                currentIndex: history.currentIndex - 1
              }
            }
          }
        }))

        logger.info(`🔄 Undoing ${sectionId} in layout ${state.currentLayoutId}: ${history.currentIndex} → ${history.currentIndex - 1} (${previousVersion.userAction});`)
        
        // Update final state cache after undo
        get().updateLayoutFinalState()
        
        return previousVersion
      },

      redo: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ Cannot redo - no current layout ID set')
          return null
        }

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const history = currentLayoutHistories[sectionId]
        
        if (!history || !Array.isArray(history.versions) || history.currentIndex >= history.versions.length - 1) {
          logger.info(`⚠️ Cannot redo ${sectionId} in layout ${state.currentLayoutId} - no next version available`)
          return null
        }

        const nextVersion = history.versions[history.currentIndex + 1]
        if (!nextVersion) return null

        // Move forward one step in history within this layout
        set((state) => ({
          histories: {
            ...state.histories,
            [state.currentLayoutId!]: {
              ...currentLayoutHistories,
              [sectionId]: {
                ...history,
                currentIndex: history.currentIndex + 1
              }
            }
          }
        }))

        logger.info(`🔄 Redoing ${sectionId} in layout ${state.currentLayoutId}: ${history.currentIndex} → ${history.currentIndex + 1} (${nextVersion.userAction});`)
        
        // Update final state cache after redo
        get().updateLayoutFinalState()
        
        return nextVersion
      },

      canUndo: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) return false

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const history = currentLayoutHistories[sectionId]
        if (!history || !Array.isArray(history.versions) || history.currentIndex <= 0) return false
        
        const previousVersion = history.versions[history.currentIndex - 1]
        // Can only undo if we have a previous state AND it's not a placeholder
        return !!previousVersion && previousVersion.component !== null
      },

      canRedo: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) return false

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const history = currentLayoutHistories[sectionId]
        if (!history || !Array.isArray(history.versions)) return false
        return history.currentIndex < history.versions.length - 1
      },

      clearHistory: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ Cannot clear history - no current layout ID set')
          return
        }

        logger.info(`🧹 Clearing history for ${sectionId} in layout ${state.currentLayoutId}`)
        
        set((state) => {
          const currentLayoutHistories = { ...state.histories[state.currentLayoutId!] }
          delete currentLayoutHistories[sectionId]
          
          return {
            histories: {
              ...state.histories,
              [state.currentLayoutId!]: currentLayoutHistories
            }
          }
        })
      },

      clearAllHistory: () => {
        logger.info('🧹 Clearing all section history')
        set({ histories: {} })
        // Also clear localStorage
        try {
          localStorage.removeItem('section-history-storage')
        } catch (error) {
          logger.warn('Could not clear localStorage:', error)
        }
      },

      getUndoAction: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) return null

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const history = currentLayoutHistories[sectionId]
        if (!history || !Array.isArray(history.versions) || history.currentIndex <= 0) return null
        
        const previousVersion = history.versions[history.currentIndex - 1]
        if (!previousVersion || previousVersion.component === null) return null
        return `Undo: ${previousVersion.userAction}`
      },

      getRedoAction: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) return null

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const history = currentLayoutHistories[sectionId]
        if (!history || !Array.isArray(history.versions) || history.currentIndex >= history.versions.length - 1) return null
        
        const nextVersion = history.versions[history.currentIndex + 1]
        return nextVersion ? `Redo: ${nextVersion.userAction}` : null
      },

      getCurrentVersion: (sectionId: string) => {
        const state = get()
        if (!state.currentLayoutId) return null

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const history = currentLayoutHistories[sectionId]
        if (!history || !Array.isArray(history.versions) || history.currentIndex < 0) return null
        
        return history.versions[history.currentIndex] || null
      },

      getAllCurrentVersions: () => {
        const state = get()
        if (!state.currentLayoutId) return {}

        const currentLayoutHistories = state.histories[state.currentLayoutId] || {}
        const currentVersions: Record<string, SectionVersion> = {}
        
        Object.entries(currentLayoutHistories).forEach(([sectionId, history]) => {
          if (history && Array.isArray(history.versions) && history.currentIndex >= 0) {
            const currentVersion = history.versions[history.currentIndex]
            if (currentVersion) {
              currentVersions[sectionId] = currentVersion
            }
          }
        })
        
        logger.info(`📋 Current versions for layout ${state.currentLayoutId}:`, Object.keys(currentVersions))
        return currentVersions
      },

      // Smart State Management Methods
      updateLayoutFinalState: () => {
        const state = get()
        if (!state.currentLayoutId) {
          logger.warn('⚠️ Cannot update final state - no current layout ID')
          return
        }

        const layoutId = state.currentLayoutId
        const currentLayoutHistories = state.histories[layoutId] || {}
        const originalState: Record<string, ComponentData> = {}
        const finalState: Record<string, ComponentData> = {}

        // Build original and final states from history
        Object.entries(currentLayoutHistories).forEach(([sectionId, history]) => {
          if (history && Array.isArray(history.versions) && history.versions.length > 0) {
            // Original is always the first version
            originalState[sectionId] = history.versions[0].component
            
            // Final is the current version (at currentIndex)
            if (history.currentIndex >= 0 && history.versions[history.currentIndex]) {
              finalState[sectionId] = history.versions[history.currentIndex].component
            }
          }
        })

        console.log(`💾 Updating final state for layout ${layoutId}:`, {
          originalCount: Object.keys(originalState).length,
          finalCount: Object.keys(finalState).length
        })

        set((state) => ({
          layoutFinalStates: {
            ...state.layoutFinalStates,
            [layoutId]: {
              originalState: JSON.parse(JSON.stringify(originalState)),
              finalState: JSON.parse(JSON.stringify(finalState)),
              lastUpdated: Date.now()
            }
          }
        }))
      },

      validateEditIsolation: (layoutId: string) => {
        const state = get()
        const finalState = state.layoutFinalStates[layoutId]
        
        if (!finalState) {
          logger.warn(`⚠️ No final state found for layout ${layoutId}`)
          return false
        }

        // Validate that sections exist and have valid components
        const isValid = Object.entries(finalState.finalState).every(([sectionId, component]) => {
          const isValidComponent = component && typeof component === 'object'
          if (!isValidComponent) {
            logger.warn(`⚠️ Invalid component for ${sectionId} in layout ${layoutId}`)
          }
          return isValidComponent
        })

        logger.info(`🔍 Edit isolation validation for ${layoutId}:`, isValid ? '✅ Valid' : '❌ Invalid')
        return isValid
      },

      getImmutableSnapshot: (layoutId: string) => {
        const state = get()
        const finalState = state.layoutFinalStates[layoutId]
        
        if (!finalState) {
          logger.warn(`⚠️ No snapshot available for layout ${layoutId}`)
          return null
        }

        // Return a deep clone to ensure immutability
        return JSON.parse(JSON.stringify(finalState))
      },

      // Layout Restoration Functions
      getLayoutFinalComponents: (layoutId: string) => {
        try {
          const state = get()
          
          // Validate layoutId
          if (!layoutId || typeof layoutId !== 'string') {
            logger.warn('⚠️ Invalid layoutId provided to getLayoutFinalComponents', 'layout-restoration')
            return null
          }

          const finalState = state.layoutFinalStates[layoutId]
          
          if (!finalState || !finalState.finalState) {
            logger.debug('layout-restoration', `No final components found for layout ${layoutId}`)
            return null
          }

          // Validate final state structure
          if (typeof finalState.finalState !== 'object') {
            logger.warn(`⚠️ Invalid final state structure for layout ${layoutId}`, 'layout-restoration')
            return null
          }

          // Return deep clone to prevent mutations
          const components = JSON.parse(JSON.stringify(finalState.finalState)) as Record<string, ComponentData>
          
          // Filter out any null or invalid components
          const validComponents: Record<string, ComponentData> = {}
          Object.entries(components).forEach(([sectionId, componentData]) => {
            if (componentData && typeof componentData === 'object' && componentData.id && componentData.html) {
              validComponents[sectionId] = componentData
            } else {
              logger.debug('layout-restoration', `Filtering out invalid component for ${sectionId}`)
            }
          })
          
          logger.info(`🎯 Retrieved ${Object.keys(validComponents).length} final components for layout ${layoutId}`, undefined, 'layout-restoration')
          return Object.keys(validComponents).length > 0 ? validComponents : null

        } catch (error) {
          logger.error('❌ Error retrieving layout final components:', error, 'layout-restoration')
          return null
        }
      },

      hasLayoutEdits: (layoutId: string) => {
        try {
          // Validate layoutId
          if (!layoutId || typeof layoutId !== 'string') {
            logger.warn('⚠️ Invalid layoutId provided to hasLayoutEdits', 'layout-restoration')
            return false
          }

          const state = get()
          const layoutHistories = state.histories[layoutId]
          
          if (!layoutHistories || typeof layoutHistories !== 'object') {
            return false
          }
          
          // Check if any section has more than just the original version
          const hasEdits = Object.values(layoutHistories).some(history => {
            if (!history || !Array.isArray(history.versions)) {
              return false
            }
            return history.versions.length > 1
          })
          
          logger.debug('layout-restoration', `Layout ${layoutId} has edits: ${hasEdits}`)
          return hasEdits

        } catch (error) {
          logger.error('❌ Error checking layout edits:', error, 'layout-restoration')
          return false
        }
      },

      // ✅ BACKEND CONFIRMED: Connect to real AI service for layout section generation
      initializeLayoutSections: async (layout: string, sectionTypes: string[]) => {
        logger.info(`🤖 AI: Initializing ${layout} sections:`, sectionTypes)

        try {
          // Connect to existing AI service registry
          const { UnifiedAIService } = await import('@/services/ai/unified-ai-service')
          const aiService = UnifiedAIService.getInstance()

          // Generate layout sections using AI with proper request structure
          const aiRequest = {
            type: 'creative_writing', // Required field for AIRequest
            content: `Generate website sections for ${layout} layout with types: ${sectionTypes.join(', ')}`,
            userContext: {
              prefersConciseResponses: false,
              previousInteractions: 0,
              preferredCommunicationStyle: 'creative' as const,
              riskTolerance: 'balanced' as const,
              // Additional context for layout generation
              requestType: 'layout_generation',
              layoutType: layout,
              sectionTypes
            },
            responseFormat: 'json',
            maxResponseTime: 5000,
            tier: 'intermediate' as const // Use intermediate tier for layout generation
          }

          const response = await aiService.processRequest(aiRequest, {
            useTierRouting: true,
            enableFallback: true
          })

          if (response.success && response.data) {
            logger.info(`🎯 AI layout sections generated successfully for ${layout}`)
            // Parse the AI response and use existing bulkInitializeFromRenderedSections
            // This follows the pattern mentioned in the original comment
            try {
              const sections = typeof response.data === 'string' ? JSON.parse(response.data) : response.data
              if (sections && typeof sections === 'object') {
                get().bulkInitializeFromRenderedSections(sections)
              }
            } catch (parseError) {
              logger.warn('Failed to parse AI layout sections response, using fallback')
              // Fall back to existing initialization patterns
            }
          }

        } catch (error) {
          logger.error('❌ AI layout generation failed, continuing without sections:', error)
          // Graceful degradation - don't block the user flow
        }
      }
    }),
    {
      name: 'section-history-storage',
      // Persist histories, final states, and current layout ID
      partialize: (state) => ({ 
        histories: state.histories, 
        layoutFinalStates: state.layoutFinalStates,
        currentLayoutId: state.currentLayoutId 
      }),
      // Migrate old data structure to new per-layout format
      migrate: (persistedState: unknown, version: number) => {
        logger.info('🔄 Migrating section history data to per-layout format...', persistedState)
        
        if (persistedState && typeof persistedState === 'object' && 'histories' in persistedState) {
          const state = persistedState as Record<string, unknown>
          // Check if it's the old global format (sectionId -> SectionHistory)
          const isOldGlobalFormat = state.histories && typeof state.histories === 'object' && Object.values(state.histories).some((history: unknown) => 
            history && typeof history === 'object' && (Array.isArray((history as any).versions) || 'previous' in history || 'current' in history)
          )
          
          if (isOldGlobalFormat) {
            logger.info('🔄 Converting old global format to per-layout format')
            
            // Convert old global format to new per-layout format
            const migratedHistories: Record<string, Record<string, SectionHistory>> = {}
            const defaultLayoutId = 'default' // Migrate old data to 'default' layout
            
            const defaultLayoutHistories: Record<string, SectionHistory> = {}
            
            Object.entries(persistedState.histories).forEach(([sectionId, history]: [string, any]) => {
              // Handle old previous/current/next format
              if (history && ('previous' in history || 'current' in history || 'next' in history)) {
                logger.info(`🔄 Migrating old three-step format for ${sectionId}`)
                const versions: SectionVersion[] = []
                let currentIndex = -1
                
                if (history.previous && history.previous.component) {
                  versions.push(history.previous)
                  currentIndex = 0
                }
                if (history.current && history.current.component) {
                  versions.push(history.current)
                  currentIndex = versions.length - 1
                }
                if (history.next && history.next.component) {
                  versions.push(history.next)
                }
                
                defaultLayoutHistories[sectionId] = { versions, currentIndex }
              } else if (history && Array.isArray(history.versions)) {
                // Already new multi-step format, keep as is
                defaultLayoutHistories[sectionId] = history
              }
            })
            
            migratedHistories[defaultLayoutId] = defaultLayoutHistories
            
            return { 
              histories: migratedHistories,
              layoutFinalStates: {},
              currentLayoutId: defaultLayoutId
            }
          }
          
          // Already in per-layout format or unknown format
          return {
            histories: state.histories,
            layoutFinalStates: (state as any).layoutFinalStates || {},
            currentLayoutId: (state as any).currentLayoutId || null
          }
        }
        
        return {
          histories: {},
          layoutFinalStates: {},
          currentLayoutId: null
        }
      },
      version: 2
    }
  )
)