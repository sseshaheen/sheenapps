/**
 * User Status Update API Route
 * Updates user account status (suspend, ban, activate)
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

    const { action, duration } = await request.json()

    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      )
    }

    // Check permissions based on action
    let hasPermission = false
    switch (action) {
      case 'suspend':
      case 'activate':
        hasPermission = 
          await AdminAuthService.hasPermission('users.write') ||
          session.user.role === 'super_admin'
        break
      case 'ban':
        hasPermission = 
          await AdminAuthService.hasPermission('users.ban') ||
          session.user.role === 'super_admin'
        break
      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}` },
          { status: 400 }
        )
    }

    if (!hasPermission) {
      return NextResponse.json(
        { error: `Insufficient permissions to ${action} users` },
        { status: 403 }
      )
    }

    logger.info('Processing user status update', {
      adminId: session.user.id.slice(0, 8),
      targetUserId: id.slice(0, 8),
      action,
      reason,
      correlationId
    })

    // Get Supabase client
    const supabase = await createServerSupabaseClientNew()

    // Prepare update data based on action
    let updateData: { banned_until: string | null; updated_at: string } = {
      updated_at: new Date().toISOString(),
      banned_until: null
    }
    
    if (action === 'activate') {
      updateData = {
        banned_until: null,
        updated_at: new Date().toISOString()
      }
    } else if (action === 'suspend') {
      // Default 30 days suspension if duration not specified
      const suspendDuration = duration || 'P30D'
      const suspendUntil = new Date()
      
      // Parse ISO 8601 duration
      if (suspendDuration.startsWith('P')) {
        const days = parseInt(suspendDuration.replace('P', '').replace('D', ''))
        suspendUntil.setDate(suspendUntil.getDate() + days)
      }
      
      updateData = {
        banned_until: suspendUntil.toISOString(),
        updated_at: new Date().toISOString()
      }
    } else if (action === 'ban') {
      // Permanent ban (set to year 9999)
      updateData = {
        banned_until: '9999-12-31T23:59:59.999Z',
        updated_at: new Date().toISOString()
      }
    }

    // Call the worker backend admin API to update user status
    const adminApiClient = AdminApiClient.getInstance()
    
    try {
      // Get admin JWT token for Bearer authentication
      const adminToken = session.token // The JWT token from admin session
      
      // Call the worker API with proper authentication
      const result = await adminApiClient.updateUserStatus(
        id,
        action,
        reason,
        duration,
        { 
          adminToken,
          correlationId 
        }
      )
      
      logger.info('User status updated via worker API', {
        adminId: session.user.id.slice(0, 8),
        targetUserId: id.slice(0, 8),
        action,
        result,
        correlationId
      })
    } catch (workerError) {
      logger.error('Worker API error updating user status', {
        userId: id,
        action,
        error: workerError instanceof Error ? workerError.message : 'Unknown error',
        correlationId
      })
      
      // If worker API fails, return an error response
      return NextResponse.json({
        error: 'Failed to update user status via worker API',
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
    //     action: `user.${action}`,
    //     resource_type: 'user',
    //     resource_id: id,
    //     reason,
    //     correlation_id: correlationId,
    //     metadata: {
    //       admin_email: session.user.email,
    //       admin_role: session.user.role,
    //       action_details: { action, duration }
    //     }
    //   })

    logger.info('User status updated successfully', {
      adminId: session.user.id.slice(0, 8),
      targetUserId: id.slice(0, 8),
      action,
      correlationId
    })

    return NextResponse.json({
      success: true,
      action,
      userId: id,
      processedBy: session.user.id,
      processedAt: new Date().toISOString(),
      correlation_id: correlationId
    })

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error updating user status', {
      userId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to update user status',
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