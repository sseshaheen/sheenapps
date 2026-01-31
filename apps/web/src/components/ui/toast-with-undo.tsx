/**
 * Toast with Undo System
 * Expert-enhanced toast notifications with compensating events
 */

'use client'

import React, { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Icon, type IconName } from './icon'
import { eventHelpers } from '@/utils/event-logger'
import { analyticsConfig } from '@/config/analytics-config'
import { actionContextManager } from '@/utils/event-privacy'

export interface ToastData {
  id: string
  type: 'success' | 'error' | 'info' | 'warning'
  title: string
  description?: string
  duration?: number
  undoable?: boolean
  undoAction?: () => Promise<void> | void
  actionId?: string // For correlating with original action
  projectIds?: string[]
}

interface ToastWithUndoProps {
  toast: ToastData
  onDismiss: (id: string) => void
  onUndo?: (actionId: string) => void
}

const toastIcons: Record<ToastData['type'], IconName> = {
  success: 'check-circle',
  error: 'alert-circle',
  info: 'info',
  warning: 'alert-triangle',
}

const toastStyles = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
}

export function ToastWithUndo({ toast, onDismiss, onUndo }: ToastWithUndoProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [timeLeft, setTimeLeft] = useState(toast.duration || analyticsConfig.undoTimeoutMs)
  const [isUndoing, setIsUndoing] = useState(false)

  const iconName = toastIcons[toast.type]

  // Auto-dismiss timer
  useEffect(() => {
    if (!toast.undoable || toast.duration === 0) return

    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          handleDismiss()
          return 0
        }
        return prev - 1000
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [toast.undoable, toast.duration])

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => {
      onDismiss(toast.id)
      
      // Clean up action context if it exists
      if (toast.actionId) {
        actionContextManager.removeContext(toast.actionId)
      }
    }, 300) // Animation duration
  }

  const handleUndo = async () => {
    if (!toast.undoAction || !toast.actionId || isUndoing) return

    setIsUndoing(true)

    try {
      // Get action context for event correlation
      const context = actionContextManager.getActionContext(toast.actionId)
      
      // Execute undo action
      await toast.undoAction()

      // Emit compensating event (expert requirement)
      eventHelpers.dashboardProjectActionUndo(
        context?.action || 'unknown',
        toast.projectIds || context?.projectIds || [],
        'toast'
      )

      // Call parent undo handler
      onUndo?.(toast.actionId)

      // Dismiss toast after successful undo
      handleDismiss()
    } catch (error) {
      console.error('Undo action failed:', error)
      
      // Emit error event for failed undo
      eventHelpers.dashboardError(
        'undo_failed',
        error,
        'user', // Will be anonymized if needed
        toast.projectIds
      )
    } finally {
      setIsUndoing(false)
    }
  }

  if (!isVisible) return null

  const progressPercent = toast.undoable && timeLeft > 0 
    ? (timeLeft / (toast.duration || analyticsConfig.undoTimeoutMs)) * 100 
    : 0

  return (
    <div
      className={cn(
        "relative flex w-full max-w-sm items-start space-x-3 rounded-lg border p-4 shadow-lg transition-all duration-300",
        toastStyles[toast.type],
        !isVisible && "opacity-0 scale-95"
      )}
      role="alert"
    >
      {/* Progress bar for undoable toasts */}
      {toast.undoable && timeLeft > 0 && (
        <div className="absolute bottom-0 left-0 h-1 bg-black/10 rounded-b-lg overflow-hidden">
          <div 
            className="h-full bg-current transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      {/* Icon */}
      <div className="flex-shrink-0">
        <Icon name={iconName} className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium">{toast.title}</h4>
        {toast.description && (
          <p className="mt-1 text-sm opacity-90">{toast.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center space-x-2">
        {/* Undo button for undoable actions */}
        {toast.undoable && timeLeft > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUndo}
            disabled={isUndoing}
            className="h-8 px-2 text-current hover:bg-current/10"
          >
            <Icon name="undo-2" className="h-4 w-4 mr-1" />
            {isUndoing ? 'Undoing...' : 'Undo'}
          </Button>
        )}

        {/* Dismiss button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-8 w-8 p-0 text-current hover:bg-current/10"
        >
          <Icon name="x" className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </div>
  )
}

// Toast container component
interface ToastContainerProps {
  toasts: ToastData[]
  onDismiss: (id: string) => void
  onUndo?: (actionId: string) => void
  className?: string
}

export function ToastContainer({ toasts, onDismiss, onUndo, className }: ToastContainerProps) {
  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none",
        className
      )}
    >
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastWithUndo
            toast={toast}
            onDismiss={onDismiss}
            onUndo={onUndo}
          />
        </div>
      ))}
    </div>
  )
}

// Toast manager hook
export function useToastWithUndo() {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const addToast = (toast: Omit<ToastData, 'id'>) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const newToast: ToastData = {
      id,
      duration: toast.undoable ? analyticsConfig.undoTimeoutMs : 5000,
      ...toast,
    }

    setToasts(prev => [...prev, newToast])

    // Auto-remove non-undoable toasts
    if (!newToast.undoable) {
      setTimeout(() => {
        removeToast(id)
      }, newToast.duration)
    }

    return id
  }

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  const removeAllToasts = () => {
    setToasts([])
  }

  // Success toast with optional undo
  const success = (
    title: string, 
    description?: string, 
    undoAction?: () => Promise<void> | void,
    actionId?: string,
    projectIds?: string[]
  ) => {
    return addToast({
      type: 'success',
      title,
      description,
      undoable: !!undoAction,
      undoAction,
      actionId,
      projectIds,
    })
  }

  // Error toast (typically not undoable)
  const error = (title: string, description?: string) => {
    return addToast({
      type: 'error',
      title,
      description,
      undoable: false,
      duration: 8000, // Longer duration for errors
    })
  }

  // Info toast
  const info = (title: string, description?: string) => {
    return addToast({
      type: 'info',
      title,
      description,
      undoable: false,
    })
  }

  // Warning toast
  const warning = (title: string, description?: string) => {
    return addToast({
      type: 'warning',
      title,
      description,
      undoable: false,
      duration: 6000,
    })
  }

  return {
    toasts,
    addToast,
    removeToast,
    removeAllToasts,
    success,
    error,
    info,
    warning,
  }
}

// Development helpers
// eslint-disable-next-line no-restricted-globals
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  ;(window as any).ToastWithUndo = {
    useToastWithUndo,
    analyticsConfig,
    actionContextManager
  }
}
