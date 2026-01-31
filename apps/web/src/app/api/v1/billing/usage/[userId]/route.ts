import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'

// Prevent caching of usage data
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

/**
 * GET /api/v1/billing/usage/[userId]
 * Get usage analytics for a user
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

    logger.info(`📊 Usage Analytics API: Fetching usage for user: ${userId}`)

    // Call worker API for usage analytics
    const path = `/v1/billing/usage/${userId}`
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
      logger.error('Worker API usage analytics error:', {
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

    const usageData = await response.json()
    
    logger.info(`✅ Usage Analytics API: Usage data retrieved for user ${userId}`)

    return noCacheResponse(usageData)
    
  } catch (error) {
    logger.error('❌ Usage Analytics API: Failed to fetch usage data:', error)
    
    return noCacheErrorResponse('Failed to fetch usage analytics', 500)
  }
}