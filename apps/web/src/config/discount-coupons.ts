/**
 * Discount Coupon Configuration
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 1
 */

import type { RegionCode } from '@/types/billing'

export const COUPON_CONFIG = {
  validation: {
    debounceMs: 500,
    tokenValidityMinutes: 30,
    maxRetriesOnExpiry: 1,
  },
  rateLimiting: {
    maxRequestsPerMinute: 100,
    clientDebounceMs: 500,
  },
  defaults: {
    region: 'us' as RegionCode, // Already lowercase in our types
    reservationExpiryMinutes: 30,
  },
  features: {
    allowStacking: false,
    requiresAuth: true,
  }
} as const