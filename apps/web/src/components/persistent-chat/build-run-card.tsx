/**
 * Build Run Card
 *
 * Phase 1: Virtual message card showing build progress in chat timeline.
 *
 * Design decisions (from UNIFIED_CHAT_BUILD_EVENTS_INTEGRATION_PLAN.md):
 * - ONE card per build, NOT 200 micro-messages (Section 4)
 * - Virtual message - NOT stored in chat DB (Section 4.4)
 * - Expandable detail section for full event list
 * - Contains recommendations when build complete (Phase 2)
 * - RTL: Progress fills right-to-left (Section 7.7)
 *
 * Phase 4: Polish & Production Readiness
 * - Mobile: 44px touch targets for recommendation chips
 * - Accessibility: ARIA labels, live regions, focus-visible states
 * - RTL: <bdi> wrappers for mixed-direction text
 */

'use client'

import React, { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  Rocket
} from 'lucide-react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { VersionBadge } from '@/components/version/version-badge'
import type { BuildRun, BuildPhase } from '@/hooks/use-build-run'
import type { ProjectRecommendation } from '@/types/project-recommendations'
import type { CleanBuildEvent } from '@/types/build-events'

/**
 * Pattern matchers for events without event_code
 * Maps raw English titles to translation keys
 */
const TITLE_PATTERN_MATCHERS: Array<{
  pattern: RegExp
  key: string
  extractParams?: (match: RegExpMatchArray) => Record<string, string>
}> = [
  // File operations: "Creating deploy-intent.json..." → BUILD_FILE_CREATING
  {
    pattern: /^Creating\s+(.+?)\.{0,3}$/i,
    key: 'BUILD_FILE_CREATING',
    extractParams: (match) => ({ filename: match[1] })
  },
  // File updates: "Updating package.json..."
  {
    pattern: /^Updating\s+(.+?)\.{0,3}$/i,
    key: 'BUILD_FILE_UPDATING',
    extractParams: (match) => ({ filename: match[1] })
  },
  // Dependencies: "Install dependencies with pnpm" or "Installing dependencies"
  {
    pattern: /^Install(?:ing)?\s+dependencies/i,
    key: 'BUILD_DEPENDENCIES_INSTALLING'
  },
  // Type check: "Type check the project"
  {
    pattern: /^Type\s+check/i,
    key: 'BUILD_CODE_REVIEWING'
  },
  // AI Session: "AI Session Started"
  {
    pattern: /^AI\s+Session\s+Started/i,
    key: 'BUILD_DEVELOPMENT_STARTING'
  },
  // Preview: "Preview Complete"
  {
    pattern: /^Preview\s+Complete/i,
    key: 'BUILD_DEPLOY_ACTIVATING'
  },
  // Build started variations
  {
    pattern: /^Build\s+started/i,
    key: 'BUILD_STARTED'
  },
  // Deployment variations
  {
    pattern: /^Deploy(?:ing|ment)/i,
    key: 'BUILD_PROJECT_DEPLOYING'
  },
  // Compiling variations
  {
    pattern: /^Compil(?:ing|e)/i,
    key: 'BUILD_COMPILING'
  },
  // Bundling variations
  {
    pattern: /^Bundl(?:ing|e)/i,
    key: 'BUILD_BUNDLING'
  },
  // Generic "Processing" or "Processing..."
  {
    pattern: /^Processing\.{0,3}$/i,
    key: 'PROCESSING'
  }
]

/**
 * Get localized event title using event_code if available, falling back to pattern matching
 * Uses try/catch for safe translation lookup (expert recommendation)
 */
function getLocalizedEventTitle(
  event: CleanBuildEvent,
  t: (key: string, params?: Record<string, any>) => string
): string {
  // Try to use event_code for translation (preferred)
  if (event.event_code) {
    const key = `buildEvents.${event.event_code}`
    try {
      // Provide default values for common params to avoid translation failures
      const params = {
        step: 1,
        total: 1,
        progress: 0,
        ...event.event_params
      }
      const translated = t(key, params)
      // next-intl returns the key string when missing - detect that
      if (translated !== key && !translated.includes(event.event_code)) {
        return translated
      }
    } catch {
      // Missing key or formatting issue - fall through
    }
  }

  // Try pattern matching on raw title (for events without event_code)
  if (event.title) {
    for (const matcher of TITLE_PATTERN_MATCHERS) {
      const match = event.title.match(matcher.pattern)
      if (match) {
        try {
          const params = {
            step: 1,
            total: 1,
            progress: 0,
            ...(matcher.extractParams?.(match) || {}),
            ...event.event_params
          }
          const translated = t(`buildEvents.${matcher.key}`, params)
          // Verify translation worked
          if (translated && !translated.includes(matcher.key)) {
            return translated
          }
        } catch {
          // Translation failed, continue to next pattern or fallback
        }
      }
    }
  }

  // Fallback to raw title, or generic "Processing" if title is empty
  return event.title || t('buildEvents.PROCESSING')
}

