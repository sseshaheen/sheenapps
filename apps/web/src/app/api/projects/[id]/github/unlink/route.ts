/**
 * GitHub Repository Unlink API Route
 * DELETE /api/projects/[id]/github/unlink
 * Removes the GitHub repository connection from a project
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

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId()
    if (!userId) {
      logger.error('GitHub unlink: Unauthorized access attempt')
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const { id: projectId } = await params
    logger.info('GitHub unlink request', { projectId, userId })

    // Prepare worker API call
    const workerUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerUrl) {
      logger.error('GitHub unlink: Worker URL not configured')
      return noCacheErrorResponse('Service configuration error', 500)
    }

    const endpoint = `/v1/projects/${projectId}/github/unlink`
    const requestBody = { user_id: userId }

    // Create authenticated headers for worker API
    const bodyStr = JSON.stringify(requestBody)
    const authHeaders = createWorkerAuthHeaders('DELETE', endpoint, bodyStr)
    
    // Make worker API call
    const response = await fetch(`${workerUrl}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: bodyStr
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('GitHub unlink: Worker API error', {
        status: response.status,
        error: errorData,
        projectId
      })

      // Handle specific error cases
      if (response.status === 404) {
        return noCacheErrorResponse('No GitHub repository linked to this project', 404)
      }
      if (response.status === 403) {
        return noCacheErrorResponse('Insufficient permissions to unlink repository', 403)
      }

      return noCacheErrorResponse(
        errorData.message || 'Failed to unlink repository', 
        response.status
      )
    }

    const data = await response.json()
    logger.info('GitHub unlink successful', { projectId })

    return noCacheResponse(data)

  } catch (error) {
    logger.error('GitHub unlink: Unexpected error', error)
    return noCacheErrorResponse('Failed to unlink repository', 500)
  }
}