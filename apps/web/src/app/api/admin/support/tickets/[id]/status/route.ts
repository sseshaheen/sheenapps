/**
 * Support Ticket Status Update API Route
 * Updates ticket status (open, in_progress, waiting_customer, resolved, closed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { AdminApiClient } from '@/lib/admin/admin-api-client'
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

    const { status, reason: bodyReason } = await request.json()

    if (!status) {
      return NextResponse.json(
        { error: 'Status is required' },
        { status: 400 }
      )
    }

    // Validate status values
    const validStatuses = ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Check permissions
    const hasPermission = 
      await AdminAuthService.hasPermission('support.write') ||
      session.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to update support tickets' },
        { status: 403 }
      )
    }

    logger.info('Processing support ticket status update', {
      adminId: session.user.id.slice(0, 8),
      ticketId: id.slice(0, 8),
      status,
      reason,
      correlationId
    })

    // Call the worker backend admin API to update ticket status
    const adminApiClient = AdminApiClient.getInstance()
    
    try {
      // Get admin JWT token for Bearer authentication
      const adminToken = session.token // The JWT token from admin session
      
      // Call the worker API with proper authentication
      const result = await adminApiClient.updateTicketStatus(
        id,
        status,
        { 
          adminToken
        }
      )
      
      logger.info('Support ticket status updated via worker API', {
        adminId: session.user.id.slice(0, 8),
        ticketId: id.slice(0, 8),
        status,
        result,
        correlationId
      })
    } catch (workerError) {
      logger.error('Worker API error updating ticket status', {
        ticketId: id,
        status,
        error: workerError instanceof Error ? workerError.message : 'Unknown error',
        correlationId
      })
      
      // If worker API fails, return an error response
      return NextResponse.json({
        error: 'Failed to update ticket status via worker API',
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
    //     action: `support_ticket.status_update`,
    //     resource_type: 'support_ticket',
    //     resource_id: id,
    //     reason,
    //     correlation_id: correlationId,
    //     metadata: {
    //       admin_email: session.user.email,
    //       admin_role: session.user.role,
    //       old_status: 'unknown', // TODO: Get from previous state
    //       new_status: status
    //     }
    //   })

    logger.info('Support ticket status updated successfully', {
      adminId: session.user.id.slice(0, 8),
      ticketId: id.slice(0, 8),
      status,
      correlationId
    })

    return NextResponse.json({
      success: true,
      ticket_id: id,
      status,
      updated_by: session.user.id,
      updated_at: new Date().toISOString(),
      correlation_id: correlationId
    })

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error updating support ticket status', {
      ticketId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to update support ticket status',
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