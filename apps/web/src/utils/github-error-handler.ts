/**
 * GitHub Error Handling Utilities
 * Provides centralized error handling and recovery actions for GitHub sync operations
 */

import { logger } from '@/utils/logger'
import { GitHubSyncError } from '@/types/github-sync'

export type GitHubErrorCode = 
  | 'CONFIG_LOAD_FAILED'
  | 'CONFIG_LOAD_ERROR'
  | 'INSTALLATIONS_LOAD_FAILED'
  | 'INSTALLATIONS_LOAD_ERROR'
  | 'REPOSITORY_NOT_FOUND'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'REPOSITORY_ALREADY_LINKED'
  | 'NO_REPOSITORY_LINKED'
  | 'SYNC_OPERATION_FAILED'
  | 'OPERATION_IN_PROGRESS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'OPERATION_NOT_FOUND'
  | 'OPERATION_EXPIRED'
  | 'REALTIME_CONNECTION_FAILED'
  | 'REALTIME_CONNECTION_ERROR'
  | 'PUSH_FAILED'
  | 'PUSH_ERROR'
  | 'PULL_FAILED'
  | 'PULL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export type ErrorSeverity = 'error' | 'warning' | 'info'

export type RecoveryAction = {
  label: string
  action: () => void | Promise<void>
  primary?: boolean
}

export interface GitHubErrorInfo {
  code: GitHubErrorCode
  title: string
  message: string
  severity: ErrorSeverity
  recoverable: boolean
  recoveryActions?: RecoveryAction[]
  details?: Record<string, any>
}

/**
 * Error code to user-friendly error information mapping
 */
const ERROR_INFO_MAP: Record<GitHubErrorCode, Omit<GitHubErrorInfo, 'code'>> = {
  CONFIG_LOAD_FAILED: {
    title: 'Configuration Load Failed',
    message: 'Failed to load GitHub configuration. Please try refreshing the page.',
    severity: 'error',
    recoverable: true
  },
  CONFIG_LOAD_ERROR: {
    title: 'Configuration Error',
    message: 'An error occurred while loading GitHub configuration.',
    severity: 'error',
    recoverable: true
  },
  INSTALLATIONS_LOAD_FAILED: {
    title: 'GitHub Installations Load Failed',
    message: 'Failed to load your GitHub installations. Please check your GitHub connection.',
    severity: 'error',
    recoverable: true
  },
  INSTALLATIONS_LOAD_ERROR: {
    title: 'GitHub Connection Error',
    message: 'An error occurred while connecting to GitHub. Please try again.',
    severity: 'error',
    recoverable: true
  },
  REPOSITORY_NOT_FOUND: {
    title: 'Repository Not Found',
    message: 'The repository was not found or you do not have access to it.',
    severity: 'error',
    recoverable: false
  },
  INSUFFICIENT_PERMISSIONS: {
    title: 'Insufficient Permissions',
    message: 'You do not have the required permissions for this repository.',
    severity: 'error',
    recoverable: false
  },
  REPOSITORY_ALREADY_LINKED: {
    title: 'Repository Already Linked',
    message: 'This repository is already linked to another project.',
    severity: 'warning',
    recoverable: false
  },
  NO_REPOSITORY_LINKED: {
    title: 'No Repository Linked',
    message: 'No GitHub repository is linked to this project.',
    severity: 'info',
    recoverable: true
  },
  SYNC_OPERATION_FAILED: {
    title: 'Sync Operation Failed',
    message: 'The sync operation failed. Please try again.',
    severity: 'error',
    recoverable: true
  },
  OPERATION_IN_PROGRESS: {
    title: 'Operation in Progress',
    message: 'Another sync operation is already running. Please wait for it to complete.',
    severity: 'warning',
    recoverable: false
  },
  RATE_LIMIT_EXCEEDED: {
    title: 'Rate Limit Exceeded',
    message: 'GitHub API rate limit exceeded. Please wait a few minutes before trying again.',
    severity: 'warning',
    recoverable: true
  },
  OPERATION_NOT_FOUND: {
    title: 'Operation Not Found',
    message: 'The requested operation was not found or has already been completed.',
    severity: 'warning',
    recoverable: false
  },
  OPERATION_EXPIRED: {
    title: 'Operation Expired',
    message: 'The operation has expired and cannot be completed.',
    severity: 'warning',
    recoverable: false
  },
  REALTIME_CONNECTION_FAILED: {
    title: 'Real-time Connection Failed',
    message: 'Unable to connect to real-time updates. Manual refresh may be needed.',
    severity: 'warning',
    recoverable: true
  },
  REALTIME_CONNECTION_ERROR: {
    title: 'Real-time Connection Error',
    message: 'An error occurred with real-time updates.',
    severity: 'warning',
    recoverable: true
  },
  PUSH_FAILED: {
    title: 'Push Failed',
    message: 'Failed to push changes to GitHub. Please check your connection and permissions.',
    severity: 'error',
    recoverable: true
  },
  PUSH_ERROR: {
    title: 'Push Error',
    message: 'An error occurred while pushing changes.',
    severity: 'error',
    recoverable: true
  },
  PULL_FAILED: {
    title: 'Pull Failed',
    message: 'Failed to pull changes from GitHub. Please check your connection.',
    severity: 'error',
    recoverable: true
  },
  PULL_ERROR: {
    title: 'Pull Error',
    message: 'An error occurred while pulling changes.',
    severity: 'error',
    recoverable: true
  },
  NETWORK_ERROR: {
    title: 'Network Error',
    message: 'A network error occurred. Please check your internet connection.',
    severity: 'error',
    recoverable: true
  },
  UNKNOWN_ERROR: {
    title: 'Unknown Error',
    message: 'An unexpected error occurred. Please try again.',
    severity: 'error',
    recoverable: true
  }
}

