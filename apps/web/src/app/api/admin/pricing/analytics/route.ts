/**
 * Pricing Analytics API Route
 * Provides pricing analytics and usage insights
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock pricing analytics for fallback
const mockAnalytics = {
  success: true,
  period: 'month',
  metrics: {
    total_revenue: 125340,
    revenue_growth: 15.2,
    average_revenue_per_user: 89.50,
    churn_rate: 2.3,
    plan_distribution: {
      starter: {
        count: 245,
        percentage: 35,
        revenue: 24500
      },
      growth: {
        count: 312,
        percentage: 45,
        revenue: 62400
      },
      scale: {
        count: 138,
        percentage: 20,
        revenue: 38440
      }
    },
    conversion_rates: {
      trial_to_paid: 42.5,
      starter_to_growth: 28.3,
      growth_to_scale: 15.7
    },
    usage_trends: {
      api_calls_per_user: 1250,
      storage_per_user_gb: 4.8,
      active_users_percentage: 78
    }
  },
  insights: [
    {
      type: 'opportunity',
      title: 'High conversion potential',
      description: 'Trial to paid conversion is above industry average',
      impact: 'high'
    },
    {
      type: 'warning',
      title: 'Churn rate increasing',
      description: 'Monthly churn has increased 0.5% over last quarter',
      impact: 'medium'
    },
    {
      type: 'success',
      title: 'Revenue growth strong',
      description: '15.2% month-over-month growth exceeds targets',
      impact: 'high'
    }
  ],
  top_countries: [
    { country: 'US', revenue: 45678, percentage: 36.5 },
    { country: 'UK', revenue: 28934, percentage: 23.1 },
    { country: 'DE', revenue: 18234, percentage: 14.5 },
    { country: 'FR', revenue: 12456, percentage: 9.9 },
    { country: 'CA', revenue: 10234, percentage: 8.2 }
  ],
  revenue_by_month: [
    { month: 'Jan', revenue: 98234 },
    { month: 'Feb', revenue: 102456 },
    { month: 'Mar', revenue: 108934 },
    { month: 'Apr', revenue: 112345 },
    { month: 'May', revenue: 118234 },
    { month: 'Jun', revenue: 125340 }
  ]
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

    // Check if user has pricing view permissions
    const hasPricingPermission = 
      await AdminAuthService.hasPermission('pricing.view') ||
      await AdminAuthService.hasPermission('pricing.manage') ||
      await AdminAuthService.hasPermission('admin.read')

    if (!hasPricingPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view pricing analytics' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'month'

    logger.info('Fetching pricing analytics', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      period,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.request(
        `/pricing/analytics?period=${period}`,
        { 
          method: 'GET',
          adminToken: session.token 
        }
      )

      // Check if we got empty or minimal data
      if (data.success && (!data.metrics || Object.keys(data.metrics).length === 0)) {
        logger.warn('Worker API returned empty analytics', {
          adminId: session.user.id.slice(0, 8),
          correlationId,
          mockFallbackEnabled: process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true'
        })

        // Only use mock data if global mock fallback is enabled
        if (process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true') {
          return NextResponse.json({
            ...mockAnalytics,
            period,
            correlation_id: correlationId,
            _mock: true,
            _reason: 'Empty worker response'
          })
        }
      }

      return NextResponse.json({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // Check if mock fallback is allowed
      const { mockReason, workerStatus } = extractMockReason(apiError)
      
      const errorResponse = handleMockFallback({
        mockReason,
        workerStatus,
        correlationId,
        endpoint: 'pricing analytics'
      })

      if (errorResponse) {
        return errorResponse
      }

      // If mock fallback is enabled, return mock data
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session?.user?.id?.slice(0, 8) || 'unknown',
        correlationId
      })

      return NextResponse.json({
        ...mockAnalytics,
        period,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in pricing analytics endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch pricing analytics',
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