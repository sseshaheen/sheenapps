/**
 * Centralized Error Messages System
 *
 * Milestone C - Day 1 Afternoon
 *
 * Purpose: Provide consistent, actionable error messages across the application.
 * All error codes map to user-friendly messages with recovery actions.
 *
 * Usage:
 * ```typescript
 * const errorInfo = getErrorInfo('NETWORK_ERROR', { context: { url: '/api/...' } })
 * <ErrorDisplay error={errorInfo} />
 * ```
 */

/**
 * Error information with recovery guidance
 */
export interface ErrorInfo {
  code: string
  title: string
  message: string
  actionLabel?: string
  actionHref?: string
  recoveryAction?: 'retry' | 'reload' | 'contact' | 'navigate' | 'none'
}

/**
 * Context for dynamic error messages
 */
export interface ErrorContext {
  [key: string]: string | number | undefined
}

/**
 * Standard error codes and their user-friendly messages
 */
export const ERROR_MESSAGES: Record<string, Omit<ErrorInfo, 'code'>> = {
  // Network & Connection Errors
  NETWORK_ERROR: {
    title: 'Connection Error',
    message: 'Unable to connect to the server. Please check your internet connection and try again.',
    actionLabel: 'Retry',
    recoveryAction: 'retry',
  },

  TIMEOUT_ERROR: {
    title: 'Request Timeout',
    message: 'The request took too long to complete. This might be due to a slow connection or server load.',
    actionLabel: 'Retry',
    recoveryAction: 'retry',
  },

  // Authentication & Authorization Errors
  AUTH_EXPIRED: {
    title: 'Session Expired',
    message: 'Your session has expired. Please sign in again to continue.',
    actionLabel: 'Sign In',
    actionHref: '/auth/signin',
    recoveryAction: 'navigate',
  },

  UNAUTHORIZED: {
    title: 'Unauthorized',
    message: 'You do not have permission to access this resource.',
    actionLabel: 'Go to Dashboard',
    actionHref: '/dashboard',
    recoveryAction: 'navigate',
  },

  PROJECT_NOT_FOUND: {
    title: 'Project Not Found',
    message: 'The project you are looking for does not exist or has been deleted.',
    actionLabel: 'View Projects',
    actionHref: '/dashboard/projects',
    recoveryAction: 'navigate',
  },

  // Quota & Rate Limiting Errors
  QUOTA_EXCEEDED: {
    title: 'Quota Exceeded',
    message: 'You have reached your usage quota. Upgrade your plan or wait until the quota resets.',
    actionLabel: 'View Plans',
    actionHref: '/pricing',
    recoveryAction: 'navigate',
  },

  RATE_LIMIT_EXCEEDED: {
    title: 'Too Many Requests',
    message: 'You are making requests too quickly. Please wait a moment and try again.',
    actionLabel: 'Retry',
    recoveryAction: 'retry',
  },

  STORAGE_LIMIT_EXCEEDED: {
    title: 'Storage Limit Exceeded',
    message: 'Your project has reached its storage limit. Delete unused data or upgrade your plan.',
    actionLabel: 'View Plans',
    actionHref: '/pricing',
    recoveryAction: 'navigate',
  },

  // Deployment Errors
  DEPLOY_TIMEOUT: {
    title: 'Deployment Timeout',
    message: 'Deployment is taking longer than expected. Please check the deployment logs for details.',
    actionLabel: 'View Logs',
    recoveryAction: 'navigate',
  },

  DEPLOYMENT_FAILED: {
    title: 'Deployment Failed',
    message: 'The deployment could not be completed. Check the deployment logs for error details.',
    actionLabel: 'View Logs',
    recoveryAction: 'navigate',
  },

  ASSETS_TOO_LARGE: {
    title: 'Assets Too Large',
    message: 'Your static assets exceed the size limit for your plan. Optimize your assets or upgrade.',
    actionLabel: 'View Plans',
    actionHref: '/pricing',
    recoveryAction: 'navigate',
  },

  BUNDLE_TOO_LARGE: {
    title: 'Bundle Too Large',
    message: 'Your server bundle exceeds the size limit for your plan. Optimize your code or upgrade.',
    actionLabel: 'View Plans',
    actionHref: '/pricing',
    recoveryAction: 'navigate',
  },

  // Database & Query Errors
  INVALID_SQL: {
    title: 'Invalid SQL Query',
    message: 'The SQL query contains syntax errors or is not allowed. Only SELECT queries are supported.',
    actionLabel: 'View Documentation',
    actionHref: '/docs/database',
    recoveryAction: 'navigate',
  },

  SCHEMA_CREATION_FAILED: {
    title: 'Schema Creation Failed',
    message: 'Failed to create the database schema. Please try again or contact support.',
    actionLabel: 'Retry',
    recoveryAction: 'retry',
  },

  DATABASE_PROVISIONING_FAILED: {
    title: 'Database Provisioning Failed',
    message: 'Failed to provision your database. Please try again or contact support if the issue persists.',
    actionLabel: 'Contact Support',
    actionHref: '/support',
    recoveryAction: 'contact',
  },

  // Build & Artifact Errors
  BUILD_ARTIFACTS_NOT_READY: {
    title: 'Build Artifacts Not Ready',
    message: 'Build artifacts are still being prepared. Please try again in a moment.',
    actionLabel: 'Retry',
    recoveryAction: 'retry',
  },

  BUILD_ARTIFACTS_INCOMPLETE: {
    title: 'Build Artifacts Incomplete',
    message: 'Some build artifacts are missing. You may need to rebuild your project.',
    actionLabel: 'Rebuild',
    recoveryAction: 'navigate',
  },

  // Project Creation Errors
  SUBDOMAIN_TAKEN: {
    title: 'Subdomain Unavailable',
    message: 'The subdomain you requested is already in use. Please choose a different subdomain.',
    recoveryAction: 'none',
  },

  INVALID_SUBDOMAIN: {
    title: 'Invalid Subdomain',
    message: 'The subdomain format is invalid. Use lowercase letters, numbers, and hyphens only.',
    recoveryAction: 'none',
  },

  PROJECT_LIMIT_REACHED: {
    title: 'Project Limit Reached',
    message: 'You have reached the maximum number of projects for your plan. Upgrade to create more.',
    actionLabel: 'View Plans',
    actionHref: '/pricing',
    recoveryAction: 'navigate',
  },

  // Generic Errors
  INTERNAL_ERROR: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again or contact support if the issue persists.',
    actionLabel: 'Contact Support',
    actionHref: '/support',
    recoveryAction: 'contact',
  },

  VALIDATION_ERROR: {
    title: 'Validation Error',
    message: 'The provided data is invalid. Please check your input and try again.',
    recoveryAction: 'none',
  },

  UNKNOWN_ERROR: {
    title: 'Unknown Error',
    message: 'An unknown error occurred. Please try again.',
    actionLabel: 'Retry',
    recoveryAction: 'retry',
  },
}

