/**
 * Payment Status API Endpoint - EXPERT VALIDATED IMPLEMENTATION
 * Checks payment status for voucher-based payments (Fawry, Paymob, etc.)
 *
 * CRITICAL FIX: Changed from [orderId] to [userId] parameter to match backend API
 * Based on CRITICAL_HIGH_PRIORITY_IMPLEMENTATION_PLAN.md Phase 1.1
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import type { VoucherStatusResponse } from '@/types/billing'
import { logger } from '@/utils/logger'

// Route configuration for dynamic responses
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params

  try {
    if (!userId) {
      return noCacheErrorResponse({
        error: 'Missing user ID',
        details: 'User ID is required in the URL path'
      }, 400)
    }

    // Verify session: caller must be the same user or an admin
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return noCacheErrorResponse('Authentication required', 401)
    }

    if (user.id !== userId) {
      const { error } = await requireAdmin('billing.read')
      if (error) return error
    }

    logger.info('Checking payment status', { user_id: userId })

    // ✅ EXPERT FIX: Connect to real backend API with production hardening
    const path = `/v1/payments/status/${userId}`
    const authHeaders = createWorkerAuthHeaders('GET', path, '')

    const response = await fetch(`${process.env.WORKER_BASE_URL}${path}`, {
      method: 'GET',
      cache: 'no-store', // ✅ EXPERT: Avoid stale payment statuses
      headers: {
        ...authHeaders, // ✅ Includes proper v1+v2 signatures, nonce, timestamps
        'Content-Type': 'application/json'
      },
      signal: createTimeoutSignal(5000) // ✅ EXPERT: 5s timeout with polyfill compatibility
    })

    // ✅ EXPERT: Propagate correlation ID for debugging
    const correlationId = response.headers.get('x-correlation-id') ?? crypto.randomUUID()

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      logger.error('Backend payment status check failed', {
        user_id: userId,
        status: response.status,
        error: errorData,
        correlation_id: correlationId
      })

      return noCacheErrorResponse({
        error: 'Payment status check failed',
        details: errorData.message || `Backend returned ${response.status}`,
        correlation_id: correlationId
      }, response.status >= 500 ? 500 : response.status)
    }

    const data: VoucherStatusResponse = await response.json()

    // ✅ EXPERT: Use proper HTTP status codes based on payment status
    switch (data.status) {
      case 'paid':
      case 'open':
        // 200 OK: Active or completed payments
        return noCacheResponse(data, {
          status: 200,
          headers: { 'x-correlation-id': correlationId }
        })

      case 'expired':
        // 410 Gone: Expired payments (cacheable response)
        return noCacheResponse(data, {
          status: 410,
          headers: {
            'x-correlation-id': correlationId,
            'Cache-Control': 'public, max-age=3600', // Cache expired status for 1 hour
          }
        })

      case 'void':
        // 409 Conflict: Voided/cancelled payments
        return noCacheResponse(data, {
          status: 409,
          headers: { 'x-correlation-id': correlationId }
        })

      default:
        logger.warn('Unknown payment status', {
          user_id: userId,
          status: data.status,
          correlation_id: correlationId
        })

        return noCacheResponse(data, {
          status: 200,
          headers: { 'x-correlation-id': correlationId }
        })
    }

  } catch (error) {
    const correlationId = crypto.randomUUID()

    logger.error('Error checking payment status', {
      user_id: userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      correlation_id: correlationId
    })

    return noCacheErrorResponse({
      error: 'Internal server error',
      details: 'Failed to check payment status',
      correlation_id: correlationId
    }, 500)
  }
}

// Add OPTIONS handler for CORS support
export async function OPTIONS(request: NextRequest) {
  return new Response(null, {
    status: 200,
    headers: {
      'Allow': 'GET, OPTIONS',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  })
}

/**
 * ✅ EXPERT FIX: AbortSignal.timeout polyfill for Node < 18 compatibility
 * Creates a timeout signal with fallback for older environments
 */
function createTimeoutSignal(timeoutMs: number): AbortSignal {
  // Check for native support first
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    return AbortSignal.timeout(timeoutMs)
  }

  // Fallback for older environments
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`))
  }, timeoutMs)

  // Cleanup timeout if request completes early
  controller.signal.addEventListener('abort', () => {
    clearTimeout(timeout)
  })

  return controller.signal
}