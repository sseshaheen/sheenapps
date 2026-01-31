/**
 * Promotion Reservation API Route
 * Proxy to worker service for coupon reservation with HMAC auth
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 4.1
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'
import type { PromotionReservationRequest } from '@/types/billing'

// Force dynamic rendering and prevent caching
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG
export const runtime = 'nodejs' // Prevent Edge runtime issues with crypto/HMAC

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication - Require authenticated user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401)
    }

    // 2. Parse and validate request body
    const body = await request.json() as PromotionReservationRequest
    
    // Validate required fields
    if (!body.validationToken || !body.userId) {
      return noCacheErrorResponse({ 
        error: 'Missing required fields', 
        details: 'validationToken and userId are required' 
      }, 400)
    }

    // Verify user matches authenticated user
    if (body.userId !== user.id) {
      return noCacheErrorResponse('Forbidden: User mismatch', 403)
    }

    // 3. Get idempotency key from headers
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey) {
      return noCacheErrorResponse({ 
        error: 'Missing idempotency key', 
        details: 'Idempotency-Key header is required' 
      }, 400)
    }

    // 4. Prepare worker request
    const workerPath = '/v1/promotions/reserve'
    const workerBody = JSON.stringify({
      userId: body.userId,
      validationToken: body.validationToken,
      expiresInMinutes: body.expiresInMinutes || 30
    })

    // 5. Create authenticated headers for worker
    const authHeaders = createWorkerAuthHeaders('POST', workerPath, workerBody)
    const workerBaseUrl = process.env.WORKER_BASE_URL

    if (!workerBaseUrl) {
      return noCacheErrorResponse('Worker service not configured', 500)
    }

    // 6. Call worker service
    const workerResponse = await fetch(`${workerBaseUrl}${workerPath}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Idempotency-Key': idempotencyKey, // Forward idempotency key
        'Content-Type': 'application/json'
      },
      body: workerBody
    })

    if (!workerResponse.ok) {
      const errorData = await workerResponse.json().catch(() => ({ message: 'Reservation failed' }))
      
      // Handle specific error cases
      if (workerResponse.status === 400) {
        return noCacheErrorResponse({
          error: 'Token expired',
          details: 'Validation token has expired. Please re-enter your coupon code.'
        }, 400)
      }

      if (workerResponse.status === 409) {
        return noCacheErrorResponse({
          error: 'Already reserved',
          details: 'This coupon has already been reserved'
        }, 409)
      }

      return noCacheErrorResponse({
        error: 'Reservation failed',
        details: errorData.message || 'Unable to reserve coupon'
      }, workerResponse.status)
    }

    // 7. Return success response
    const result = await workerResponse.json()
    
    return noCacheResponse(result)

  } catch (error) {
    console.error('[Promotions] Reservation failed:', error)
    
    return noCacheErrorResponse({ 
      error: 'Internal server error',
      details: 'Failed to reserve coupon'
    }, 500)
  }
}