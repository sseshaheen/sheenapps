/**
 * Admin Build Info API Endpoint
 * Provides individual build information
 * Uses JWT Bearer token authentication for admin endpoints
 */

import { NextRequest, NextResponse } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

// Mock build info for fallback
const mockBuildInfo = {
  buildId: 'build_01HZ8X9J2K3L4M5N6P7Q8R9S0T',
  projectId: 'proj_01HZ8X9J2K3L4M5N6P7Q8R9S0A',
  userId: 'user_789abc',
  userEmail: 'developer@example.com',
  status: 'completed',
  createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 45000).toISOString(),
  buildDurationMs: 45000,
  totalLinesProcessed: 1250,
  claudeRequests: 8,
  memoryPeakMb: 256,
  errorMessage: null,
  logExists: true,
  logSizeBytes: 65536
}

interface RouteParams {
  params: Promise<{ buildId: string }>
}

export async function GET(request: NextRequest, props: RouteParams) {
  const params = await props.params;
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

    const { buildId } = params

    // Validate buildId format
    if (!buildId || typeof buildId !== 'string') {
      return noCacheErrorResponse(
        { error: 'Invalid build ID' },
        400
      )
    }

    // Try to fetch build info from worker API
    try {
      const buildInfo = await adminApiClient.getBuildInfo(
        buildId,
        { adminToken: adminSession.token }
      )

      return noCacheResponse(buildInfo)
    } catch (workerError) {
      // Worker API failed - check if mock fallback is enabled
      const mockFallbackEnabled = process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true'

      logger.warn('Worker API build info request failed', {
        adminId: adminSession.user.id.slice(0, 8),
        buildId: buildId.slice(0, 8),
        correlationId,
        mockFallbackEnabled,
        error: workerError instanceof Error ? workerError.message : String(workerError),
        endpoint: `/v1/admin/builds/${buildId}/info`
      })

      if (!mockFallbackEnabled) {
        // Re-throw the error if mock fallback is disabled
        throw workerError
      }

      // Return mock build info with the requested buildId
      const mockResponse = {
        ...mockBuildInfo,
        buildId, // Use the requested buildId
        correlation_id: correlationId,
        _mock: true,
        _mockReason: 'Worker API unavailable'
      }

      return noCacheResponse(mockResponse)
    }

  } catch (error) {
    logger.error('Admin build info API error', {
      buildId: params.buildId?.slice(0, 8),
      correlationId,
      error: error instanceof Error ? error.message : String(error)
    })

    return noCacheErrorResponse(
      {
        error: 'Failed to fetch build info',
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