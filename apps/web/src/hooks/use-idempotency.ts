/**
 * Idempotency Management Hook
 * Generates new keys for each user action (Pay button click)
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 2.2
 */

'use client'

import { useState, useCallback } from 'react'

export function useIdempotency() {
  const [currentKey, setCurrentKey] = useState<string>()
  
  const generateNewKey = useCallback(() => {
    const key = crypto.randomUUID()
    setCurrentKey(key)
    return key
  }, [])
  
  // Generate new key for each user action (Pay click)
  return { currentKey, generateNewKey }
}