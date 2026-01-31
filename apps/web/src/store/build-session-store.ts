/**
 * Build Session Store
 *
 * Manages the build session lifecycle with a proper state machine.
 * This is DISTINCT from build-state-store.ts which tracks buildId for polling.
 *
 * Key Concepts:
 * - buildSessionId: Generated ONCE at submit, NEVER regenerated until terminal phase
 * - phase: The current state in the build lifecycle
 * - Idempotency: Retries during in-flight phases reuse the same sessionId
 *
 * Sequence Validation Note:
 * Event sequence validation is handled ONLY in stream-controller.ts (closest to wire).
 * This store assumes events are already validated and ordered.
 */

'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { generateBuildSessionId, shortenBuildSessionId } from '@/lib/ids'
import { logger } from '@/utils/logger'

/**
 * Build lifecycle phases.
 * Valid transitions are enforced by VALID_TRANSITIONS.
 */
export type BuildPhase =
  | 'idle'           // No active build
  | 'submitting'     // Prompt being sent
  | 'queued'         // In BullMQ queue
  | 'planning'       // AI planning phase
  | 'coding'         // AI generating code
  | 'testing'        // Running tests/validation
  | 'deploying'      // Deploying to preview
  | 'complete'       // Build successful
  | 'failed'         // Build failed

/**
 * Valid phase transitions (enforced).
 * Any transition not in this map is rejected.
 */
const VALID_TRANSITIONS: Record<BuildPhase, BuildPhase[]> = {
  idle: ['submitting'],
  submitting: ['queued', 'failed'],
  queued: ['planning', 'failed'],
  planning: ['coding', 'failed'],
  coding: ['testing', 'failed'],
  testing: ['deploying', 'failed'],
  deploying: ['complete', 'failed'],
  complete: ['idle'],  // Reset for new build
  failed: ['idle'],    // Reset for retry
}

/**
 * Phases where we're actively building (idempotent - reuse session ID)
 */
const IN_FLIGHT_PHASES: BuildPhase[] = [
  'submitting', 'queued', 'planning', 'coding', 'testing', 'deploying'
]

/**
 * Phases where build is done (generate new session ID on next build)
 */
const TERMINAL_PHASES: BuildPhase[] = ['idle', 'complete', 'failed']

interface BuildSessionState {
  /** Unique session ID for this build (generated once at submit) */
  buildSessionId: string | null
  /** Project this session belongs to */
  projectId: string | null
  /** Current phase in the build lifecycle */
  phase: BuildPhase
  /** Build progress percentage (0-100) */
  progress: number
  /** When this session started */
  startedAt: number | null
  /** When this session completed/failed */
  completedAt: number | null
  /** The build ID returned by the worker (different from sessionId) */
  buildId: string | null
  /** Preview URL when deployment completes */
  previewUrl: string | null
  /** Error message if build failed */
  error: string | null
  /** The original prompt for this build */
  prompt: string | null
}

interface BuildSessionActions {
  /**
   * Start a new build session. Generates a new sessionId if:
   * - No current session exists
   * - Current session is for a different project
   * - Current session is in a terminal phase (complete/failed)
   *
   * If already in an in-flight phase for the same project, returns existing sessionId.
   * This makes retries idempotent.
   */
  startSession: (projectId: string, prompt: string) => string

  /**
   * Transition to a new phase. Validates the transition is allowed.
   * Invalid transitions are logged and ignored.
   */
  setPhase: (phase: BuildPhase) => void

  /**
   * Update progress percentage.
   */
  setProgress: (progress: number) => void

  /**
   * Set the build ID returned by the worker.
   */
  setBuildId: (buildId: string) => void

  /**
   * Set the preview URL when deployment completes.
   */
  setPreviewUrl: (previewUrl: string) => void

  /**
   * Mark the build as failed with an error message.
   */
  setError: (error: string) => void

  /**
   * Reset the session to idle state.
   */
  reset: () => void

  /**
   * Get current session info for logging.
   */
  getSessionInfo: () => {
    buildSessionId: string | null
    projectId: string | null
    phase: BuildPhase
    shortSessionId: string
  }
}

type BuildSessionStore = BuildSessionState & BuildSessionActions

const initialState: BuildSessionState = {
  buildSessionId: null,
  projectId: null,
  phase: 'idle',
  progress: 0,
  startedAt: null,
  completedAt: null,
  buildId: null,
  previewUrl: null,
  error: null,
  prompt: null,
}

