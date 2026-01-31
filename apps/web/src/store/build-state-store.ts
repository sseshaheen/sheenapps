/**
 * Global Build State Store
 * 
 * Manages current buildId state globally to prevent multiple useCleanBuildEvents
 * instances from polling different buildIds simultaneously (zombie polling issue).
 * 
 * Ensures atomic buildId transitions across all components.
 */

'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { logger } from '@/utils/logger'

interface BuildState {
  // Current active buildId for the project
  currentBuildId: string | null
  // Previous buildId (for debugging)
  previousBuildId: string | null
  // Project this buildId belongs to
  currentProjectId: string | null
  // When the buildId was last updated
  lastUpdated: number
  // Flag indicating a new build was just started (not loading an existing one)
  isNewBuildStarted: boolean
  // Timestamp when the new build was started
  newBuildStartedAt: number | null
}

interface BuildStateActions {
  // Set the current buildId (triggers cleanup of old polling)
  setCurrentBuildId: (buildId: string | null, projectId?: string, source?: string) => void
  // Get the current buildId
  getCurrentBuildId: () => string | null
  // Check if a specific buildId is the current active one
  isBuildIdCurrent: (buildId: string | null) => boolean
  // Clear all build state
  clearBuildState: () => void
  // Debug: Get current state
  getDebugState: () => BuildState
  // Mark that a new build has started (for loading state)
  markNewBuildStarted: (buildId: string, projectId: string) => void
  // Clear the new build flag (when build completes or fails)
  clearNewBuildFlag: () => void
  // Check if we're currently starting a new build
  isStartingNewBuild: () => boolean
}

type BuildStateStore = BuildState & BuildStateActions

const initialState: BuildState = {
  currentBuildId: null,
  previousBuildId: null,
  currentProjectId: null,
  lastUpdated: 0,
  isNewBuildStarted: false,
  newBuildStartedAt: null
}

export const useBuildStateStore = create<BuildStateStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setCurrentBuildId: (buildId: string | null, projectId?: string, source = 'unknown') => {
        const state = get()
        const now = Date.now()
        
        // 🆕 ENHANCED: Track who is calling this function
        const caller = source || 'unknown'
        
        // Skip if same buildId (avoid unnecessary updates) - 🆕 Enhanced logging
        if (state.currentBuildId === buildId) {
          logger.debug('build-state', `✅ BuildId unchanged: ${buildId?.slice(0, 8) || 'null'} - no update needed (caller: ${caller})`)
          return
        }

        const previousBuildId = state.currentBuildId
        
        logger.warn('build-state', `🔄 GLOBAL BUILD STATE UPDATE from ${caller}: ${previousBuildId?.slice(0, 8) || 'null'} → ${buildId?.slice(0, 8) || 'null'}`)
        
        // Log debugging info for buildId transitions
        if (previousBuildId && buildId && previousBuildId !== buildId) {
          logger.info('build-state', `🔄 Build ID transition from ${caller}: ${previousBuildId.slice(0, 8)} → ${buildId.slice(0, 8)}`)
          
          // 🆕 STACK TRACE: In development, show who called this
          if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
            console.trace(`🔥 BuildId State Change Source: ${caller}`)
          }
        } else if (!previousBuildId && buildId) {
          logger.info('build-state', `🆕 INITIAL from ${caller}: Setting first buildId to ${buildId.slice(0, 8)}`)
        } else if (previousBuildId && !buildId) {
          logger.warn('build-state', `🗑️ CLEARING from ${caller}: Removing buildId ${previousBuildId.slice(0, 8)}`)
        }
        
        // 🆕 ATOMIC UPDATE: All changes happen together
        set({
          currentBuildId: buildId,
          previousBuildId: previousBuildId,
          currentProjectId: projectId || state.currentProjectId,
          lastUpdated: now
        })

        logger.debug('build-state', `✅ Global build state updated by ${caller}`)
        
        // Broadcast change to all listeners immediately
        if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
          console.log('🌐 Global BuildId State Change:', {
            from: previousBuildId?.slice(0, 8) || 'null',
            to: buildId?.slice(0, 8) || 'null',
            source: caller,
            projectId: (projectId || state.currentProjectId)?.slice(0, 8) || 'null',
            timestamp: new Date().toISOString()
          })
        }

        // Trigger build query manager cleanup if the buildId changed
        if (previousBuildId !== buildId) {
          // Import here to avoid circular dependencies
          import('@/utils/build-query-manager').then(({ buildQueryManager }) => {
            // Note: We let individual useCleanBuildEvents hooks handle their own cleanup
            // based on the global state change, rather than doing it here
            logger.debug('build-state', `Build query manager available for cleanup coordination`)
          })
        }
      },

      getCurrentBuildId: () => {
        const state = get()
        return state.currentBuildId
      },

      isBuildIdCurrent: (buildId: string | null) => {
        const state = get()
        return state.currentBuildId === buildId
      },

      clearBuildState: () => {
        logger.info('build-state', '🧹 Clearing global build state')
        set(initialState)
      },

      getDebugState: () => {
        const { setCurrentBuildId, getCurrentBuildId, isBuildIdCurrent, clearBuildState, getDebugState, markNewBuildStarted, clearNewBuildFlag, isStartingNewBuild, ...state } = get()
        return state
      },

      markNewBuildStarted: (buildId: string, projectId: string) => {
        logger.warn('build-state', `🚀 NEW BUILD STARTED: ${buildId.slice(0, 8)} for project ${projectId.slice(0, 8)}`)
        set({
          currentBuildId: buildId,
          currentProjectId: projectId,
          isNewBuildStarted: true,
          newBuildStartedAt: Date.now(),
          lastUpdated: Date.now()
        })
      },

      clearNewBuildFlag: () => {
        const state = get()
        if (state.isNewBuildStarted) {
          logger.info('build-state', `✅ Clearing new build flag for ${state.currentBuildId?.slice(0, 8) || 'null'}`)
          set({
            isNewBuildStarted: false,
            newBuildStartedAt: null
          })
        }
      },

      isStartingNewBuild: () => {
        const state = get()
        // Consider it a new build for up to 30 seconds after starting
        if (state.isNewBuildStarted && state.newBuildStartedAt) {
          const elapsed = Date.now() - state.newBuildStartedAt
          return elapsed < 30000 // 30 seconds
        }
        return false
      }
    }),
    {
      name: 'build-state-store',
      enabled: process.env.NODE_ENV === 'development'
    }
  )
)

