/**
 * Refund Processing API Route
 * Handles refund requests with two-person approval for high-value operations
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

const REFUND_THRESHOLD = 500

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Check refund permission
    const hasRefundPermission = 
      await AdminAuthService.hasPermission('finance.refund') ||
      session.user.role === 'super_admin'

    if (!hasRefundPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to process refunds' },
        { status: 403 }
      )
    }

    const correlationId = request.headers.get('x-correlation-id') || uuidv4()
    const idempotencyKey = request.headers.get('idempotency-key')
    const adminReason = request.headers.get('x-admin-reason')

    if (!adminReason) {
      return NextResponse.json(
        { error: 'Admin reason required (x-admin-reason header)' },
        { status: 400 }
      )
    }

    const { invoice_id, amount, reason, notify_user } = await request.json()

    if (!invoice_id || !amount) {
      return NextResponse.json(
        { error: 'Invoice ID and amount are required' },
        { status: 400 }
      )
    }

    logger.info('Processing refund request', {
      adminId: session.user.id.slice(0, 8),
      invoiceId: invoice_id,
      amount,
      requiresApproval: amount > REFUND_THRESHOLD,
      correlationId
    })

    // Check if this requires two-person approval
    if (amount > REFUND_THRESHOLD) {
      // Create approval request
      const approvalRequest = {
        id: `tp_${uuidv4()}`,
        action: 'refund.issue',
        resource_type: 'invoice',
        resource_id: invoice_id,
        payload: {
          amount,
          reason,
          notify_user
        },
        threshold: REFUND_THRESHOLD,
        requested_by: session.user.id,
        requested_by_email: session.user.email,
        correlation_id: correlationId,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // 48 hours
        age_hours: 0
      }

      logger.info('Refund requires two-person approval', {
        adminId: session.user.id.slice(0, 8),
        approvalId: approvalRequest.id,
        amount,
        correlationId
      })

      // In production, this would be saved to the database
      // For now, return pending approval status
      return NextResponse.json({
        status: 'pending_approval',
        approval_request: {
          id: approvalRequest.id,
          threshold: REFUND_THRESHOLD,
          expires_at: approvalRequest.expires_at,
          requires_approval_from: 'different_admin'
        },
        correlation_id: correlationId
      }, {
        status: 202 // Accepted but pending
      })
    }

    // Process immediate refund (under threshold)
    // TODO: In production, this would integrate with payment provider
    await new Promise(resolve => setTimeout(resolve, 1000)) // Simulate processing

    const refundResult = {
      success: true,
      refund: {
        id: `re_${uuidv4()}`,
        invoice_id,
        amount,
        status: 'processed',
        processed_at: new Date().toISOString()
      },
      audit: {
        correlation_id: correlationId,
        admin_user_id: session.user.id,
        logged_at: new Date().toISOString()
      }
    }

    logger.info('Refund processed successfully', {
      adminId: session.user.id.slice(0, 8),
      refundId: refundResult.refund.id,
      amount,
      correlationId
    })

    return NextResponse.json(refundResult)

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error processing refund', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to process refund',
      correlation_id: correlationId
    }, {
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Get refund history
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

    // Check permission
    const hasPermission = 
      await AdminAuthService.hasPermission('finance.read') ||
      session.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to view refunds' },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()

    // Mock refund history
    const refunds = [
      {
        id: 're_123',
        invoice_id: 'inv_abc',
        amount: 250.00,
        status: 'completed',
        reason: 'Customer request',
        processed_by: 'admin@company.com',
        processed_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 're_456',
        invoice_id: 'inv_def',
        amount: 750.00,
        status: 'pending_approval',
        reason: 'Service issue',
        requested_by: 'admin2@company.com',
        requested_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
      }
    ]

    return NextResponse.json({
      success: true,
      refunds,
      total: refunds.length,
      correlation_id: correlationId
    })

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error fetching refunds', {
      error: error instanceof Error ? error.message : 'Unknown error',
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to fetch refunds',
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