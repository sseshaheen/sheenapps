'use client'

import { AnimatePresence, m } from '@/components/ui/motion-provider'
import { VersionBadge } from '@/components/version/version-badge'
import { useCleanBuildEvents } from '@/hooks/use-clean-build-events'
import { usePostBuildRecommendations } from '@/hooks/use-project-recommendations'
import { useMilestones } from '@/hooks/use-milestones'
import { usePlanContext } from '@/hooks/use-plan-context'
import { useCodeViewerStore } from '@/store/code-viewer-store'
import { StepDetailsPanel } from './step-details-panel'
import { cn } from '@/lib/utils'
import type { CleanBuildEvent } from '@/types/build-events'
import { StructuredErrorService } from '@/services/structured-error-handling'
import { formatBuildEvent } from '@/utils/format-build-events'
import { useTranslations } from 'next-intl'
import { AlertCircle, CheckCircle, ChevronDown, ChevronUp, ExternalLink, Loader2 } from 'lucide-react'
import React, { useState, useMemo, useEffect } from 'react'
import { BuildProgressErrorBoundary } from './build-progress-error-boundary'
import { ProjectRecommendations } from './project-recommendations'
import { MilestoneToastContainer } from './milestone-toast'
import type { SendMessageFunction } from '@/hooks/use-apply-recommendation'

// Phase configuration constants
const PHASE_CONFIG = [
  { key: 'setup', name: 'Setup', icon: '📦' },
  { key: 'development', name: 'Development', icon: '⚡' },
  { key: 'dependencies', name: 'Dependencies', icon: '📚' },
  { key: 'build', name: 'Build', icon: '🔧' },
  { key: 'deploy', name: 'Preview', icon: '🚀' }
] as const

interface CleanBuildProgressProps {
  buildId: string | null
  userId: string
  projectId?: string
  projectBuildStatus?: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null
  // EXPERT FIX ROUND 6: sendMessage is optional, but recommendations won't show without it
  // This prevents accidental duplicate chat initialization while maintaining backward compat
  sendMessage?: SendMessageFunction
  className?: string
  // Infrastructure mode - shows Infrastructure link for Easy Mode projects
  infraMode?: 'easy' | 'pro' | null
}

