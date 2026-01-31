/**
 * useUserIdle Hook
 *
 * Tracks user interaction to determine idle state.
 * Used for "peek + pin" pattern - auto-expand UI only when user is idle.
 *
 * Key principle: Track WHEN user last interacted (timestamp), not just IF.
 * This allows checking "idle for X ms" at any time, rather than permanently
 * disabling auto-expand after one early scroll.
 *
 * @see ux-analysis-code-generation-wait-time.md
 */

'use client'

import { useRef, useEffect, useCallback } from 'react'

export interface UseUserIdleOptions {
  /**
   * Threshold in milliseconds. User is considered "idle" if no interaction
   * for this duration. Default: 1500ms (1.5 seconds)
   */
  thresholdMs?: number
}

export interface UseUserIdleReturn {
  /**
   * Returns true if user has been idle for at least thresholdMs
   */
  isIdle: () => boolean

  /**
   * Returns milliseconds since last user interaction
   */
  getTimeSinceInteraction: () => number

  /**
   * Manually mark an interaction (useful for programmatic events)
   */
  markInteraction: () => void
}

/**
 * Hook to track user idle state based on interaction timestamps
 *
 * @example
 * ```tsx
 * const { isIdle } = useUserIdle({ thresholdMs: 1500 })
 *
 * useEffect(() => {
 *   if (isBuildStarting && isIdle()) {
 *     setCodeViewerExpanded(true)
 *   }
 * }, [isBuildStarting])
 * ```
 */
export function useUserIdle(options: UseUserIdleOptions = {}): UseUserIdleReturn {
  const { thresholdMs = 1500 } = options

  // Track WHEN user last interacted (timestamp), not just IF
  const lastInteractionRef = useRef<number>(Date.now())

  // Stable callback to mark interaction
  const markInteraction = useCallback(() => {
    lastInteractionRef.current = Date.now()
  }, [])

  // Set up event listeners for user interactions
  useEffect(() => {
    // Events that indicate user is actively engaged
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown', 'scroll'] as const

    const handleInteraction = () => {
      lastInteractionRef.current = Date.now()
    }

    // Add listeners with passive flag for performance
    for (const event of events) {
      window.addEventListener(event, handleInteraction, { passive: true })
    }

    return () => {
      for (const event of events) {
        window.removeEventListener(event, handleInteraction)
      }
    }
  }, [])

  // Check if user has been idle for threshold duration
  const isIdle = useCallback(() => {
    const timeSinceInteraction = Date.now() - lastInteractionRef.current
    return timeSinceInteraction >= thresholdMs
  }, [thresholdMs])

  // Get raw time since last interaction
  const getTimeSinceInteraction = useCallback(() => {
    return Date.now() - lastInteractionRef.current
  }, [])

  return {
    isIdle,
    getTimeSinceInteraction,
    markInteraction,
  }
}

export default useUserIdle
