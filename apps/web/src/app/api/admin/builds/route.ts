/**
 * Admin Builds API Endpoint
 * Provides builds list with filtering and pagination
 * Uses JWT Bearer token authentication for admin endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

// Mock builds data for fallback
const mockBuilds = [
  {
    build_id: 'build_01HZ8X9J2K3L4M5N6P7Q8R9S0T',
    project_id: 'proj_01HZ8X9J2K3L4M5N6P7Q8R9S0A',
    user_id: 'user_789abc',
    user_email: 'developer@example.com',
    status: 'completed',
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45000).toISOString(),
    build_duration_ms: 45000,
    error_message: null,
    logExists: true,
    user_prompt: 'Build a modern e-commerce landing page with product cards and a hero section'
  },
  {
    build_id: 'build_01HZ8X9J2K3L4M5N6P7Q8R9S0U',
    project_id: 'proj_01HZ8X9J2K3L4M5N6P7Q8R9S0B',
    user_id: 'user_456def',
    user_email: 'designer@example.com',
    status: 'failed',
    created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000 + 12000).toISOString(),
    build_duration_ms: 12000,
    error_message: 'Component validation failed: Invalid prop types',
    logExists: true,
    user_prompt: 'Add a contact form with email validation'
  },
  {
    build_id: 'build_01HZ8X9J2K3L4M5N6P7Q8R9S0V',
    project_id: 'proj_01HZ8X9J2K3L4M5N6P7Q8R9S0C',
    user_id: 'user_123ghi',
    user_email: 'startup@example.com',
    status: 'building',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
    updated_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
    build_duration_ms: null,
    error_message: null,
    logExists: false,
    user_prompt: 'Create a dashboard with analytics charts and user management'
  }
]

export async function GET(request: NextRequest) {
  const correlationId = uuidv4()

  try {
    // Check admin authentication
    const adminSession = await AdminAuthService.getAdminSession()

    if (!adminSession) {
      return noCacheErrorResponse(
        { error: 'Admin authentication required' },
        401
      )
    }

    // Check read_logs permission
    const hasPermission = adminSession.permissions.includes('read_logs') ||
                         adminSession.permissions.includes('admin:*') ||
                         adminSession.user.role === 'super_admin'

    if (!hasPermission) {
      return noCacheErrorResponse(
        {
          error: 'Insufficient permissions',
          required: 'read_logs',
          current: adminSession.permissions
        },
        403
      )
    }

    // Extract query parameters
    const searchParams = request.nextUrl.searchParams
    const params: Record<string, any> = {}

    // Pagination parameters
    const limit = searchParams.get('limit')
    const offset = searchParams.get('offset')
    const limitNum = limit ? parseInt(limit, 10) : 25
    const offsetNum = offset ? parseInt(offset, 10) : 0

    if (limit) params.limit = limitNum
    if (offset) params.offset = offsetNum

    // Filter parameters
    const status = searchParams.get('status')
    const userId = searchParams.get('userId')
    const projectId = searchParams.get('projectId')
    const minDurationMs = searchParams.get('minDurationMs')
    const maxDurationMs = searchParams.get('maxDurationMs')

    if (status) params.status = status
    if (userId) params.userId = userId
    if (projectId) params.projectId = projectId
    if (minDurationMs) params.minDurationMs = parseInt(minDurationMs, 10)
    if (maxDurationMs) params.maxDurationMs = parseInt(maxDurationMs, 10)

    // Try to fetch builds list from worker API
    try {
      const buildsResult = await adminApiClient.getBuildsList(
        params,
        { adminToken: adminSession.token }
      )

      return noCacheResponse(buildsResult)
    } catch (workerError) {
      // Worker API failed - check if mock fallback is enabled
      const mockFallbackEnabled = process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true'

      logger.warn('Worker API builds request failed', {
        adminId: adminSession.user.id.slice(0, 8),
        correlationId,
        mockFallbackEnabled,
        error: workerError instanceof Error ? workerError.message : String(workerError),
        endpoint: '/v1/admin/builds'
      })

      if (!mockFallbackEnabled) {
        // Re-throw the error if mock fallback is disabled
        throw workerError
      }

      // Apply filters to mock data
      let filteredBuilds = [...mockBuilds]

      if (status) {
        filteredBuilds = filteredBuilds.filter(build => build.status === status)
      }
      if (userId) {
        filteredBuilds = filteredBuilds.filter(build => build.user_id === userId)
      }
      if (projectId) {
        filteredBuilds = filteredBuilds.filter(build => build.project_id === projectId)
      }
      if (minDurationMs) {
        const minMs = parseInt(minDurationMs, 10)
        filteredBuilds = filteredBuilds.filter(build =>
          build.build_duration_ms !== null && build.build_duration_ms >= minMs
        )
      }
      if (maxDurationMs) {
        const maxMs = parseInt(maxDurationMs, 10)
        filteredBuilds = filteredBuilds.filter(build =>
          build.build_duration_ms !== null && build.build_duration_ms <= maxMs
        )
      }

      // Apply pagination
      const total = filteredBuilds.length
      const paginatedBuilds = filteredBuilds.slice(offsetNum, offsetNum + limitNum)

      return noCacheResponse({
        builds: paginatedBuilds,
        pagination: {
          limit: limitNum,
          offset: offsetNum,
          total
        },
        correlation_id: correlationId,
        _mock: true,
        _mockReason: 'Worker API unavailable'
      })
    }

  } catch (error) {
    logger.error('Admin builds API error', {
      correlationId,
      error: error instanceof Error ? error.message : String(error)
    })

    return noCacheErrorResponse(
      {
        error: 'Failed to fetch builds list',
        details: error instanceof Error ? error.message : String(error),
        correlation_id: correlationId
      },
      500
    )
  }
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'