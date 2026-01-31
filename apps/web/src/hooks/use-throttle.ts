/**
 * Throttling Utilities for Performance Optimization
 * 
 * Implements requestAnimationFrame-based throttling for event handlers
 * Prevents excessive re-renders and improves performance
 */

import { useRef, useEffect, useState } from 'react'

/**
 * Throttle function using requestAnimationFrame for 60fps performance
 * More accurate than setTimeout for visual updates
 */
export function throttleWithRAF<T extends (...args: any[]) => any>(
  callback: T,
  context?: any
): ThrottledFunction<T> {
  let rafId: number | null = null
  let lastArgs: Parameters<T> | null = null

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args
    
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        callback.apply(context, lastArgs!)
        rafId = null
        lastArgs = null
      })
    }
  }

  // Cleanup function
  throttled.cancel = () => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
      lastArgs = null
    }
  }

  return throttled as ThrottledFunction<T>
}

/**
 * Traditional throttle with configurable delay
 * Useful for non-visual updates or specific timing requirements
 */
export function throttle<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 16, // Default to ~60fps
  context?: any
): ThrottledFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let lastArgs: Parameters<T> | null = null
  let lastExecTime = 0

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now()
    lastArgs = args

    if (now - lastExecTime >= delay) {
      // Execute immediately if enough time has passed
      callback.apply(context, args)
      lastExecTime = now
    } else if (timeoutId === null) {
      // Schedule execution for later
      timeoutId = setTimeout(() => {
        callback.apply(context, lastArgs!)
        lastExecTime = Date.now()
        timeoutId = null
        lastArgs = null
      }, delay - (now - lastExecTime))
    }
  }

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
      lastArgs = null
    }
  }

  return throttled as ThrottledFunction<T>
}

/**
 * Hook for throttled callbacks using requestAnimationFrame
 * Automatically handles cleanup on component unmount
 *
 * Note: We use a ref + useEffect pattern instead of useCallback because
 * useCallback does not accept undefined as a valid function type.
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T | undefined,
  deps: React.DependencyList = []
): T | undefined {
  const throttledRef = useRef<T | undefined>(undefined)
  const callbackRef = useRef<T | undefined>(callback)

  // Keep callback ref in sync
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!callback) {
      throttledRef.current = undefined
      return
    }

    // Create throttled wrapper that calls through ref for latest callback
    const throttled = throttleWithRAF((...args: any[]) => {
      return callbackRef.current?.(...args)
    })
    throttledRef.current = throttled as unknown as T

    return () => {
      throttled.cancel?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback !== undefined, ...deps])

  useEffect(() => {
    return () => {
      (throttledRef.current as any)?.cancel?.()
    }
  }, [])

  return throttledRef.current
}

/**
 * Hook for throttled callbacks with custom delay
 * Useful for non-visual updates or specific timing needs
 */
export function useThrottledCallbackWithDelay<T extends (...args: any[]) => any>(
  callback: T | undefined,
  delay: number = 16,
  deps: React.DependencyList = []
): T | undefined {
  const throttledRef = useRef<T | undefined>(undefined)
  const callbackRef = useRef<T | undefined>(callback)

  // Keep callback ref in sync
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!callback) {
      throttledRef.current = undefined
      return
    }

    // Create throttled wrapper that calls through ref for latest callback
    const throttled = throttle((...args: any[]) => {
      return callbackRef.current?.(...args)
    }, delay)
    throttledRef.current = throttled as unknown as T

    return () => {
      throttled.cancel?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback !== undefined, delay, ...deps])

  useEffect(() => {
    return () => {
      (throttledRef.current as any)?.cancel?.()
    }
  }, [])

  return throttledRef.current
}

/**
 * Hook for throttled resize events
 * Optimized for window resize handling
 */
export function useThrottledResize(
  callback: () => void,
  delay: number = 16 // 60fps by default
): void {
  const throttledCallback = useThrottledCallbackWithDelay(callback, delay)

  useEffect(() => {
    if (!throttledCallback) return

    const handleResize = () => {
      throttledCallback()
    }

    window.addEventListener('resize', handleResize, { passive: true })
    window.addEventListener('orientationchange', handleResize, { passive: true })

    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [throttledCallback])
}

/**
 * Hook for throttled scroll events
 * Optimized for scroll handling with passive listeners
 */
export function useThrottledScroll(
  callback: (event: Event) => void,
  element?: HTMLElement | Window,
  delay: number = 16
): void {
  const throttledCallback = useThrottledCallbackWithDelay(callback, delay)

  useEffect(() => {
    if (!throttledCallback) return

    const target = element || window
    const handleScroll = (event: Event) => {
      throttledCallback(event)
    }

    target.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      target.removeEventListener('scroll', handleScroll)
    }
  }, [throttledCallback, element])
}

/**
 * Hook for throttled pointer/touch move events
 * Optimized for drag, hover, and gesture handling
 */
