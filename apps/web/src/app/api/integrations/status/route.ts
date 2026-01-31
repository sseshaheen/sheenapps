/**
 * Integration Status API Route
 *
 * Frontend proxy to the backend integration status endpoint.
 * Handles authentication and forwards requests to the unified backend API.
 *
 * GET /api/integrations/status?projectId={id}&userId={userId}
 * Returns: IntegrationStatusResponse with all 4 integration statuses
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import type { IntegrationStatusResponse, IntegrationErrorResponse } from '@/types/integrationStatus'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  const correlationId = crypto.randomUUID()

  try {
    // Extract query parameters
    const { searchParams } = request.nextUrl
    const projectId = searchParams.get('projectId')
    const userId = searchParams.get('userId')

    // Validate required parameters
    if (!projectId || !userId) {
      const error: IntegrationErrorResponse = {
        error: 'missing_parameters',
        message: 'Both projectId and userId are required',
        code: 'MISSING_REQUIRED_PARAMS',
        params: { projectId: !!projectId, userId: !!userId }
      }

      return NextResponse.json(error, {
        status: 400,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // Verify session: caller must be the same user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (user.id !== userId) {
      return NextResponse.json(
        { error: 'forbidden', message: 'Access denied', code: 'FORBIDDEN' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Build backend API URL
    const workerBaseUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

    const backendParams = new URLSearchParams({
      projectId,
      userId,
      _t: Date.now().toString() // Cache busting
    })

    const backendPath = `/api/integrations/status?${backendParams}`
    const backendUrl = `${workerBaseUrl}${backendPath}`

    // Create authentication headers for backend
    const authHeaders = createWorkerAuthHeaders('GET', backendPath, '')

    logger.info('Fetching integration status from backend', {
      correlationId,
      projectId: projectId.slice(0, 8),
      userId: userId.slice(0, 8),
      backendUrl: backendUrl.replace(workerBaseUrl, '[WORKER_BASE_URL]')
    })

    // Forward request to backend with authentication
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Accept': 'application/json',
        'User-Agent': 'SheenApps-Frontend/1.0',
        'X-Correlation-ID': correlationId
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    })

    // Handle non-200 responses
    if (!response.ok) {
      let errorDetails: any
      try {
        errorDetails = await response.json()
      } catch {
        errorDetails = { message: response.statusText }
      }

      logger.error('Backend integration status request failed', {
        correlationId,
        status: response.status,
        statusText: response.statusText,
        error: errorDetails
      })

      const error: IntegrationErrorResponse = {
        error: 'backend_error',
        message: errorDetails.message || 'Failed to fetch integration status',
        code: 'BACKEND_REQUEST_FAILED',
        params: {
          status: response.status,
          backend: errorDetails
        }
      }

      return NextResponse.json(error, {
        status: response.status >= 500 ? 503 : response.status,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // Parse and validate response
    const data: IntegrationStatusResponse = await response.json()

    logger.info('Integration status fetched successfully', {
      correlationId,
      projectId: projectId.slice(0, 8),
      overall: data.overall,
      itemCount: data.items?.length,
      hash: data.hash?.slice(0, 8)
    })

    // Forward response with cache-busting headers
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'ETag': data.hash || `"${Date.now()}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Correlation-ID': correlationId
      }
    })

  } catch (error) {
    logger.error('Integration status API error', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    const errorResponse: IntegrationErrorResponse = {
      error: 'internal_error',
      message: 'Internal server error while fetching integration status',
      code: 'INTERNAL_SERVER_ERROR',
      params: {
        correlationId,
        timestamp: new Date().toISOString()
      }
    }

    return NextResponse.json(errorResponse, {
      status: 500,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Correlation-ID': correlationId
      }
    })
  }
}