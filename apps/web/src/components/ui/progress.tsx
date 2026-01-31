'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  /** 0–100 */
  value?: number
  /** Force direction (SSR-safe). Falls back to <html dir> on client. */
  dir?: 'ltr' | 'rtl'
}

export function Progress({ className, value = 0, dir, ...props }: ProgressProps) {
  const pct = Math.max(0, Math.min(100, value))
  // Determine direction safely
  const isRTL = React.useMemo(() => {
    if (dir) return dir === 'rtl'
    if (typeof document !== 'undefined') {
      return document.documentElement.dir === 'rtl'
    }
    return false
  }, [dir])

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      data-state={Number.isFinite(value) ? 'loading' : 'indeterminate'}
      data-value={pct}
      className={cn('relative h-4 w-full overflow-hidden rounded-full bg-secondary', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full w-full bg-primary transition-transform duration-300 will-change-transform',
          isRTL ? 'origin-right' : 'origin-left'
        )}
        // scaleX(0..1) grows from the chosen origin (left in LTR, right in RTL)
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  )
}