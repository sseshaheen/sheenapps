/**
 * Revenue Metrics Dashboard API Route
 * Provides comprehensive revenue and growth metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock revenue metrics for fallback
const mockRevenueMetrics = {
  mrr: {
    current: 42000,
    previous: 38500,
    growth: 9.09,
    chart_data: [
      { month: 'Jan', value: 35000 },
      { month: 'Feb', value: 36500 },
      { month: 'Mar', value: 38500 },
      { month: 'Apr', value: 42000 }
    ]
  },
  arr: {
    current: 504000,
    projected: 580000,
    growth_rate: 15.08
  },
  ltv: {
    average: 2400,
    by_plan: {
      starter: 800,
      pro: 2400,
      enterprise: 8500
    }
  },
  arpu: {
    current: 89,
    previous: 82,
    change: 8.54
  },
  churn: {
    rate: 5.2,
    revenue_churn: 4.8,
    customers_churned: 28
  },
  growth_metrics: {
    new_customers: 125,
    upgrades: 42,
    downgrades: 8,
    reactivations: 12
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check if user has metrics permissions (parallelize permission checks)
    const [metricsPermission, adminPermission] = await Promise.all([
      AdminAuthService.hasPermission('metrics.view'),
      AdminAuthService.hasPermission('admin.read')
    ])
    const hasMetricsPermission = metricsPermission || adminPermission

    if (!hasMetricsPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view revenue metrics' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()

    logger.info('Fetching revenue metrics dashboard', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getRevenueMetrics({ 
        adminToken: session.token 
      })
      
      return NextResponse.json({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // If worker API fails, fall back to mock data for development
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return NextResponse.json({
        success: true,
        ...mockRevenueMetrics,
        correlation_id: correlationId,
        _mock: true
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in revenue metrics dashboard endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch revenue metrics',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'