function CleanBuildProgressInner({
  buildId,
  userId,
  projectId,
  projectBuildStatus,
  sendMessage,
  className,
  infraMode
}: CleanBuildProgressProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // EXPERT FIX ROUND 4: Get translations once at parent level
  // Instead of calling useTranslations() in every EventItem
  const t = useTranslations()
  const buildEventTranslations = useMemo(() => {
    try {
      return { builder: { buildEvents: t.raw('builder.buildEvents') } }
    } catch {
      return { builder: { buildEvents: {} } }
    }
  }, [t])

  // EXPERT FIX ROUND 3: Reset expanded state when buildId changes
  useEffect(() => {
    setIsExpanded(false)
  }, [buildId])

  // EXPERT FIX ROUND 11 (v3): Only poll when actively building
  const shouldPoll =
    projectBuildStatus === 'queued' ||
    projectBuildStatus === 'building' ||
    projectBuildStatus === 'rollingBack'

  const {
    events,
    isComplete,
    currentProgress,
    previewUrl,
    stepIndex,
    totalSteps,
    currentPhase,
    error,
    isLoading
  } = useCleanBuildEvents(buildId, userId, useMemo(() => ({
    autoPolling: shouldPoll,
    projectBuildStatus: (projectBuildStatus ?? null) as 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed' | null
  }), [shouldPoll, projectBuildStatus]))

  // Fetch recommendations when build is complete
  // EXPERT FIX ROUND 16: Always call hook to respect Rules of Hooks,
  // but pass enabled: false to prevent API calls when feature is disabled
  const SHOW_RECOMMENDATIONS_PANEL = false
  const {
    recommendations,
    hasRecommendations,
    isLoading: recommendationsLoading
  } = usePostBuildRecommendations(projectId || null, userId, isComplete, {
    enabled: SHOW_RECOMMENDATIONS_PANEL
  })

  // Track milestones for tasteful celebrations
  // @see ux-analysis-code-generation-wait-time.md
  const {
    currentMilestone,
    dismissMilestone,
  } = useMilestones({
    buildId,
    progress: Math.round(currentProgress * 100),
    isComplete,
    enabled: !!buildId,
  })

  // Plan context for Code Explanation Context feature
  // @see docs/plan-code-explanation-context.md
  const planContext = usePlanContext(buildId ?? undefined)

  // Get current file from code viewer store (streaming file or active file)
  const currentStreamingFile = useCodeViewerStore((state) =>
    state.streaming.currentFile || state.activeFile
  )

  // Derive current plan step from the file being streamed/viewed
  // Uses file-based tracking (most accurate approach)
  const currentPlanStep = useMemo(() => {
    if (!planContext.hasContext || isComplete) return null
    if (!currentStreamingFile) return null

    return planContext.getStepForFile(currentStreamingFile)
  }, [planContext, currentStreamingFile, isComplete])

  // Don't render if no buildId or no events yet
  if (!buildId) return null

  const progressPercentage = Math.round(currentProgress * 100)
  // EXPERT FIX ROUND 3: If isComplete, always show 100% (prevents 0% bar with "100%" label)
  const displayProgress = isComplete ? 100 : Math.max(0, Math.min(100, progressPercentage))
  const latestEvent = events[events.length - 1]
  const hasEvents = events.length > 0

  return (
    <div className={cn("w-full", className)} data-testid="build-progress">
      {/* Milestone Toast - Shows subtle celebrations at key progress points */}
      <MilestoneToastContainer
        milestone={currentMilestone}
        onDismiss={dismissMilestone}
        position="top"
      />

      {/* Compact View */}
      <m.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900/50 rounded-lg border border-gray-700 p-4"
      >
        {/* Header with progress */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            🏗️ Building Your App
          </h3>
          <span className="text-sm text-gray-400">
            {isComplete ? '100%' : `${displayProgress}%`}
            {isComplete && ' • Build Complete! 🎉'}
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
          <m.div
            className={cn(
              "h-2 rounded-full transition-colors",
              isComplete
                ? "bg-gradient-to-r from-green-500 to-emerald-500"
                : "bg-gradient-to-r from-blue-500 to-indigo-500"
            )}
            animate={{ width: `${displayProgress}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* Plan Step Context - Shows which plan step relates to current activity */}
        {/* Uses truthful language: "From your plan" not "Executing step" */}
        {/* @see docs/plan-code-explanation-context.md */}
        {currentPlanStep && !isComplete && (
          <div className="flex items-start gap-2 mb-3 p-2 bg-blue-900/20 border border-blue-700/30 rounded">
            <span className="text-blue-400 mt-0.5">📋</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-blue-200 truncate">
                From your plan: {currentPlanStep.title}
              </div>
              {currentPlanStep.description && (
                <div className="text-xs text-blue-300/70 line-clamp-1 mt-0.5">
                  {currentPlanStep.description}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step Details Panel - Expandable view of current plan step */}
        {/* Collapsed by default per design constraint */}
        {planContext.hasContext && (
          <StepDetailsPanel
            buildId={buildId}
            isComplete={isComplete}
            className="mb-3 -mx-4 bg-gray-900/30 rounded-lg overflow-hidden"
          />
        )}

        {/* Error display */}
        {error && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-red-900/30 border border-red-700/50 rounded">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-200">
              Failed to load build progress. {error.message}
            </span>
          </div>
        )}

        {/* Loading state */}
        {isLoading && !hasEvents && (
          <div className="flex items-center gap-2 mb-3">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-200">Loading build status...</span>
          </div>
        )}

        {/* Current progress info */}
        {hasEvents && (
          <>
            {/* Step progress (when available) */}
            {stepIndex !== undefined && totalSteps && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-gray-400">
                  Step {stepIndex + 1} of {totalSteps}
                </span>
                {currentPhase && (
                  <>
                    <span className="text-gray-600">•</span>
                    <span className="text-sm text-gray-300 capitalize" data-testid={`phase-${currentPhase}`}>
                      {currentPhase}
                    </span>
                  </>
                )}
              </div>
            )}

            {/* Current status */}
            {latestEvent && (
              <div className="flex items-center gap-2 mb-2" data-testid="status-message">
                {isComplete ? (
                  <CheckCircle className="w-4 h-4 text-green-400" />
                ) : (
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                )}
                <span className={cn(
                  "text-sm",
                  isComplete ? "text-green-200" : "text-blue-200"
                )}>
                  {latestEvent.title}
                </span>
              </div>
            )}

            {/* Description */}
            {latestEvent?.description && (
              <div className="text-sm text-gray-400 mb-3">
                {latestEvent.description}
              </div>
            )}
          </>
        )}

        {/* Completion state with preview and version info */}
        {isComplete && previewUrl && (
          <div className="bg-green-900/30 border border-green-700/50 rounded p-3 mb-3" data-testid="build-complete">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="font-medium text-green-200">
                  🎉 Build Complete!
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-sm rounded transition-colors"
                >
                  🚀 Preview
                  <ExternalLink className="w-3 h-3" />
                </a>
                {/* Infrastructure button for Easy Mode projects */}
                {infraMode === 'easy' && projectId && (
                  <a
                    href={`/builder/workspace/${projectId}?infra=open`}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
                  >
                    🏗️ Infrastructure
                  </a>
                )}
              </div>
            </div>

            {/* ✅ NEW: Version information from completion event */}
            {(() => {
              const completionEvent = events.find(
                event => event.finished && event.event_type === 'completed'
              )
              return completionEvent?.versionId && (
                <div className="flex items-center gap-2 pt-2 border-t border-green-700/30">
                  <span className="text-sm text-green-300">Version:</span>
                  <VersionBadge
                    versionId={completionEvent.versionId}
                    versionName={completionEvent.versionName}
                    isProcessing={!completionEvent.versionName}
                    size="sm"
                  />
                </div>
              )
            })()}
          </div>
        )}

        {/* Project Recommendations */}
        {/* EXPERT FIX ROUND 11 (v4): Disabled - BuilderChatInterface shows recommendations via RecommendationMessage */}
        {/* Showing here would duplicate the UI (both chat message + cards) */}
        {/* The new useBuildRecommendations system in BuilderChatInterface is now the primary surface */}
        {/* Keep code for potential future flag-gated behavior */}
        {false && isComplete && hasRecommendations && projectId && sendMessage && (
          <ProjectRecommendations
            recommendations={recommendations}
            projectId={projectId}
            sendMessage={sendMessage}
            className="mb-3"
          />
        )}

        {/* Failed event error */}
        {events.some(e => e.event_type === 'failed') && (
          <BuildErrorDisplay
            event={events.find(e => e.event_type === 'failed')!}
            onRetry={() => window.location.reload()}
          />
        )}

        {/* Expand/Collapse toggle */}
        {hasEvents && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                Hide {events.length} build steps
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                Show {events.length} build steps
              </>
            )}
          </button>
        )}
      </m.div>

      {/* Expanded Timeline View */}
      <AnimatePresence>
        {isExpanded && hasEvents && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 bg-gray-900/30 rounded-lg border border-gray-700/50 overflow-hidden"
          >
            <div className="p-4">
              <h4 className="text-md font-semibold text-white mb-4 flex items-center gap-2">
                📋 Build Timeline Details
              </h4>

              {/* Phase progress visualization */}
              <PhaseProgress currentPhase={currentPhase} />

              {/* Step-by-step progress */}
              {stepIndex !== undefined && totalSteps && (
                <StepByStepProgress
                  stepIndex={stepIndex}
                  totalSteps={totalSteps}
                  currentTitle={latestEvent?.title || ''}
                  currentDescription={latestEvent?.description || ''}
                />
              )}

              {/* Event list */}
              <div className="space-y-2 mt-4">
                {events.map((event, index) => (
                  <EventItem
                    key={event.id}
                    event={event}
                    isLatest={index === events.length - 1}
                    isComplete={isComplete}
                    translations={buildEventTranslations}
                  />
                ))}
              </div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Phase progress component
const PhaseProgress = React.memo(function PhaseProgress({
  currentPhase
}: {
  currentPhase?: string
}) {
  const currentPhaseIndex = PHASE_CONFIG.findIndex(p => p.key === currentPhase)

  return (
    <div className="phase-progress mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">Phase Progress</span>
      </div>
      <div className="flex items-center gap-2">
        {PHASE_CONFIG.map((phase, index) => (
          <div
            key={phase.key}
            className={cn(
              "flex flex-col items-center gap-1 flex-1",
              index < currentPhaseIndex && "text-green-400",
              index === currentPhaseIndex && "text-blue-400",
              index > currentPhaseIndex && "text-gray-500"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs",
              index < currentPhaseIndex && "border-green-400 bg-green-400/20",
              index === currentPhaseIndex && "border-blue-400 bg-blue-400/20",
              index > currentPhaseIndex && "border-gray-500"
            )}>
              {phase.icon}
            </div>
            <span className="text-xs text-center">{phase.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

// Step-by-step progress component
function StepByStepProgress({
  stepIndex,
  totalSteps,
  currentTitle,
  currentDescription
}: {
  stepIndex: number
  totalSteps: number
  currentTitle: string
  currentDescription: string
}) {
  return (
    <div className="step-progress mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-300">
          Step {stepIndex + 1} of {totalSteps}
        </span>
        <span className="text-xs text-gray-500">
          {Math.round(((stepIndex + 1) / totalSteps) * 100)}% complete
        </span>
      </div>

      <div className="flex items-center gap-1 mb-3">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <div
            key={index}
            className={cn(
              "h-2 flex-1 rounded",
              index < stepIndex && "bg-green-400",
              index === stepIndex && "bg-blue-400",
              index > stepIndex && "bg-gray-600"
            )}
            style={{
              // CSS perf: will-change only on active step to prevent reflow issues
              willChange: index === stepIndex ? 'transform' : undefined
            }}
          />
        ))}
      </div>

      <div className="current-step bg-gray-800/50 rounded p-2">
        <div className="text-sm font-medium text-white">{currentTitle}</div>
        {currentDescription && (
          <div className="text-xs text-gray-400 mt-1">{currentDescription}</div>
        )}
      </div>
    </div>
  )
}

// Individual event item
function EventItem({
  event,
  isLatest,
  isComplete,
  translations
}: {
  event: CleanBuildEvent
  isLatest: boolean
  isComplete: boolean
  translations: any  // EXPERT FIX ROUND 4: Accept translations from parent instead of calling useTranslations
}) {
  // EXPERT FIX ROUND 4: Use passed translations instead of calling useTranslations()
  // This avoids creating a new context subscription for every event item

  // Format event using new or legacy format
  // EXPERT FIX ROUND 5: Removed logging from inside useMemo (can be spammy during rapid streaming)
  const formattedEvent = useMemo(() => {
    return formatBuildEvent(event, translations)
  }, [event, translations])
  
  const getStatusIcon = () => {
    if (event.event_type === 'failed') {
      return <AlertCircle className="w-4 h-4 text-red-400" />
    }
    if (event.finished || (!isLatest && isComplete)) {
      return <CheckCircle className="w-4 h-4 text-green-400" />
    }
    if (isLatest && !isComplete) {
      return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
    }
    return <div className="w-2 h-2 bg-green-400 rounded-full" />
  }

  const getTextColor = () => {
    if (event.event_type === 'failed') return 'text-red-200'
    if (event.finished || (!isLatest && isComplete)) return 'text-green-200'
    if (isLatest && !isComplete) return 'text-blue-200'
    return 'text-gray-400'
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {getStatusIcon()}
      <div className="flex-1">
        <span className={cn("font-medium", getTextColor())}>
          {formattedEvent.title}
        </span>
        {formattedEvent.description && (
          <div className="text-xs text-gray-500 mt-0.5">
            {formattedEvent.description}
          </div>
        )}
      </div>
      {event.duration_seconds && (
        <span className="text-xs text-gray-500">
          {event.duration_seconds.toFixed(1)}s
        </span>
      )}
    </div>
  )
}

// 🆕 Enhanced Error display component with structured error handling
function BuildErrorDisplay({
  event,
  onRetry
}: {
  event: CleanBuildEvent
  onRetry: () => void
}) {
  // Use structured error service for enhanced error handling
  const errorConfig = StructuredErrorService.handleBuildError(event, onRetry)
  
  // Get icon mapping for different error types
  const getErrorIcon = (type: string) => {
    switch (type) {
      case 'capacity': return '🕐'
      case 'network': return '📡'  
      case 'rate_limit': return '⏱️'
      case 'auth': return '🔐'
      case 'provider': return '🔧'
      default: return '⚠️'
    }
  }

  return (
    <div className="bg-red-900/30 border border-red-700/50 rounded p-3 mb-3">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          {/* Enhanced error title with type-specific styling */}
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-red-200">{errorConfig.title}</h3>
            <span className="text-lg">{getErrorIcon(errorConfig.type)}</span>
          </div>

          {/* User-friendly error message */}
          <div className="text-sm text-red-300 mb-2">
            {errorConfig.message}
          </div>

          {/* Countdown timer for capacity errors */}
          {errorConfig.showCountdown && errorConfig.retryDelay > 0 && (
            <div className="text-xs text-amber-300 mb-2 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {StructuredErrorService.formatCountdownText(errorConfig.retryDelay)}
            </div>
          )}

          {/* Build context information */}
          <div className="text-xs text-red-400/80 space-y-1 mb-3">
            <div>Failed during: <strong>{event.phase}</strong> phase</div>
            <div>Progress: {Math.round((event.overall_progress ?? 0) * 100)}% complete</div>
            {event.error?.code && (
              <div>Error type: <span className="font-mono text-xs">{event.error.code}</span></div>
            )}
          </div>

          {/* Smart retry button based on error configuration */}
          {/* EXPERT FIX ROUND 6: Don't show retry button for auth errors (they get sign-in button instead) */}
          {errorConfig.canRetry && errorConfig.type !== 'auth' && (
            <button
              className={cn(
                "px-3 py-1.5 text-white text-sm rounded transition-colors",
                errorConfig.type === 'capacity'
                  ? "bg-amber-600 hover:bg-amber-500"
                  : "bg-red-600 hover:bg-red-500"
              )}
              onClick={onRetry}
              disabled={errorConfig.retryDelay > 0}
            >
              {errorConfig.retryButtonText}
            </button>
          )}

          {/* Show sign-in button for auth errors (mutually exclusive with retry button) */}
          {errorConfig.type === 'auth' && (
            <button
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
              onClick={() => {
                // TODO: Implement auth redirect
                window.location.href = '/auth/login'
              }}
            >
              {errorConfig.retryButtonText}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Export the component wrapped with error boundary
export function CleanBuildProgress(props: CleanBuildProgressProps) {
  return (
    <BuildProgressErrorBoundary>
      <CleanBuildProgressInner {...props} />
    </BuildProgressErrorBoundary>
  )
}
