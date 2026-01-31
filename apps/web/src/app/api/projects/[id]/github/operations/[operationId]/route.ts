/**
 * GitHub Operation Status API Route
 * GET /api/projects/[id]/github/operations/[operationId]
 * Retrieves status of a specific GitHub sync operation
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
  { params }: { params: Promise<{ id: string; operationId: string }> }
) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId()
    if (!userId) {
      logger.error('GitHub operation status: Unauthorized access attempt')
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const { id: projectId, operationId } = await params
    logger.info('GitHub operation status request', { projectId, operationId, userId })

    // Prepare worker API call
    const workerUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerUrl) {
      logger.error('GitHub operation status: Worker URL not configured')
      return noCacheErrorResponse('Service configuration error', 500)
    }

    const endpoint = `/v1/projects/${projectId}/github/operations/${operationId}`
    const queryParams = new URLSearchParams({
      user_id: userId,
      _t: Date.now().toString() // Cache busting
    })

    // Create authenticated headers for worker API (empty body for GET)
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
      logger.error('GitHub operation status: Worker API error', {
        status: response.status,
        error: errorData,
        projectId,
        operationId
      })

      // Handle specific error cases
      if (response.status === 404) {
        return noCacheErrorResponse('Operation not found', 404)
      }
      if (response.status === 403) {
        return noCacheErrorResponse('Insufficient permissions to access operation status', 403)
      }

      return noCacheErrorResponse(
        errorData.message || 'Failed to retrieve operation status', 
        response.status
      )
    }

    const data = await response.json()
    logger.info('GitHub operation status retrieved successfully', { 
      projectId, 
      operationId,
      status: data.status 
    })

    return noCacheResponse(data)

  } catch (error) {
    logger.error('GitHub operation status: Unexpected error', error)
    return noCacheErrorResponse('Failed to retrieve operation status', 500)
  }
}

/**
 * Cancel GitHub Operation
 * DELETE /api/projects/[id]/github/operations/[operationId]
 * Cancels a running GitHub sync operation
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; operationId: string }> }
) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId()
    if (!userId) {
      logger.error('GitHub operation cancel: Unauthorized access attempt')
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const { id: projectId, operationId } = await params
    logger.info('GitHub operation cancel request', { projectId, operationId, userId })

    // Prepare worker API call
    const workerUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerUrl) {
      logger.error('GitHub operation cancel: Worker URL not configured')
      return noCacheErrorResponse('Service configuration error', 500)
    }

    const endpoint = `/v1/projects/${projectId}/github/operations/${operationId}/cancel`
    const requestBody = { user_id: userId }

    // Create authenticated headers for worker API
    const requestBodyString = JSON.stringify(requestBody)
    const authHeaders = createWorkerAuthHeaders('POST', endpoint, requestBodyString)
    
    // Make worker API call
    const response = await fetch(`${workerUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: requestBodyString
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('GitHub operation cancel: Worker API error', {
        status: response.status,
        error: errorData,
        projectId,
        operationId
      })

      // Handle specific error cases
      if (response.status === 404) {
        return noCacheErrorResponse('Operation not found or already completed', 404)
      }
      if (response.status === 409) {
        return noCacheErrorResponse('Operation cannot be cancelled in its current state', 409)
      }
      if (response.status === 403) {
        return noCacheErrorResponse('Insufficient permissions to cancel operation', 403)
      }

      return noCacheErrorResponse(
        errorData.message || 'Failed to cancel operation', 
        response.status
      )
    }

    const data = await response.json()
    logger.info('GitHub operation cancelled successfully', { projectId, operationId })

    return noCacheResponse(data)

  } catch (error) {
    logger.error('GitHub operation cancel: Unexpected error', error)
    return noCacheErrorResponse('Failed to cancel operation', 500)
  }
}