export const useBuildSessionStore = create<BuildSessionStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      startSession: (projectId: string, prompt: string) => {
        const current = get()

        // Check if we can reuse the existing session
        const isInFlight = IN_FLIGHT_PHASES.includes(current.phase)
        const isSameProject = current.projectId === projectId

        if (current.buildSessionId && isSameProject && isInFlight) {
          // Idempotent: return existing session ID for in-flight builds
          logger.info('build-session', `Reusing existing session: ${shortenBuildSessionId(current.buildSessionId)}`)
          return current.buildSessionId
        }

        // Generate new session ID for new build (or if previous build finished/failed)
        const buildSessionId = generateBuildSessionId(projectId)

        logger.info('build-session', `Starting new session: ${shortenBuildSessionId(buildSessionId)} for project ${projectId.slice(0, 8)}`)

        set({
          buildSessionId,
          projectId,
          phase: 'submitting',
          progress: 0,
          startedAt: Date.now(),
          completedAt: null,
          buildId: null,
          previewUrl: null,
          error: null,
          prompt,
        })

        return buildSessionId
      },

      setPhase: (toPhase: BuildPhase) => {
        const current = get()
        const fromPhase = current.phase

        // Validate transition
        if (!VALID_TRANSITIONS[fromPhase].includes(toPhase)) {
          logger.error('build-session', `Invalid phase transition: ${fromPhase} → ${toPhase}`)
          return
        }

        logger.info('build-session', `Phase transition: ${fromPhase} → ${toPhase}`)

        const updates: Partial<BuildSessionState> = { phase: toPhase }

        // Set completedAt for terminal phases
        if (TERMINAL_PHASES.includes(toPhase) && toPhase !== 'idle') {
          updates.completedAt = Date.now()
        }

        // Set progress to 100 on complete
        if (toPhase === 'complete') {
          updates.progress = 100
        }

        set(updates)
      },

      setProgress: (progress: number) => {
        const clamped = Math.max(0, Math.min(100, progress))
        set({ progress: clamped })
      },

      setBuildId: (buildId: string) => {
        logger.info('build-session', `Build ID set: ${buildId.slice(0, 8)}`)
        set({ buildId })
      },

      setPreviewUrl: (previewUrl: string) => {
        logger.info('build-session', `Preview URL set: ${previewUrl}`)
        set({ previewUrl })
      },

      setError: (error: string) => {
        logger.error('build-session', `Build error: ${error}`)
        set({
          error,
          phase: 'failed',
          completedAt: Date.now()
        })
      },

      reset: () => {
        const current = get()
        logger.info('build-session', `Resetting session: ${shortenBuildSessionId(current.buildSessionId)}`)
        set(initialState)
      },

      getSessionInfo: () => {
        const { buildSessionId, projectId, phase } = get()
        return {
          buildSessionId,
          projectId,
          phase,
          shortSessionId: shortenBuildSessionId(buildSessionId)
        }
      }
    }),
    {
      name: 'build-session-store',
      enabled: process.env.NODE_ENV === 'development'
    }
  )
)

// Selectors for common use cases

/**
 * Get the current build session ID.
 */
export function useCurrentBuildSessionId(): string | null {
  return useBuildSessionStore(state => state.buildSessionId)
}

/**
 * Get the current build phase.
 */
export function useCurrentBuildPhase(): BuildPhase {
  return useBuildSessionStore(state => state.phase)
}

/**
 * Check if a build is currently in progress.
 */
export function useIsBuildInProgress(): boolean {
  return useBuildSessionStore(state => IN_FLIGHT_PHASES.includes(state.phase))
}

/**
 * Check if a build has completed successfully.
 */
export function useIsBuildComplete(): boolean {
  return useBuildSessionStore(state => state.phase === 'complete')
}

/**
 * Check if a build has failed.
 */
export function useIsBuildFailed(): boolean {
  return useBuildSessionStore(state => state.phase === 'failed')
}

/**
 * Get session actions without subscribing to state changes.
 */
export function useBuildSessionActions() {
  return useBuildSessionStore(state => ({
    startSession: state.startSession,
    setPhase: state.setPhase,
    setProgress: state.setProgress,
    setBuildId: state.setBuildId,
    setPreviewUrl: state.setPreviewUrl,
    setError: state.setError,
    reset: state.reset,
  }))
}

// Expose test hooks only in test/development environments
if (typeof window !== 'undefined' && (process.env.NODE_ENV === 'test' || process.env.NEXT_PUBLIC_ENABLE_TEST_HOOKS === 'true')) {
  (window as unknown as { __BUILD_SESSION_STORE__: typeof useBuildSessionStore }).__BUILD_SESSION_STORE__ = useBuildSessionStore
}
