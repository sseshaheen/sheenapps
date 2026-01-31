'use client'

import { useState, useEffect } from 'react'

/**
 * Debounce a value - useful for filter inputs to avoid excessive API calls
 * @param value The value to debounce
 * @param delay Delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}

/**
 * Hook for debounced filter with explicit apply button pattern
 * Returns both draft and applied values with handlers
 */
export function useDebouncedFilter<T>(initialValue: T, delay = 300) {
  const [draft, setDraft] = useState<T>(initialValue)
  const [applied, setApplied] = useState<T>(initialValue)
  const debouncedDraft = useDebouncedValue(draft, delay)

  // Auto-apply on debounce
  useEffect(() => {
    setApplied(debouncedDraft)
  }, [debouncedDraft])

  const applyNow = () => {
    setApplied(draft)
  }

  const reset = () => {
    setDraft(initialValue)
    setApplied(initialValue)
  }

  return {
    draft,
    setDraft,
    applied,
    applyNow,
    reset,
    isDirty: draft !== applied,
  }
}
