'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { m, AnimatePresence } from '@/components/ui/motion-provider'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'
import type { Hint } from '@/services/hints/hint-engine'

interface SmartHintProps {
  hint: Hint
  onDismiss: () => void
  onAction?: () => void
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center'
  autoHide?: boolean
  autoHideDelay?: number
}

export function SmartHint({ 
  hint, 
  onDismiss, 
  onAction,
  position = 'top-right',
  autoHide = false,
  autoHideDelay = 5000
}: SmartHintProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    // Show hint based on timing
    const showDelay = hint.timing === 'immediate' ? 0 : 
                     hint.timing === 'delayed' ? 2000 : 
                     hint.timing === 'on_idle' ? 3000 : 1000

    const showTimer = setTimeout(() => setIsVisible(true), showDelay)

    return () => clearTimeout(showTimer)
  }, [hint])

  const handleDismiss = useCallback(() => {
    setIsVisible(false)
    setTimeout(() => onDismiss(), 300)
  }, [onDismiss])

  useEffect(() => {
    // Auto-hide functionality
    if (autoHide && isVisible && !isHovered) {
      const hideTimer = setTimeout(() => {
        handleDismiss()
      }, autoHideDelay)

      return () => clearTimeout(hideTimer)
    }
  }, [autoHide, autoHideDelay, isVisible, isHovered, handleDismiss])

  const handleAction = () => {
    hint.content.action?.handler()
    onAction?.()
    handleDismiss()
  }

  const getIcon = () => {
    switch (hint.type) {
      case 'explanation':
        return <Icon name="alert-circle" className="w-5 h-5"  />
      case 'suggestion':
        return <Icon name="alert-circle" className="w-5 h-5"  />
      case 'encouragement':
        return <Icon name="sparkles" className="w-5 h-5"  />
      case 'tutorial':
        return <Icon name="arrow-right" className="w-5 h-5"  />
      case 'warning':
        return <Icon name="alert-circle" className="w-5 h-5"  />
      default:
        return <Icon name="sparkles" className="w-5 h-5"  />
    }
  }

  const getPriorityStyles = () => {
    const baseStyles = "border shadow-lg backdrop-blur-sm"
    
    switch (hint.priority) {
      case 'urgent':
        return `${baseStyles} bg-red-900/90 border-red-500 shadow-red-500/20`
      case 'high':
        return `${baseStyles} bg-purple-900/90 border-purple-500 shadow-purple-500/20`
      case 'medium':
        return `${baseStyles} bg-blue-900/90 border-blue-500 shadow-blue-500/20`
      case 'low':
        return `${baseStyles} bg-gray-800/90 border-gray-600 shadow-gray-600/20`
      default:
        return `${baseStyles} bg-gray-800/90 border-gray-600`
    }
  }

  const getIconColor = () => {
    switch (hint.priority) {
      case 'urgent':
        return 'text-red-400'
      case 'high':
        return 'text-purple-400'
      case 'medium':
        return 'text-blue-400'
      case 'low':
        return 'text-gray-400'
      default:
        return 'text-gray-400'
    }
  }

  const getPositionStyles = () => {
    const positions = {
      'top-right': 'top-4 right-4',
      'top-left': 'top-4 left-4',
      'bottom-right': 'bottom-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'center': 'top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2'
    }
    return positions[position]
  }

  const getAnimationDirection = () => {
    if (position.includes('right')) return { x: 20 }
    if (position.includes('left')) return { x: -20 }
    if (position.includes('center')) return { y: 20, scale: 0.95 }
    return { y: -20 }
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <m.div
          initial={{ opacity: 0, ...getAnimationDirection() }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{ opacity: 0, ...getAnimationDirection() }}
          className={cn(
            "fixed z-50 max-w-sm rounded-lg",
            getPriorityStyles(),
            getPositionStyles()
          )}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{ maxWidth: position === 'center' ? '400px' : '320px' }}
        >
          {/* Priority indicator */}
          {hint.priority === 'urgent' && (
            <m.div
              className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}

          <div className="p-4">
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                hint.priority === 'urgent' && "bg-red-500",
                hint.priority === 'high' && "bg-purple-500",
                hint.priority === 'medium' && "bg-blue-500",
                hint.priority === 'low' && "bg-gray-600"
              )}>
                <div className={getIconColor()}>
                  {getIcon()}
                </div>
              </div>
              
              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-white mb-1 leading-tight">
                  {hint.content.title}
                </h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {hint.content.message}
                </p>
                
                {/* Visual indicators */}
                {hint.content.visual?.highlight && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-blue-300">
                    <Icon name="eye" className="w-3 h-3"  />
                    <span>Elements will be highlighted</span>
                  </div>
                )}
              </div>
              
              {/* Dismiss button */}
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
                className="text-gray-400 hover:text-white p-1 h-auto"
              >
                <Icon name="x" className="w-4 h-4"  />
              </Button>
            </div>
            
            {/* Action buttons */}
            {hint.content.action && (
              <div className="mt-4 flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleAction}
                  className={cn(
                    "flex items-center gap-2",
                    hint.priority === 'urgent' && "bg-red-600 hover:bg-red-700",
                    hint.priority === 'high' && "bg-purple-600 hover:bg-purple-700",
                    hint.priority === 'medium' && "bg-blue-600 hover:bg-blue-700",
                    hint.priority === 'low' && "bg-gray-600 hover:bg-gray-700"
                  )}
                >
                  {hint.content.action.text}
                  <Icon name="arrow-right" className="w-3 h-3"  />
                </Button>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="text-gray-400 hover:text-white"
                >
                  Got it
                </Button>
              </div>
            )}

            {/* Progress indicator for tutorial hints */}
            {hint.type === 'tutorial' && (
              <div className="mt-3 flex items-center gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      i === 0 ? "bg-blue-400" : "bg-gray-600"
                    )}
                  />
                ))}
                <span className="text-xs text-gray-400 ml-2">Step 1 of 3</span>
              </div>
            )}
            
            {/* Auto-hide progress bar */}
            {autoHide && !isHovered && (
              <m.div
                className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500"
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: autoHideDelay / 1000, ease: "linear" }}
              />
            )}
          </div>
          
          {/* Pulse effect for high priority hints */}
          {hint.priority === 'high' && (
            <m.div
              className="absolute inset-0 rounded-lg border border-purple-400 pointer-events-none"
              animate={{ opacity: [0, 0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}
        </m.div>
      )}
    </AnimatePresence>
  )
}

