/**
 * useToast Hook
 *
 * Milestone C - Day 2 Morning
 *
 * Convenience hook for toast notifications with better TypeScript types
 * and integration with our error handling system.
 *
 * Usage:
 * ```typescript
 * const { toast, success, error, loading, promise } = useToast()
 *
 * // Simple success toast
 * success('Project deployed!')
 *
 * // Error toast with action
 * error('Deploy failed', {
 *   action: { label: 'Retry', onClick: () => retryDeploy() }
 * })
 *
 * // Promise-based loading toast
 * await promise(deployAsync(), {
 *   loading: 'Deploying...',
 *   success: 'Deployed!',
 *   error: 'Deploy failed'
 * })
 * ```
 */

'use client'

import type { ErrorInfo } from '@/lib/errors/error-messages'
import { useCallback } from 'react'
import { toast as sonnerToast, type ExternalToast } from 'sonner'

/**
 * Toast options extending Sonner's ExternalToast
 */
export interface ToastOptions extends ExternalToast {
  /** Optional action button */
  action?: {
    label: string
    onClick: () => void
  }
  /** Duration in milliseconds (default: 4000) */
  duration?: number
}

/**
 * Promise toast messages
 */
export interface PromiseMessages<T = any> {
  loading: string
  success: string | ((data: T) => string)
  error: string | ((error: any) => string)
}

/**
 * useToast Hook
 *
 * Provides convenient methods for showing toast notifications
 */
export function useToast() {
  /**
   * Show success toast
   */
  const success = useCallback((message: string, options?: ToastOptions) => {
    return sonnerToast.success(message, options)
  }, [])

  /**
   * Show error toast
   */
  const error = useCallback((message: string, options?: ToastOptions) => {
    return sonnerToast.error(message, options)
  }, [])

  /**
   * Show info toast
   */
  const info = useCallback((message: string, options?: ToastOptions) => {
    return sonnerToast.info(message, options)
  }, [])

  /**
   * Show warning toast
   */
  const warning = useCallback((message: string, options?: ToastOptions) => {
    return sonnerToast.warning(message, options)
  }, [])

  /**
   * Show loading toast
   */
  const loading = useCallback((message: string, options?: ToastOptions) => {
    return sonnerToast.loading(message, options)
  }, [])

  /**
   * Show default toast
   */
  const toast = useCallback((message: string, options?: ToastOptions) => {
    return sonnerToast(message, options)
  }, [])

  /**
   * Promise-based toast
   *
   * Shows loading state while promise is pending,
   * then success or error based on result.
   *
   * @example
   * ```typescript
   * await promise(deployProject(), {
   *   loading: 'Deploying...',
   *   success: 'Deployed!',
   *   error: 'Deploy failed'
   * })
   * ```
   */
  const promise = useCallback(
    <T,>(
      promiseOrFn: Promise<T> | (() => Promise<T>),
      messages: PromiseMessages<T>
    ): Promise<T> => {
      const result = sonnerToast.promise(promiseOrFn, messages)
      return typeof result === 'object' && result && 'unwrap' in result
        ? result.unwrap()
        : Promise.resolve(result as unknown as T)
    },
    []
  )

  /**
   * Dismiss a toast by ID or dismiss all toasts
   */
  const dismiss = useCallback((toastId?: string | number) => {
    sonnerToast.dismiss(toastId)
  }, [])

  /**
   * Show error toast from ErrorInfo
   *
   * Integrates with our centralized error system from Day 1 Afternoon.
   * Displays error title and message, optionally with action button.
   *
   * @example
   * ```typescript
   * const errorInfo = getErrorInfo('NETWORK_ERROR')
   * showError(errorInfo, { onRetry: () => retryRequest() })
   * ```
   */
  const showError = useCallback(
    (
      errorInfo: ErrorInfo,
      callbacks?: {
        onRetry?: () => void
        onNavigate?: () => void
        onContact?: () => void
      }
    ) => {
      const action =
        errorInfo.recoveryAction &&
        errorInfo.recoveryAction !== 'none' &&
        errorInfo.actionLabel
          ? {
              label: errorInfo.actionLabel,
              onClick: () => {
                switch (errorInfo.recoveryAction) {
                  case 'retry':
                    callbacks?.onRetry?.()
                    break
                  case 'navigate':
                    callbacks?.onNavigate?.()
                    break
                  case 'contact':
                    callbacks?.onContact?.()
                    break
                  case 'reload':
                    window.location.reload()
                    break
                }
              },
            }
          : undefined

      return sonnerToast.error(errorInfo.title, {
        description: errorInfo.message,
        action,
        duration: 6000, // Errors get longer duration (6s)
      })
    },
    []
  )

  /**
   * Show success toast with custom description
   *
   * Useful for success messages that need additional context.
   *
   * @example
   * ```typescript
   * showSuccess('Deployed!', 'Your app is now live at example.com')
   * ```
   */
  const showSuccess = useCallback(
    (title: string, description?: string, options?: ToastOptions) => {
      return sonnerToast.success(title, {
        description,
        ...options,
      })
    },
    []
  )

  /**
   * Show info toast with custom description
   */
  const showInfo = useCallback(
    (title: string, description?: string, options?: ToastOptions) => {
      return sonnerToast.info(title, {
        description,
        ...options,
      })
    },
    []
  )

  /**
   * Show warning toast with custom description
   */
  const showWarning = useCallback(
    (title: string, description?: string, options?: ToastOptions) => {
      return sonnerToast.warning(title, {
        description,
        ...options,
      })
    },
    []
  )

  return {
    // Basic methods
    toast,
    success,
    error,
    info,
    warning,
    loading,
    promise,
    dismiss,

    // Enhanced methods with description
    showSuccess,
    showInfo,
    showWarning,
    showError,
  }
}

/**
 * Type for the toast return value (for managing toast IDs)
 */
export type ToastId = string | number