// Phase configuration - icons only, names come from translations (expert review fix)
const PHASE_CONFIG: readonly { key: BuildPhase; icon: string }[] = [
  { key: 'setup', icon: '📦' },
  { key: 'development', icon: '⚡' },
  { key: 'dependencies', icon: '📚' },
  { key: 'build', icon: '🔧' },
  { key: 'deploy', icon: '🚀' }
]

interface BuildRunCardProps {
  buildRun: BuildRun
  /** Callback when user selects a recommendation */
  onRecommendationSelect?: (recommendation: ProjectRecommendation) => void
  /** Additional className */
  className?: string
  /** Infrastructure mode - 'easy' shows deploy button */
  infraMode?: 'easy' | 'custom' | null
  /** Subdomain for Easy Mode deployment */
  subdomain?: string
  /** Deploy state from useDeploy hook */
  deployState?: {
    isFirstDeploy: boolean
    isDeploying: boolean
    deployPhase: 'idle' | 'uploading' | 'deploying' | 'routing' | 'complete' | 'error'
    deployError: string | null
    deployedUrl: string | null
  }
  /** Callback to open deploy dialog (for first deploy) */
  onOpenDeployDialog?: () => void
  /** Callback for quick deploy (for subsequent deploys) */
  onQuickDeploy?: (buildId: string) => void
  /** Deploy button translations */
  deployTranslations?: {
    deploy: string
    deploying: string
    deployed: string
    deployFailed: string
    viewSite: string
  }
}

