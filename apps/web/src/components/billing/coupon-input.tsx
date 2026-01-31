/**
 * Accessible Coupon Input Component
 * Real-time validation with screen reader support
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 3.1
 */

'use client'

import { useState, useCallback, useEffect } from 'react'
import DOMPurify from 'dompurify'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useCouponValidation } from '@/hooks/use-coupon-validation'
import { mapCouponErrorToMultiProvider } from '@/utils/coupon-error-mapping'
import { formatCurrency } from '@/types/billing'
import type { 
  PromotionValidationResponse,
  SupportedCurrency, 
  RegionCode 
} from '@/types/billing'

interface CouponInputProps {
  packageKey: string
  currency: SupportedCurrency
  region: RegionCode
  totalAmount: number
  onValidation?: (validation: PromotionValidationResponse | null) => void
  className?: string
  locale?: string
}

export function CouponInput({
  packageKey,
  currency,
  region,
  totalAmount,
  onValidation,
  className,
  locale = 'en'
}: CouponInputProps) {
  const t = useTranslations('billing')
  const [inputValue, setInputValue] = useState('')
  
  const { validate, validation, isValidating, error, reset } = useCouponValidation(
    packageKey,
    currency,
    region,
    totalAmount
  )

  // Notify parent when validation changes
  const handleValidationChange = useCallback((newValidation: PromotionValidationResponse | null) => {
    onValidation?.(newValidation)
  }, [onValidation])

  // Handle input changes with validation
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    
    if (value.trim()) {
      validate(value)
    } else {
      reset()
      handleValidationChange(null)
    }
  }

  // Update parent when validation succeeds
  useEffect(() => {
    if (validation?.valid) {
      handleValidationChange(validation)
    } else if (validation && !validation.valid) {
      handleValidationChange(null)
    }
  }, [validation, handleValidationChange])

  // Map error to our error system
  const mappedError = error ? mapCouponErrorToMultiProvider(error) : null

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="Enter promotion code"
          aria-label="Promotion code"
          aria-invalid={!!error}
          aria-describedby="coupon-status coupon-help"
          className={cn(
            error && "border-red-500 focus-visible:ring-red-500",
            validation?.valid && "border-green-500 focus-visible:ring-green-500"
          )}
        />
        
        {/* Loading indicator */}
        {isValidating && (
          <div className="absolute inset-y-0 end-0 flex items-center pe-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-purple-600" />
          </div>
        )}
      </div>
      
      {/* Live region for screen readers (accessibility) */}
      <div 
        id="coupon-status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {isValidating && 'Validating coupon code'}
        {validation?.valid && validation.discountMinorUnits && (
          // Include amount in words for clarity (e.g., "10 US dollars")
          `Discount of ${new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            currencyDisplay: 'name' // Shows "US dollars" instead of "$"
          }).format(validation.discountMinorUnits / 100)} applied`
        )}
        {mappedError && `Invalid or expired coupon code: ${mappedError.message}`}
      </div>
      
      {/* Visual feedback for valid coupon */}
      {validation?.valid && validation.discountMinorUnits && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 dark:bg-green-950/20 dark:border-green-800">
          <p className="text-sm text-green-800 dark:text-green-200 flex items-center">
            <svg className="w-4 h-4 me-2" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            Discount: {formatCurrency(validation.discountMinorUnits, currency)}
          </p>
          {validation.metadata?.promotionName && (
            <p className="text-xs text-green-600 dark:text-green-300 mt-1">
              {DOMPurify.sanitize(validation.metadata.promotionName)}
            </p>
          )}
        </div>
      )}
      
      {/* Error display */}
      {mappedError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 dark:bg-red-950/20 dark:border-red-800">
          <p className="text-sm text-red-800 dark:text-red-200 flex items-center">
            <svg className="w-4 h-4 me-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            {mappedError.message}
          </p>
          {mappedError.actionRequired && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {mappedError.actionRequired}
            </p>
          )}
        </div>
      )}
      
      {/* Help text */}
      <p id="coupon-help" className="text-xs text-gray-500 dark:text-gray-400">
        Enter a valid promotion code to apply a discount
      </p>
    </div>
  )
}