/**
 * Convert a GitHub sync error to user-friendly error information
 */
export function getGitHubErrorInfo(error: GitHubSyncError | string): GitHubErrorInfo {
  const code = typeof error === 'string' ? error as GitHubErrorCode : error.code as GitHubErrorCode
  const details = typeof error === 'object' ? error.details : undefined
  
  const baseInfo = ERROR_INFO_MAP[code] || ERROR_INFO_MAP.UNKNOWN_ERROR
  
  return {
    code,
    ...baseInfo,
    details
  }
}

/**
 * Create recovery actions for common error scenarios
 */
export function createRecoveryActions(
  errorCode: GitHubErrorCode,
  context: {
    retry?: () => Promise<void>
    refresh?: () => void
    reconnect?: () => void
    openSettings?: () => void
    installGitHubApp?: () => void
  }
): RecoveryAction[] {
  const actions: RecoveryAction[] = []

  switch (errorCode) {
    case 'CONFIG_LOAD_FAILED':
    case 'CONFIG_LOAD_ERROR':
      if (context.retry) {
        actions.push({
          label: 'Retry',
          action: context.retry,
          primary: true
        })
      }
      if (context.refresh) {
        actions.push({
          label: 'Refresh Page',
          action: context.refresh
        })
      }
      break

    case 'INSTALLATIONS_LOAD_FAILED':
    case 'INSTALLATIONS_LOAD_ERROR':
      if (context.retry) {
        actions.push({
          label: 'Retry Connection',
          action: context.retry,
          primary: true
        })
      }
      if (context.installGitHubApp) {
        actions.push({
          label: 'Install GitHub App',
          action: context.installGitHubApp
        })
      }
      break

    case 'INSUFFICIENT_PERMISSIONS':
      if (context.openSettings) {
        actions.push({
          label: 'Check Repository Settings',
          action: context.openSettings,
          primary: true
        })
      }
      break

    case 'NO_REPOSITORY_LINKED':
      if (context.openSettings) {
        actions.push({
          label: 'Connect Repository',
          action: context.openSettings,
          primary: true
        })
      }
      break

    case 'SYNC_OPERATION_FAILED':
    case 'PUSH_FAILED':
    case 'PUSH_ERROR':
    case 'PULL_FAILED':
    case 'PULL_ERROR':
      if (context.retry) {
        actions.push({
          label: 'Try Again',
          action: context.retry,
          primary: true
        })
      }
      break

    case 'REALTIME_CONNECTION_FAILED':
    case 'REALTIME_CONNECTION_ERROR':
      if (context.reconnect) {
        actions.push({
          label: 'Reconnect',
          action: context.reconnect,
          primary: true
        })
      }
      if (context.refresh) {
        actions.push({
          label: 'Refresh Status',
          action: context.refresh
        })
      }
      break

    case 'RATE_LIMIT_EXCEEDED':
      // No immediate actions for rate limiting - user needs to wait
      break

    case 'NETWORK_ERROR':
      if (context.retry) {
        actions.push({
          label: 'Retry',
          action: context.retry,
          primary: true
        })
      }
      break

    case 'UNKNOWN_ERROR':
      if (context.retry) {
        actions.push({
          label: 'Try Again',
          action: context.retry,
          primary: true
        })
      }
      if (context.refresh) {
        actions.push({
          label: 'Refresh',
          action: context.refresh
        })
      }
      break
  }

  return actions
}

/**
 * Log GitHub error with context
 */
export function logGitHubError(
  error: GitHubSyncError | Error | string,
  context: {
    operation?: string
    projectId?: string
    userId?: string
    additional?: Record<string, any>
  }
) {
  const errorInfo = typeof error === 'string' 
    ? { code: error, message: error }
    : error instanceof Error
    ? { code: 'UNKNOWN_ERROR', message: error.message, stack: error.stack }
    : error

  logger.error('GitHub operation error', {
    error: errorInfo,
    operation: context.operation,
    projectId: context.projectId,
    userId: context.userId,
    ...context.additional
  })
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(errorCode: GitHubErrorCode): boolean {
  return getGitHubErrorInfo(errorCode).recoverable
}

/**
 * Get error severity level
 */
export function getErrorSeverity(errorCode: GitHubErrorCode): ErrorSeverity {
  return getGitHubErrorInfo(errorCode).severity
}

/**
 * Convert HTTP status code to GitHub error code
 */
export function httpStatusToErrorCode(status: number, context?: string): GitHubErrorCode {
  switch (status) {
    case 401:
      return 'INSUFFICIENT_PERMISSIONS'
    case 403:
      return 'INSUFFICIENT_PERMISSIONS'
    case 404:
      return context === 'repository' ? 'REPOSITORY_NOT_FOUND' : 'OPERATION_NOT_FOUND'
    case 409:
      return context === 'repository' ? 'REPOSITORY_ALREADY_LINKED' : 'OPERATION_IN_PROGRESS'
    case 410:
      return 'OPERATION_EXPIRED'
    case 422:
      return 'SYNC_OPERATION_FAILED'
    case 429:
      return 'RATE_LIMIT_EXCEEDED'
    case 500:
    case 502:
    case 503:
    case 504:
      return 'NETWORK_ERROR'
    default:
      return 'UNKNOWN_ERROR'
  }
}