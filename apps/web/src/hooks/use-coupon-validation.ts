/**
 * Coupon Validation Hook
 * Uses useMutation for imperative validation (per expert feedback)
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 2.1
 */

'use client'

import { useMutation } from '@tanstack/react-query'
import { useRef, useEffect, useState } from 'react'
import { useDebouncedCallback } from '@/hooks/use-throttle'
import { PromotionAPIClient } from '@/services/promotion-api-client'
import { COUPON_CONFIG } from '@/config/discount-coupons'
import type { 
  PromotionValidationResponse,
  SupportedCurrency, 
  RegionCode 
} from '@/types/billing'

export function useCouponValidation(
  packageKey: string,
  currency: SupportedCurrency,
  region: RegionCode,
  totalAmount: number
) {
  const abortControllerRef = useRef<AbortController | null>(null)
  const [lastValidatedCode, setLastValidatedCode] = useState<string>()
  
  // Use mutation for imperative validation (FIX: not useQuery with enabled:false)
  const mutation = useMutation({
    mutationKey: ['coupon-validation', packageKey, currency, region, totalAmount],
    mutationFn: async ({ code, signal }: { code: string; signal?: AbortSignal }) => {
      // Trim whitespace before sending (but keep original for display)
      const trimmedCode = code.trim().replace(/\s+/g, ' ')
      
      return PromotionAPIClient.validateCode(trimmedCode, packageKey, {
        currency,
        region,
        totalMinorUnits: totalAmount,
        signal
      })
    },
    onSuccess: (data, variables) => {
      setLastValidatedCode(variables.code)
    },
    onError: (error: any) => {
      // Map 429 rate limit to friendly message
      if (error.status === 429) {
        throw new Error('Too many attempts. Please wait a moment and try again.')
      }
    }
  })
  
  // CRITICAL: Clear validation when inputs change (prevent token drift)
  useEffect(() => {
    if (lastValidatedCode) {
      // Clear only the specific validation, not all (FIX: precise cache clearing)
      mutation.reset()
      setLastValidatedCode(undefined)
    }
  }, [packageKey, currency, region, totalAmount, mutation])
  
  // Debounced validation with abort support
  const validateDebounced = useDebouncedCallback(
    (code: string) => {
      // Abort previous request to prevent race conditions
      abortControllerRef.current?.abort()
      
      if (!code.trim()) {
        mutation.reset()
        return
      }
      
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController()
      
      // Execute mutation with abort signal
      mutation.mutate({ 
        code, 
        signal: abortControllerRef.current.signal 
      })
    },
    COUPON_CONFIG.validation.debounceMs
  )
  
  // Cleanup on unmount
  useEffect(() => {
    return () => abortControllerRef.current?.abort()
  }, [])
  
  return {
    validate: validateDebounced,
    validation: mutation.data,
    isValidating: mutation.isPending,
    error: mutation.error,
    reset: () => mutation.reset()
  }
}