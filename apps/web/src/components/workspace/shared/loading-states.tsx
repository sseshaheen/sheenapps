/**
 * Loading States Component
 *
 * Consistent loading UI for workspace components
 * Part of shared workspace utilities
 */

'use client'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function LoadingSpinner({ size = 'md', className = '' }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  }

  return (
    <div
      className={`animate-spin rounded-full border-2 border-muted border-t-primary ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  )
}

interface LoadingMessageProps {
  message: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function LoadingMessage({ message, size = 'md', className = '' }: LoadingMessageProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LoadingSpinner size={size} />
      <span className="text-muted-foreground">{message}</span>
    </div>
  )
}

interface FileLoadingProps {
  message?: string
  className?: string
}

function FileLoading({ message = 'Loading file...', className = '' }: FileLoadingProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <LoadingSpinner size="lg" />
      <div className="text-center">
        <p className="text-foreground font-medium">📄</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

interface DirectoryLoadingProps {
  message?: string
  className?: string
}

function DirectoryLoading({ message = 'Loading directory...', className = '' }: DirectoryLoadingProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <LoadingSpinner size="lg" />
      <div className="text-center">
        <p className="text-foreground font-medium">📁</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

interface LogsLoadingProps {
  message?: string
  className?: string
}

function LogsLoading({ message = 'Connecting to log stream...', className = '' }: LogsLoadingProps) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <LoadingSpinner size="lg" />
      <div className="text-center">
        <p className="text-foreground font-medium">📊</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

interface SkeletonProps {
  className?: string
  lines?: number
}

function Skeleton({ className = '', lines = 3 }: SkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-4 bg-muted rounded animate-pulse"
          style={{
            width: `${Math.random() * 40 + 60}%`
          }}
        />
      ))}
    </div>
  )
}

export const LoadingStates = {
  Spinner: LoadingSpinner,
  Message: LoadingMessage,
  FileLoading,
  DirectoryLoading,
  LogsLoading,
  Skeleton
}