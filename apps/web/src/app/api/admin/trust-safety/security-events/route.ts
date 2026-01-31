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

// Mock security events for fallback when ENABLE_MOCK_DATA=true
const mockSecurityEvents = [
  {
    id: 'sec_001',
    event_type: 'failed_login',
    user_id: 'user_456',
    user_email: 'test@example.com',
    severity: 'medium',
    description: 'Multiple failed login attempts',
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0...',
    timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    metadata: {
      attempts: 5,
      last_attempt: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    }
  },
  {
    id: 'sec_002',
    event_type: 'suspicious_activity',
    user_id: 'user_789',
    user_email: 'suspicious@example.com',
    severity: 'high',
    description: 'Rapid API calls detected',
    ip_address: '10.0.0.50',
    user_agent: 'Custom Bot/1.0',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    metadata: {
      api_calls: 500,
      time_window: '60 seconds'
    }
  },
  {
    id: 'sec_003',
    event_type: 'rate_limit_exceeded',
    user_id: 'user_321',
    user_email: 'rate@example.com',
    severity: 'low',
    description: 'Rate limit exceeded on API endpoint',
    ip_address: '172.16.0.10',
    user_agent: 'Mozilla/5.0...',
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    metadata: {
      endpoint: '/api/generate',
      limit: 100,
      actual: 125
    }
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
      await AdminAuthService.hasPermission('security.view') ||
      await AdminAuthService.hasRole('super_admin')

    if (!hasTrustSafetyPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view security events' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()

    logger.info('Fetching security events', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from backend
      const data = await adminApiClient.getSecurityEvents({ 
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
        endpoint: '/api/admin/trust-safety/security-events'
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
        
        const securityEvents: any[] = []
        
        const eventStats = {
          total: 0,
          by_type: {
            failed_login: 0,
            suspicious_activity: 0,
            rate_limit_exceeded: 0,
            unauthorized_access: 0,
            account_takeover_attempt: 0
          },
          by_severity: {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0
          }
        }

        return noCacheResponse({
          success: true,
          events: securityEvents,
          stats: eventStats,
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
      const eventStats = {
        total: mockSecurityEvents.length,
        by_type: {
          failed_login: mockSecurityEvents.filter(e => e.event_type === 'failed_login').length,
          suspicious_activity: mockSecurityEvents.filter(e => e.event_type === 'suspicious_activity').length,
          rate_limit_exceeded: mockSecurityEvents.filter(e => e.event_type === 'rate_limit_exceeded').length,
          unauthorized_access: 0,
          account_takeover_attempt: 0
        },
        by_severity: {
          critical: mockSecurityEvents.filter(e => e.severity === 'critical').length,
          high: mockSecurityEvents.filter(e => e.severity === 'high').length,
          medium: mockSecurityEvents.filter(e => e.severity === 'medium').length,
          low: mockSecurityEvents.filter(e => e.severity === 'low').length
        }
      }

      return NextResponse.json({
        success: true,
        events: mockSecurityEvents,
        stats: eventStats,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in security events endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch security events',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}