// Hook for managing hints
export function useSmartHints() {
  const [currentHint, setCurrentHint] = useState<Hint | null>(null)
  const [hintQueue, setHintQueue] = useState<Hint[]>([])
  const [hintsShown, setHintsShown] = useState<string[]>([])

  const showHint = (hint: Hint) => {
    // Don't show duplicate hints
    if (hintsShown.includes(hint.id)) {
      return
    }

    if (currentHint) {
      // Queue the hint if one is already showing
      setHintQueue(prev => [...prev, hint])
    } else {
      setCurrentHint(hint)
      setHintsShown(prev => [...prev, hint.id])
    }
  }

  const dismissCurrentHint = () => {
    setCurrentHint(null)
    
    // Show next hint in queue
    if (hintQueue.length > 0) {
      const nextHint = hintQueue[0]
      setHintQueue(prev => prev.slice(1))
      setTimeout(() => {
        setCurrentHint(nextHint)
        setHintsShown(prev => [...prev, nextHint.id])
      }, 500)
    }
  }

  const clearAllHints = () => {
    setCurrentHint(null)
    setHintQueue([])
  }

  const getHintStats = () => ({
    hintsShown: hintsShown.length,
    hintsQueued: hintQueue.length,
    currentHintPriority: currentHint?.priority || null
  })

  return {
    currentHint,
    showHint,
    dismissCurrentHint,
    clearAllHints,
    getHintStats
  }
}

// Specialized hint components
export function TutorialHint({ hint, onDismiss, step, totalSteps }: {
  hint: Hint
  onDismiss: () => void
  step: number
  totalSteps: number
}) {
  return (
    <SmartHint
      hint={{
        ...hint,
        content: {
          ...hint.content,
          title: `${hint.content.title} (${step}/${totalSteps})`
        }
      }}
      onDismiss={onDismiss}
      position="center"
    />
  )
}

export function EncouragementHint({ hint, onDismiss }: {
  hint: Hint
  onDismiss: () => void
}) {
  return (
    <SmartHint
      hint={hint}
      onDismiss={onDismiss}
      position="top-right"
      autoHide={true}
      autoHideDelay={4000}
    />
  )
}

export function UrgentHint({ hint, onDismiss }: {
  hint: Hint
  onDismiss: () => void
}) {
  return (
    <SmartHint
      hint={hint}
      onDismiss={onDismiss}
      position="center"
      autoHide={false}
    />
  )
}