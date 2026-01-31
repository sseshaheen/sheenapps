/**
 * Coupon Price Summary Component
 * Shows discount breakdown in pricing display
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 3.3
 */

'use client'

import { cn } from '@/lib/utils'
import { formatCurrency } from '@/types/billing'
import type { 
  PromotionValidationResponse,
  SupportedCurrency 
} from '@/types/billing'

interface CouponPriceSummaryProps {
  originalAmount: number
  validation?: PromotionValidationResponse | null
  currency: SupportedCurrency
  className?: string
  packageName?: string
}

export function CouponPriceSummary({
  originalAmount,
  validation,
  currency,
  className,
  packageName = 'Package'
}: CouponPriceSummaryProps) {
  const hasDiscount = validation?.valid && validation.discountMinorUnits && validation.discountMinorUnits > 0
  const finalAmount = validation?.finalAmountMinorUnits || originalAmount

  return (
    <div className={cn("space-y-2 text-sm", className)}>
      {/* Original price */}
      <div className="flex justify-between items-center">
        <span className="text-gray-600 dark:text-gray-400">
          {packageName}:
        </span>
        <span className={cn(
          hasDiscount && "text-gray-500 dark:text-gray-500 line-through"
        )}>
          {formatCurrency(originalAmount, currency)}
        </span>
      </div>

      {/* Discount line */}
      {hasDiscount && (
        <>
          <div className="flex justify-between items-center">
            <span className="text-green-600 dark:text-green-400 flex items-center">
              <svg className="w-4 h-4 me-1" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Discount ({validation.discountType === 'percentage' 
                ? `${validation.discountValue}%` 
                : 'Coupon'
              }):
            </span>
            <span className="text-green-600 dark:text-green-400 font-medium">
              -{formatCurrency(validation.discountMinorUnits!, currency)}
            </span>
          </div>

          {/* Separator line */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
            <div className="flex justify-between items-center font-medium text-base">
              <span>Total:</span>
              <span className="text-green-600 dark:text-green-400">
                {formatCurrency(finalAmount, currency)}
              </span>
            </div>
          </div>

          {/* Savings message */}
          <div className="text-center">
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">
              You save {formatCurrency(validation.discountMinorUnits!, currency)}!
            </p>
          </div>
        </>
      )}

      {/* No discount - just show total */}
      {!hasDiscount && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
          <div className="flex justify-between items-center font-medium text-base">
            <span>Total:</span>
            <span>{formatCurrency(finalAmount, currency)}</span>
          </div>
        </div>
      )}
    </div>
  )
}