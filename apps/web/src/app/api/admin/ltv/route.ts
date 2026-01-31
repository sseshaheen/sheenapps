/**
 * 💰 Admin LTV (Lifetime Value) API Route
 * BFF pattern for LTV analytics with proper fallback handling
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

// Mock LTV data for fallback
const mockLTVData = {
  current: 1285,
  change_percentage: 5.2,
  previous_period: 1221,
  by_segment: {
    enterprise: 24120,
    pro: 3600,
    starter: 696
  },
  last_updated: new Date().toISOString()
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

    const correlationId = uuidv4()

    logger.info('Admin LTV request', {
      adminId: session.user.id.slice(0, 8),
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getLTV({ adminToken: session.token })
      
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
        endpoint: '/api/admin/ltv'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return mock data
      logger.warn('Worker API unavailable, using mock LTV data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return noCacheResponse({
        success: true,
        ...mockLTVData,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus,
        correlation_id: correlationId
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Unexpected error getting LTV data', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })
    
    return noCacheErrorResponse(
      { error: 'Failed to retrieve LTV data', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}

// Expert's route configuration for optimal behavior
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'