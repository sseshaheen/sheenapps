import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'
import type { EnhancedBalance } from '@/types/billing'

// Prevent caching of balance data
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

/**
 * GET /api/v1/billing/enhanced-balance/[userId]
 * Get enhanced AI time balance for a user (v1 implementation)
 * Auth: session user must match userId param, or caller must be admin with billing.read.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    // Validate user ID
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

    logger.info(`📊 Enhanced Balance API: Fetching balance for user: ${userId}`)

    // Call worker API for enhanced balance
    const path = `/v1/billing/enhanced-balance/${userId}`
    const body = ''
    
    // Generate authentication headers
    const authHeaders = createWorkerAuthHeaders('GET', path, body)

    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        ...authHeaders,
        'x-user-id': userId
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Worker API enhanced balance error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        userId
      })
      
      return noCacheErrorResponse(
        `Worker API error: ${response.status}`,
        response.status
      )
    }

    const enhancedBalance: EnhancedBalance = await response.json()
    
    logger.info(`✅ Enhanced Balance API: Balance retrieved for user ${userId}`, {
      total_seconds: enhancedBalance.totals.total_seconds,
      paid_seconds: enhancedBalance.totals.paid_seconds,
      bonus_seconds: enhancedBalance.totals.bonus_seconds,
      plan_key: enhancedBalance.plan_key,
      version: enhancedBalance.version
    })

    return noCacheResponse(enhancedBalance)
    
  } catch (error) {
    logger.error('❌ Enhanced Balance API: Failed to fetch balance:', error)
    
    return noCacheErrorResponse('Failed to fetch enhanced balance', 500)
  }
}