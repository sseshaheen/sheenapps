/**
 * Promotion API Client
 * Handles coupon validation and reservation with HMAC authentication
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 1.3
 */

'use client'

import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import type {
  PromotionValidationRequest,
  PromotionValidationResponse,
  PromotionReservationRequest,
  PromotionReservationResponse,
  SupportedCurrency,
  RegionCode,
  LocaleCode
} from '@/types/billing'

export class PromotionAPIClient {
  /**
   * Validate coupon code with debounced request
   */
  static async validateCode(
    code: string,
    packageKey: string,
    options: {
      currency: SupportedCurrency,
      region: RegionCode,
      totalMinorUnits: number,
      locale?: LocaleCode,
      signal?: AbortSignal
    }
  ): Promise<PromotionValidationResponse> {
    const body = JSON.stringify({
      code, // Already trimmed by hook
      package_key: packageKey,
      currency: options.currency,
      region: options.region,
      totalMinorUnits: options.totalMinorUnits,
      locale: options.locale
    })
    
    // Create auth headers with dual signature support
    const authHeaders = createWorkerAuthHeaders('POST', '/api/promotions/validate', body)
    
    const response = await fetch('/api/promotions/validate', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-sheen-locale': options.locale || 'en'
      },
      body,
      signal: options.signal
    })
    
    // SECURITY: Never log validation tokens or codes
    logger.debug('api', 'Coupon validation attempted', { 
      packageKey, 
      currency: options.currency,
      region: options.region
      // DO NOT LOG: code, validationToken
    })
    
    // Handle rate limiting with friendly message
    if (response.status === 429) {
      throw { status: 429, message: 'Too many attempts. Please wait a moment and try again.' }
    }
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Validation failed')
    }
    
    return response.json()
  }
  
  /**
   * Reserve promotion with validation token
   */
  static async reservePromotion(
    userId: string,
    validationToken: string,
    idempotencyKey: string
  ): Promise<PromotionReservationResponse> {
    const body = JSON.stringify({
      userId,
      validationToken, // Single-use token
      expiresInMinutes: 30
    })
    
    // Create auth headers with dual signature support  
    const authHeaders = createWorkerAuthHeaders('POST', '/api/promotions/reserve', body)
    
    const response = await fetch('/api/promotions/reserve', {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Idempotency-Key': idempotencyKey // In header per expert feedback
      },
      body
    })
    
    // SECURITY: Never log tokens
    logger.debug('api', 'Promotion reservation attempted', { 
      userId
      // DO NOT LOG: validationToken, idempotencyKey
    })
    
    if (!response.ok) {
      if (response.status === 400) {
        throw { status: 400, message: 'Token expired or invalid' }
      }
      throw new Error('Reservation failed')
    }
    
    return response.json()
  }
}