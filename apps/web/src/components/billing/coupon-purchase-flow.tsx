/**
 * Complete Coupon Purchase Flow Integration
 * Combines all coupon components for easy integration
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 3.3
 */

'use client'

import { useState } from 'react'
import { useAuthStore } from '@/store'
import { usePurchaseRegion } from '@/hooks/use-purchase-region'
import { CouponInput } from './coupon-input'
import { CouponPriceSummary } from './coupon-price-summary'
import { CouponAwarePurchaseButton } from './coupon-aware-purchase-button'
import type { 
  PromotionValidationResponse,
  SupportedCurrency,
  MultiProviderPurchaseRequest 
} from '@/types/billing'

interface CouponPurchaseFlowProps {
  packageKey: string
  packageName: string
  originalAmount: number
  currency: SupportedCurrency
  purchaseParams: Omit<MultiProviderPurchaseRequest, 'idempotencyKey'>
  locale?: string
  onSuccess?: () => void
  onError?: (error: any) => void
  className?: string
  showPriceSummary?: boolean
}

export function CouponPurchaseFlow({
  packageKey,
  packageName,
  originalAmount,
  currency,
  purchaseParams,
  locale = 'en',
  onSuccess,
  onError,
  className,
  showPriceSummary = true
}: CouponPurchaseFlowProps) {
  const { user } = useAuthStore()
  const region = usePurchaseRegion()
  const [validation, setValidation] = useState<PromotionValidationResponse | null>(null)

  if (!user) {
    return null // Don't show for unauthenticated users
  }

  return (
    <div className={className}>
      {/* Coupon Input */}
      <div className="mb-4">
        <CouponInput
          packageKey={packageKey}
          currency={currency}
          region={region}
          totalAmount={originalAmount}
          onValidation={setValidation}
          locale={locale}
        />
      </div>

      {/* Price Summary */}
      {showPriceSummary && (
        <div className="mb-6">
          <CouponPriceSummary
            originalAmount={originalAmount}
            validation={validation}
            currency={currency}
            packageName={packageName}
          />
        </div>
      )}

      {/* Purchase Button */}
      <CouponAwarePurchaseButton
        validation={validation}
        purchaseParams={purchaseParams}
        userId={user.id}
        originalAmount={originalAmount}
        currency={currency}
        locale={locale}
        onSuccess={onSuccess}
        onError={onError}
      />
    </div>
  )
}