/**
 * Get error information for a given error code
 *
 * @param code - Error code (from API or local)
 * @param options - Additional options
 * @param options.fallbackMessage - Custom message to use if code not found
 * @param options.context - Dynamic context for message interpolation
 * @returns ErrorInfo object with user-friendly message and recovery action
 *
 * @example
 * ```typescript
 * // Basic usage
 * const error = getErrorInfo('NETWORK_ERROR')
 *
 * // With custom fallback
 * const error = getErrorInfo(apiErrorCode, {
 *   fallbackMessage: 'Operation failed. Please try again.'
 * })
 *
 * // With context (for future dynamic messages)
 * const error = getErrorInfo('QUOTA_EXCEEDED', {
 *   context: { limit: 1000, resetAt: '2026-01-16' }
 * })
 * ```
 */
export function getErrorInfo(
  code: string,
  options?: {
    fallbackMessage?: string
    context?: ErrorContext
  }
): ErrorInfo {
  const errorTemplate = ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN_ERROR

  let message = errorTemplate.message

  // Apply context-based message interpolation if provided
  if (options?.context) {
    Object.entries(options.context).forEach(([key, value]) => {
      if (value !== undefined) {
        message = message.replace(`{${key}}`, String(value))
      }
    })
  }

  // Use custom fallback message if code not found and fallback provided
  if (!ERROR_MESSAGES[code] && options?.fallbackMessage) {
    message = options.fallbackMessage
  }

  return {
    code,
    ...errorTemplate,
    message,
  }
}

/**
 * Extract error code from various error sources
 *
 * @param error - Error object (can be Error, ApiResponse, or plain object)
 * @returns Error code string or 'UNKNOWN_ERROR'
 *
 * @example
 * ```typescript
 * // From API response
 * const apiError = { ok: false, error: { code: 'QUOTA_EXCEEDED', message: '...' } }
 * extractErrorCode(apiError) // 'QUOTA_EXCEEDED'
 *
 * // From Error object
 * const err = new Error('NETWORK_ERROR: Failed to fetch')
 * extractErrorCode(err) // 'NETWORK_ERROR'
 *
 * // From generic error
 * extractErrorCode({ message: 'Something failed' }) // 'UNKNOWN_ERROR'
 * ```
 */
export function extractErrorCode(error: any): string {
  // API response error format
  if (error?.error?.code) {
    return error.error.code
  }

  // Error with code property
  if (error?.code && typeof error.code === 'string') {
    return error.code
  }

  // Error message starting with code (e.g., "NETWORK_ERROR: ...")
  if (error?.message && typeof error.message === 'string') {
    const match = error.message.match(/^([A-Z_]+):/)
    if (match) {
      return match[1]
    }
  }

  return 'UNKNOWN_ERROR'
}

/**
 * Check if an error code is retryable
 *
 * @param code - Error code
 * @returns true if the error can be retried
 */
export function isRetryableError(code: string): boolean {
  const retryableErrors = [
    'NETWORK_ERROR',
    'TIMEOUT_ERROR',
    'RATE_LIMIT_EXCEEDED',
    'BUILD_ARTIFACTS_NOT_READY',
    'INTERNAL_ERROR',
  ]

  return retryableErrors.includes(code)
}
