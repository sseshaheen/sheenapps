/**
 * GitHub Status API Route
 * GET /api/projects/[id]/github/status
 * Retrieves GitHub sync status for a project
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/server/auth'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'

// Route configuration for cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId()
    if (!userId) {
      logger.error('GitHub status: Unauthorized access attempt')
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const { id: projectId } = await params
    logger.info('GitHub status request', { projectId, userId })

    // Prepare worker API call
    const workerUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerUrl) {
      logger.error('GitHub status: Worker URL not configured')
      return noCacheErrorResponse('Service configuration error', 500)
    }

    const endpoint = `/v1/projects/${projectId}/github/status`
    const queryParams = new URLSearchParams({
      user_id: userId,
      _t: Date.now().toString() // Cache busting
    })

    // Create authenticated headers for worker API
    const authHeaders = createWorkerAuthHeaders('GET', `${endpoint}?${queryParams}`, '')
    
    // Make worker API call
    const response = await fetch(`${workerUrl}${endpoint}?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('GitHub status: Worker API error', {
        status: response.status,
        error: errorData,
        projectId
      })

      // Handle specific error cases
      if (response.status === 404) {
        // No GitHub configuration found - return default status
        return noCacheResponse({
          enabled: false,
          repoOwner: null,
          repoName: null,
          branch: null,
          syncMode: null,
          lastSync: null,
          pendingOperations: 0,
          recentOperations: []
        })
      }
      if (response.status === 403) {
        return noCacheErrorResponse('Insufficient permissions to access GitHub status', 403)
      }

      return noCacheErrorResponse(
        errorData.message || 'Failed to retrieve GitHub status', 
        response.status
      )
    }

    const data = await response.json()
    logger.info('GitHub status retrieved successfully', { 
      projectId, 
      enabled: data.enabled,
      repoName: data.repoName 
    })

    return noCacheResponse(data)

  } catch (error) {
    logger.error('GitHub status: Unexpected error', error)
    return noCacheErrorResponse('Failed to retrieve GitHub status', 500)
  }
}