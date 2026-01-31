/**
 * File Context Banner Component
 *
 * Shows which plan step relates to the currently active file in the code viewer.
 * Uses truthful language ("Related to" not "Executing") per design constraints.
 *
 * @see docs/plan-code-explanation-context.md
 */

'use client'

import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { usePlanContext, type PlanStep } from '@/hooks/use-plan-context'
import { useCodeViewerStore } from '@/store/code-viewer-store'

interface FileContextBannerProps {
  /** Optional buildId override (defaults to store's buildId) */
  buildId?: string | null
  className?: string
}

/**
 * Truncate text to a maximum length with ellipsis
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 1) + '…'
}

/**
 * FileContextBanner - Shows plan step context for the active file
 *
 * Design constraints (from expert feedback):
 * - One line maximum (scannable in <1s)
 * - Truthful language ("Related to" not "Executing")
 * - Show nothing if no match (not "Unknown step")
 * - Subtle styling (not attention-grabbing)
 */
export function FileContextBanner({ buildId: buildIdProp, className }: FileContextBannerProps) {
  // Get active file and buildId from code viewer store
  const activeFilePath = useCodeViewerStore((state) => state.activeFile)
  const storeBuildId = useCodeViewerStore((state) => state.buildId)

  // Use prop buildId or fall back to store buildId
  const effectiveBuildId = buildIdProp ?? storeBuildId

  // Get plan context
  const planContext = usePlanContext(effectiveBuildId ?? undefined)

  // Look up the step for the active file
  const stepContext = useMemo((): PlanStep | null => {
    if (!planContext.hasContext || !activeFilePath) return null
    return planContext.getStepForFile(activeFilePath)
  }, [planContext, activeFilePath])

  // Graceful degradation: show nothing if no match
  // Per design: "Show nothing rather than wrong information"
  if (!stepContext) return null

  return (
    <div
      className={cn(
        // Subtle styling - not attention-grabbing
        'flex items-center gap-2 px-3 py-1.5',
        'bg-blue-500/5 dark:bg-blue-500/10 border-b border-blue-500/20',
        'text-sm text-blue-700 dark:text-blue-300',
        className
      )}
      role="status"
      aria-label={`This file is related to: ${stepContext.title}`}
    >
      <span className="text-blue-500 flex-shrink-0">📝</span>
      <span className="truncate">
        {/* Truthful language: "Related to" not "Executing" */}
        Related to: {truncateText(stepContext.title, 50)}
      </span>
    </div>
  )
}
