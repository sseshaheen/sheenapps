/**
 * In-House Mode: Deployment History API Route
 *
 * GET /api/inhouse/projects/[id]/deployments
 *
 * Fetches deployment history for an Easy Mode project:
 * - List of past deployments with status and metadata
 * - Cursor-based pagination for efficient loading
 * - Identifies the currently active deployment
 *
 * Used by DeploymentHistory component and HostingStatusCard.
 *
 * SECURITY: Session-authenticated, userId derived from session (not client input)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthState } from '@/lib/auth-server'
import { callWorker } from '@/lib/api/worker-helpers'
import { logger } from '@/utils/logger'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import type { ApiResponse } from '@/types/inhouse-api'

// Force dynamic rendering and no caching
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Deployment history item from the worker API
 */
export interface DeploymentHistoryItem {
  id: string
  buildId: string
  status: 'uploading' | 'deploying' | 'deployed' | 'failed'
  deployedAt: string | null
  errorMessage: string | null
  isCurrentlyActive: boolean
  metadata: {
    assetCount: number
    totalSizeBytes: number
    durationMs: number
  }
  createdAt: string
}

export interface DeploymentHistoryResponse {
  deployments: DeploymentHistoryItem[]
  nextCursor: string | null
}

/**
 * GET /api/inhouse/projects/[id]/deployments
 * Get deployment history for a project (session-authenticated)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: projectId } = await params
    const searchParams = request.nextUrl.searchParams
    const limit = searchParams.get('limit')
    const cursor = searchParams.get('cursor')

    // Validate limit if provided
    if (limit) {
      const parsedLimit = parseInt(limit, 10)
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        return NextResponse.json<ApiResponse<never>>(
          {
            ok: false,
            error: {
              code: 'INVALID_LIMIT',
              message: 'limit must be an integer between 1 and 100'
            }
          },
          { status: 400 }
        )
      }
    }

    // Session authentication
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

    // EXPERT FIX ROUND 7: Use shared helper for ownership check (reduces drift)
    const supabase = await createServerSupabaseClientNew()
    const ownerCheck = await requireProjectOwner(supabase, projectId, userId)
    if (!ownerCheck.ok) return ownerCheck.response

    logger.info('Fetching deployment history', {
      projectId: projectId.slice(0, 8),
      userId: userId.slice(0, 8),
      limit: limit || '20',
      hasCursor: !!cursor
    })

    // Build query params for worker
    const queryParams: Record<string, string> = { userId }
    if (limit) queryParams.limit = limit
    if (cursor) queryParams.cursor = cursor

    // Call worker API
    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/deployments`,
      queryParams
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to fetch deployment history'
          }
        },
        { status: result.status }
      )
    }

    logger.info('Deployment history fetched successfully', {
      projectId: projectId.slice(0, 8),
      count: result.data?.deployments?.length || 0,
      hasMore: !!result.data?.nextCursor
    })

    // Return success response
    return NextResponse.json<ApiResponse<DeploymentHistoryResponse>>(
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
    logger.error('Failed to fetch deployment history', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while fetching deployment history'
        }
      },
      { status: 500 }
    )
  }
}
