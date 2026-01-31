/**
 * Build Progress Header
 *
 * Phase 0: Compact progress indicator shown at top of unified chat during builds.
 * Stops the "broken" perception by showing build status immediately.
 *
 * Design decisions (from UNIFIED_CHAT_BUILD_EVENTS_INTEGRATION_PLAN.md):
 * - Always visible during active build
 * - Auto-hides when build completes or fails
 * - Shows skeleton state when build state not immediately available
 * - RTL: Progress bar fills right-to-left in RTL locales
 *
 * Phase 4: Polish & Production Readiness
 * - Accessibility: ARIA labels on progress bar, live region for status
 * - RTL: <bdi> wrappers for mixed-direction text
 */

'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'
import { Loader2, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'

// Valid phase keys for type safety
const PHASE_KEYS = ['setup', 'development', 'dependencies', 'build', 'deploy', 'metadata'] as const
type PhaseKey = typeof PHASE_KEYS[number]

interface BuildProgressHeaderProps {
  /** Whether a build is currently active */
  isBuilding: boolean
  /** Whether the build is complete */
  isComplete: boolean
  /** Whether the build failed */
  isFailed: boolean
  /** Current progress (0-1) */
  progress: number
  /** Current build phase */
  currentPhase?: string
  /** Latest event title */
  latestTitle?: string
  /** Preview URL when build is complete */
  previewUrl?: string | null
  /** Show skeleton loading state */
  isLoadingBuildState?: boolean
  /** Additional className */
  className?: string
}

export function BuildProgressHeader({
  isBuilding,
  isComplete,
  isFailed,
  progress,
  currentPhase,
  latestTitle,
  previewUrl,
  isLoadingBuildState = false,
  className
}: BuildProgressHeaderProps) {
  const locale = useLocale()
  const t = useTranslations('builder.buildProgress')
  const isRTL = locale === 'ar' || locale.startsWith('ar-')

  // Don't render if no build activity and not loading
  if (!isBuilding && !isComplete && !isFailed && !isLoadingBuildState) {
    return null
  }

  const progressPercentage = Math.round(progress * 100)
  // Use localized phase labels (expert review fix - hardcoded English was a bug for RTL users)
  const phaseLabel = currentPhase && PHASE_KEYS.includes(currentPhase as PhaseKey)
    ? t(`phases.${currentPhase}`)
    : currentPhase || ''

  // Determine status
  const getStatusConfig = () => {
    if (isLoadingBuildState) {
      return {
        icon: <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />,
        label: t('starting'),
        bgColor: 'bg-muted/50',
        progressColor: 'bg-muted-foreground/30',
        textColor: 'text-muted-foreground'
      }
    }
    if (isFailed) {
      return {
        icon: <AlertCircle className="w-4 h-4 text-destructive" />,
        label: t('failed'),
        bgColor: 'bg-destructive/10',
        progressColor: 'bg-destructive',
        textColor: 'text-destructive'
      }
    }
    if (isComplete) {
      return {
        icon: <CheckCircle className="w-4 h-4 text-green-500" />,
        label: t('complete'),
        bgColor: 'bg-green-500/10',
        progressColor: 'bg-green-500',
        textColor: 'text-green-600 dark:text-green-400'
      }
    }
    return {
      icon: <Loader2 className="w-4 h-4 animate-spin text-primary" />,
      label: t('building'),
      bgColor: 'bg-primary/10',
      progressColor: 'bg-primary',
      textColor: 'text-primary'
    }
  }

  const status = getStatusConfig()

  return (
    <AnimatePresence>
      <m.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'shrink-0 border-b border-border',
          status.bgColor,
          className
        )}
        // Accessibility: Live region for status announcements
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="px-3 py-2">
          {/* Main status row */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span aria-hidden="true">{status.icon}</span>
              <span className={cn('text-sm font-medium', status.textColor)}>
                {status.label}
              </span>
              {phaseLabel && isBuilding && (
                <>
                  <span className="text-muted-foreground" aria-hidden="true">•</span>
                  <span className="text-sm text-muted-foreground truncate">
                    <bdi>{phaseLabel}</bdi>
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Percentage */}
              {!isLoadingBuildState && (
                <span className={cn('text-sm tabular-nums', status.textColor)}>
                  {progressPercentage}%
                </span>
              )}

              {/* Preview link when complete - Touch-friendly */}
              {isComplete && previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded',
                    'bg-green-500 hover:bg-green-600 text-white transition-colors',
                    // Mobile: 44px minimum touch target
                    'min-h-11 touch-manipulation',
                    // Focus visible for keyboard users
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-green-500'
                  )}
                >
                  {t('preview')}
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>

          {/* Progress bar - Accessible */}
          <div
            role="progressbar"
            aria-valuenow={isLoadingBuildState ? undefined : progressPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('building')}
            className="w-full bg-muted/50 rounded-full h-1.5 overflow-hidden"
          >
            <m.div
              className={cn(
                'h-full rounded-full',
                status.progressColor,
                // RTL: Progress bar fills from right
                isRTL && 'ms-auto'
              )}
              initial={{ width: 0 }}
              animate={{ width: isLoadingBuildState ? '30%' : `${progressPercentage}%` }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              style={isRTL ? { marginInlineStart: 'auto' } : undefined}
            />
          </div>

          {/* Latest event title (compact) - RTL safe */}
          {latestTitle && isBuilding && !isLoadingBuildState && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1.5"
            >
              <span className="text-xs text-muted-foreground truncate block">
                <bdi>{latestTitle}</bdi>
              </span>
            </m.div>
          )}
        </div>
      </m.div>
    </AnimatePresence>
  )
}
