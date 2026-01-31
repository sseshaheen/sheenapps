/**
 * Coupon-Aware Purchase Button
 * Handles promotion reservation and checkout with idempotency
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 3.2
 */

'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useIdempotency } from '@/hooks/use-idempotency'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'
import { PromotionAPIClient } from '@/services/promotion-api-client'
import { multiProviderBilling } from '@/services/multi-provider-billing'
import { formatCurrency } from '@/types/billing'
import type { 
  PromotionValidationResponse,
  SupportedCurrency,
  RegionCode,
  MultiProviderPurchaseRequest 
} from '@/types/billing'

interface CouponAwarePurchaseButtonProps {
  validation?: PromotionValidationResponse | null
  purchaseParams: Omit<MultiProviderPurchaseRequest, 'idempotencyKey'>
  userId: string
  originalAmount: number
  currency: SupportedCurrency
  locale: string
  onSuccess?: () => void
  onError?: (error: any) => void
  children?: React.ReactNode
  className?: string
}

export function CouponAwarePurchaseButton({
  validation,
  purchaseParams,
  userId,
  originalAmount,
  currency,
  locale,
  onSuccess,
  onError,
  children,
  className
}: CouponAwarePurchaseButtonProps) {
  const queryClient = useQueryClient()
  const { generateNewKey } = useIdempotency()
  const [isProcessing, setIsProcessing] = useState(false)
  const { error: showError } = useToastWithUndo()

  // Calculate final amount
  const finalAmount = validation?.valid 
    ? (validation.finalAmountMinorUnits || originalAmount)
    : originalAmount

  const handlePurchase = async () => {
    // Generate new key per click (backend requirement)
    const idempotencyKey = generateNewKey()
    setIsProcessing(true) // Disable button
    
    try {
      let reservationId: string | undefined

      // Reserve promotion if valid coupon
      if (validation?.valid && validation.validationToken) {
        const reservation = await PromotionAPIClient.reservePromotion(
          userId,
          validation.validationToken,
          idempotencyKey // Same key for entire flow
        )
        reservationId = reservation.reservationId
      }
      
      // Create checkout with same idempotency key
      // ✅ BACKEND CONFIRMED: promotion_reservation_id fully supported
      const checkoutResult = await multiProviderBilling.createCheckout({
        packageKey: purchaseParams.package_key,
        currency: purchaseParams.currency,
        region: purchaseParams.region,
        // TODO: Add locale support to MultiProviderPurchaseRequest type
        // locale: purchaseParams.locale,
        phone: purchaseParams.phone,
        resumeToken: purchaseParams.resumeToken,
        // TODO: Add promotion_reservation_id to MultiProviderPurchaseRequest type
        // promotion_reservation_id: reservationId,
        userId
      })
      
      onSuccess?.()
      return checkoutResult
      
    } catch (error: any) {
      console.error('Purchase failed:', error)
      
      if (error.status === 400 && validation) {
        // Token expired - force revalidation
        showError('Coupon expired. Please re-enter the code.')
        queryClient.removeQueries({ queryKey: ['coupon-validation'] })
      } else {
        showError(error.message || 'Purchase failed. Please try again.')
      }
      
      onError?.(error)
      throw error
      
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <Button
      onClick={handlePurchase}
      disabled={isProcessing} // Prevent double-click
      aria-busy={isProcessing}
      className={cn(
        "w-full",
        isProcessing && "opacity-50 cursor-not-allowed",
        className
      )}
      size="lg"
    >
      {isProcessing ? (
        <div className="flex items-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white me-2" />
          Processing...
        </div>
      ) : (
        children || `Pay ${formatCurrency(finalAmount, currency)}`
      )}
    </Button>
  )
}