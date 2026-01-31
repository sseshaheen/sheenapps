/**
 * Step Details Panel Component
 *
 * Expandable panel showing full details about the current plan step.
 * Collapsed by default per design constraint.
 *
 * @see docs/plan-code-explanation-context.md
 */

'use client'

import { useState, useMemo } from 'react'
import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { ChevronDown, ChevronUp, FileText, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePlanContext, type PlanStep } from '@/hooks/use-plan-context'
import { useCodeViewerStore } from '@/store/code-viewer-store'

interface StepDetailsPanelProps {
  /** Build ID for plan context */
  buildId: string | null
  /** Whether the build is complete */
  isComplete?: boolean
  className?: string
}

/**
 * Get file name from path
 */
function getFileName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

/**
 * StepDetailsPanel - Expandable step details
 *
 * Design constraints:
 * - Collapsed by default
 * - Shows full step description
 * - Lists files in current step
 * - Shows what's next preview
 */
export function StepDetailsPanel({
  buildId,
  isComplete = false,
  className,
}: StepDetailsPanelProps) {
  // Collapsed by default per design constraint
  const [isExpanded, setIsExpanded] = useState(false)

  // Get plan context
  const planContext = usePlanContext(buildId ?? undefined)

  // Get current file from code viewer to determine current step
  const currentStreamingFile = useCodeViewerStore((state) =>
    state.streaming.currentFile || state.activeFile
  )

  // Get all steps and determine current step
  const allSteps = useMemo(() => {
    if (!planContext.hasContext) return []
    return planContext.getAllSteps()
  }, [planContext])

  // Find current step based on streaming file
  const { currentStep, currentStepIndex, nextStep } = useMemo(() => {
    if (!planContext.hasContext || allSteps.length === 0) {
      return { currentStep: null, currentStepIndex: -1, nextStep: null }
    }

    // If complete, show last step
    if (isComplete) {
      const lastStep = allSteps[allSteps.length - 1]
      return {
        currentStep: lastStep,
        currentStepIndex: allSteps.length - 1,
        nextStep: null,
      }
    }

    // Find step for current file
    if (currentStreamingFile) {
      const step = planContext.getStepForFile(currentStreamingFile)
      if (step) {
        const index = allSteps.findIndex((s) => s.title === step.title)
        return {
          currentStep: step,
          currentStepIndex: index,
          nextStep: index >= 0 && index < allSteps.length - 1 ? allSteps[index + 1] : null,
        }
      }
    }

    // Fallback to first step
    return {
      currentStep: allSteps[0] || null,
      currentStepIndex: 0,
      nextStep: allSteps.length > 1 ? allSteps[1] : null,
    }
  }, [planContext, allSteps, currentStreamingFile, isComplete])

  // Get files that have been created/modified
  const filesByPath = useCodeViewerStore((state) => state.filesByPath)
  const completedFilePaths = useMemo(() => {
    return Object.keys(filesByPath).filter(
      (path) => filesByPath[path].status === 'modified' || filesByPath[path].status === 'new'
    )
  }, [filesByPath])

  // Graceful degradation: show nothing if no plan context
  if (!planContext.hasContext || !currentStep) return null

  return (
    <div className={cn('border-t border-gray-700', className)}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2',
          'text-sm text-gray-400 hover:text-gray-200 transition-colors',
          'hover:bg-gray-800/50'
        )}
        aria-expanded={isExpanded}
        aria-controls="step-details-content"
      >
        <span className="flex items-center gap-2">
          <FileText className="w-4 h-4" />
          <span>
            {isExpanded ? 'Hide step details' : 'Show step details'}
          </span>
        </span>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {isExpanded && (
          <m.div
            id="step-details-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Current Step Details */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-white flex items-center gap-2">
                  <span className="text-blue-400">
                    Step {currentStepIndex + 1} of {allSteps.length}
                  </span>
                </h4>
                <p className="text-sm text-gray-300">{currentStep.title}</p>
                {currentStep.description && (
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {currentStep.description}
                  </p>
                )}
              </div>

              {/* Files in this step */}
              {currentStep.files && currentStep.files.length > 0 && (
                <div className="space-y-2">
                  <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Files in this step
                  </h5>
                  <ul className="space-y-1">
                    {currentStep.files.map((file) => {
                      const isCompleted = completedFilePaths.some(
                        (p) => p.toLowerCase() === file.toLowerCase() ||
                               p.toLowerCase().endsWith('/' + file.toLowerCase().split('/').pop())
                      )
                      return (
                        <li
                          key={file}
                          className="flex items-center gap-2 text-xs text-gray-400"
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                          ) : (
                            <Circle className="w-3 h-3 text-gray-600 flex-shrink-0" />
                          )}
                          <span className={cn(isCompleted && 'text-gray-300')}>
                            {getFileName(file)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* What's Next */}
              {nextStep && !isComplete && (
                <div className="pt-2 border-t border-gray-700/50">
                  <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">
                    Next
                  </h5>
                  <p className="text-xs text-gray-500">
                    {nextStep.title}
                  </p>
                </div>
              )}

              {/* Completion state */}
              {isComplete && (
                <div className="pt-2 border-t border-gray-700/50">
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    All steps completed
                  </p>
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
