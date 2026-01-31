/**
 * Streaming Cursor Component
 *
 * Animated cursor showing where code is being generated.
 */

'use client'

import { memo } from 'react'
import { cn } from '@/lib/utils'

// ============================================================================
// Types
// ============================================================================

interface StreamingCursorProps {
  isActive: boolean
  className?: string
}

// ============================================================================
// Streaming Cursor Component
// ============================================================================

export const StreamingCursor = memo(function StreamingCursor({
  isActive,
  className,
}: StreamingCursorProps) {
  if (!isActive) return null

  return (
    <span
      className={cn(
        'inline-block w-2 h-[1.2em] bg-primary/80 rounded-sm',
        'animate-cursor-blink',
        className
      )}
      aria-hidden="true"
    />
  )
})

// ============================================================================
// CSS (add to globals.css)
// ============================================================================

/*
Add to globals.css:

@keyframes cursor-blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.animate-cursor-blink {
  animation: cursor-blink 1s ease-in-out infinite;
}
*/
