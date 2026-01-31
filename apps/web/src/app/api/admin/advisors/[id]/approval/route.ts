/**
 * Advisor Approval API Route
 * Approve or reject advisor applications
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { AdminApiClient } from '@/lib/admin/admin-api-client'
import { IndexNowService } from '@/services/indexnow-service'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export async function PUT(
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

    const correlationId = uuidv4()
    const reason = request.headers.get('x-admin-reason')
    
    if (!reason) {
      return NextResponse.json(
        { error: 'Admin reason required (x-admin-reason header)' },
        { status: 400 }
      )
    }

    const { action, reason: bodyReason, notes } = await request.json()

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      )
    }

    // Validate action values
    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    // For rejection, require a reason
    if (action === 'reject' && !notes && !bodyReason) {
      return NextResponse.json(
        { error: 'Rejection reason is required' },
        { status: 400 }
      )
    }

    // Check permissions
    const hasPermission = 
      await AdminAuthService.hasPermission('advisors.approve') ||
      session.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to approve/reject advisors' },
        { status: 403 }
      )
    }

    logger.info('Processing advisor approval/rejection', {
      adminId: session.user.id.slice(0, 8),
      advisorId: id.slice(0, 8),
      action,
      reason,
      correlationId
    })

    // Call the worker backend admin API to approve/reject advisor
    const adminApiClient = AdminApiClient.getInstance()
    
    try {
      // Get admin JWT token for Bearer authentication
      const adminToken = session.token // The JWT token from admin session
      
      // Call the worker API with proper authentication
      const result = await adminApiClient.approveAdvisor(
        id,
        action as 'approve' | 'reject',
        bodyReason || notes || reason,
        { 
          adminToken,
          correlationId 
        }
      )
      
      logger.info('Advisor approval/rejection processed via worker API', {
        adminId: session.user.id.slice(0, 8),
        advisorId: id.slice(0, 8),
        action,
        result,
        correlationId
      })
    } catch (workerError) {
      logger.error('Worker API error processing advisor approval', {
        advisorId: id,
        action,
        error: workerError instanceof Error ? workerError.message : 'Unknown error',
        correlationId
      })
      
      // If worker API fails, return an error response
      return NextResponse.json({
        error: 'Failed to process advisor approval via worker API',
        details: workerError instanceof Error ? workerError.message : 'Unknown error',
        correlation_id: correlationId
      }, {
        status: 503,
        headers: { 'X-Correlation-Id': correlationId }
      })
    }

    // TODO: Log admin action to audit table when table is available
    // await supabase
    //   .from('admin_audit_logs')
    //   .insert({
    //     admin_id: session.user.id,
    //     action: `advisor.${action}`,
    //     resource_type: 'advisor_application',
    //     resource_id: id,
    //     reason,
    //     correlation_id: correlationId,
    //     metadata: {
    //       admin_email: session.user.email,
    //       admin_role: session.user.role,
    //       action_details: { action, notes: notes || bodyReason }
    //     }
    //   })

    logger.info('Advisor approval/rejection processed successfully', {
      adminId: session.user.id.slice(0, 8),
      advisorId: id.slice(0, 8),
      action,
      correlationId
    })

    // Trigger IndexNow for advisor profile and advisors listing (for approvals)
    if (action === 'approve') {
      try {
        await Promise.all([
          IndexNowService.indexAdvisorProfile(id),
          IndexNowService.indexAdvisorsPage()
        ])
        logger.info('🚀 IndexNow triggered for approved advisor', { advisorId: id.slice(0, 8) })
      } catch (indexError) {
        logger.warn('⚠️ IndexNow failed (non-critical):', indexError)
      }
    }

    return NextResponse.json({
      success: true,
      advisor_id: id,
      action,
      processed_by: session.user.id,
      processed_at: new Date().toISOString(),
      notes: notes || bodyReason,
      correlation_id: correlationId
    })

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error processing advisor approval/rejection', {
      advisorId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to process advisor approval/rejection',
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