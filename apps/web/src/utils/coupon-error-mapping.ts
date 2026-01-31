/**
 * Coupon Error Mapping Utilities
 * Maps coupon-specific errors to our MultiProviderError system
 */

import type { MultiProviderError } from '@/types/billing'

export function mapCouponErrorToMultiProvider(error: any): MultiProviderError {
  // Handle rate limiting
  if (error.status === 429) {
    return {
      error: 'RATE_LIMITED',
      message: 'Too many attempts. Please wait a moment and try again.',
      params: {
        waitTime: 60, // 1 minute
        retryAfterSeconds: 60
      }
    }
  }
  
  // Handle validation errors
  if (error.status === 400) {
    return {
      error: 'NOT_SUPPORTED',
      message: 'Invalid or expired coupon code',
      actionRequired: 'Please check your coupon code and try again'
    }
  }
  
  // Handle timeout errors
  if (error.status === 408 || error.name === 'TimeoutError') {
    return {
      error: 'PROVIDER_TIMEOUT',
      message: 'Validation request timed out',
      actionRequired: 'Please try again'
    }
  }
  
  // Handle server errors
  if (error.status >= 500) {
    return {
      error: 'PROVIDER_UNAVAILABLE',
      message: 'Coupon validation service is temporarily unavailable',
      actionRequired: 'Please try again in a few minutes'
    }
  }
  
  // Default error
  return {
    error: 'PROVIDER_UNAVAILABLE',
    message: error.message || 'Unknown error occurred',
    actionRequired: 'Please try again'
  }
}