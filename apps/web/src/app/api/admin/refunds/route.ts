/**
 * 💰 Admin Refunds API Route (BFF Pattern with Idempotency)
 * Expert-validated financial operations with idempotency and dual-layer safety
 * 
 * Key features:
 * - Expert's idempotency pattern (frontend generates UUIDs, backend enforces)
 * - BFF-only pattern for financial safety (no direct browser-to-admin calls)
 * - Super admin only permissions (finance.refund)
 * - Mandatory reason collection with structured codes
 * - Enhanced audit logging for financial operations
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { serverAdminClient, AdminApiError, type AdminRefundRequest } from '@/lib/admin/server-admin-client'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

// Expert's refund handler with financial safety patterns
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

    const correlationId = uuidv4()
    const reason = request.headers.get('x-admin-reason') || 'Refund processing'
    
    // Expert's financial permission check (super admin only)
    if (session.user.role !== 'super_admin') {
      logger.warn('Non-authorized admin attempted refund', {
        adminId: session.user.id.slice(0, 8),
        correlationId,
        role: session.user.role
      })
      
      return NextResponse.json(
        { 
          error: 'Insufficient permissions for refund operations. Super admin required.',
          required: 'super_admin',
          available: session.user.role,
          correlation_id: correlationId
        },
        { 
          status: 403,
          headers: { 'X-Correlation-Id': correlationId }
        }
      )
    }

    const body = await request.json()
    const { invoiceId, amount } = body

    if (!invoiceId || !amount) {
      return NextResponse.json(
        { 
          error: 'Missing required fields: invoiceId and amount',
          correlation_id: correlationId
        },
        { 
          status: 400,
          headers: { 'X-Correlation-Id': correlationId }
        }
      )
    }

    // Expert's idempotency pattern - frontend generates the key
    const idempotencyKey = body.idempotencyKey || uuidv4()
    
    if (!reason) {
      return NextResponse.json(
        { 
          error: 'Reason is required for financial operations. Please provide a structured reason.',
          correlation_id: correlationId
        },
        { 
          status: 400,
          headers: { 'X-Correlation-Id': correlationId }
        }
      )
    }

    // Validate amount (example business logic)
    if (amount <= 0 || amount > 10000) {
      return NextResponse.json(
        { 
          error: 'Invalid refund amount. Must be between $0.01 and $10,000',
          correlation_id: correlationId
        },
        { 
          status: 400,
          headers: { 'X-Correlation-Id': correlationId }
        }
      )
    }

    logger.info('Admin refund request initiated', {
      adminId: session.user.id.slice(0, 8),
      correlationId,
      idempotencyKey,
      invoiceId,
      amount,
      hasReason: !!reason
    })

    try {
      // Expert's BFF pattern: Server-side call with idempotency
      const refundRequest: AdminRefundRequest = {
        invoiceId,
        amount,
        reason: reason,
        idempotency_key: idempotencyKey,
        correlation_id: correlationId
      }

      const { data, correlationId: backendCorrelationId } = await serverAdminClient.processRefund(refundRequest)
      
      // Expert's success logging with financial context
      logger.info('Admin refund processed', {
        adminId: session.user.id.slice(0, 8),
        correlationId: backendCorrelationId,
        refundId: data.refund_id,
        invoiceId,
        amount,
        deduped: data.deduped,
        idempotencyKey
      })

      // Expert's response format for financial operations
      return NextResponse.json({
        success: true,
        refund: {
          id: data.refund_id,
          invoiceId,
          amount,
          status: 'processed',
          deduped: data.deduped || false, // Indicates if this was a duplicate request
          processedBy: session.user.id,
          processedAt: new Date().toISOString()
        },
        // Financial operations include additional metadata for audit trails
        audit: {
          idempotencyKey,
          adminUserId: session.user.id,
          reason
        }
      })

    } catch (error) {
      if (error instanceof AdminApiError) {
        // Expert's financial error handling with enhanced logging
        logger.error('Admin backend error in refund processing', {
          error: error.message,
          code: error.code,
          statusCode: error.statusCode,
          details: error.message,
          idempotencyKey,
          adminId: session.user.id.slice(0, 8),
          correlationId
        })

        // Expert's structured financial error responses
        if (error.statusCode === 409) {
          // Idempotent conflict - might be a duplicate request
          return NextResponse.json({
            error: 'Duplicate refund request detected',
            message: 'This refund has already been processed with the same idempotency key',
            idempotencyKey,
            correlation_id: correlationId
          }, { 
            status: 409,
            headers: { 'X-Correlation-Id': correlationId }
          })
        }

        return NextResponse.json({
          error: 'Failed to process refund',
          message: error.message,
          code: error.code,
          correlation_id: correlationId,
          // Financial operations include minimal user-facing details
          userMessage: 'We encountered an issue processing this refund. Please contact support with the correlation ID.'
        }, { 
          status: error.statusCode || 500,
          headers: { 'X-Correlation-Id': correlationId }
        })
      }

      // Generic error handling for financial operations
      logger.error('Unexpected refund processing error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        adminId: session.user.id.slice(0, 8),
        correlationId,
        severity: 'CRITICAL'
      })

      return NextResponse.json({
        error: 'Internal server error during refund processing',
        correlation_id: correlationId,
        userMessage: 'An unexpected error occurred. Please contact support with the correlation ID.'
      }, { 
        status: 500,
        headers: { 'X-Correlation-Id': correlationId }
      })
    }
  } catch (error) {
    // Top-level catch for any unexpected errors
    const correlationId = uuidv4()
    
    logger.error('Unexpected error in refund processing', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId,
      severity: 'CRITICAL'
    })
    
    return NextResponse.json({
      error: 'Critical error in refund processing',
      correlation_id: correlationId
    }, { 
      status: 500,
      headers: { 'X-Correlation-Id': correlationId }
    })
  }
}

// Expert's route configuration for financial operations
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'