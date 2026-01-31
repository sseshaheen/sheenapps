/**
 * usePlanContext Hook
 *
 * Provides plan context during code generation to show which plan step
 * relates to current files being created/modified.
 *
 * Features:
 * - SessionStorage persistence (survives page refresh)
 * - File-to-step lookup with path normalization
 * - Feature flag integration
 * - Graceful null handling (show nothing rather than wrong info)
 *
 * @see docs/plan-code-explanation-context.md
 */

import { FEATURE_FLAGS } from '@/config/feature-flags'
import type { FeaturePlanResponse, FixPlanResponse } from '@/types/chat-plan'
import { extractPlannedFiles, type PlannedFile } from '@/utils/plan-files'
import { useCallback, useEffect, useMemo, useState } from 'react'

// Storage key prefix
const STORAGE_KEY_PREFIX = 'plan-context:'

// TTL for stored context (30 minutes)
const CONTEXT_TTL_MS = 30 * 60 * 1000

/**
 * Stored plan context structure
 */
interface StoredPlanContext {
  buildId: string
  plan: FeaturePlanResponse | FixPlanResponse
  plannedFilesMap: Record<string, PlannedFile>
  storedAt: number
}

/**
 * Step information from the plan
 */
export interface PlanStep {
  order: number
  title: string
  description: string
  files: string[]
  estimatedEffort?: 'low' | 'medium' | 'high'
}

/**
 * Plan context return type
 */
export interface PlanContextValue {
  /** Whether the feature is enabled */
  isEnabled: boolean
  /** The cached plan (null if not available) */
  plan: FeaturePlanResponse | FixPlanResponse | null
  /** Get the step that relates to a file path (null if not found) */
  getStepForFile: (filePath: string) => PlanStep | null
  /** Get the PlannedFile info for a file path */
  getPlannedFile: (filePath: string) => PlannedFile | null
  /** Get all steps from the plan */
  getAllSteps: () => PlanStep[]
  /** Get summary text for the plan */
  getPlanSummary: () => string | null
  /** Check if plan context is available for a build */
  hasContext: boolean
}

/**
 * Normalize file path for consistent lookup
 * Handles: backslashes, leading ./, leading /, casing
 */
