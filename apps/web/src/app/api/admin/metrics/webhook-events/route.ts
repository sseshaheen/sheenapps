import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'

export async function GET(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Get query parameters
    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const gateway = url.searchParams.get('gateway')

    // Get the admin auth headers
    const authHeaders = await AdminAuthService.getAuthHeaders()

    // Call the worker API for webhook events
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    })
    
    if (gateway) {
      queryParams.append('gateway', gateway)
    }

    const response = await fetch(`${WORKER_BASE_URL}/v1/admin/metrics/webhook-events?${queryParams}`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('Failed to fetch webhook events from worker', {
        status: response.status,
        error: errorData
      })
      
      // Return fallback data structure if worker fails
      return noCacheResponse({
        success: true,
        data: [],
        pagination: {
          limit,
          offset,
          hasMore: false,
          total: 0
        }
      })
    }

    const data = await response.json()
    
    // Transform worker response to match frontend expectations
    const events = (data.events || data.data || []).map((event: any) => ({
      id: event.id || event.event_id || '',
      gateway: event.gateway || event.payment_gateway || 'unknown',
      type: event.type || event.event_type || '',
      status: event.status || 'unknown',
      created_at: event.created_at || event.date || new Date().toISOString(),
      payload: event.payload || {},
      error: event.error || null
    }))

    logger.info('Admin accessed webhook events', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      limit,
      offset,
      gateway,
      count: events.length
    })

    return noCacheResponse({
      success: true,
      data: events,
      pagination: {
        limit,
        offset,
        hasMore: data.hasMore || data.has_more || events.length >= limit,
        total: data.total || events.length
      }
    })

  } catch (error) {
    logger.error('Failed to fetch webhook events', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return noCacheErrorResponse({
      error: 'Failed to fetch webhook events'
    }, 500)
  }
}