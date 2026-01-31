/**
 * In-House Mode: Database Schema API Route
 *
 * GET /api/inhouse/projects/[id]/schema
 *
 * Fetches database schema for an Easy Mode project:
 * - List of tables
 * - Column definitions (name, type, nullable, primary key, etc.)
 * - Row counts and size estimates
 *
 * Used by SchemaBrowser component for displaying database structure.
 *
 * SECURITY: Session-authenticated, userId derived from session (not client input)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthState } from '@/lib/auth-server'
import { callWorker } from '@/lib/api/worker-helpers'
import { logger } from '@/utils/logger'
import type { ApiResponse, DatabaseSchema } from '@/types/inhouse-api'

// Force dynamic rendering and no caching
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/inhouse/projects/[id]/schema
 * Get database schema for a project (session-authenticated)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: projectId } = await params

    // EXPERT FIX: Use session auth, don't trust userId from client
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

    logger.info('Fetching database schema', {
      projectId: projectId.slice(0, 8),
      userId: userId.slice(0, 8)
    })

    // EXPERT FIX: Use canonical query params and safe worker call
    const result = await callWorker({
      method: 'GET',
      path: '/v1/inhouse/db/schema',
      queryParams: {
        projectId,
        userId
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to fetch database schema'
          }
        },
        { status: result.status }
      )
    }

    logger.info('Database schema fetched successfully', {
      projectId: projectId.slice(0, 8),
      totalTables: result.data?.totalTables || 0
    })

    // Return success response
    return NextResponse.json<ApiResponse<DatabaseSchema>>(
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
    logger.error('Failed to fetch database schema', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while fetching schema'
        }
      },
      { status: 500 }
    )
  }
}
