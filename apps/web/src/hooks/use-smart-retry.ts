/**
 * Smart Retry Hook for Structured Error Handling
 * 
 * Provides intelligent retry logic based on error type and timing
 * Includes countdown timers and automatic retries for appropriate error types
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import type { CleanBuildEvent } from '@/types/build-events'
import { StructuredErrorService } from '@/services/structured-error-handling'

interface SmartRetryOptions {
  /** Function to call when retry is triggered */
  retryFn: () => Promise<void>
  /** Build event with potential error information */
  event?: CleanBuildEvent
  /** Enable automatic retry when countdown reaches zero */
  autoRetryEnabled?: boolean
}

export interface SmartRetryReturn {
  /** Manually trigger a retry */
  retry: () => Promise<void>
  /** Whether this error can be retried */
  canRetry: boolean
  /** Time remaining before retry is available (ms) */
  retryDelay: number
  /** Whether a retry is currently in progress */
  isRetrying: boolean
  /** Formatted countdown text for display */
  countdownText: string
  /** Whether countdown is active */
  isCountingDown: boolean
}

export function useSmartRetry({
  retryFn,
  event,
  autoRetryEnabled = false
}: SmartRetryOptions): SmartRetryReturn {
  const [isRetrying, setIsRetrying] = useState(false)
  const [retryDelay, setRetryDelay] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const autoRetryTriggeredRef = useRef(false)
  
  const canRetry = event ? StructuredErrorService.isRetryableError(event) : false
  const initialDelay = event ? StructuredErrorService.getRetryDelay(event) : 0
  
  // Initialize retry delay
  useEffect(() => {
    if (event && canRetry) {
      setRetryDelay(initialDelay)
      autoRetryTriggeredRef.current = false
    } else {
      setRetryDelay(0)
    }
  }, [event, canRetry, initialDelay])

  // Countdown timer
  useEffect(() => {
    if (retryDelay > 0) {
      intervalRef.current = setInterval(() => {
        setRetryDelay(prev => {
          const newDelay = Math.max(0, prev - 1000)
          
          // Auto-retry when countdown reaches zero
          if (newDelay === 0 && autoRetryEnabled && !autoRetryTriggeredRef.current) {
            autoRetryTriggeredRef.current = true
            // Trigger retry on next tick to avoid state update conflicts
            setTimeout(() => retry(), 100)
          }
          
          return newDelay
        })
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = undefined
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [retryDelay, autoRetryEnabled])

  // Manual retry function
  const retry = useCallback(async () => {
    if (!canRetry || isRetrying) return
    
    setIsRetrying(true)
    autoRetryTriggeredRef.current = true
    
    try {
      await retryFn()
      setRetryDelay(0) // Clear countdown on successful retry
    } catch (error) {
      console.error('Retry failed:', error)
      // Reset for potential future retries
      autoRetryTriggeredRef.current = false
    } finally {
      setIsRetrying(false)
    }
  }, [retryFn, canRetry, isRetrying])

  // Formatted countdown text
  const countdownText = StructuredErrorService.formatCountdownText(retryDelay)
  const isCountingDown = retryDelay > 0

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  return {
    retry,
    canRetry,
    retryDelay,
    isRetrying,
    countdownText,
    isCountingDown
  }
}

/**
 * Hook for components that need basic retry functionality without countdown
 */
export function useBasicRetry(retryFn: () => Promise<void>) {
  const [isRetrying, setIsRetrying] = useState(false)

  const retry = useCallback(async () => {
    if (isRetrying) return
    
    setIsRetrying(true)
    try {
      await retryFn()
    } catch (error) {
      console.error('Retry failed:', error)
    } finally {
      setIsRetrying(false)
    }
  }, [retryFn, isRetrying])

  return { retry, isRetrying }
}