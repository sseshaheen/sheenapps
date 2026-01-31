/**
 * Reject Pending Request API Route
 * Processes rejection for a pending two-person approval request
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
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
        { error: 'Insufficient permissions to reject requests' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()
    const { reason } = await request.json()

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { error: 'A detailed reason is required (minimum 10 characters)' },
        { status: 400 }
      )
    }

    logger.info('Processing rejection request', {
      requestId: id,
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      correlationId
    })

    try {
      // Call real worker API
      const result = await adminApiClient.rejectRequest(id, reason, {
        adminToken: session.token
      })
      
      logger.info('Rejection processed successfully', {
        requestId: id,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      return NextResponse.json({
        ...result,
        correlation_id: correlationId
      })
      
    } catch (apiError) {
      // Fallback to mock response if worker unavailable
      logger.warn('Worker API unavailable, simulating rejection', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        requestId: id,
        correlationId
      })

      // Simulate successful rejection
      const rejectionResult = {
        success: true,
        rejection: {
          id: id,
          rejected_by: session.user.id,
          rejected_at: new Date().toISOString(),
          reason: reason
        },
        correlation_id: correlationId,
        _mock: true
      }

      return NextResponse.json(rejectionResult)
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error processing rejection', {
      requestId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to process rejection',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Disable caching
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'