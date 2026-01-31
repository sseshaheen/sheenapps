/**
 * Recommendations Listener Hook
 *
 * Listens for SSE events related to recommendations and updates the store.
 * When recommendations_ready is received, updates store state which triggers
 * React Query to fetch from DB (via enabled: aiReady in use-build-recommendations).
 *
 * Integration Notes:
 * - Uses StreamController for automatic reconnection and resumption
 * - SSE events are signals only (no payload) - DB is source of truth
 * - Validates buildSessionId to ignore stale events
 * - Does NOT invalidate queries directly - relies on store state to trigger fetch
 *
 * Usage:
 * ```typescript
 * useRecommendationsListener({
 *   projectId,
 *   buildSessionId,
 *   enabled: isBuilding
 * })
 * ```
 */

'use client'

import { useEffect, useCallback } from 'react'
import { useRecommendationsStore } from '@/store/recommendations-store'
import { useStreamController, useStreamEvent } from '@/hooks/use-stream-controller'
import type { StreamEvent } from '@/lib/stream-controller'
import { logger } from '@/utils/logger'

interface UseRecommendationsListenerOptions {
  /** The project ID to listen for */
  projectId: string | null
  /** The current build session ID (for validation) */
  buildSessionId: string | null
  /** Whether the listener should be active */
  enabled?: boolean
}

interface RecommendationsEventData {
  buildSessionId?: string
  projectId: string
  versionId: string
  recommendationCount?: number
  error?: string
  recoverable?: boolean
}

/**
 * Hook to listen for recommendation SSE events via StreamController.
 *
 * When recommendations_ready is received:
 * 1. Validates buildSessionId matches current session
 * 2. Updates store to mark AI recs as ready (this triggers React Query fetch
 *    via enabled: aiReady condition in use-build-recommendations)
 *
 * When recommendations_failed is received:
 * 1. Validates buildSessionId
 * 2. Updates store with error state
 *
 * Note: We don't invalidate queries here because:
 * - The query key uses buildId (from DB), not buildSessionId (SSE-only)
 * - Setting aiReady=true already triggers the fetch via enabled condition
 */
export function useRecommendationsListener({
  projectId,
  buildSessionId,
  enabled = true
}: UseRecommendationsListenerOptions): void {
  // Get store actions
  const { notifyAiRecsReady, setFailed } = useRecommendationsStore()

  // Initialize StreamController
  const { subscribe, isConnected, connectionState } = useStreamController({
    buildSessionId,
    projectId,
    enabled,
    onConnectionChange: (state) => {
      logger.debug('recommendations-listener', `Connection state: ${state}`)
    },
    onError: (error) => {
      logger.error(`[recommendations-listener] Stream error: ${error.message}`)
    }
  })

  // Handle recommendations_ready event
  const handleRecommendationsReady = useCallback((event: StreamEvent) => {
    const data = event.data as RecommendationsEventData

    // Validate this is for current session (if buildSessionId provided in event)
    if (data.buildSessionId && data.buildSessionId !== buildSessionId) {
      logger.warn(`[recommendations-listener] Ignoring stale recommendations_ready event (expected ${buildSessionId?.slice(0, 10)}, got ${data.buildSessionId.slice(0, 10)})`)
      return
    }

    logger.debug('general', `[recommendations-listener] Received recommendations_ready for session ${buildSessionId?.slice(0, 10)}`, {
      count: data.recommendationCount
    })

    // Mark that AI recs are ready - this triggers React Query fetch
    // via enabled: aiReady condition in use-build-recommendations
    notifyAiRecsReady()
  }, [buildSessionId, notifyAiRecsReady])

  // Handle recommendations_failed event
  const handleRecommendationsFailed = useCallback((event: StreamEvent) => {
    const data = event.data as RecommendationsEventData

    // Validate this is for current session (if buildSessionId provided in event)
    if (data.buildSessionId && data.buildSessionId !== buildSessionId) {
      logger.warn(`[recommendations-listener] Ignoring stale recommendations_failed event`)
      return
    }

    logger.debug('general', `[recommendations-listener] Received recommendations_failed for session ${buildSessionId?.slice(0, 10)}`, {
      error: data.error,
      recoverable: data.recoverable
    })

    // Update store with error
    setFailed(data.error || 'Failed to generate personalized recommendations')
  }, [buildSessionId, setFailed])

  // Subscribe to recommendations events
  useStreamEvent(subscribe, 'recommendations_ready', handleRecommendationsReady, [handleRecommendationsReady])
  useStreamEvent(subscribe, 'recommendations_failed', handleRecommendationsFailed, [handleRecommendationsFailed])

  // Log connection state changes for debugging
  useEffect(() => {
    if (enabled && buildSessionId && projectId) {
      logger.debug('recommendations-listener', `Stream controller state: ${connectionState}, connected: ${isConnected}`)
    }
  }, [enabled, buildSessionId, projectId, connectionState, isConnected])
}

/**
 * Query key factory for recommendations.
 * @deprecated Use ['recommendations', projectId, buildId] directly instead.
 * buildId (from DB) is now used for correlation instead of buildSessionId (SSE-only).
 */
export function getRecommendationsQueryKey(projectId: string, buildId: string): string[] {
  return ['recommendations', projectId, buildId]
}
