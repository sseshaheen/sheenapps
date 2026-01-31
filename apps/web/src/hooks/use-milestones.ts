/**
 * useMilestones Hook
 *
 * Tracks and detects build milestones for tasteful celebration UX.
 * Only triggers each milestone once per build.
 *
 * Milestones:
 * - first_progress: First real progress (proof-of-work)
 * - halfway: 50% complete
 * - complete: Build finished
 *
 * Design principles:
 * - Data-backed: Only triggers on real progress, not fake phases
 * - Once per build: Uses sessionStorage to prevent re-triggers
 * - Non-intrusive: Returns data, doesn't manage UI directly
 *
 * @see ux-analysis-code-generation-wait-time.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type MilestoneType =
  | 'first_progress' // First sign of real work (>0% progress)
  | 'first_file' // First file generated
  | 'halfway' // 50% complete
  | 'complete' // Build finished

export interface Milestone {
  type: MilestoneType
  message: string
  timestamp: number
  /** Visual intensity: subtle for in-progress, visible for completion */
  intensity: 'subtle' | 'visible'
}

export interface MilestoneConfig {
  type: MilestoneType
  message: string
  intensity: 'subtle' | 'visible'
  /** Check if milestone should trigger */
  shouldTrigger: (state: MilestoneState) => boolean
}

interface MilestoneState {
  progress: number // 0-100
  filesCompleted: number
  totalFiles: number
  isComplete: boolean
  hasStarted: boolean
}

interface UseMilestonesOptions {
  /** Unique build ID for tracking which milestones have been shown */
  buildId: string | null
  /** Current progress percentage (0-100) */
  progress: number
  /** Number of completed files */
  filesCompleted?: number
  /** Total number of files */
  totalFiles?: number
  /** Whether build is complete */
  isComplete: boolean
  /** Whether to enable milestone detection */
  enabled?: boolean
}

interface UseMilestonesReturn {
  /** Currently triggered milestone (null if none pending) */
  currentMilestone: Milestone | null
  /** Dismiss the current milestone */
  dismissMilestone: () => void
  /** All milestones triggered this session */
  triggeredMilestones: Milestone[]
  /** Check if a specific milestone was triggered */
  hasMilestone: (type: MilestoneType) => boolean
}

// Default milestone configurations
const DEFAULT_MILESTONES: MilestoneConfig[] = [
  {
    type: 'first_progress',
    message: 'Build started',
    intensity: 'subtle',
    shouldTrigger: (state) => state.progress > 0 && !state.isComplete,
  },
  {
    type: 'first_file',
    message: 'First file ready',
    intensity: 'subtle',
    shouldTrigger: (state) => state.filesCompleted >= 1 && !state.isComplete,
  },
  {
    type: 'halfway',
    message: '50% complete',
    intensity: 'subtle',
    shouldTrigger: (state) => state.progress >= 50 && !state.isComplete,
  },
  {
    type: 'complete',
    message: 'Build complete!',
    intensity: 'visible',
    shouldTrigger: (state) => state.isComplete,
  },
]

/**
 * Get the storage key for a build's milestone state
 */
function getMilestoneStorageKey(buildId: string): string {
  return `milestones:${buildId}`
}

/**
 * Get triggered milestones from sessionStorage
 */
function getTriggeredMilestones(buildId: string): Set<MilestoneType> {
  try {
    const stored = sessionStorage.getItem(getMilestoneStorageKey(buildId))
    if (stored) {
      return new Set(JSON.parse(stored) as MilestoneType[])
    }
  } catch {
    // Ignore storage errors
  }
  return new Set()
}

/**
 * Save triggered milestones to sessionStorage
 */
function saveTriggeredMilestones(buildId: string, milestones: Set<MilestoneType>): void {
  try {
    sessionStorage.setItem(
      getMilestoneStorageKey(buildId),
      JSON.stringify(Array.from(milestones))
    )
  } catch {
    // Ignore storage errors
  }
}

export function useMilestones({
  buildId,
  progress,
  filesCompleted = 0,
  totalFiles = 0,
  isComplete,
  enabled = true,
}: UseMilestonesOptions): UseMilestonesReturn {
  // Track which milestones have been triggered this session
  const [triggeredMilestones, setTriggeredMilestones] = useState<Milestone[]>([])
  // Current milestone to display (queue of one)
  const [currentMilestone, setCurrentMilestone] = useState<Milestone | null>(null)
  // Set of milestone types already triggered (persisted per build)
  const triggeredTypesRef = useRef<Set<MilestoneType>>(new Set())

  // Initialize triggered types from sessionStorage when buildId changes
  useEffect(() => {
    if (buildId) {
      triggeredTypesRef.current = getTriggeredMilestones(buildId)
    } else {
      triggeredTypesRef.current = new Set()
    }
    setTriggeredMilestones([])
    setCurrentMilestone(null)
  }, [buildId])

  // Current state for milestone checks
  const state = useMemo<MilestoneState>(
    () => ({
      progress,
      filesCompleted,
      totalFiles,
      isComplete,
      hasStarted: progress > 0 || filesCompleted > 0,
    }),
    [progress, filesCompleted, totalFiles, isComplete]
  )

  // Check for new milestones when state changes
  useEffect(() => {
    if (!enabled || !buildId) return

    // Check each milestone configuration
    for (const config of DEFAULT_MILESTONES) {
      // Skip if already triggered
      if (triggeredTypesRef.current.has(config.type)) continue

      // Check if should trigger
      if (config.shouldTrigger(state)) {
        const milestone: Milestone = {
          type: config.type,
          message: config.message,
          intensity: config.intensity,
          timestamp: Date.now(),
        }

        // Mark as triggered
        triggeredTypesRef.current.add(config.type)
        saveTriggeredMilestones(buildId, triggeredTypesRef.current)

        // Add to triggered list
        setTriggeredMilestones((prev) => [...prev, milestone])

        // Set as current (only if no current milestone pending)
        setCurrentMilestone((prev) => prev ?? milestone)

        // Only trigger one milestone per state change
        break
      }
    }
  }, [state, enabled, buildId])

  // Dismiss current milestone
  const dismissMilestone = useCallback(() => {
    setCurrentMilestone(null)
  }, [])

  // Check if a milestone was triggered
  const hasMilestone = useCallback(
    (type: MilestoneType) => triggeredTypesRef.current.has(type),
    []
  )

  return {
    currentMilestone,
    dismissMilestone,
    triggeredMilestones,
    hasMilestone,
  }
}

export default useMilestones
