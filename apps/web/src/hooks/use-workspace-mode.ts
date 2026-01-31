'use client'

import { useMemo, useCallback, useEffect, useState } from 'react'
import type { Project } from './use-workspace-project'

/**
 * Workspace Mode Types
 *
 * - simple: Non-technical users, first-time builders
 * - standard: Comfortable users, some technical knowledge
 * - advanced: Developers who want full control
 */
export type WorkspaceMode = 'simple' | 'standard' | 'advanced'

const STORAGE_KEY_PREFIX = 'sa_workspace_mode_'
const DEV_INTENT_KEY = 'sa_dev_intent'
const DEV_INTENT_EVENT = 'sa:dev-intent-changed'

interface DevIntentSignals {
  hasOpenedCodeTab?: boolean
  hasUsedExport?: boolean
  hasViewedApiKeys?: boolean
  hasConnectedGitHub?: boolean
}

/**
 * Get dev intent signals from localStorage
 */
function getDevIntentSignals(): DevIntentSignals {
  if (typeof window === 'undefined') return {}
  try {
    const stored = localStorage.getItem(DEV_INTENT_KEY)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * Track a developer intent signal
 */
export function trackDevIntent(signal: keyof DevIntentSignals): void {
  if (typeof window === 'undefined') return
  try {
    const current = getDevIntentSignals()
    if (current[signal]) return
    current[signal] = true
    localStorage.setItem(DEV_INTENT_KEY, JSON.stringify(current))
    window.dispatchEvent(new Event(DEV_INTENT_EVENT))
  } catch {
    // Ignore storage errors
  }
}

interface UseWorkspaceModeOptions {
  project: Project | null
  userId?: string | null
}

interface UseWorkspaceModeReturn {
  /** Current workspace mode */
  mode: WorkspaceMode
  /** Set explicit mode override (persisted to localStorage) */
  setMode: (mode: WorkspaceMode) => void
  /** Clear the override and return to auto-detected mode */
  clearOverride: () => void
  /** Derived boolean: mode === 'simple' */
  isSimple: boolean
  /** Derived boolean: mode === 'advanced' */
  isAdvanced: boolean
  /** Whether user has explicitly set a mode */
  hasOverride: boolean
}

/**
 * Centralized workspace mode resolver
 *
 * Priority:
 * 1. Explicit user override (localStorage)
 * 2. Developer intent signals (Code tab, Export, API Keys, GitHub)
 * 3. Project infraMode (easy → simple)
 * 4. Default: 'simple' for new users
 *
 * @see WORKSPACE_SIMPLIFICATION_PLAN.md Section 5.5
 */
export function useWorkspaceMode({
  project,
  userId
}: UseWorkspaceModeOptions): UseWorkspaceModeReturn {
  const storageKey = userId ? `${STORAGE_KEY_PREFIX}${userId}` : null

  // State for override (persisted to localStorage)
  const [override, setOverrideState] = useState<WorkspaceMode | null>(null)
  const [devIntent, setDevIntent] = useState<DevIntentSignals>({})
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setDevIntent(getDevIntentSignals())

    const handleIntentChange = () => setDevIntent(getDevIntentSignals())
    window.addEventListener('storage', handleIntentChange)
    window.addEventListener(DEV_INTENT_EVENT, handleIntentChange)

    return () => {
      window.removeEventListener('storage', handleIntentChange)
      window.removeEventListener(DEV_INTENT_EVENT, handleIntentChange)
    }
  }, [])

  // Hydrate from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) {
      setIsHydrated(true)
      return
    }

    try {
      const stored = localStorage.getItem(storageKey)
      if (stored && ['simple', 'standard', 'advanced'].includes(stored)) {
        setOverrideState(stored as WorkspaceMode)
      }
    } catch {
      // Ignore storage errors
    }
    setIsHydrated(true)
  }, [storageKey])

  // Detect developer intent from various signals
  const hasShownDevIntent = useMemo(() => {
    return (
      devIntent.hasOpenedCodeTab === true ||
      devIntent.hasUsedExport === true ||
      devIntent.hasViewedApiKeys === true ||
      devIntent.hasConnectedGitHub === true
    )
  }, [devIntent])

  // Compute effective mode
  const mode = useMemo((): WorkspaceMode => {
    // 1. Explicit override takes priority
    if (override) return override

    // 2. Developer intent → standard (don't hide tools from developers)
    if (hasShownDevIntent) return 'standard'

    // 3. Easy Mode projects → simple
    if (project?.infraMode === 'easy') return 'simple'

    // 4. Pro Mode projects → standard
    if (project?.infraMode === 'pro') return 'standard'

    // 5. Default for new/unknown → simple
    return 'simple'
  }, [override, hasShownDevIntent, project?.infraMode])

  // Set mode override
  const setMode = useCallback((newMode: WorkspaceMode) => {
    setOverrideState(newMode)
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, newMode)
      } catch {
        // Ignore storage errors
      }
    }
  }, [storageKey])

  // Clear override
  const clearOverride = useCallback(() => {
    setOverrideState(null)
    if (storageKey && typeof window !== 'undefined') {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // Ignore storage errors
      }
    }
  }, [storageKey])

  // Derive booleans (never store these separately)
  const isSimple = mode === 'simple'
  const isAdvanced = mode === 'advanced'

  return {
    mode: isHydrated ? mode : 'simple', // Default to simple during hydration
    setMode,
    clearOverride,
    isSimple: isHydrated ? isSimple : true,
    isAdvanced: isHydrated ? isAdvanced : false,
    hasOverride: override !== null
  }
}
