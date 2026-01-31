/**
 * Pending Approvals API Route
 * Fetches all pending two-person approval requests
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// No more mock data - return proper service errors when worker API is unavailable

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

    // Check if user has approval permissions
    const hasApprovalPermission = 
      await AdminAuthService.hasPermission('admin.approve') ||
      await AdminAuthService.hasPermission('finance.refund')

    if (!hasApprovalPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view approvals' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()

    logger.info('Fetching pending approvals', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const data = await adminApiClient.getPendingApprovals({ 
        adminToken: session.token 
      })
      
      return NextResponse.json({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // Production-ready: Return proper service unavailable error instead of mock data
      const { mockReason, workerStatus } = extractMockReason(apiError)
      
      logger.error('Worker API unavailable for pending approvals', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return NextResponse.json({
        error: 'Admin approvals service is currently unavailable. Please try again later.',
        service_status: 'unavailable',
        correlation_id: correlationId,
        details: {
          reason: mockReason,
          worker_status: workerStatus
        }
      }, { 
        status: 503,
        headers: { 
          'X-Correlation-Id': correlationId,
          'Retry-After': '60' // Suggest retry after 60 seconds
        }
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in pending approvals endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch pending approvals',
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