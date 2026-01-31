/**
 * Error Display Component
 *
 * Milestone C - Day 1 Afternoon
 *
 * Standardized error display with recovery actions.
 * Uses centralized error messages for consistency.
 *
 * Features:
 * - Alert with destructive variant for errors
 * - Title and message display
 * - Optional action button (retry, navigate, contact)
 * - Icon support
 *
 * Usage:
 * ```typescript
 * import { ErrorDisplay } from '@/components/ui/error-display'
 * import { getErrorInfo } from '@/lib/errors/error-messages'
 *
 * const errorInfo = getErrorInfo('NETWORK_ERROR')
 * <ErrorDisplay error={errorInfo} onRetry={handleRetry} />
 * ```
 */

'use client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { useRouter } from '@/i18n/routing'
import type { ErrorInfo } from '@/lib/errors/error-messages'

export interface ErrorDisplayProps {
  /** Error information from getErrorInfo() */
  error: ErrorInfo | null | undefined

  /** Callback for retry action */
  onRetry?: () => void

  /** Custom className for the Alert component */
  className?: string

  /** Show icon (default: true) */
  showIcon?: boolean

  /** Compact mode - smaller padding and text */
  compact?: boolean
}

/**
 * Error Display Component
 *
 * Displays errors in a consistent, user-friendly way with recovery actions.
 */
export function ErrorDisplay({
  error,
  onRetry,
  className,
  showIcon = true,
  compact = false,
}: ErrorDisplayProps) {
  const router = useRouter()

  if (!error) {
    return null
  }

  const handleAction = () => {
    switch (error.recoveryAction) {
      case 'retry':
        onRetry?.()
        break

      case 'reload':
        window.location.reload()
        break

      case 'navigate':
        if (error.actionHref) {
          router.push(error.actionHref)
        }
        break

      case 'contact':
        if (error.actionHref) {
          window.open(error.actionHref, '_blank', 'noopener,noreferrer')
        }
        break

      case 'none':
      default:
        // No action
        break
    }
  }

  const hasAction = error.recoveryAction && error.recoveryAction !== 'none' && error.actionLabel

  return (
    <Alert variant="destructive" className={className}>
      {showIcon && <Icon name="alert-circle" className="h-4 w-4" />}
      <AlertTitle className={compact ? 'text-sm' : undefined}>{error.title}</AlertTitle>
      <AlertDescription className={compact ? 'text-xs' : 'text-sm'}>
        <div className="space-y-3">
          <p>{error.message}</p>

          {hasAction && (
            <div>
              <Button
                onClick={handleAction}
                variant="outline"
                size={compact ? 'sm' : 'default'}
                className="bg-background hover:bg-background/80"
              >
                {error.recoveryAction === 'retry' && (
                  <Icon name="refresh-cw" className="w-4 h-4 me-2" />
                )}
                {error.recoveryAction === 'navigate' && (
                  <Icon name="arrow-right" className="w-4 h-4 me-2" />
                )}
                {error.recoveryAction === 'contact' && (
                  <Icon name="mail" className="w-4 h-4 me-2" />
                )}
                {error.recoveryAction === 'reload' && (
                  <Icon name="rotate-ccw" className="w-4 h-4 me-2" />
                )}
                {error.actionLabel}
              </Button>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  )
}

/**
 * Inline Error Display (compact variant)
 *
 * Use this for inline errors in forms or smaller UI elements.
 */
export function InlineErrorDisplay(props: ErrorDisplayProps) {
  return <ErrorDisplay {...props} compact showIcon={false} />
}
