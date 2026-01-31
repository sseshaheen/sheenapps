import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { WebhookRetryService } from '@/services/payment/webhook-retry-service'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    // Admin or super_admin can retry webhooks
    if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
      return NextResponse.json(
        { 
          error: 'Insufficient permissions for webhook retry',
          required: 'admin or super_admin',
          available: session.user.role
        },
        { status: 403 }
      )
    }

    const correlationId = uuidv4()

    // Get webhook ID from request
    const { webhookId } = await request.json()
    
    if (!webhookId) {
      return NextResponse.json(
        { error: 'Webhook ID is required' },
        { status: 400 }
      )
    }

    logger.info('Admin webhook retry request', {
      adminId: session.user.id.slice(0, 8),
      webhookId,
      correlationId
    })

    // Retry the webhook
    const retryService = new WebhookRetryService()
    const result = await retryService.manualRetry(webhookId)

    if (result.success) {
      logger.info('Admin webhook retry successful', {
        adminId: session.user.id.slice(0, 8),
        webhookId,
        correlationId
      })

      return NextResponse.json({
        success: true,
        message: 'Webhook retry initiated successfully',
        webhookId,
        correlationId
      })
    } else {
      logger.error('Admin webhook retry failed', {
        adminId: session.user.id.slice(0, 8),
        webhookId,
        error: result.error,
        correlationId
      })

      return NextResponse.json(
        { 
          error: 'Webhook retry failed',
          details: result.error,
          correlationId
        },
        { status: 500 }
      )
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Unexpected error in webhook retry', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json(
      { 
        error: 'Failed to retry webhook',
        correlationId
      },
      { status: 500 }
    )
  }
}