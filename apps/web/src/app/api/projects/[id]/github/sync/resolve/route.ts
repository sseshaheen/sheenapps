/**
 * GitHub Conflict Resolution API Route
 * POST /api/projects/[id]/github/sync/resolve
 * Resolves sync conflicts with specified strategy
 */

import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/lib/server/auth'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'
import { z } from 'zod'

// Route configuration for cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Request validation schema
const ConflictResolutionSchema = z.object({
  operation_id: z.string(),
  resolution_strategy: z.enum(['ours', 'theirs', 'manual']),
  files: z.array(z.object({
    path: z.string(),
    resolution: z.enum(['ours', 'theirs', 'custom']),
    content: z.string().optional() // For custom resolutions
  })).optional(),
  commit_message: z.string().optional(),
  create_pr: z.boolean().default(true)
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId()
    if (!userId) {
      logger.error('GitHub conflict resolution: Unauthorized access attempt')
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const { id: projectId } = await params
    logger.info('GitHub conflict resolution request', { projectId, userId })

    // Validate request body
    const body = await request.json()
    const resolutionData = ConflictResolutionSchema.parse(body)

    // Prepare worker API call
    const workerUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerUrl) {
      logger.error('GitHub conflict resolution: Worker URL not configured')
      return noCacheErrorResponse('Service configuration error', 500)
    }

    const endpoint = `/v1/projects/${projectId}/github/sync/resolve`
    const requestBody = {
      ...resolutionData,
      user_id: userId,
      resolved_at: new Date().toISOString()
    }

    // Create authenticated headers for worker API
    const bodyStr = JSON.stringify(requestBody)
    const authHeaders = createWorkerAuthHeaders('POST', endpoint, bodyStr)
    
    // Make worker API call
    const response = await fetch(`${workerUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: bodyStr
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error('GitHub conflict resolution: Worker API error', {
        status: response.status,
        error: errorData,
        projectId,
        operationId: resolutionData.operation_id
      })

      // Handle specific error cases
      if (response.status === 404) {
        return noCacheErrorResponse('Sync operation not found or already resolved', 404)
      }
      if (response.status === 410) {
        return noCacheErrorResponse('Sync operation has expired and cannot be resolved', 410)
      }
      if (response.status === 403) {
        return noCacheErrorResponse('Insufficient permissions to resolve conflicts', 403)
      }
      if (response.status === 422) {
        return noCacheErrorResponse('Invalid resolution data provided', 422)
      }

      return noCacheErrorResponse(
        errorData.message || 'Failed to resolve sync conflicts', 
        response.status
      )
    }

    const data = await response.json()
    logger.info('GitHub conflict resolved successfully', { 
      projectId, 
      operationId: resolutionData.operation_id,
      strategy: resolutionData.resolution_strategy 
    })

    return noCacheResponse(data)

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('GitHub conflict resolution: Invalid request data', { error: error.issues })
      return noCacheErrorResponse('Invalid request data', 400)
    }

    logger.error('GitHub conflict resolution: Unexpected error', error)
    return noCacheErrorResponse('Failed to resolve sync conflicts', 500)
  }
}