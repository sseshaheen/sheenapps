/**
 * In-House Mode: Project Status API Route
 *
 * GET /api/inhouse/projects/[id]/status
 *
 * Fetches complete infrastructure status for an Easy Mode project:
 * - Database status (provisioning/active/error)
 * - Hosting status (deploying/live/error)
 * - Quota usage (requests, bandwidth)
 * - API keys info
 *
 * Used by InfrastructurePanel for real-time status display.
 *
 * SECURITY: Session-authenticated, userId derived from session (not client input)
 * EXPERT FIX ROUND 2: Fixed auth bypass vulnerability
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthState } from '@/lib/auth-server'
import { callWorker } from '@/lib/api/worker-helpers'
import { logger } from '@/utils/logger'
import type { ApiResponse, InfrastructureStatus } from '@/types/inhouse-api'

// Force dynamic rendering and no caching
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/inhouse/projects/[id]/status
 * Get infrastructure status for a project (session-authenticated)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: projectId } = await params

    // EXPERT FIX ROUND 2: Use session auth, don't trust userId from client
    const authState = await getServerAuthState()
    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        },
        { status: 401 }
      )
    }

    const userId = authState.user.id

    logger.info('Fetching infrastructure status', {
      projectId: projectId.slice(0, 8),
      userId: userId.slice(0, 8)
    })

    // EXPERT FIX ROUND 2: Use callWorker with canonical query params
    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/status`,
      queryParams: {
        userId
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to fetch project status'
          }
        },
        { status: result.status }
      )
    }

    logger.info('Infrastructure status fetched successfully', {
      projectId: projectId.slice(0, 8),
      databaseStatus: result.data?.database?.status,
      hostingStatus: result.data?.hosting?.status
    })

    // Return success response
    return NextResponse.json<ApiResponse<InfrastructureStatus>>(
      {
        ok: true,
        data: result.data
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('Failed to fetch infrastructure status', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while fetching status'
        }
      },
      { status: 500 }
    )
  }
}
