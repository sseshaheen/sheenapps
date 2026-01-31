/**
 * Audit Logs API Route
 * Provides audit trail for admin actions
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { extractMockReason } from '@/lib/admin/mock-reason-helper'
import { handleMockFallback } from '@/lib/admin/mock-fallback-handler'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'
import { logger } from '@/utils/logger'

// Mock audit logs for fallback
const mockAuditLogs = [
  {
    id: 'log_001',
    admin_id: 'admin_456',
    admin_email: 'admin@company.com',
    action: 'user.suspend',
    resource_type: 'user',
    resource_id: 'user_789',
    details: {
      reason: 'Violation of terms of service',
      duration: '7 days'
    },
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0...',
    correlation_id: 'corr_123',
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'log_002',
    admin_id: 'admin_789',
    admin_email: 'superadmin@company.com',
    action: 'refund.approved',
    resource_type: 'invoice',
    resource_id: 'inv_456',
    details: {
      amount: 299.00,
      reason: 'Service issue',
      approved_by: 'admin_456'
    },
    ip_address: '192.168.1.101',
    user_agent: 'Mozilla/5.0...',
    correlation_id: 'corr_456',
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
  },
  {
    id: 'log_003',
    admin_id: 'admin_456',
    admin_email: 'admin@company.com',
    action: 'advisor.approved',
    resource_type: 'advisor_application',
    resource_id: 'advisor_app_001',
    details: {
      advisor_name: 'John Smith',
      approval_notes: 'Excellent qualifications'
    },
    ip_address: '192.168.1.100',
    user_agent: 'Mozilla/5.0...',
    correlation_id: 'corr_789',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }
]

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

    // Check if user has audit log permissions
    const hasAuditPermission = 
      await AdminAuthService.hasPermission('audit.view') ||
      await AdminAuthService.hasRole('super_admin')

    if (!hasAuditPermission) {
      return noCacheErrorResponse(
        { error: 'Insufficient permissions to view audit logs' },
        403
      )
    }

    const correlationId = uuidv4()
    const searchParams = request.nextUrl.searchParams
    const adminId = searchParams.get('admin_id')
    const action = searchParams.get('action')
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    logger.info('Fetching audit logs', {
      adminId: session.user.id.slice(0, 8),
      adminRole: session.user.role,
      filters: { adminId, action, startDate, endDate },
      pagination: { offset, limit },
      correlationId
    })

    try {
      // Try to fetch from real worker API first
      const params: Record<string, any> = {}
      if (adminId) params.admin_id = adminId
      if (action) params.action = action
      if (startDate) params.start_date = startDate
      if (endDate) params.end_date = endDate
      params.limit = limit
      params.offset = offset

      const data = await adminApiClient.getAuditLogs(params, { 
        adminToken: session.token 
      })
      
      return noCacheResponse({
        success: true,
        ...data,
        correlation_id: correlationId
      })

    } catch (apiError) {
      // Check if mock fallback is allowed
      const { mockReason, workerStatus } = extractMockReason(apiError)
      
      const errorResponse = handleMockFallback({
        mockReason,
        workerStatus,
        correlationId,
        endpoint: '/api/admin/audit/logs'
      })

      if (errorResponse) {
        return errorResponse
      }

      // Mock fallback is enabled - return mock data
      logger.warn('Worker API unavailable, using mock data', {
        error: apiError instanceof Error ? apiError.message : 'Unknown error',
        mockReason,
        workerStatus,
        adminId: session.user.id.slice(0, 8),
        correlationId
      })

      // Apply filters to mock data
      let filteredLogs = [...mockAuditLogs]
      if (adminId) {
        filteredLogs = filteredLogs.filter(log => log.admin_id === adminId)
      }
      if (action) {
        filteredLogs = filteredLogs.filter(log => log.action === action)
      }

      // Pagination with offset
      const paginatedLogs = filteredLogs.slice(offset, offset + limit)

      return noCacheResponse({
        success: true,
        logs: paginatedLogs,
        pagination: {
          limit,
          offset,
          total: filteredLogs.length,
          returned: paginatedLogs.length,
          has_more: offset + limit < filteredLogs.length
        },
        correlation_id: correlationId,
        _mock: true,
        _mockReason: mockReason,
        _workerStatus: workerStatus
      })
    }

  } catch (error) {
    const correlationId = uuidv4()
    
    logger.error('Error in audit logs endpoint', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      correlationId
    })

    return noCacheErrorResponse(
      { error: 'Failed to fetch audit logs', correlation_id: correlationId },
      500,
      { 'X-Correlation-Id': correlationId }
    )
  }
}

// Disable caching for this endpoint
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'