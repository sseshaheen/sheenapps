/**
 * MilestoneToast Component
 *
 * Subtle, non-intrusive toast for build milestone celebrations.
 * Part of the "tasteful milestones" UX pattern.
 *
 * Features:
 * - Auto-dismiss after configurable duration
 * - Respects prefers-reduced-motion
 * - Different intensity levels (subtle vs visible)
 * - Non-blocking - doesn't require user action
 *
 * @see ux-analysis-code-generation-wait-time.md
 */

'use client'

import { m as motion, AnimatePresence } from '@/components/ui/motion-provider'
import { cn } from '@/lib/utils'
import type { Milestone } from '@/hooks/use-milestones'
import { CheckCircle, Sparkles, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

// Check if user prefers reduced motion
function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return prefersReducedMotion
}

export interface MilestoneToastProps {
  /** Milestone to display */
  milestone: Milestone | null
  /** Callback when toast is dismissed */
  onDismiss: () => void
  /** Auto-dismiss duration in ms (default: subtle=2000, visible=3500) */
  dismissDuration?: number
  /** Position of the toast */
  position?: 'top' | 'bottom'
  /** Additional class name */
  className?: string
}

/**
 * Get icon for milestone type
 */
function MilestoneIcon({ type, intensity }: { type: Milestone['type']; intensity: Milestone['intensity'] }) {
  const iconClass = cn(
    'w-4 h-4',
    intensity === 'visible' ? 'text-green-400' : 'text-blue-400'
  )

  switch (type) {
    case 'complete':
      return <Sparkles className={iconClass} />
    case 'first_file':
    case 'first_progress':
      return <Zap className={iconClass} />
    case 'halfway':
      return <CheckCircle className={iconClass} />
    default:
      return <CheckCircle className={iconClass} />
  }
}

export function MilestoneToast({
  milestone,
  onDismiss,
  dismissDuration,
  position = 'top',
  className,
}: MilestoneToastProps) {
  const prefersReducedMotion = usePrefersReducedMotion()

  // Auto-dismiss logic
  useEffect(() => {
    if (!milestone) return

    // Determine duration based on intensity
    const duration =
      dismissDuration ??
      (milestone.intensity === 'visible' ? 3500 : 2000)

    const timer = setTimeout(() => {
      onDismiss()
    }, duration)

    return () => clearTimeout(timer)
  }, [milestone, onDismiss, dismissDuration])

  // Animation variants based on motion preference
  const variants = prefersReducedMotion
    ? {
        // Reduced motion: simple fade
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        // Full motion: slide + fade
        initial: { opacity: 0, y: position === 'top' ? -20 : 20, scale: 0.95 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: position === 'top' ? -10 : 10, scale: 0.98 },
      }

  return (
    <AnimatePresence mode="wait">
      {milestone && (
        <motion.div
          key={milestone.type + milestone.timestamp}
          initial={variants.initial}
          animate={variants.animate}
          exit={variants.exit}
          transition={{ duration: prefersReducedMotion ? 0.15 : 0.25, ease: 'easeOut' }}
          className={cn(
            // Base styles
            'pointer-events-auto px-4 py-2.5 rounded-lg shadow-lg',
            'flex items-center gap-2.5',
            'backdrop-blur-sm border',
            // Intensity-based styling
            milestone.intensity === 'visible'
              ? [
                  // Visible: More prominent, celebratory
                  'bg-gradient-to-r from-green-900/90 to-emerald-900/90',
                  'border-green-600/50',
                  'text-green-100',
                ]
              : [
                  // Subtle: Understated, informational
                  'bg-gray-900/80',
                  'border-gray-700/50',
                  'text-gray-200',
                ],
            className
          )}
          role="status"
          aria-live="polite"
        >
          {/* Icon */}
          <MilestoneIcon type={milestone.type} intensity={milestone.intensity} />

          {/* Message */}
          <span
            className={cn(
              'text-sm font-medium',
              milestone.intensity === 'visible' && 'text-green-100'
            )}
          >
            {milestone.message}
          </span>

          {/* Optional: Progress pulse for visible milestones */}
          {milestone.intensity === 'visible' && !prefersReducedMotion && (
            <motion.div
              className="absolute inset-0 rounded-lg bg-green-400/10"
              initial={{ opacity: 0.5 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 1, repeat: 1 }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * Container for milestone toasts with proper positioning
 */
export interface MilestoneToastContainerProps {
  /** Milestone to display */
  milestone: Milestone | null
  /** Callback when toast is dismissed */
  onDismiss: () => void
  /** Position of the toast container */
  position?: 'top' | 'bottom'
  /** Additional class name */
  className?: string
}

export function MilestoneToastContainer({
  milestone,
  onDismiss,
  position = 'top',
  className,
}: MilestoneToastContainerProps) {
  return (
    <div
      className={cn(
        // Fixed positioning
        'fixed z-50 pointer-events-none',
        // Horizontal centering
        'left-1/2 -translate-x-1/2',
        // Vertical positioning
        position === 'top' ? 'top-4' : 'bottom-4',
        // Container for toast
        'flex justify-center',
        className
      )}
    >
      <MilestoneToast
        milestone={milestone}
        onDismiss={onDismiss}
        position={position}
      />
    </div>
  )
}

export default MilestoneToast
