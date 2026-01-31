/**
 * PlanBuildHandshake Component
 *
 * Shows the transition from "plan complete" to "generating files".
 * Creates a satisfying micro-moment that connects plan to action.
 *
 * Event boundaries:
 * - Triggered on: plan_complete (when user clicks "Start Building")
 * - Displayed until: file_manifest OR first file_start (build starts)
 *
 * @see ux-analysis-code-generation-wait-time.md
 */

'use client'

import { m as motion, AnimatePresence } from '@/components/ui/motion-provider'
import type { FeaturePlanResponse, FixPlanResponse } from '@/types/chat-plan'
import {
  extractPlannedFiles,
  getPlannedFilesSummary,
  type PlannedFile,
} from '@/utils/plan-files'
import {
  CheckCircle2,
  FileCode,
  FilePlus,
  FileEdit,
  FileX,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { useMemo, useState } from 'react'

export interface PlanBuildHandshakeProps {
  /**
   * The plan that was approved and is being converted to build
   */
  plan: FeaturePlanResponse | FixPlanResponse

  /**
   * Current state of the handshake
   */
  state: 'locked' | 'generating' | 'started'

  /**
   * Optional: Number of files generated so far (once build starts)
   */
  filesGenerated?: number

  /**
   * Optional class name
   */
  className?: string
}

/**
 * Icon for file change type
 */
function FileIcon({ changeType }: { changeType: PlannedFile['changeType'] }) {
  switch (changeType) {
    case 'create':
      return <FilePlus className="w-4 h-4 text-green-500" />
    case 'modify':
      return <FileEdit className="w-4 h-4 text-blue-500" />
    case 'delete':
      return <FileX className="w-4 h-4 text-red-500" />
    default:
      return <FileCode className="w-4 h-4 text-gray-500" />
  }
}

/**
 * Single file item in the list
 */
function PlannedFileItem({ file }: { file: PlannedFile }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <FileIcon changeType={file.changeType} />
      <span className="text-sm text-gray-700 dark:text-gray-300 font-mono truncate">
        {file.path}
      </span>
    </div>
  )
}

export function PlanBuildHandshake({
  plan,
  state,
  filesGenerated = 0,
  className = '',
}: PlanBuildHandshakeProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Extract planned files from the plan
  const plannedFiles = useMemo(() => extractPlannedFiles(plan), [plan])
  const summary = useMemo(() => getPlannedFilesSummary(plannedFiles), [plannedFiles])

  // Show first 3 files, rest behind expand
  const visibleFiles = isExpanded ? plannedFiles : plannedFiles.slice(0, 3)
  const hasMore = plannedFiles.length > 3

  // Status text based on state
  const statusText = useMemo(() => {
    switch (state) {
      case 'locked':
        return 'Plan locked'
      case 'generating':
        return 'Generating files from plan...'
      case 'started':
        return `Building... (${filesGenerated}/${summary.total} files)`
      default:
        return 'Processing...'
    }
  }, [state, filesGenerated, summary.total])

  // Don't render if no files planned
  if (plannedFiles.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`
        rounded-lg border overflow-hidden
        ${state === 'locked'
          ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
          : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800'
        }
        ${className}
      `}
    >
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          {state === 'locked' ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
          ) : (
            <Loader2 className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" />
          )}

          {/* Status text */}
          <div>
            <span className={`
              font-medium text-sm
              ${state === 'locked'
                ? 'text-green-700 dark:text-green-300'
                : 'text-blue-700 dark:text-blue-300'
              }
            `}>
              {statusText}
            </span>

            {/* File count summary */}
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              {summary.total} file{summary.total !== 1 ? 's' : ''} planned
              {summary.create > 0 && ` · ${summary.create} new`}
              {summary.modify > 0 && ` · ${summary.modify} modified`}
            </div>
          </div>
        </div>

        {/* Progress indicator for generating state */}
        {state === 'started' && summary.total > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
              {/* EXPERT FIX ROUND 12: Defensive clamp to prevent NaN/Infinity */}
              {(() => {
                const pct = summary.total > 0 ? (filesGenerated / summary.total) * 100 : 0
                const safePct = Math.max(0, Math.min(100, pct))
                return (
                  <motion.div
                    className="h-full bg-blue-600 dark:bg-blue-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${safePct}%` }}
                    transition={{ duration: 0.3 }}
                  />
                )
              })()}
            </div>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
              {summary.total > 0 ? Math.round(Math.max(0, Math.min(100, (filesGenerated / summary.total) * 100))) : 0}%
            </span>
          </div>
        )}
      </div>

      {/* File list */}
      <div className="px-4 pb-3 border-t border-gray-200/50 dark:border-gray-700/50">
        <div className="pt-3 space-y-0.5">
          <AnimatePresence mode="popLayout">
            {visibleFiles.map((file, index) => (
              <motion.div
                key={file.path}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ delay: index * 0.05 }}
              >
                <PlannedFileItem file={file} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Expand/collapse button */}
        {hasMore && (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="
              mt-2 flex items-center gap-1 text-xs
              text-gray-600 dark:text-gray-400
              hover:text-gray-900 dark:hover:text-gray-200
              transition-colors
            "
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                Show {plannedFiles.length - 3} more files
              </>
            )}
          </button>
        )}
      </div>
    </motion.div>
  )
}

export default PlanBuildHandshake
