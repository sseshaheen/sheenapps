/**
 * Trust & Safety Risk Scores API Route
 * Provides risk assessment and safety metrics for users
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock risk scores matching the new backend format
const mockRiskScores = {
  risk_scores: [
    {
      user_id: 'user_999',
      user_email: 'suspicious@example.com',
      risk_score: 85,
      risk_level: 'critical',
      risk_factors: {
        chargebacks: 3,
        failed_payments: 5,
        disputes: 2,
        security_events: 4,
        violations: 1,
        suspicious_activity: 3
      },
      recommendations: [
        'Immediate review required',
        'Freeze payment processing',
        'Review chargeback patterns',
        'Investigate security events'
      ],
      last_activity: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      account_age_days: 3
    },
    {
      user_id: 'user_888',
      user_email: 'risky@example.com',
      risk_score: 42,
      risk_level: 'high',
      risk_factors: {
        chargebacks: 1,
        failed_payments: 3,
        disputes: 1,
        security_events: 2,
        violations: 0,
        suspicious_activity: 1
      },
      recommendations: [
        'Consider suspension',
        'Enable enhanced monitoring',
        'Review payment failures',
        'Monitor account activity closely'
      ],
      last_activity: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      account_age_days: 15
    }
  ],
  metrics: {
    total_users: 1250,
    high_risk_users: 12,
    violations_today: 3,
    security_events_today: 7,
    pending_reviews: 5,
    blocked_users: 2,
    suspended_users: 8,
    chargebacks: {
      total: 15,
      amount: 4250.00,
      trend: 'stable'
    },
    fraud_detection: {
      attempts_blocked: 23,
      success_rate: 95.2
    }
  },
  pagination: {
    limit: 50,
    offset: 0,
    total: 125,
    returned: 2
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

    // Check if user has trust & safety permissions
    const hasTrustSafetyPermission = 
      await AdminAuthService.hasPermission('trust.view') ||
      await AdminAuthService.hasPermission('users.suspend') ||
      await AdminAuthService.hasRole('super_admin')

    if (!hasTrustSafetyPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view risk scores' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()
    const searchParams = request.nextUrl.searchParams
    const userId = searchParams.get('user_id')
    const riskLevel = searchParams.get('risk_level')

    logger.info('Fetching trust & safety risk scores', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      filters: { userId, riskLevel },
      correlationId
    })

    try {
      // If specific user ID provided, get individual risk score
      if (userId) {
        const data = await adminApiClient.getUserRiskScore(userId, { 
          adminToken: session.token 
        })
        
        return NextResponse.json({
          success: true,
          ...data,
          correlation_id: correlationId
        })
      }

      // Otherwise, return general risk scores dashboard
      const data = await adminApiClient.getRiskScores({ 
        adminToken: session.token 
      })
      
      // Backend now provides complete risk_factors and recommendations
      // No transformation needed - trust the backend response
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
        endpoint: '/api/admin/trust-safety/risk-scores'
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
        
        return NextResponse.json({
          success: true,
          risk_scores: [],
          metrics: {
            total_users: 0,
            high_risk_users: 0,
            violations_today: 0,
            security_events_today: 0,
            pending_reviews: 0,
            blocked_users: 0,
            suspended_users: 0,
            chargebacks: {
              total: 0,
              amount: 0,
              trend: 'stable'
            },
            fraud_detection: {
              attempts_blocked: 0,
              success_rate: 100
            }
          },
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

      // Filter mock data based on query params
      let response: any = { ...mockRiskScores }
      
      if (userId) {
        // Return specific user risk score
        const userRisk = mockRiskScores.risk_scores.find(u => u.user_id === userId)
        if (userRisk) {
          response = {
            user_risk: userRisk,
            historical_scores: [
              { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), score: 65 },
              { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), score: 78 },
              { date: new Date().toISOString(), score: userRisk.risk_score }
            ]
          }
        } else {
          response = {
            user_risk: {
              user_id: userId,
              user_email: 'user@example.com',
              risk_score: 15,
              risk_level: 'low',
              risk_factors: {
                chargebacks: 0,
                failed_payments: 0,
                disputes: 0,
                security_events: 0,
                violations: 0,
                suspicious_activity: 0
              },
              recommendations: ['No action needed', 'Continue monitoring'],
              last_activity: new Date().toISOString(),
              account_age_days: 180
            }
          }
        }
      } else if (riskLevel) {
        // Filter by risk level
        response.risk_scores = response.risk_scores.filter(
          (u: any) => u.risk_level === riskLevel
        )
      }

      return NextResponse.json({
        success: true,
        ...response,
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in trust & safety risk scores endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch risk scores',
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