export function BuildRunCard({
  buildRun,
  onRecommendationSelect,
  className,
  infraMode,
  subdomain,
  deployState,
  onOpenDeployDialog,
  onQuickDeploy,
  deployTranslations
}: BuildRunCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const locale = useLocale()
  const t = useTranslations('builder')
  const isRTL = locale === 'ar' || locale.startsWith('ar-')

  // Unique ID for aria-controls to avoid collisions when multiple cards exist
  const eventsListId = `build-events-list-${buildRun.buildId}`

  const {
    buildId,
    status,
    currentPhase,
    overallProgress,
    latestEventTitle,
    latestEventDescription,
    completedPhases,
    currentPhaseIndex,
    stepIndex,
    totalSteps,
    events,
    previewUrl,
    error,
    versionId,
    versionName,
    recommendations,
    hasRecommendations
  } = buildRun

  // Determine card styling based on status
  const statusConfig = useMemo(() => {
    switch (status) {
      case 'completed':
        return {
          borderColor: 'border-green-500/30',
          bgColor: 'bg-green-500/5',
          iconColor: 'text-green-500',
          progressColor: 'bg-green-500',
          icon: <CheckCircle className="w-5 h-5" />
        }
      case 'failed':
        return {
          borderColor: 'border-destructive/30',
          bgColor: 'bg-destructive/5',
          iconColor: 'text-destructive',
          progressColor: 'bg-destructive',
          icon: <AlertCircle className="w-5 h-5" />
        }
      case 'queued':
        return {
          borderColor: 'border-muted-foreground/30',
          bgColor: 'bg-muted/50',
          iconColor: 'text-muted-foreground',
          progressColor: 'bg-muted-foreground',
          icon: <Clock className="w-5 h-5" />
        }
      default: // running
        return {
          borderColor: 'border-primary/30',
          bgColor: 'bg-primary/5',
          iconColor: 'text-primary',
          progressColor: 'bg-primary',
          icon: <Loader2 className="w-5 h-5 animate-spin" />
        }
    }
  }, [status])

  return (
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-lg border p-4 my-2',
        statusConfig.borderColor,
        statusConfig.bgColor,
        className
      )}
      data-testid="build-run-card"
      data-build-id={buildId}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={statusConfig.iconColor}>{statusConfig.icon}</span>
          <h3 className="font-semibold text-foreground">
            🏗️ {status === 'completed' ? t('buildEvents.BUILD_COMPLETE') : t('interface.buildLog.title')}
          </h3>
          <span className="text-xs text-muted-foreground font-mono">
            #{buildId.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Percentage */}
          <span className={cn('text-sm font-medium tabular-nums', statusConfig.iconColor)}>
            {overallProgress}%
          </span>

          {/* Preview button */}
          {status === 'completed' && previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded',
                'bg-green-500 hover:bg-green-600 text-white transition-colors'
              )}
            >
              {t('buildProgress.preview')}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {/* Deploy button - Easy Mode only */}
          {status === 'completed' && infraMode === 'easy' && buildId && (
            <>
              {/* Deploy in progress */}
              {deployState?.isDeploying && (
                <span className={cn(
                  'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded',
                  'bg-primary/20 text-primary'
                )}>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {deployTranslations?.deploying || t('buildProgress.deploying')}
                </span>
              )}

              {/* Deploy complete - show link to live site */}
              {deployState?.deployPhase === 'complete' && deployState?.deployedUrl && (
                <a
                  href={deployState.deployedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded',
                    'bg-primary hover:bg-primary/90 text-primary-foreground transition-colors'
                  )}
                >
                  {deployTranslations?.viewSite || t('buildProgress.viewSite')}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              {/* Deploy error */}
              {deployState?.deployPhase === 'error' && (
                <span className={cn(
                  'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded',
                  'bg-destructive/20 text-destructive'
                )}>
                  <AlertCircle className="w-3 h-3" />
                  {deployTranslations?.deployFailed || t('buildProgress.deployFailed')}
                </span>
              )}

              {/* Deploy button - idle state */}
              {(!deployState || deployState.deployPhase === 'idle') && (
                <button
                  onClick={() => {
                    if (deployState?.isFirstDeploy) {
                      onOpenDeployDialog?.()
                    } else {
                      onQuickDeploy?.(buildId)
                    }
                  }}
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded',
                    'bg-primary hover:bg-primary/90 text-primary-foreground transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                  )}
                >
                  <Rocket className="w-3 h-3" />
                  {deployTranslations?.deploy || t('buildProgress.deploy')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress bar - Accessible */}
      <div
        role="progressbar"
        aria-valuenow={overallProgress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('buildProgress.building')}
        className="w-full bg-muted/50 rounded-full h-2 mb-3 overflow-hidden"
      >
        <m.div
          className={cn(
            'h-full rounded-full',
            statusConfig.progressColor,
            // RTL: Progress fills from right
            isRTL && 'ms-auto'
          )}
          initial={{ width: 0 }}
          animate={{ width: `${overallProgress}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          style={isRTL ? { marginInlineStart: 'auto' } : undefined}
        />
      </div>

      {/* Phase indicators */}
      <div className="flex items-center gap-1 mb-3">
        {PHASE_CONFIG.map((phase, index) => {
          const isCompleted = completedPhases.includes(phase.key)
          const isCurrent = phase.key === currentPhase
          const isPending = !isCompleted && !isCurrent

          return (
            <div
              key={phase.key}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs',
                isCompleted && 'bg-green-500/20 text-green-600 dark:text-green-400',
                isCurrent && 'bg-primary/20 text-primary',
                isPending && 'bg-muted/50 text-muted-foreground'
              )}
            >
              {isCompleted ? (
                <CheckCircle className="w-3 h-3" />
              ) : isCurrent ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <span className="w-3 h-3 flex items-center justify-center">○</span>
              )}
              <span className="hidden sm:inline">{t(`buildProgress.phases.${phase.key}`)}</span>
              <span className="sm:hidden">{phase.icon}</span>
            </div>
          )
        })}
      </div>

      {/* Current status / error - with RTL-safe text wrapping */}
      {error ? (
        <div
          className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg mb-3"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-destructive">
              <bdi>{error.message}</bdi>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('buildProgress.failedDuring', { phase: error.phase })}
              {error.code && <span className="font-mono ms-2">[{error.code}]</span>}
            </p>
          </div>
        </div>
      ) : latestEventTitle && status === 'running' ? (
        <div
          className="flex items-center gap-2 mb-3"
          aria-live="polite"
          aria-atomic="true"
        >
          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm text-foreground truncate"><bdi>{latestEventTitle}</bdi></p>
            {latestEventDescription && (
              <p className="text-xs text-muted-foreground truncate"><bdi>{latestEventDescription}</bdi></p>
            )}
          </div>
        </div>
      ) : null}

      {/* Step progress */}
      {stepIndex !== undefined && totalSteps && status === 'running' && (
        <div className="text-xs text-muted-foreground mb-3">
          {t('buildProgress.step', { current: stepIndex + 1, total: totalSteps })}
        </div>
      )}

      {/* Version info on completion */}
      {status === 'completed' && versionId && (
        <div className="flex items-center gap-2 mb-3 pt-2 border-t border-border/50">
          <span className="text-sm text-muted-foreground">{t('buildProgress.version')}</span>
          <VersionBadge
            versionId={versionId}
            versionName={versionName}
            isProcessing={!versionName}
            size="sm"
          />
        </div>
      )}

      {/* Recommendations (Phase 2) - Touch-friendly chips */}
      {status === 'completed' && hasRecommendations && onRecommendationSelect && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <p className="text-sm font-medium text-foreground mb-2">
            {t('buildProgress.recommendedNextSteps')}
          </p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Recommended actions">
            {recommendations.slice(0, 4).map((rec) => (
              <button
                key={rec.id}
                onClick={() => onRecommendationSelect(rec)}
                className={cn(
                  // Base styles
                  'px-3 py-1.5 text-sm rounded-full border transition-colors',
                  'bg-background hover:bg-accent text-foreground',
                  'border-border hover:border-primary',
                  // Mobile: 44px minimum touch target (WCAG 2.5.5)
                  'min-h-11 touch-manipulation',
                  // Focus visible for keyboard users
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                )}
              >
                <bdi>{rec.title}</bdi>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Expand/collapse toggle - Accessible */}
      {events.length > 0 && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          aria-expanded={isExpanded}
          aria-controls={eventsListId}
          className={cn(
            'flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-3',
            // Mobile: 44px touch target
            'min-h-11 touch-manipulation',
            // Focus visible for keyboard users
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded'
          )}
        >
          {isExpanded ? (
            <>
              <ChevronUp className="w-4 h-4" aria-hidden="true" />
              {t('buildProgress.hideBuildSteps', { count: events.length })}
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" aria-hidden="true" />
              {t('buildProgress.showBuildSteps', { count: events.length })}
            </>
          )}
        </button>
      )}

      {/* Expanded event list - Accessible */}
      <AnimatePresence>
        {isExpanded && events.length > 0 && (
          <m.div
            id={eventsListId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 pt-3 border-t border-border/50 overflow-hidden"
          >
            <ul className="space-y-2 max-h-64 overflow-y-auto" role="list" aria-label="Build steps">
              {events.map((event, index) => {
                // Determine if this event should show as completed
                // When build is complete/failed, ALL past events are done (no spinners)
                const buildIsDone = status === 'completed' || status === 'failed'
                const eventFailed = event.event_type === 'failed'
                const eventCompleted = event.event_type === 'completed' || event.event_type === 'deploy_completed' || event.finished
                // Show checkmark if: event explicitly completed, OR build is done and event didn't fail
                const showAsCompleted = eventCompleted || (buildIsDone && !eventFailed)

                return (
                <li
                  key={event.id}
                  className="flex items-start gap-2 text-sm"
                >
                  {/* Icon logic: failed → error, completed/build done → check, else → spinner */}
                  {eventFailed ? (
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" aria-hidden="true" />
                  ) : showAsCompleted ? (
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-primary animate-spin mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className={cn(
                      'block truncate',
                      event.event_type === 'failed' && 'text-destructive'
                    )}>
                      <bdi>{getLocalizedEventTitle(event, t)}</bdi>
                    </span>
                    {event.duration_seconds && (
                      <span className="text-xs text-muted-foreground">
                        {event.duration_seconds.toFixed(1)}s
                      </span>
                    )}
                  </div>
                </li>
              )})}
            </ul>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
