/**
 * Build Recommendations Hook
 *
 * Unified hook that handles the complete recommendations lifecycle:
 * 1. Generates quick suggestions immediately when build starts
 * 2. Listens for AI recommendations via SSE
 * 3. Provides state for UI display (which source to show, when to swap)
 *
 * This hook replaces the timer-based recommendation fetching with state-driven logic.
 *
 * Usage:
 * ```typescript
 * const {
 *   displayedRecommendations,
 *   readySource,
 *   aiReady,
 *   aiGenerationInProgress,
 *   aiFailed,
 *   handleSwitchToAI,
 *   startBuildSession,
 *   reset
 * } = useBuildRecommendations({
 *   projectId,
 *   buildSessionId,
 *   promptAnalysis,
 *   enabled: isBuilding
 * })
 * ```
 */

'use client'

import { useEffect, useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRecommendationsStore, useRecommendationsActions, type QuickSuggestion, type PromptAnalysis } from '@/store/recommendations-store'
import { generateQuickSuggestions, generateFallbackSuggestions } from '@/services/quick-suggestions'
import { useRecommendationsListener } from '@/hooks/use-recommendations-listener'
import { buildMetrics } from '@/lib/metrics'
import { logger } from '@/utils/logger'
import type { ProjectRecommendation } from '@/types/project-recommendations'

interface UseBuildRecommendationsOptions {
  /** The project ID */
  projectId: string | null
  /** The current build session ID (from build-session-store) - used for SSE correlation */
  buildSessionId: string | null
  /** The build ID (from build record) - used for DB query correlation */
  buildId?: string | null
  /** Prompt analysis data (from AI) - used to generate quick suggestions */
  promptAnalysis?: PromptAnalysis | null
  /** Whether recommendations should be active (typically true during/after build) */
  enabled?: boolean
}

interface UseBuildRecommendationsReturn {
  /** The recommendations to display (quick suggestions OR AI recommendations) */
  displayedRecommendations: (QuickSuggestion | ProjectRecommendation)[] | null
  /** Which source is currently displayed: 'quick' or 'ai' */
  readySource: 'quick' | 'ai' | null
  /** Whether AI recommendations are ready (even if not displayed) */
  aiReady: boolean
  /** Whether AI recommendations are being generated */
  aiGenerationInProgress: boolean
  /** Whether AI recommendation generation failed */
  aiFailed: boolean
  /** Error message if failed */
  error: string | null
  /** Whether recommendations are loading from server */
  isLoading: boolean
  /** Switch display to AI recommendations */
  handleSwitchToAI: () => void
  /** Start a new build session (generates quick suggestions) */
  startBuildSession: (analysis?: PromptAnalysis) => void
  /** Reset recommendations state */
  reset: () => void
}

/**
 * Fetch recommendations from the API.
 * Uses buildId for correlation (what's stored in DB).
 * Auth is handled server-side via session - no userId param needed.
 */
