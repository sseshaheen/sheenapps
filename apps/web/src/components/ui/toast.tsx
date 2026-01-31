/**
 * Toast Notifications Component
 *
 * Milestone C - Day 2 Morning
 *
 * Wraps Sonner (https://sonner.emilkowal.ski/) for consistent toast notifications.
 * Sonner is built on Radix Toast with better defaults and animations.
 *
 * Features:
 * - Success, error, info, warning variants
 * - Auto-dismiss with configurable duration
 * - Dark mode support via CSS variables
 * - RTL support
 * - Keyboard dismissal (Escape key)
 * - Promise-based loading states
 *
 * Usage:
 * ```typescript
 * import { toast } from '@/components/ui/toast'
 *
 * toast.success('Deployment successful!')
 * toast.error('Failed to connect to server')
 * toast.promise(deployAsync(), {
 *   loading: 'Deploying...',
 *   success: 'Deployed!',
 *   error: 'Deploy failed'
 * })
 * ```
 */

'use client'

import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner'
import { useTheme } from 'next-themes'

/**
 * Toast Toaster Component
 *
 * Add this once at the app level (in layout.tsx)
 */
export function Toaster() {
  const { theme } = useTheme()

  return (
    <SonnerToaster
      theme={theme as 'light' | 'dark' | 'system'}
      position="bottom-right"
      toastOptions={{
        // Default duration: 4 seconds (4000ms)
        duration: 4000,
        // Styling to match our design system
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error: 'group-[.toast]:bg-destructive group-[.toast]:text-destructive-foreground',
          success: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          warning: 'group-[.toast]:bg-yellow-500 group-[.toast]:text-white',
          info: 'group-[.toast]:bg-blue-500 group-[.toast]:text-white',
        },
      }}
      // Close button always visible
      closeButton
      // Rich colors for better visual feedback
      richColors
      // Expand on hover for better UX
      expand={false}
      // Max 3 toasts visible at once
      visibleToasts={3}
      // Gap between toasts
      gap={8}
    />
  )
}

/**
 * Toast API - Re-export from Sonner with TypeScript types
 *
 * Available methods:
 * - toast(message, options?) - Default toast
 * - toast.success(message, options?)
 * - toast.error(message, options?)
 * - toast.info(message, options?)
 * - toast.warning(message, options?)
 * - toast.loading(message, options?)
 * - toast.promise(promise, { loading, success, error })
 * - toast.custom(jsx, options?)
 * - toast.dismiss(id?) - Dismiss specific toast or all toasts
 */
export const toast = sonnerToast

/**
 * Toast options type for convenience
 */
export type ToastOptions = Parameters<typeof sonnerToast>[1]

/**
 * Helper function for toast with action button
 *
 * @example
 * ```typescript
 * toastWithAction('File deleted', {
 *   action: {
 *     label: 'Undo',
 *     onClick: () => restoreFile()
 *   }
 * })
 * ```
 */
export function toastWithAction(
  message: string,
  options: {
    action: {
      label: string
      onClick: () => void
    }
    variant?: 'default' | 'success' | 'error' | 'info' | 'warning'
    duration?: number
  }
) {
  const { action, variant = 'default', duration } = options

  const toastFn = variant === 'default' ? toast : toast[variant]

  return toastFn(message, {
    duration,
    action: {
      label: action.label,
      onClick: action.onClick,
    },
  })
}

/**
 * Helper function for promise-based toasts
 *
 * Shows loading state while promise is pending,
 * then success or error based on promise result.
 *
 * @example
 * ```typescript
 * await toastPromise(
 *   deployProject(),
 *   {
 *     loading: 'Deploying project...',
 *     success: 'Project deployed successfully!',
 *     error: 'Failed to deploy project'
 *   }
 * )
 * ```
 */
export async function toastPromise<T>(
  promise: Promise<T>,
  messages: {
    loading: string
    success: string | ((data: T) => string)
    error: string | ((error: any) => string)
  },
  options?: ToastOptions
): Promise<T> {
  return toast.promise(promise, messages, options)
}
