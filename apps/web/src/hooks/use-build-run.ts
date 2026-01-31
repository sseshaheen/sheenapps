/**
 * useBuildRun Hook
 *
 * Phase 1: Derives BuildRun state from build events and recommendations.
 *
 * Design decisions (from UNIFIED_CHAT_BUILD_EVENTS_INTEGRATION_PLAN.md):
 * - BuildRun is a first-class UI concept, not a message type
 * - ONE card per build, updated in place (Section 4.2)
 * - Events ordered ONLY inside the card (Section 7.2)
 * - Throttle UI updates at event→UI boundary (Section 7.4)
 */

'use client'

import { useMemo, useRef } from 'react'
import { useCleanBuildEvents } from '@/hooks/use-clean-build-events'
import { usePostBuildRecommendations } from '@/hooks/use-project-recommendations'
import { useThrottledValue } from '@/hooks/use-throttle'
import type { CleanBuildEvent } from '@/types/build-events'
import type { ProjectRecommendation } from '@/types/project-recommendations'

// Throttle delay for UI updates during active builds (Section 7.4)
const BUILD_ACTIVE_THROTTLE_MS = 300

// Phase configuration for UI
export const BUILD_PHASES = [
  { key: 'setup', name: 'Setup', icon: '📦' },
  { key: 'development', name: 'Development', icon: '⚡' },
  { key: 'dependencies', name: 'Dependencies', icon: '📚' },
  { key: 'build', name: 'Build', icon: '🔧' },
  { key: 'deploy', name: 'Deploy', icon: '🚀' }
] as const

export type BuildPhase = typeof BUILD_PHASES[number]['key']

/**
 * BuildRun: First-class UI concept for build visualization
 * This is NOT stored in chat DB - it's derived from build state
 */
export interface BuildRun {
  // Identity
  buildId: string
  projectId: string

  // Lifecycle
  status: 'queued' | 'running' | 'completed' | 'failed'
  createdAt: Date
  completedAt?: Date

  // Progress (derived from events)
  currentPhase: BuildPhase
  overallProgress: number // 0-100 percentage
  latestEventTitle: string
  latestEventDescription?: string

  // Phase completion tracking
  completedPhases: BuildPhase[]
  currentPhaseIndex: number

  // Step tracking (when available)
  stepIndex?: number
  totalSteps?: number

  // Events (for expanded view)
  events: CleanBuildEvent[]

  // Outputs
  previewUrl?: string
  error?: {
    code?: string
    message: string
    phase: string
  }

  // Version info
  versionId?: string
  versionName?: string

  // Post-build
  recommendations: ProjectRecommendation[]
  hasRecommendations: boolean
  recommendationsLoading: boolean
}

interface UseBuildRunOptions {
  /** Whether to enable polling */
  enabled?: boolean
  /** Project build status for stopping polling */
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | null
}

interface UseBuildRunReturn {
  buildRun: BuildRun | null
  isLoading: boolean
  error: Error | null
}

/**
 * Derives BuildRun state from build events and recommendations
 */