/**
 * Hook to get current buildId from global store
 * Use this instead of passing buildId through props when possible
 */
export function useCurrentBuildId() {
  return useBuildStateStore(state => state.currentBuildId)
}

// 🆕 CACHED SELECTORS to prevent infinite re-renders
const buildIdActionsSelector = (state: BuildStateStore) => ({
  setCurrentBuildId: state.setCurrentBuildId,
  isBuildIdCurrent: state.isBuildIdCurrent,
  clearBuildState: state.clearBuildState
})

/**
 * Hook to get buildId setter for updating global state
 * 🆕 Uses cached selector to prevent infinite re-renders
 */
export function useBuildIdActions() {
  return useBuildStateStore(buildIdActionsSelector)
}

/**
 * Hook to get individual action functions (more selective)
 */
export function useSetCurrentBuildId() {
  return useBuildStateStore(state => state.setCurrentBuildId)
}

export function useIsBuildIdCurrent() {
  return useBuildStateStore(state => state.isBuildIdCurrent)
}

/**
 * Hook for debugging build state issues
 * 🆕 Returns individual values to prevent object recreation
 */
export function useBuildStateDebug() {
  const currentBuildId = useBuildStateStore(state => state.currentBuildId)
  const previousBuildId = useBuildStateStore(state => state.previousBuildId) 
  const currentProjectId = useBuildStateStore(state => state.currentProjectId)
  const lastUpdated = useBuildStateStore(state => state.lastUpdated)
  const isBuildIdCurrent = useBuildStateStore(state => state.isBuildIdCurrent)
  const getDebugState = useBuildStateStore(state => state.getDebugState)

  return {
    currentBuildId: currentBuildId?.slice(0, 8) || 'null',
    previousBuildId: previousBuildId?.slice(0, 8) || 'null', 
    currentProjectId: currentProjectId?.slice(0, 8) || 'null',
    lastUpdated: new Date(lastUpdated).toISOString(),
    isBuildIdCurrent,
    getDebugState
  }
}