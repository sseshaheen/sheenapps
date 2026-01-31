import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Mock violations for fallback when ENABLE_MOCK_DATA=true
const mockViolations = [
  {
    id: 'vio_001',
    user_id: 'user_999',
    user_email: 'violator@example.com',
    violation_type: 'Harassment',
    violation_code: 'T02',
    severity: 'high',
    status: 'pending',
    description: 'Multiple reports of aggressive behavior in chat',
    reported_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    reported_by: 'user_123',
    evidence: ['chat_log_123.json', 'screenshot_456.png']
  },
  {
    id: 'vio_002',
    user_id: 'user_888',
    user_email: 'spammer@example.com',
    violation_type: 'Spam',
    violation_code: 'T01',
    severity: 'medium',
    status: 'pending',
    description: 'Posting promotional content repeatedly',
    reported_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    reported_by: 'auto_detection',
    evidence: ['post_history.json']
  }
]

export async function GET(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Check if user has trust & safety permissions
    const hasTrustSafetyPermission = 
      await AdminAuthService.hasPermission('trust.view') ||
      await AdminAuthService.hasPermission('violations.view') ||
      await AdminAuthService.hasRole('super_admin')

    if (!hasTrustSafetyPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view violations' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()

    logger.info('Fetching trust safety violations', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from backend
      const data = await adminApiClient.getViolations({ 
        adminToken: session.token 
      })
      
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
        endpoint: '/api/admin/trust-safety/violations'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - check if we should return mock data
      const useMockData = process.env.ENABLE_MOCK_DATA === 'true'
      
      if (!useMockData) {
        // Return empty data structure instead of mock data
        logger.warn('Worker API unavailable, returning empty data', {
          error: apiError instanceof Error ? apiError.message : 'Unknown error',
          mockReason,
          workerStatus,
          adminId: session.user.id.slice(0, 8),
          correlationId
        })
        
        const violations: any[] = []
        
        const violationStats = {
          total: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
          by_type: {
            spam: 0,
            abuse: 0,
            fraud: 0,
            tos_violation: 0,
            content_violation: 0
          }
        }

        return noCacheResponse({
          success: true,
          violations,
          stats: violationStats,
          correlation_id: correlationId
        })
      }
      
      logger.warn('Worker API unavailable, using mock data (ENABLE_MOCK_DATA=true)', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      // Return mock data
      const violationStats = {
        total: mockViolations.length,
        critical: mockViolations.filter(v => v.severity === 'critical').length,
        high: mockViolations.filter(v => v.severity === 'high').length,
        medium: mockViolations.filter(v => v.severity === 'medium').length,
        low: mockViolations.filter(v => v.severity === 'low').length,
        by_type: {
          spam: mockViolations.filter(v => v.violation_type === 'Spam').length,
          abuse: mockViolations.filter(v => v.violation_type === 'Harassment').length,
          fraud: 0,
          tos_violation: 0,
          content_violation: 0
        }
      }

      return NextResponse.json({
        success: true,
        violations: mockViolations,
        stats: violationStats,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in trust safety violations endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch violations',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}