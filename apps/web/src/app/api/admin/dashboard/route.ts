/**
 * 🏠 Admin Dashboard API Route (BFF Pattern)
 * Expert-validated BFF implementation that proxies to admin backend service
 * 
 * Key features:
 * - BFF-only pattern (browser → Next.js API → admin backend)
 * - Expert's header standardization and correlation tracking
 * - Server-side admin client (no token exposure)
 * - Enhanced audit logging for admin dashboard access
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

// Mock dashboard data for fallback
const mockDashboardData = {
  metrics: {
    totalUsers: 1250,
    activeUsers: 892,
    totalRevenue: 285000,
    monthlyRevenue: 42000,
    pendingApprovals: 3
  },
  recentActions: [
    {
      id: 'action_001',
      action: 'user.suspended',
      adminUser: 'admin@company.com',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      correlationId: 'corr_abc123'
    },
    {
      id: 'action_002',
      action: 'refund.processed',
      adminUser: 'admin@company.com',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      correlationId: 'corr_def456'
    }
  ]
}

// Expert's dashboard handler using BFF pattern
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

    const correlationId = uuidv4()

    logger.info('Admin dashboard access', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getDashboard({ 
        adminToken: session.token 
      })
      
      logger.info('Admin dashboard data retrieved', {
        adminId: session.user.id.slice(0, 8),
        correlationId,
        metricsCount: Object.keys(data.metrics || {}).length,
        recentActionsCount: data.recentActions?.length || 0
      })

      return noCacheResponse({
        success: true,
        dashboard: data,
        // Include admin context for frontend
        adminContext: {
          role: session.user.role,
          userId: session.user.id
        },
        correlation_id: correlationId
      })

    } catch (apiError) {
      // Check if mock fallback is allowed
      const { mockReason, workerStatus } = extractMockReason(apiError)
      
      const errorResponse = handleMockFallback({
        mockReason,
        workerStatus,
        correlationId,
        endpoint: '/api/admin/dashboard'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return mock data
      logger.warn('Worker API unavailable, using mock dashboard data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        workerStatus,
        mockReason,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return noCacheResponse({
        success: true,
        dashboard: mockDashboardData,
        adminContext: {
          role: session.user.role,
          userId: session.user.id
        },
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    // Handle unexpected errors with correlation ID
    logger.error('Unexpected error in admin dashboard', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })
    
    return noCacheErrorResponse(
      { error: 'Failed to fetch dashboard data', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}

// Expert's route configuration for optimal caching behavior
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'