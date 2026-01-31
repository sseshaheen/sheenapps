/**
 * Pricing Catalog Activation API Route
 * Activate a specific pricing catalog version
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

    const { reason: bodyReason } = await request.json()

    // Check permissions - pricing changes require super admin
    const hasPermission = 
      await AdminAuthService.hasPermission('pricing.activate') ||
      session.user.role === 'super_admin'

    if (!hasPermission) {
      return NextResponse.json(
        { error: 'Insufficient permissions to activate pricing catalogs' },
        { status: 403 }
      )
    }

    logger.info('Processing pricing catalog activation', {
      adminId: session.user.id.slice(0, 8),
      catalogId: id.slice(0, 8),
      reason,
      correlationId
    })

    // Call the worker backend admin API to activate catalog
    const adminApiClient = AdminApiClient.getInstance()
    
    try {
      // Get admin JWT token for Bearer authentication
      const adminToken = session.token // The JWT token from admin session
      
      // Call the worker API with proper authentication
      const result = await adminApiClient.activatePricingCatalog(
        id,
        bodyReason || reason,
        { 
          adminToken,
          correlationId 
        }
      )
      
      logger.info('Pricing catalog activated via worker API', {
        adminId: session.user.id.slice(0, 8),
        catalogId: id.slice(0, 8),
        result,
        correlationId
      })
    } catch (workerError) {
      logger.error('Worker API error activating pricing catalog', {
        catalogId: id,
        error: workerError instanceof Error ? workerError.message : 'Unknown error',
        correlationId
      })
      
      // If worker API fails, return an error response
      return NextResponse.json({
        error: 'Failed to activate pricing catalog via worker API',
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
    //     action: `pricing_catalog.activate`,
    //     resource_type: 'pricing_catalog',
    //     resource_id: id,
    //     reason,
    //     correlation_id: correlationId,
    //     metadata: {
    //       admin_email: session.user.email,
    //       admin_role: session.user.role,
    //       action_details: { reason: bodyReason || reason }
    //     }
    //   })

    logger.info('Pricing catalog activated successfully', {
      adminId: session.user.id.slice(0, 8),
      catalogId: id.slice(0, 8),
      correlationId
    })

    return NextResponse.json({
      success: true,
      catalog_id: id,
      activated_by: session.user.id,
      activated_at: new Date().toISOString(),
      reason: bodyReason || reason,
      correlation_id: correlationId
    })

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error activating pricing catalog', {
      catalogId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return NextResponse.json({
      error: 'Failed to activate pricing catalog',
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