export function useThrottledPointerMove(
  callback: (event: PointerEvent | MouseEvent | TouchEvent) => void,
  element?: HTMLElement,
  delay: number = 16
): void {
  const throttledCallback = useThrottledCallbackWithDelay(callback, delay)

  useEffect(() => {
    if (!throttledCallback || !element) return

    const handlePointerMove = (event: PointerEvent) => {
      throttledCallback(event)
    }

    const handleMouseMove = (event: MouseEvent) => {
      throttledCallback(event)
    }

    const handleTouchMove = (event: TouchEvent) => {
      throttledCallback(event)
    }

    // Use pointer events if available, fall back to mouse/touch
    const htmlElement = element as HTMLElement
    const supportsPointerEvents = 'onpointermove' in htmlElement
    
    if (supportsPointerEvents) {
      (htmlElement as HTMLElement).addEventListener('pointermove', handlePointerMove, { passive: true })
    } else {
      (htmlElement as HTMLElement).addEventListener('mousemove', handleMouseMove, { passive: true })
      ;(htmlElement as HTMLElement).addEventListener('touchmove', handleTouchMove, { passive: false }) // Not passive for gesture control
    }

    return () => {
      (htmlElement as HTMLElement).removeEventListener('pointermove', handlePointerMove)
      ;(htmlElement as HTMLElement).removeEventListener('mousemove', handleMouseMove)
      ;(htmlElement as HTMLElement).removeEventListener('touchmove', handleTouchMove)
    }
  }, [throttledCallback, element])
}

/**
 * Debounce function for events that should only fire after inactivity
 * Useful for search inputs, resize end events, etc.
 */
export function debounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
  context?: any
): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      callback.apply(context, args)
      timeoutId = null
    }, delay)
  }

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  return debounced as unknown as T
}

/**
 * Hook for debounced callbacks
 * Automatically handles cleanup on component unmount
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T | undefined,
  delay: number,
  deps: React.DependencyList = []
): T | undefined {
  const debouncedRef = useRef<T | undefined>(undefined)
  const callbackRef = useRef<T | undefined>(callback)

  // Keep callback ref in sync
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    if (!callback) {
      debouncedRef.current = undefined
      return
    }

    // Create debounced wrapper that calls through ref for latest callback
    const debounced = debounce((...args: any[]) => {
      return callbackRef.current?.(...args)
    }, delay)
    debouncedRef.current = debounced as T

    return () => {
      (debounced as any)?.cancel?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callback !== undefined, delay, ...deps])

  useEffect(() => {
    return () => {
      (debouncedRef.current as any)?.cancel?.()
    }
  }, [])

  return debouncedRef.current
}

/**
 * Performance utilities for measuring and optimizing event handlers
 */
export const PerformanceUtils = {
  /**
   * Measure the performance of an event handler
   */
  measureHandler: <T extends (...args: any[]) => any>(
    handler: T,
    name: string = 'handler'
  ): T => {
    return ((...args: Parameters<T>) => {
      const start = performance.now()
      const result = handler(...args)
      const end = performance.now()
      
      if (end - start > 16) { // Warn if handler takes longer than one frame
        console.warn(`${name} took ${(end - start).toFixed(2)}ms (>16ms frame budget)`)
      }
      
      return result
    }) as T
  },

  /**
   * Check if RAF throttling is supported
   */
  supportsRAF: typeof requestAnimationFrame !== 'undefined',

  /**
   * Get the current frame rate
   */
  measureFPS: () => {
    let lastTime = performance.now()
    let frameCount = 0
    let fps = 0

    const measure = () => {
      const currentTime = performance.now()
      frameCount++

      if (currentTime - lastTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (currentTime - lastTime))
        frameCount = 0
        lastTime = currentTime
      }

      requestAnimationFrame(measure)
    }

    requestAnimationFrame(measure)
    
    return () => fps
  }
}

/**
 * Hook for throttling value updates
 * Returns the latest value, but only updates at most once per delay period
 * Useful for reducing re-renders when values change rapidly (e.g., build progress)
 *
 * @param value - The value to throttle
 * @param delay - Throttle delay in milliseconds (0 = no throttling)
 * @returns The throttled value
 */
export function useThrottledValue<T>(value: T, delay: number): T {
  const [throttledValue, setThrottledValue] = useState<T>(value)
  const lastUpdateTime = useRef<number>(0)
  const pendingValue = useRef<T>(value)
  const timeoutId = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    pendingValue.current = value

    // If delay is 0, skip state updates to avoid infinite loop
    // When delay is 0, we return `value` directly at the end
    if (delay === 0) {
      return
    }

    const now = Date.now()
    const timeSinceLastUpdate = now - lastUpdateTime.current

    if (timeSinceLastUpdate >= delay) {
      // Enough time has passed, update immediately
      setThrottledValue(value)
      lastUpdateTime.current = now
    } else if (timeoutId.current === null) {
      // Schedule update for later
      timeoutId.current = setTimeout(() => {
        setThrottledValue(pendingValue.current)
        lastUpdateTime.current = Date.now()
        timeoutId.current = null
      }, delay - timeSinceLastUpdate)
    }

    return () => {
      if (timeoutId.current !== null) {
        clearTimeout(timeoutId.current)
        timeoutId.current = null
      }
    }
  }, [value, delay])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutId.current !== null) {
        clearTimeout(timeoutId.current)
      }
    }
  }, [])

  // When delay is 0, return value directly (no throttling, no state)
  // This avoids the setState infinite loop when parent recreates object references
  return delay === 0 ? value : throttledValue
}

// Type exports for better IDE support
export type ThrottledFunction<T extends (...args: any[]) => any> = T & {
  cancel: () => void
}

export type DebouncedFunction<T extends (...args: any[]) => any> = T & {
  cancel: () => void
}