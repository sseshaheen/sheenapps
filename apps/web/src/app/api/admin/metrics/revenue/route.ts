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

    // Get the admin auth headers
    const authHeaders = await AdminAuthService.getAuthHeaders()

    // Call the worker API for revenue metrics
    const response = await fetch(`${WORKER_BASE_URL}/v1/admin/metrics/dashboard`, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('Failed to fetch revenue metrics from worker', {
        status: response.status,
        error: errorData
      })
      
      // Return fallback data structure if worker fails
      return noCacheResponse({
        success: true,
        metrics: {
          revenue: {
            mrr: 0,
            mrrGrowth: 0,
            arpu: 0,
            customerCount: 0,
            newCustomers: 0,
            churnedCustomers: 0,
            churnRate: 0,
            mrrByPlan: {},
            mrrByGateway: {},
            current: 0,
            growth: 0
          },
          ltv: {
            overall: 0,
            average: 0,
            byPlan: {},
            byCohort: {}
          },
          payments: {
            totalRevenue: 0,
            total: 0,
            successfulPayments: 0,
            failedPayments: 0,
            failureRate: 0,
            averageTransactionValue: 0,
            revenueByCountry: {},
            revenueByCurrency: {}
          }
        }
      })
    }

    const data = await response.json()
    
    // Transform worker response to match frontend expectations
    const metrics = {
      revenue: {
        mrr: data.mrr?.total || 0,
        mrrGrowth: data.mrr?.growth || 0,
        arpu: data.arpu?.overall || 0,
        customerCount: data.arpu?.totalCustomers || 0,
        newCustomers: data.churn?.newCustomers || 0,
        churnedCustomers: data.churn?.churnedCustomers || 0,
        churnRate: data.churn?.rate || 0,
        mrrByPlan: data.mrr?.byPlan || {},
        mrrByGateway: data.mrr?.byGateway || {},
        current: data.mrr?.total || 0,
        growth: data.mrr?.growth || 0
      },
      ltv: data.ltv?.overall || data.ltv || {
        overall: 0,
        average: data.ltv?.overall || 0,
        byPlan: data.ltv?.byPlan || {},
        byCohort: data.ltv?.byCohort || {}
      },
      payments: {
        totalRevenue: data.mrr?.total || 0,
        total: data.payments?.total || 0,
        successfulPayments: data.payments?.successful || 0,
        failedPayments: data.payments?.failed || 0,
        failureRate: data.payments?.failureRate || 0,
        averageTransactionValue: data.arpu?.overall || 0,
        revenueByCountry: data.mrr?.byCountry || {},
        revenueByCurrency: data.mrr?.byCurrency || {}
      }
    }

    logger.info('Admin accessed revenue metrics', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      hasData: !!data.mrr?.total
    })

    return noCacheResponse({
      success: true,
      metrics
    })

  } catch (error) {
    logger.error('Failed to fetch revenue metrics', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return noCacheErrorResponse({
      error: 'Failed to fetch revenue metrics'
    }, 500)
  }
}