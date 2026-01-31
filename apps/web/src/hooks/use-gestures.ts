'use client'

import { useEffect, useRef, RefObject } from 'react'
import { throttleWithRAF } from './use-throttle'

export interface GestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onPinchStart?: (scale: number) => void
  onPinch?: (scale: number) => void
  onPinchEnd?: (scale: number) => void
  onLongPress?: (event: TouchEvent | MouseEvent) => void
  onDoubleTap?: (event: TouchEvent | MouseEvent) => void
  onTap?: (event: TouchEvent | MouseEvent) => void
  threshold?: number
  longPressDelay?: number
  doubleTapDelay?: number
  preventScrollOnSwipe?: boolean
  enabled?: boolean
}

interface TouchData {
  startX: number
  startY: number
  startTime: number
  currentX: number
  currentY: number
  touches: number
  initialDistance?: number
  initialScale?: number
}

/**
 * Comprehensive gesture recognition hook for mobile interactions
 * Supports swipe, pinch, long press, double tap, and tap gestures
 */
export function useGestures(
  elementRef: RefObject<HTMLElement>,
  options: GestureOptions
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onPinchStart,
    onPinch,
    onPinchEnd,
    onLongPress,
    onDoubleTap,
    onTap,
    threshold = 50,
    longPressDelay = 500,
    doubleTapDelay = 300,
    preventScrollOnSwipe = true,
    enabled = true
  } = options

  const touchDataRef = useRef<TouchData | null>(null)
  const longPressTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const doubleTapTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const tapCountRef = useRef(0)
  const isPinchingRef = useRef(false)

  // Helper function to get distance between two touch points
  const getDistance = (touches: TouchList): number => {
    if (touches.length < 2) return 0
    const touch1 = touches[0]
    const touch2 = touches[1]
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) +
      Math.pow(touch2.clientY - touch1.clientY, 2)
    )
  }

  // Helper function to trigger haptic feedback
  const triggerHaptic = (pattern: number | number[] = 10) => {
    if (navigator.vibrate) {
      navigator.vibrate(pattern)
    }
  }

  const handleTouchStart = (e: TouchEvent) => {
    if (!enabled) return

    const touch = e.touches[0]
    const touches = e.touches.length

    touchDataRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      currentX: touch.clientX,
      currentY: touch.clientY,
      touches,
      initialDistance: touches > 1 ? getDistance(e.touches) : undefined,
      initialScale: 1
    }

    // Handle pinch start
    if (touches === 2 && onPinchStart) {
      isPinchingRef.current = true
      onPinchStart(1)
    }

    // Start long press timer
    if (onLongPress && touches === 1) {
      longPressTimerRef.current = setTimeout(() => {
        if (touchDataRef.current && !isPinchingRef.current) {
          onLongPress(e)
          triggerHaptic([50, 50, 50]) // Triple vibration for long press
        }
      }, longPressDelay)
    }
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (!enabled || !touchDataRef.current) return

    const touch = e.touches[0]
    const touches = e.touches.length

    touchDataRef.current.currentX = touch.clientX
    touchDataRef.current.currentY = touch.clientY

    // Handle pinch gesture
    if (touches === 2 && isPinchingRef.current && touchDataRef.current.initialDistance) {
      const currentDistance = getDistance(e.touches)
      const scale = currentDistance / touchDataRef.current.initialDistance
      
      if (onPinch) {
        onPinch(scale)
      }
      
      // Prevent default to avoid zooming
      e.preventDefault()
      return
    }

    // Cancel long press if moving too much
    if (longPressTimerRef.current) {
      const deltaX = Math.abs(touch.clientX - touchDataRef.current.startX)
      const deltaY = Math.abs(touch.clientY - touchDataRef.current.startY)
      
      if (deltaX > 10 || deltaY > 10) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = undefined
      }
    }

    // Prevent scroll on horizontal swipes if enabled
    if (preventScrollOnSwipe && touches === 1) {
      const deltaX = Math.abs(touch.clientX - touchDataRef.current.startX)
      const deltaY = Math.abs(touch.clientY - touchDataRef.current.startY)
      
      if (deltaX > deltaY && deltaX > 10) {
        e.preventDefault()
      }
    }
  }

  // Throttled version for performance
  const throttledTouchMove = throttleWithRAF(handleTouchMove)

  const handleTouchEnd = (e: TouchEvent) => {
    if (!enabled || !touchDataRef.current) return

    const touch = e.changedTouches[0]
    const touchData = touchDataRef.current
    const deltaX = touch.clientX - touchData.startX
    const deltaY = touch.clientY - touchData.startY
    const deltaTime = Date.now() - touchData.startTime
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    // Clear timers
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = undefined
    }

    // Handle pinch end
    if (isPinchingRef.current) {
      isPinchingRef.current = false
      if (onPinchEnd && touchData.initialDistance) {
        const finalDistance = getDistance(e.touches.length > 0 ? e.touches : e.changedTouches)
        const finalScale = finalDistance / touchData.initialDistance
        onPinchEnd(finalScale)
      }
      touchDataRef.current = null
      return
    }

    // Only process swipes for single touch that moved enough
    if (touchData.touches === 1 && distance > threshold && deltaTime < 300) {
      // Determine swipe direction
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight()
          triggerHaptic(20)
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft()
          triggerHaptic(20)
        }
      } else {
        // Vertical swipe
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown()
          triggerHaptic(20)
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp()
          triggerHaptic(20)
        }
      }
    } 
    // Handle tap gestures for small movements and quick touches
    else if (distance < 10 && deltaTime < 300 && touchData.touches === 1) {
      tapCountRef.current++

      if (tapCountRef.current === 1) {
        // First tap - start double tap timer
        doubleTapTimerRef.current = setTimeout(() => {
          if (tapCountRef.current === 1 && onTap) {
            onTap(e)
            triggerHaptic(10)
          }
          tapCountRef.current = 0
        }, doubleTapDelay)
      } else if (tapCountRef.current === 2) {
        // Double tap detected
        if (doubleTapTimerRef.current) {
          clearTimeout(doubleTapTimerRef.current)
        }
        if (onDoubleTap) {
          onDoubleTap(e)
          triggerHaptic([10, 10]) // Double vibration for double tap
        }
        tapCountRef.current = 0
      }
    }

    touchDataRef.current = null
  }

  // Mouse event handlers for desktop testing
  const handleMouseDown = (e: MouseEvent) => {
    if (!enabled) return

    touchDataRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      currentX: e.clientX,
      currentY: e.clientY,
      touches: 1
    }

    // Start long press timer for mouse
    if (onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        if (touchDataRef.current) {
          onLongPress(e)
        }
      }, longPressDelay)
    }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!enabled || !touchDataRef.current) return

    touchDataRef.current.currentX = e.clientX
    touchDataRef.current.currentY = e.clientY

    // Cancel long press if moving too much
    if (longPressTimerRef.current) {
      const deltaX = Math.abs(e.clientX - touchDataRef.current.startX)
      const deltaY = Math.abs(e.clientY - touchDataRef.current.startY)
      
      if (deltaX > 10 || deltaY > 10) {
        clearTimeout(longPressTimerRef.current)
        longPressTimerRef.current = undefined
      }
    }
  }

  // Throttled version for performance
  const throttledMouseMove = throttleWithRAF(handleMouseMove)

  const handleMouseUp = (e: MouseEvent) => {
    if (!enabled || !touchDataRef.current) return

    const touchData = touchDataRef.current
    const deltaX = e.clientX - touchData.startX
    const deltaY = e.clientY - touchData.startY
    const deltaTime = Date.now() - touchData.startTime
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

    // Clear long press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = undefined
    }

    // Handle mouse "swipes" (drags)
    if (distance > threshold && deltaTime < 500) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > 0 && onSwipeRight) {
          onSwipeRight()
        } else if (deltaX < 0 && onSwipeLeft) {
          onSwipeLeft()
        }
      } else {
        if (deltaY > 0 && onSwipeDown) {
          onSwipeDown()
        } else if (deltaY < 0 && onSwipeUp) {
          onSwipeUp()
        }
      }
    } else if (distance < 10 && deltaTime < 300) {
      // Handle mouse clicks as taps
      tapCountRef.current++

      if (tapCountRef.current === 1) {
        doubleTapTimerRef.current = setTimeout(() => {
          if (tapCountRef.current === 1 && onTap) {
            onTap(e)
          }
          tapCountRef.current = 0
        }, doubleTapDelay)
      } else if (tapCountRef.current === 2) {
        if (doubleTapTimerRef.current) {
          clearTimeout(doubleTapTimerRef.current)
        }
        if (onDoubleTap) {
          onDoubleTap(e)
        }
        tapCountRef.current = 0
      }
    }

    touchDataRef.current = null
  }

  useEffect(() => {
    const element = elementRef.current
    if (!element || !enabled) return

    // Touch events (throttle move for performance)
    element.addEventListener('touchstart', handleTouchStart, { passive: false })
    element.addEventListener('touchmove', throttledTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: false })

    // Mouse events for desktop testing (throttle move for performance)
    element.addEventListener('mousedown', handleMouseDown)
    element.addEventListener('mousemove', throttledMouseMove, { passive: true })
    element.addEventListener('mouseup', handleMouseUp)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', throttledTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
      element.removeEventListener('mousedown', handleMouseDown)
      element.removeEventListener('mousemove', throttledMouseMove)
      element.removeEventListener('mouseup', handleMouseUp)
      
      // Cancel any pending throttled calls
      throttledTouchMove.cancel?.()
      throttledMouseMove.cancel?.()

      // Clean up timers
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
      if (doubleTapTimerRef.current) {
        clearTimeout(doubleTapTimerRef.current)
      }
    }
  }, [
    elementRef,
    enabled,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onPinchStart,
    onPinch,
    onPinchEnd,
    onLongPress,
    onDoubleTap,
    onTap,
    threshold,
    longPressDelay,
    doubleTapDelay,
    preventScrollOnSwipe
  ])

  // Cleanup function
  const cleanup = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
    }
    if (doubleTapTimerRef.current) {
      clearTimeout(doubleTapTimerRef.current)
    }
    touchDataRef.current = null
    isPinchingRef.current = false
    tapCountRef.current = 0
  }

  return { cleanup }
}

/**
 * Simplified swipe-only gesture hook for common use cases
 */
export function useSwipeGestures(
  elementRef: RefObject<HTMLElement>,
  options: {
    onSwipeLeft?: () => void
    onSwipeRight?: () => void
    onSwipeUp?: () => void
    onSwipeDown?: () => void
    threshold?: number
    enabled?: boolean
  }
) {
  return useGestures(elementRef, {
    ...options,
    preventScrollOnSwipe: true
  })
}

/**
 * Long press gesture hook for context menus and actions
 */
export function useLongPress(
  elementRef: RefObject<HTMLElement>,
  onLongPress: (event: TouchEvent | MouseEvent) => void,
  options: {
    delay?: number
    enabled?: boolean
  } = {}
) {
  return useGestures(elementRef, {
    onLongPress,
    longPressDelay: options.delay || 500,
    enabled: options.enabled ?? true
  })
}