'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { AnimatePresence, m, type PanInfo } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { Button } from './button'

export interface MobileSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  snapPoints?: number[] // Percentages of viewport height (0.4 = 40%)
  initialSnap?: number // Index in snapPoints array
  dismissible?: boolean
  showHandle?: boolean
  className?: string
  headerClassName?: string
  contentClassName?: string
  enableInternalScroll?: boolean // Control internal scrolling
  onSnapChange?: (snapIndex: number) => void
}

/**
 * Mobile bottom sheet component with multiple snap points and gesture support
 * Provides native-like sheet behavior for mobile interfaces
 */
export function MobileSheet({
  isOpen,
  onClose,
  title,
  children,
  snapPoints = [0.4, 0.8, 1],
  initialSnap = 1,
  dismissible = true,
  showHandle = true,
  className,
  headerClassName,
  contentClassName,
  enableInternalScroll = true,
  onSnapChange
}: MobileSheetProps) {
  const [snapIndex, setSnapIndex] = useState(initialSnap)
  const [isDragging, setIsDragging] = useState(false)
  const sheetRef = useRef<HTMLDivElement>(null)

  // Ensure snapIndex is within bounds
  const validSnapIndex = Math.max(0, Math.min(snapIndex, snapPoints.length - 1))
  const currentSnapPoint = snapPoints[validSnapIndex]

  const handleSnapChange = useCallback((newSnapIndex: number) => {
    const clampedIndex = Math.max(0, Math.min(newSnapIndex, snapPoints.length - 1))
    setSnapIndex(clampedIndex)
    onSnapChange?.(clampedIndex)
  }, [snapPoints.length, onSnapChange])

  const handleDragStart = () => {
    setIsDragging(true)
  }

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false)
    
    const velocity = info.velocity.y
    const offset = info.offset.y
    const threshold = 50 // Reduced threshold for easier dragging

    // Determine next snap point based on drag direction and velocity
    if (velocity > 300 || offset > threshold) {
      // Dragging down
      if (validSnapIndex === 0 && dismissible) {
        onClose()
      } else if (validSnapIndex > 0) {
        handleSnapChange(validSnapIndex - 1)
      }
    } else if (velocity < -300 || offset < -threshold) {
      // Dragging up
      if (validSnapIndex < snapPoints.length - 1) {
        handleSnapChange(validSnapIndex + 1)
      }
    }

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }
  }

  // Handle backdrop click
  const handleBackdropClick = useCallback(() => {
    if (dismissible) {
      onClose()
    }
  }, [dismissible, onClose])

  // Reset snap index when sheet opens
  useEffect(() => {
    if (isOpen) {
      setSnapIndex(initialSnap)
    }
  }, [isOpen, initialSnap])

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, dismissible, onClose])

  // Prevent body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [isOpen])

  const sheetHeight = currentSnapPoint * window.innerHeight

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={handleBackdropClick}
          />

          {/* Sheet */}
          <m.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={isDragging ? false : { 
              y: `${100 - currentSnapPoint * 100}%`,
              transition: { type: 'spring', damping: 30, stiffness: 300 }
            }}
            exit={{ 
              y: '100%',
              transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1] }
            }}
            drag="y"
            dragConstraints={{
              top: -(snapPoints[snapPoints.length - 1] - snapPoints[0]) * window.innerHeight,
              bottom: (1 - snapPoints[0]) * window.innerHeight
            }}
            dragElastic={0.2}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
              "fixed inset-x-0 bottom-0 bg-gray-800 rounded-t-2xl shadow-2xl z-50",
              "border-t border-gray-700",
              className
            )}
            style={{ height: sheetHeight }}
          >
            {/* Drag Handle */}
            {showHandle && (
              <div className="flex justify-center pt-3 pb-3 px-4 cursor-grab active:cursor-grabbing">
                <div className="w-16 h-1.5 bg-gray-500 rounded-full" />
              </div>
            )}

            {/* Header */}
            {title && (
              <div className={cn(
                "flex items-center justify-between px-4 pb-4",
                showHandle ? "pt-0" : "pt-4",
                "border-b border-gray-700",
                headerClassName
              )}>
                <h3 className="text-lg font-semibold text-white">{title}</h3>
                {dismissible && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClose}
                    className="text-gray-400 hover:text-white p-2"
                  >
                    <Icon name="x" className="w-4 h-4"  />
                  </Button>
                )}
              </div>
            )}

            {/* Content */}
            <div className={cn(
              "flex-1 overflow-hidden",
              contentClassName
            )}>
              <div className={cn(
                "h-full",
                enableInternalScroll ? "overflow-y-auto mobile-scroll" : "overflow-hidden"
              )}>
                {children}
              </div>
            </div>

            {/* Snap Point Indicators */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
              {snapPoints.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleSnapChange(index)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors duration-200",
                    index === validSnapIndex
                      ? "bg-purple-500"
                      : "bg-gray-600 hover:bg-gray-500"
                  )}
                  aria-label={`Snap to position ${index + 1}`}
                />
              ))}
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * Quick action sheet for simple selections
 */
export interface QuickActionSheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  actions: Array<{
    label: string
    icon?: React.ComponentType<{ className?: string }>
    onClick: () => void
    destructive?: boolean
    disabled?: boolean
  }>
}

export function QuickActionSheet({
  isOpen,
  onClose,
  title,
  actions
}: QuickActionSheetProps) {
  return (
    <MobileSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      snapPoints={[0.4]}
      initialSnap={0}
      dismissible={true}
    >
      <div className="p-4 space-y-2">
        {actions.map((action, index) => {
          const Icon = action.icon
          return (
            <button
              key={index}
              onClick={() => {
                action.onClick()
                onClose()
              }}
              disabled={action.disabled}
              className={cn(
                "w-full flex items-center gap-3 p-4 rounded-lg transition-colors",
                "mobile-touch-target text-left",
                action.destructive
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-white hover:bg-gray-700",
                action.disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
              <span className="font-medium">{action.label}</span>
            </button>
          )
        })}
      </div>
    </MobileSheet>
  )
}

/**
 * Confirmation sheet for destructive actions
 */
export interface ConfirmationSheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  destructive?: boolean
}

export function ConfirmationSheet({
  isOpen,
  onClose,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  destructive = false
}: ConfirmationSheetProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <MobileSheet
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      snapPoints={[0.3]}
      initialSnap={0}
      dismissible={true}
    >
      <div className="p-4 space-y-6">
        <p className="text-gray-300 leading-relaxed">{message}</p>
        
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12"
          >
            {cancelLabel}
          </Button>
          
          <Button
            onClick={handleConfirm}
            className={cn(
              "flex-1 h-12",
              destructive
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-purple-600 hover:bg-purple-700 text-white"
            )}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </MobileSheet>
  )
}