function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')           // Backslash to forward slash
    .replace(/^\.\//, '')          // Remove leading ./
    .replace(/^\//, '')            // Remove leading /
    .toLowerCase()                 // Case-insensitive
}

/**
 * Build a lookup map from file path to PlannedFile
 */
function buildFilesMap(files: PlannedFile[]): Record<string, PlannedFile> {
  const map: Record<string, PlannedFile> = {}
  for (const file of files) {
    const normalizedPath = normalizePath(file.path)
    // Only keep first match if same file appears in multiple steps
    if (!map[normalizedPath]) {
      map[normalizedPath] = file
    }
  }
  return map
}

/**
 * Extract steps from plan (handles both FeaturePlanResponse and FixPlanResponse)
 */
function extractSteps(plan: FeaturePlanResponse | FixPlanResponse): PlanStep[] {
  if (plan.mode === 'feature') {
    const featurePlan = plan as FeaturePlanResponse
    if (featurePlan.plan?.steps) {
      return featurePlan.plan.steps.map(step => ({
        order: step.order,
        title: step.title,
        description: step.description,
        files: step.files || [],
        estimatedEffort: step.estimatedEffort,
      }))
    }
    // Legacy format
    if (featurePlan.steps) {
      return featurePlan.steps.map((step, index) => ({
        order: index + 1,
        title: step.title,
        description: step.description,
        files: step.files_affected || [],
      }))
    }
  } else if (plan.mode === 'fix') {
    const fixPlan = plan as FixPlanResponse
    // Fix plans don't have explicit steps, but we can create a pseudo-step from solution
    if (fixPlan.solution?.changes) {
      return [{
        order: 1,
        title: 'Apply Fix',
        description: fixPlan.solution.approach,
        files: fixPlan.solution.changes.map(c => c.file),
      }]
    }
  }
  return []
}

/**
 * Get plan summary text
 */
function getPlanSummaryText(plan: FeaturePlanResponse | FixPlanResponse): string | null {
  if (plan.mode === 'feature') {
    const featurePlan = plan as FeaturePlanResponse
    return featurePlan.summary || featurePlan.plan?.overview || null
  } else if (plan.mode === 'fix') {
    const fixPlan = plan as FixPlanResponse
    return fixPlan.solution?.approach || fixPlan.issue?.description || null
  }
  return null
}

/**
 * Store plan context to sessionStorage
 */
export function storePlanContext(
  buildId: string,
  plan: FeaturePlanResponse | FixPlanResponse
): void {
  if (typeof window === 'undefined') return

  try {
    const plannedFiles = extractPlannedFiles(plan)
    const plannedFilesMap = buildFilesMap(plannedFiles)

    const context: StoredPlanContext = {
      buildId,
      plan,
      plannedFilesMap,
      storedAt: Date.now(),
    }

    sessionStorage.setItem(
      `${STORAGE_KEY_PREFIX}${buildId}`,
      JSON.stringify(context)
    )
  } catch (error) {
    // Silently fail - graceful degradation
    console.warn('[PlanContext] Failed to store context:', error)
  }
}

/**
 * Retrieve plan context from sessionStorage
 */
function retrievePlanContext(buildId: string): StoredPlanContext | null {
  if (typeof window === 'undefined') return null

  try {
    const stored = sessionStorage.getItem(`${STORAGE_KEY_PREFIX}${buildId}`)
    if (!stored) return null

    const parsed: StoredPlanContext = JSON.parse(stored)

    // Check TTL
    if (Date.now() - parsed.storedAt > CONTEXT_TTL_MS) {
      // Expired - clean up
      sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${buildId}`)
      return null
    }

    return parsed
  } catch (error) {
    // Silently fail - graceful degradation
    console.warn('[PlanContext] Failed to retrieve context:', error)
    return null
  }
}

/**
 * Clear plan context from sessionStorage
 */
export function clearPlanContext(buildId: string): void {
  if (typeof window === 'undefined') return

  try {
    sessionStorage.removeItem(`${STORAGE_KEY_PREFIX}${buildId}`)
  } catch {
    // Silently fail
  }
}

/**
 * Hook to access plan context during code generation
 *
 * @param buildId - The build ID to get context for
 * @returns Plan context with lookup methods
 */
export function usePlanContext(buildId: string | undefined): PlanContextValue {
  const [storedContext, setStoredContext] = useState<StoredPlanContext | null>(null)

  // Check feature flag
  const isEnabled = FEATURE_FLAGS.ENABLE_PLAN_CONTEXT

  // Load context from storage on mount or buildId change
  useEffect(() => {
    if (!isEnabled || !buildId) {
      setStoredContext(null)
      return
    }

    const context = retrievePlanContext(buildId)
    setStoredContext(context)
  }, [buildId, isEnabled])

  // Get step for a file path
  const getStepForFile = useCallback((filePath: string): PlanStep | null => {
    if (!storedContext?.plan) return null

    const normalizedPath = normalizePath(filePath)
    const plannedFile = storedContext.plannedFilesMap[normalizedPath]

    if (!plannedFile?.stepTitle) return null

    // Find the matching step
    const steps = extractSteps(storedContext.plan)
    return steps.find(step => step.title === plannedFile.stepTitle) || null
  }, [storedContext])

  // Get PlannedFile for a path
  const getPlannedFile = useCallback((filePath: string): PlannedFile | null => {
    if (!storedContext?.plannedFilesMap) return null

    const normalizedPath = normalizePath(filePath)
    return storedContext.plannedFilesMap[normalizedPath] || null
  }, [storedContext])

  // Get all steps
  const getAllSteps = useCallback((): PlanStep[] => {
    if (!storedContext?.plan) return []
    return extractSteps(storedContext.plan)
  }, [storedContext])

  // Get plan summary
  const getPlanSummary = useCallback((): string | null => {
    if (!storedContext?.plan) return null
    return getPlanSummaryText(storedContext.plan)
  }, [storedContext])

  // Memoize the return value
  return useMemo(() => ({
    isEnabled,
    plan: storedContext?.plan || null,
    getStepForFile,
    getPlannedFile,
    getAllSteps,
    getPlanSummary,
    hasContext: isEnabled && storedContext !== null,
  }), [isEnabled, storedContext, getStepForFile, getPlannedFile, getAllSteps, getPlanSummary])
}
