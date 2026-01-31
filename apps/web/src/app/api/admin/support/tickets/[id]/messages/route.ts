/**
 * Support Ticket Messages API Route
 * Manages messages for support tickets (replies, internal notes)
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { AdminApiClient } from '@/lib/admin/admin-api-client'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
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

    const correlationId = uuidv4()
    const { body, is_internal, attachments } = await request.json()

    if (!body || body.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message body is required' },
        { status: 400 }
      )
    }

    // Check permissions
    const hasPermission = 
      await AdminAuthService.hasPermission('support.write') ||
      session.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to add messages to support tickets' },
        { status: 403 }
      )
    }

    logger.info('Processing support ticket message addition', {
      adminId: session.user.id.slice(0, 8),
      ticketId: id.slice(0, 8),
      messageLength: body.length,
      isInternal: is_internal,
      correlationId
    })

    // Call the worker backend admin API to add message
    const adminApiClient = AdminApiClient.getInstance()
    
    try {
      // Get admin JWT token for Bearer authentication
      const adminToken = session.token // The JWT token from admin session
      
      // Call the worker API with proper authentication
      const result = await adminApiClient.addTicketMessage(
        id,
        body.trim(),
        is_internal || false,
        { 
          adminToken
        }
      )
      
      logger.info('Support ticket message added via worker API', {
        adminId: session.user.id.slice(0, 8),
        ticketId: id.slice(0, 8),
        messageId: result?.message?.id?.slice(0, 8) || 'unknown',
        correlationId
      })

      return NextResponse.json({
        success: true,
        message: {
          id: result?.message?.id || `msg_${Date.now()}`,
          ticket_id: id,
          sender_email: session.user.email,
          sender_name: 'Support Team',
          body: body.trim(),
          is_internal: is_internal || false,
          created_at: new Date().toISOString(),
          attachments: attachments || []
        },
        correlation_id: correlationId
      })
      
    } catch (workerError) {
      logger.error('Worker API error adding ticket message', {
        ticketId: id,
        error: workerError instanceof Error ? workerError.message : 'Unknown error',
        correlationId
      })
      
      // If worker API fails, return an error response
      return NextResponse.json({
        error: 'Failed to add message via worker API',
        details: workerError instanceof Error ? workerError.message : 'Unknown error',
        correlation_id: correlationId
      }, {
        status: 503,
        headers: { 'X-Correlation-Id': correlationId }
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error adding support ticket message', {
      ticketId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to add support ticket message',
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