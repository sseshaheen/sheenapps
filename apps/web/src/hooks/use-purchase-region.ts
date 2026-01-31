/**
 * Purchase Region Detection Hook
 * Determines region from billing address, not locale
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 2.3
 */

'use client'

import { useAuthStore } from '@/store'
import { COUPON_CONFIG } from '@/config/discount-coupons'
import type { RegionCode } from '@/types/billing'

export function usePurchaseRegion(): RegionCode {
  const { user } = useAuthStore()
  
  // Priority: billing address > profile > default (per backend requirement)
  // TODO: Add billingAddress and profile fields to User type once backend is ready
  return COUPON_CONFIG.defaults.region
}