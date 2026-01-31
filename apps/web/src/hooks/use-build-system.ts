/**
 * Build System Facade Hook
 * Provides a unified interface for build events and recommendations
 * Phase 2.4: Single entry point for all build-related functionality
 */

'use client'

import { useCleanBuildEvents } from './use-clean-build-events'
import { useProjectRecommendations } from './use-project-recommendations'
import type { CleanBuildEvent } from '@/types/build-events'
import type { ProjectRecommendation } from '@/types/project-recommendations'

interface BuildSystemOptions {
  /** Enable automatic polling for build events */
  autoPolling?: boolean
  /** Initial polling interval */
  pollingInterval?: number
}

interface BuildSystemReturn {
  // Build Events
  events: CleanBuildEvent[]
  isBuilding: boolean
  isComplete: boolean
  currentProgress: number
  previewUrl: string | null
  buildError: Error | null
  
  // Build Status Indicators
  stepIndex?: number
  totalSteps?: number
  currentPhase?: string
  
  // Recommendations
  recommendations: ProjectRecommendation[]
  recommendationsLoading: boolean
  recommendationsError: Error | null
  
  // Unified Status
  status: 'idle' | 'building' | 'completed' | 'failed'
  progressPercentage: number
  
  // Actions
  refreshEvents: () => void
  refreshRecommendations: () => void
}

/**
 * Unified build system hook that combines events and recommendations
 * Provides a single interface for all build-related functionality
 */
export function useBuildSystem(
  buildId: string | null,
  userId: string,
  projectId?: string,
  options: BuildSystemOptions = {}
): BuildSystemReturn {
  const {
    autoPolling = true,
    pollingInterval = 2000
  } = options

  // Get build events
  const {
    events,
    isComplete,
    currentProgress,
    previewUrl,
    stepIndex,
    totalSteps,
    currentPhase,
    error: buildError,
    isLoading: isBuilding
  } = useCleanBuildEvents(buildId, userId, { 
    autoPolling, 
    initialInterval: pollingInterval 
  })

  // Get recommendations (only when build is complete and we have a project)
  const {
    recommendations = [],
    isLoading: recommendationsLoading,
    error: recommendationsError,
    refetch: refreshRecommendations
  } = useProjectRecommendations(
    isComplete && projectId ? projectId : null,
    userId,
    { enabled: isComplete && !!projectId }
  )

  // Determine unified status
  const status = (() => {
    if (buildError || events.some(e => e.event_type === 'failed')) return 'failed'
    if (isComplete) return 'completed'
    if (isBuilding || events.some(e => e.event_type === 'started')) return 'building'
    return 'idle'
  })()

  // Calculate progress percentage
  const progressPercentage = Math.round(currentProgress * 100)

  // Mock refresh function for events (React Query handles this automatically)
  const refreshEvents = () => {
    // React Query will handle refetching automatically
    // This is here for API consistency
  }

  return {
    // Build Events
    events,
    isBuilding,
    isComplete,
    currentProgress,
    previewUrl,
    buildError,
    
    // Build Status Indicators
    stepIndex,
    totalSteps,
    currentPhase,
    
    // Recommendations
    recommendations,
    recommendationsLoading,
    recommendationsError,
    
    // Unified Status
    status,
    progressPercentage,
    
    // Actions
    refreshEvents,
    refreshRecommendations
  }
}

/**
 * Simplified hook for components that only need basic build status
 */
export function useBuildStatus(buildId: string | null, userId: string) {
  const { status, progressPercentage, isComplete, previewUrl, buildError } = useBuildSystem(
    buildId, 
    userId, 
    undefined, 
    { autoPolling: true, pollingInterval: 3000 }
  )

  return {
    status,
    progressPercentage,
    isComplete,
    previewUrl,
    hasError: !!buildError
  }
}

/**
 * Hook for components that need both events and recommendations
 */
export function useBuildSystemWithRecommendations(
  buildId: string | null, 
  userId: string, 
  projectId: string
) {
  return useBuildSystem(buildId, userId, projectId, { autoPolling: true })
}