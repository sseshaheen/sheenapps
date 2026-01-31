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

    // Get the admin auth headers
    const authHeaders = await AdminAuthService.getAuthHeaders()

    // Call the worker API for failed payments
    const queryParams = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString()
    })

    const response = await fetch(`${WORKER_BASE_URL}/v1/admin/metrics/failed-payments?${queryParams}`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('Failed to fetch failed payments from worker', {
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
    // The worker should return failed payments with structure matching FailedPayment interface
    const payments = (data.payments || data.data || []).map((payment: any) => ({
      id: payment.id || payment.payment_id || '',
      date: payment.created_at || payment.date || new Date().toISOString(),
      amount: payment.amount || 0,
      currency: payment.currency || 'USD',
      gateway: payment.gateway || payment.payment_gateway || 'unknown',
      error: payment.error || payment.error_message || '',
      userId: payment.user_id || '',
      email: payment.email || payment.user_email || ''
    }))

    logger.info('Admin accessed failed payments', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      limit,
      offset,
      count: payments.length
    })

    return noCacheResponse({
      success: true,
      data: payments,
      pagination: {
        limit,
        offset,
        hasMore: data.hasMore || data.has_more || payments.length >= limit,
        total: data.total || payments.length
      }
    })

  } catch (error) {
    logger.error('Failed to fetch failed payments', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return noCacheErrorResponse({
      error: 'Failed to fetch failed payments'
    }, 500)
  }
}