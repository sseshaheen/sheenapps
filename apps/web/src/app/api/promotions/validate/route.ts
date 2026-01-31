/**
 * Promotion Validation API Route
 * Proxy to worker service for coupon validation with HMAC auth
 * Based on DISCOUNT_COUPON_FRONTEND_IMPLEMENTATION_PLAN.md Phase 4.1
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'
import type { PromotionValidationRequest } from '@/types/billing'

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
    const body = await request.json() as PromotionValidationRequest
    
    // Validate required fields
    if (!body.code || !body.package_key || !body.currency || !body.region || typeof body.totalMinorUnits !== 'number') {
      return noCacheErrorResponse({ 
        error: 'Missing required fields', 
        details: 'code, package_key, currency, region, and totalMinorUnits are required' 
      }, 400)
    }

    // 3. Get locale from headers
    const locale = request.headers.get('x-sheen-locale') || 'en'

    // 4. Prepare worker request
    const workerPath = '/v1/promotions/validate'
    const workerBody = JSON.stringify({
      code: body.code.trim().replace(/\s+/g, ' '), // Trim whitespace
      package_key: body.package_key,
      currency: body.currency,
      region: body.region,
      totalMinorUnits: body.totalMinorUnits,
      locale,
      context: body.context,
      user_id: user.id // Include user context
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
        'x-sheen-locale': locale,
        'Content-Type': 'application/json'
      },
      body: workerBody
    })

    if (!workerResponse.ok) {
      const errorData = await workerResponse.json().catch(() => ({ message: 'Validation failed' }))
      
      // Handle specific error cases
      if (workerResponse.status === 429) {
        return noCacheErrorResponse({
          error: 'Rate limited',
          details: 'Too many validation attempts. Please wait a moment.'
        }, 429)
      }

      if (workerResponse.status === 400) {
        return noCacheErrorResponse({
          error: 'Invalid coupon',
          details: errorData.message || 'Coupon code is invalid or expired'
        }, 400)
      }

      return noCacheErrorResponse({
        error: 'Validation failed',
        details: errorData.message || 'Unable to validate coupon'
      }, workerResponse.status)
    }

    // 7. Return success response
    const result = await workerResponse.json()
    
    return noCacheResponse(result, {
      headers: {
        'Content-Language': locale
      }
    })

  } catch (error) {
    console.error('[Promotions] Validation failed:', error)
    
    return noCacheErrorResponse({ 
      error: 'Internal server error',
      details: 'Failed to validate coupon code'
    }, 500)
  }
}