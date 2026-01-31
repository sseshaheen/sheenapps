/**
 * Project Files API Route
 * Proxies requests to the backend worker for file listing and content retrieval.
 * Used by the GeneratedCodeViewer component.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/utils/auth'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/v1/projects/[projectId]/files
 *
 * Without ?path= : Returns file tree listing
 * With ?path=src/App.tsx : Returns single file content
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params
    const { searchParams } = new URL(req.url)
    const filePath = searchParams.get('path')
    const buildId = searchParams.get('buildId')

    // Get current user
    let userId: string
    try {
      userId = await getCurrentUserId()
    } catch {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Validate project ID
    if (!projectId || projectId.length < 3) {
      return noCacheErrorResponse(
        { error: 'Invalid project ID', code: 'INVALID_PROJECT_ID' },
        400
      )
    }

    // Build worker URL
    const workerBaseUrl = process.env.WORKER_BASE_URL
    if (!workerBaseUrl) {
      logger.error('[ProjectFilesAPI] WORKER_BASE_URL not configured')
      return noCacheErrorResponse(
        { error: 'Service unavailable', code: 'SERVICE_UNAVAILABLE' },
        503
      )
    }

    // Build query string for worker
    const workerParams = new URLSearchParams({ userId })
    if (filePath) workerParams.set('path', filePath)
    if (buildId) workerParams.set('buildId', buildId)

    const endpoint = `/api/v1/projects/${projectId}/files?${workerParams}`

    // Generate HMAC authentication headers (empty body for GET)
    const authHeaders = createWorkerAuthHeaders('GET', endpoint, '')

    logger.info('[ProjectFilesAPI] Fetching from worker', {
      projectId: projectId.slice(0, 8),
      hasPath: !!filePath,
      hasBuildId: !!buildId
    })

    // Forward request to worker
    const workerResponse = await fetch(`${workerBaseUrl}${endpoint}`, {
      method: 'GET',
      headers: authHeaders,
      cache: 'no-store',
    })

    if (!workerResponse.ok) {
      const errorData = await workerResponse.json().catch(() => ({}))
      logger.error('[ProjectFilesAPI] Worker error', {
        status: workerResponse.status,
        error: errorData
      })

      return noCacheErrorResponse(
        {
          error: errorData.error || 'Failed to fetch files',
          code: errorData.code || 'WORKER_ERROR'
        },
        workerResponse.status
      )
    }

    const data = await workerResponse.json()

    // Forward caching headers from worker
    const response = NextResponse.json(data)

    const cacheControl = workerResponse.headers.get('Cache-Control')
    if (cacheControl) {
      response.headers.set('Cache-Control', cacheControl)
    }

    const etag = workerResponse.headers.get('ETag')
    if (etag) {
      response.headers.set('ETag', etag)
    }

    return response

  } catch (error) {
    logger.error('[ProjectFilesAPI] Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return noCacheErrorResponse(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      500
    )
  }
}
