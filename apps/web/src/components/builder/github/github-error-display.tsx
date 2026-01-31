/**
 * GitHub Error Display Component
 * Shows user-friendly error messages with recovery actions for GitHub sync operations
 */

'use client'

import React from 'react'
import { AlertTriangle, AlertCircle, Info, X, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { 
  GitHubErrorInfo, 
  getGitHubErrorInfo, 
  createRecoveryActions,
  RecoveryAction
} from '@/utils/github-error-handler'
import { GitHubSyncError } from '@/types/github-sync'

interface GitHubErrorDisplayProps {
  error: GitHubSyncError | string | null
  className?: string
  onDismiss?: () => void
  onRetry?: () => Promise<void>
  onRefresh?: () => void
  onReconnect?: () => void
  onOpenSettings?: () => void
  onInstallGitHubApp?: () => void
  compact?: boolean
  showIcon?: boolean
}

export function GitHubErrorDisplay({
  error,
  className,
  onDismiss,
  onRetry,
  onRefresh,
  onReconnect,
  onOpenSettings,
  onInstallGitHubApp,
  compact = false,
  showIcon = true
}: GitHubErrorDisplayProps) {
  if (!error) return null

  const errorInfo = getGitHubErrorInfo(error)
  const recoveryActions = createRecoveryActions(errorInfo.code, {
    retry: onRetry,
    refresh: onRefresh,
    reconnect: onReconnect,
    openSettings: onOpenSettings,
    installGitHubApp: onInstallGitHubApp
  })

  const getSeverityStyles = () => {
    switch (errorInfo.severity) {
      case 'error':
        return {
          container: 'bg-red-500/10 border-red-500/20 text-red-300',
          icon: 'text-red-400',
          title: 'text-red-200',
          message: 'text-red-300'
        }
      case 'warning':
        return {
          container: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-300',
          icon: 'text-yellow-400',
          title: 'text-yellow-200',
          message: 'text-yellow-300'
        }
      case 'info':
        return {
          container: 'bg-blue-500/10 border-blue-500/20 text-blue-300',
          icon: 'text-blue-400',
          title: 'text-blue-200',
          message: 'text-blue-300'
        }
    }
  }

  const getSeverityIcon = () => {
    switch (errorInfo.severity) {
      case 'error':
        return AlertCircle
      case 'warning':
        return AlertTriangle
      case 'info':
        return Info
    }
  }

  const styles = getSeverityStyles()
  const IconComponent = getSeverityIcon()

  return (
    <div className={cn(
      'rounded-lg border',
      styles.container,
      compact ? 'p-2 sm:p-3' : 'p-3 sm:p-4',
      className
    )}>
      <div className="flex items-start gap-2 sm:gap-3">
        {showIcon && (
          <IconComponent 
            className={cn(
              'flex-shrink-0 mt-0.5',
              compact ? 'h-3 w-3 sm:h-4 sm:w-4' : 'h-4 w-4',
              styles.icon
            )} 
          />
        )}
        
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {!compact && (
                <h4 className={cn(
                  'font-medium text-sm sm:text-base mb-1',
                  styles.title
                )}>
                  {errorInfo.title}
                </h4>
              )}
              
              <p className={cn(
                compact ? 'text-xs sm:text-sm' : 'text-sm',
                styles.message
              )}>
                {errorInfo.message}
              </p>

              {/* eslint-disable-next-line no-restricted-globals */}
              {errorInfo.details && process.env.NODE_ENV === 'development' && (
                <details className="mt-2">
                  <summary className="text-xs opacity-75 cursor-pointer">
                    Technical Details
                  </summary>
                  <pre className="mt-1 text-xs opacity-75 overflow-x-auto">
                    {JSON.stringify(errorInfo.details, null, 2)}
                  </pre>
                </details>
              )}
            </div>

            {onDismiss && (
              <button
                onClick={onDismiss}
                className={cn(
                  'flex-shrink-0 p-1 rounded hover:bg-black/10 transition-colors',
                  styles.icon
                )}
                aria-label="Dismiss error"
              >
                <X className="h-3 w-3 sm:h-4 sm:w-4" />
              </button>
            )}
          </div>

          {recoveryActions.length > 0 && (
            <div className={cn(
              'flex flex-wrap gap-2',
              compact ? 'mt-2' : 'mt-3'
            )}>
              {recoveryActions.map((action, index) => (
                <RecoveryActionButton
                  key={index}
                  action={action}
                  severity={errorInfo.severity}
                  compact={compact}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface RecoveryActionButtonProps {
  action: RecoveryAction
  severity: 'error' | 'warning' | 'info'
  compact?: boolean
}

function RecoveryActionButton({ 
  action, 
  severity, 
  compact = false 
}: RecoveryActionButtonProps) {
  const [isExecuting, setIsExecuting] = React.useState(false)

  const handleClick = async () => {
    try {
      setIsExecuting(true)
      await action.action()
    } catch (error) {
      console.error('Recovery action failed:', error)
    } finally {
      setIsExecuting(false)
    }
  }

  const getButtonStyles = () => {
    const baseStyles = cn(
      'inline-flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs sm:text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
      compact ? 'min-h-[32px]' : 'min-h-[36px]',
      'touch-manipulation'
    )

    if (action.primary) {
      switch (severity) {
        case 'error':
          return cn(baseStyles, 'bg-red-600/20 hover:bg-red-600/30 text-red-200 border border-red-600/30')
        case 'warning':
          return cn(baseStyles, 'bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-200 border border-yellow-600/30')
        case 'info':
          return cn(baseStyles, 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 border border-blue-600/30')
      }
    }

    // Secondary button style
    return cn(baseStyles, 'bg-gray-600/20 hover:bg-gray-600/30 text-gray-300 border border-gray-600/30')
  }

  return (
    <button
      onClick={handleClick}
      disabled={isExecuting}
      className={getButtonStyles()}
    >
      {isExecuting && (
        <RefreshCw className="h-3 w-3 animate-spin" />
      )}
      {action.label}
    </button>
  )
}

/**
 * Hook for managing GitHub error state with recovery actions
 */
export function useGitHubErrorHandler() {
  const [error, setError] = React.useState<GitHubSyncError | null>(null)

  const handleError = React.useCallback((error: GitHubSyncError | string | Error) => {
    if (typeof error === 'string') {
      setError({ code: error, message: error })
    } else if (error instanceof Error) {
      setError({ code: 'UNKNOWN_ERROR', message: error.message })
    } else {
      setError(error)
    }
  }, [])

  const clearError = React.useCallback(() => {
    setError(null)
  }, [])

  const isErrorRecoverable = React.useMemo(() => {
    return error ? getGitHubErrorInfo(error).recoverable : false
  }, [error])

  return {
    error,
    handleError,
    clearError,
    isErrorRecoverable
  }
}