async function fetchRecommendations(
  projectId: string,
  buildId?: string | null
): Promise<ProjectRecommendation[]> {
  // Build URL with optional buildId for precise correlation
  const url = buildId
    ? `/api/projects/${projectId}/recommendations?buildId=${encodeURIComponent(buildId)}`
    : `/api/projects/${projectId}/recommendations`

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch recommendations: ${response.status}`)
  }

  const data = await response.json()
  return data.recommendations || []
}

/**
 * Unified hook for managing build recommendations.
 *
 * Combines quick suggestions, SSE listening, and React Query fetching
 * into a single, easy-to-use interface.
 */
export function useBuildRecommendations({
  projectId,
  buildSessionId,
  buildId,
  promptAnalysis,
  enabled = true,
}: UseBuildRecommendationsOptions): UseBuildRecommendationsReturn {
  const queryClient = useQueryClient()

  // Get store state
  const status = useRecommendationsStore(state => state.status)
  const readySource = useRecommendationsStore(state => state.readySource)
  const aiReady = useRecommendationsStore(state => state.aiReady)
  const aiFailed = useRecommendationsStore(state => state.aiFailed)
  const aiGenerationInProgress = useRecommendationsStore(state => state.aiGenerationStarted)
  const quickSuggestions = useRecommendationsStore(state => state.quickSuggestions)
  const recommendations = useRecommendationsStore(state => state.recommendations)
  const error = useRecommendationsStore(state => state.error)

  // Get store actions
  const {
    startBuildSession: storeStartSession,
    setAIRecommendations,
    switchToAIRecommendations,
    reset: storeReset,
  } = useRecommendationsActions()

  // Listen for SSE events (uses buildSessionId for correlation)
  useRecommendationsListener({
    projectId,
    buildSessionId,
    enabled: enabled && !!buildSessionId,
  })

  // Fetch recommendations from DB when AI recs are ready
  // Query key includes buildId for cache isolation between builds
  const { data: fetchedRecs, isLoading } = useQuery({
    queryKey: projectId && buildId
      ? ['recommendations', projectId, buildId]
      : ['recommendations', 'disabled'],
    queryFn: () => {
      if (!projectId) {
        throw new Error('Missing projectId')
      }
      // Pass buildId for precise correlation, auth handled server-side
      return fetchRecommendations(projectId, buildId)
    },
    // Only fetch when AI is ready (SSE notification received)
    enabled: enabled && !!projectId && aiReady,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  // Update store when recommendations are fetched
  useEffect(() => {
    if (fetchedRecs && fetchedRecs.length > 0) {
      logger.info('build-recommendations', `Fetched ${fetchedRecs.length} AI recommendations`)
      setAIRecommendations(fetchedRecs)

      // Mark metrics
      buildMetrics.markRecommendationsVisible()
    }
  }, [fetchedRecs, setAIRecommendations])

  // Start a new build session
  const startBuildSession = useCallback((analysis?: PromptAnalysis) => {
    if (!buildSessionId) {
      logger.warn('build-recommendations', 'Cannot start session without buildSessionId')
      return
    }

    // Generate quick suggestions from analysis or use fallback
    const suggestions = analysis
      ? generateQuickSuggestions(analysis)
      : promptAnalysis
        ? generateQuickSuggestions(promptAnalysis)
        : generateFallbackSuggestions()

    logger.info('build-recommendations', `Starting session with ${suggestions.length} quick suggestions`)
    storeStartSession(buildSessionId, suggestions)
  }, [buildSessionId, promptAnalysis, storeStartSession])

  // Switch to AI recommendations
  const handleSwitchToAI = useCallback(() => {
    logger.info('build-recommendations', 'User switching to AI recommendations')
    switchToAIRecommendations()
  }, [switchToAIRecommendations])

  // Reset recommendations state
  const reset = useCallback(() => {
    storeReset()
    if (projectId && buildId) {
      queryClient.removeQueries({
        queryKey: ['recommendations', projectId, buildId],
      })
    }
  }, [storeReset, queryClient, projectId, buildId])

  // Determine what to display
  const displayedRecommendations = useMemo(() => {
    if (readySource === 'ai' && recommendations && recommendations.length > 0) {
      return recommendations
    }
    return quickSuggestions
  }, [readySource, recommendations, quickSuggestions])

  return {
    displayedRecommendations,
    readySource,
    aiReady,
    aiGenerationInProgress,
    aiFailed,
    error,
    isLoading,
    handleSwitchToAI,
    startBuildSession,
    reset,
  }
}

/**
 * Check if an item is a quick suggestion (vs AI recommendation).
 */
export function isQuickSuggestionItem(item: QuickSuggestion | ProjectRecommendation): item is QuickSuggestion {
  return 'titleKey' in item && 'promptKey' in item
}

/**
 * Check if an item is an AI recommendation.
 */
export function isAIRecommendationItem(item: QuickSuggestion | ProjectRecommendation): item is ProjectRecommendation {
  return 'title' in item && 'prompt' in item && 'priority' in item
}
