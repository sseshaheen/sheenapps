/**
 * Billing Overview API Route
 *
 * GET /api/v1/billing/overview/[userId]?currency=USD
 *
 * Aggregated endpoint returning balance, usage, and catalog in a single call.
 * Auth: session user must match userId param, or caller must be admin with billing.read.
 */

import { NextRequest } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'

export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    if (!userId) {
      return noCacheErrorResponse('User ID is required', 400)
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

    const currency = request.nextUrl.searchParams.get('currency') || 'USD'
    const path = `/v1/billing/overview/${userId}?currency=${encodeURIComponent(currency)}`
    const authHeaders = createWorkerAuthHeaders('GET', path, '')

    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        ...authHeaders,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Worker billing overview error:', {
        status: response.status,
        body: errorText,
        userId,
      })
      return noCacheErrorResponse(
        `Worker API error: ${response.status}`,
        response.status
      )
    }

    const data = await response.json()
    return noCacheResponse(data.data ?? data)
  } catch (error) {
    logger.error('Failed to fetch billing overview:', error)
    return noCacheErrorResponse('Failed to fetch billing overview', 500)
  }
}