export function useBuildRun(
  buildId: string | null,
  userId: string,
  projectId: string,
  options: UseBuildRunOptions = {}
): UseBuildRunReturn {
  const { enabled = true, projectBuildStatus } = options

  // Cache first-seen timestamp per buildId to prevent card position jumping (expert review fix)
  // When events arrive later, we don't want createdAt to change from Date.now() to event time
  const buildTimestampCache = useRef<Map<string, Date>>(new Map())

  // Get build events from existing singleton hook
  const {
    events,
    isComplete,
    currentProgress,
    previewUrl,
    stepIndex,
    totalSteps,
    currentPhase,
    hasRecommendationsGenerated,
    error: eventsError,
    isLoading: eventsLoading
  } = useCleanBuildEvents(buildId, userId, useMemo(() => ({
    autoPolling: enabled,
    projectBuildStatus: projectBuildStatus || null
  }), [enabled, projectBuildStatus]))

  // Get recommendations when build is complete
  const {
    recommendations,
    hasRecommendations,
    isLoading: recommendationsLoading
  } = usePostBuildRecommendations(
    isComplete ? projectId : null,
    userId,
    isComplete
  )

  // Derive BuildRun from events (Section 4.3)
  const buildRun = useMemo<BuildRun | null>(() => {
    // No buildId = no build run to show
    if (!buildId) {
      return null
    }

    // NOTE: Deduplication removed per expert review - useCleanBuildEvents already
    // returns a stable deduped list. Cross-poll dedup via seenEventIds ref would
    // actually DROP history on subsequent polls (only "new" events kept).
    // If useCleanBuildEvents ever emits duplicates, add dedup there instead.
    const deduplicatedEvents = events

    const latestEvent = deduplicatedEvents[deduplicatedEvents.length - 1]
    const failedEvent = deduplicatedEvents.find(e => e.event_type === 'failed')
    const completedEvent = deduplicatedEvents.find(
      e => e.finished && (e.event_type === 'completed' || e.event_type === 'deploy_completed')
    )

    // Determine status - queued when we have buildId but no events yet
    let status: BuildRun['status'] = 'running'
    if (events.length === 0) {
      status = 'queued'
    } else if (failedEvent) {
      status = 'failed'
    } else if (isComplete) {
      status = 'completed'
    }

    // Calculate completed phases
    const phaseOrder: BuildPhase[] = ['setup', 'development', 'dependencies', 'build', 'deploy']
    const currentPhaseKey = (currentPhase as BuildPhase) || 'setup'
    const currentPhaseIdx = phaseOrder.indexOf(currentPhaseKey)

    // For completed builds, ALL phases are done
    // For running builds, phases before currentPhase are completed
    // For failed builds, phases before currentPhase are completed (current phase failed)
    let completedPhases: BuildPhase[]
    if (status === 'completed') {
      completedPhases = [...phaseOrder] // All phases completed
    } else {
      completedPhases = phaseOrder.slice(0, Math.max(0, currentPhaseIdx))
    }

    // Extract error info
    let error: BuildRun['error'] | undefined
    if (failedEvent) {
      error = {
        code: failedEvent.error?.code || failedEvent.event_code,
        message: failedEvent.error?.message || failedEvent.error_message || failedEvent.title,
        phase: failedEvent.phase
      }
    }

    // Get version info from completion event
    const versionId = completedEvent?.versionId
    const versionName = completedEvent?.versionName

    // Find creation time - use cached timestamp if available, otherwise compute and cache
    // This prevents card position jumping when events arrive later (expert review fix)
    let createdAt: Date
    if (buildTimestampCache.current.has(buildId)) {
      createdAt = buildTimestampCache.current.get(buildId)!
    } else {
      // Prefer first event time, fallback to now for queued builds
      createdAt = deduplicatedEvents[0]?.created_at
        ? new Date(deduplicatedEvents[0].created_at)
        : new Date()
      buildTimestampCache.current.set(buildId, createdAt)
    }

    const completedAt = isComplete && latestEvent
      ? new Date(latestEvent.created_at)
      : undefined

    return {
      buildId,
      projectId,
      status,
      createdAt,
      completedAt,
      currentPhase: currentPhaseKey,
      overallProgress: Math.round(currentProgress * 100),
      latestEventTitle: latestEvent?.title || '',
      latestEventDescription: latestEvent?.description,
      completedPhases,
      currentPhaseIndex: currentPhaseIdx,
      stepIndex,
      totalSteps,
      events: deduplicatedEvents,
      previewUrl: previewUrl || undefined,
      error,
      versionId,
      versionName,
      recommendations: recommendations || [],
      hasRecommendations,
      recommendationsLoading
    }
  }, [
    buildId,
    projectId,
    events,
    isComplete,
    currentProgress,
    previewUrl,
    stepIndex,
    totalSteps,
    currentPhase,
    recommendations,
    hasRecommendations,
    recommendationsLoading
  ])

  // Phase 3: Throttle UI updates during active builds (Section 7.4)
  // Only throttle when build is running to reduce re-renders during rapid event updates
  const isRunning = buildRun?.status === 'running'
  const throttleDelay = isRunning ? BUILD_ACTIVE_THROTTLE_MS : 0
  const throttledBuildRun = useThrottledValue(buildRun, throttleDelay)

  return {
    buildRun: throttledBuildRun,
    isLoading: eventsLoading,
    error: eventsError
  }
}

/**
 * Utility to find the insertion point for a build card in the message list
 * Based on Section 7.8 anchoring rules
 */
export function findBuildCardInsertionPoint<T extends { id: string; created_at?: string; seq?: number }>(
  messages: T[],
  buildCreatedAt: Date,
  triggerMessageId?: string
): number {
  // 1. If triggerMessageId exists, insert after that message
  if (triggerMessageId) {
    const triggerIndex = messages.findIndex(m => m.id === triggerMessageId)
    if (triggerIndex !== -1) {
      return triggerIndex + 1
    }
  }

  // 2. Find nearest message with created_at <= buildCreatedAt within 2-minute window
  const twoMinutesMs = 2 * 60 * 1000
  const buildTime = buildCreatedAt.getTime()

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.created_at) {
      const msgTime = new Date(msg.created_at).getTime()
      if (msgTime <= buildTime && buildTime - msgTime <= twoMinutesMs) {
        return i + 1
      }
    }
  }

  // 3. Fallback: insert at end
  return messages.length
}
