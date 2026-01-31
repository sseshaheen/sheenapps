/**
 * Security Alerts API Route
 * Provides real-time security alerts for admin monitoring
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse(
        { error: 'Authentication required' },
        401
      )
    }

    // Check if user has audit/security permissions
    const hasPermission = 
      await AdminAuthService.hasPermission('audit.view') ||
      await AdminAuthService.hasPermission('security.view') ||
      await AdminAuthService.hasRole('super_admin')

    if (!hasPermission) {
      return noCacheErrorResponse(
        { error: 'Insufficient permissions to view security alerts' },
        403
      )
    }

    const correlationId = uuidv4()
    const searchParams = request.nextUrl.searchParams
    const severity = searchParams.get('severity')
    const resolved = searchParams.get('resolved')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    logger.info('Fetching security alerts', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      filters: { severity, resolved },
      pagination: { offset, limit },
      correlationId
    })

    try {
      // Build query parameters
      const params: Record<string, any> = {}
      if (severity) params.severity = severity
      if (resolved !== null) params.resolved = resolved === 'true'
      params.limit = limit
      params.offset = offset

      // Fetch from worker API
      const data = await adminApiClient.getSecurityAlerts(params, { 
        adminToken: session.token,
        correlationId
      })
      
      return noCacheResponse({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      logger.error('Failed to fetch security alerts from worker', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      // Return empty alerts list on error (no mock fallback for security data)
      return noCacheResponse({
        success: false,
        alerts: [],
        error: 'Unable to fetch security alerts',
        correlation_id: correlationId
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in security alerts endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse(
      { error: 'Failed to fetch security alerts', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'