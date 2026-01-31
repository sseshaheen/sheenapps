/**
 * In-House Mode: Create Project API Route
 *
 * POST /api/inhouse/projects/create
 *
 * Creates a new Easy Mode project with managed infrastructure:
 * - Database schema (isolated tenant)
 * - API keys (public + server)
 * - Subdomain assignment
 *
 * This is a proxy route that:
 * 1. Validates user session (derives userId from session)
 * 2. Signs request with HMAC dual signatures
 * 3. Calls worker endpoint /v1/inhouse/projects
 * 4. Returns result to frontend
 *
 * SECURITY: Session-authenticated, userId derived from session (not client input)
 * EXPERT FIX ROUND 2: Fixed auth bypass vulnerability
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthState } from '@/lib/auth-server'
import { callWorker } from '@/lib/api/worker-helpers'
import { logger } from '@/utils/logger'
import { assertSameOrigin } from '@/lib/security/csrf'
import type { ApiResponse, CreateProjectResponse } from '@/types/inhouse-api'

// Force dynamic rendering and no caching
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * POST /api/inhouse/projects/create
 * Create a new Easy Mode project (session-authenticated)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // CSRF Protection: Verify request origin
    try {
      assertSameOrigin(request)
    } catch (e) {
      logger.warn('CSRF check failed on create project endpoint', {
        error: e instanceof Error ? e.message : String(e),
        origin: request.headers.get('origin'),
        host: request.headers.get('host')
      })
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Forbidden'
          }
        },
        { status: 403 }
      )
    }

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

    // Parse request body (ignore client userId if present)
    const body = await request.json()
    const { name, subdomain, tier } = body

    // Validate required fields
    if (!name || name.trim().length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Project name is required'
          }
        },
        { status: 400 }
      )
    }

    logger.info('Creating Easy Mode project', {
      userId: userId.slice(0, 8),
      name,
      tier: tier || 'free',
      hasSubdomain: !!subdomain
    })

    // EXPERT FIX ROUND 2: Use callWorker with proper auth + Content-Type
    const result = await callWorker({
      method: 'POST',
      path: '/v1/inhouse/projects',
      body: {
        userId,
        name,
        subdomain: subdomain || undefined
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to create project'
          }
        },
        { status: result.status }
      )
    }

    logger.info('Easy Mode project created successfully', {
      projectId: result.data?.projectId?.slice(0, 8),
      subdomain: result.data?.subdomain
    })

    // Return success response
    return NextResponse.json<ApiResponse<CreateProjectResponse>>(
      {
        ok: true,
        data: {
          projectId: result.data.projectId,
          subdomain: result.data.subdomain,
          schemaName: result.data.schemaName,
          publicApiKey: result.data.apiKey?.publicKey || '',
          url: result.data.previewUrl || `https://${result.data.subdomain}.sheenapps.com`,
          tier: tier || 'free'
        }
      },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )

  } catch (error) {
    logger.error('Failed to create Easy Mode project', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json<ApiResponse<never>>(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred while creating the project'
        }
      },
      { status: 500 }
    )
  }
}
