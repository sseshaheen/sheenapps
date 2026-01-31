/**
 * Financial Overview API Route
 * Fetches financial metrics and overview for admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock financial data for fallback
const mockFinancialOverview = {
  revenue: {
    total: 285000,
    monthly: 42000,
    growth: 12.5
  },
  transactions: {
    total: 1250,
    successful: 1180,
    failed: 70,
    pending: 15
  },
  refunds: {
    total: 25,
    amount: 3500,
    pending: 3
  },
  churn: {
    rate: 5.2,
    trend: -0.8
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse(
        { error: 'Authentication required' },
        401
      )
    }

    // Check if user has financial permissions (parallelize permission checks)
    const [financePermission, adminPermission] = await Promise.all([
      AdminAuthService.hasPermission('finance.view'),
      AdminAuthService.hasPermission('admin.read')
    ])
    const hasFinancePermission = financePermission || adminPermission

    if (!hasFinancePermission) {
      return noCacheErrorResponse(
        { error: 'Insufficient permissions to view financial data' },
        403
      )
    }

    const correlationId = uuidv4()

    logger.info('Fetching financial overview', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getFinancialOverview({ 
        adminToken: session.token 
      })
      
      return noCacheResponse({
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
        endpoint: '/api/admin/finance/overview'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return mock data
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return noCacheResponse({
        success: true,
        ...mockFinancialOverview,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in financial overview endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse(
      { error: 'Failed to fetch financial overview', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'