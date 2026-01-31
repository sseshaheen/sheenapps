/**
 * GitHub Sync Trigger API Route
 * POST /api/projects/[id]/github/sync/trigger
 * Triggers manual sync operations (push/pull/sync)
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
const SyncTriggerSchema = z.object({
  operation_type: z.enum(['push', 'pull', 'sync']),
  commit_message: z.string().optional(),
  create_pr: z.boolean().default(false),
  pr_title: z.string().optional(),
  pr_body: z.string().optional(),
  conflict_resolution: z.enum(['ours', 'theirs', 'manual']).optional(),
  force_sync: z.boolean().default(false)
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId()
    if (!userId) {
      logger.error('GitHub sync trigger: Unauthorized access attempt')
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const { id: projectId } = await params
    logger.info('GitHub sync trigger request', { projectId, userId })

    // Validate request body
    const body = await request.json()
    const syncData = SyncTriggerSchema.parse(body)

    // Prepare worker API call
    const workerUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerUrl) {
      logger.error('GitHub sync trigger: Worker URL not configured')
      return noCacheErrorResponse('Service configuration error', 500)
    }

    const endpoint = `/v1/projects/${projectId}/github/sync/trigger`
    const requestBody = {
      ...syncData,
      user_id: userId,
      triggered_at: new Date().toISOString()
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
      logger.error('GitHub sync trigger: Worker API error', {
        status: response.status,
        error: errorData,
        projectId,
        operationType: syncData.operation_type
      })

      // Handle specific error cases
      if (response.status === 404) {
        return noCacheErrorResponse('No GitHub repository linked to this project', 404)
      }
      if (response.status === 409) {
        return noCacheErrorResponse('Another sync operation is already in progress', 409)
      }
      if (response.status === 403) {
        return noCacheErrorResponse('Insufficient permissions for this sync operation', 403)
      }
      if (response.status === 429) {
        return noCacheErrorResponse('Rate limit exceeded. Please try again later', 429)
      }

      return noCacheErrorResponse(
        errorData.message || 'Failed to trigger sync operation', 
        response.status
      )
    }

    const data = await response.json()
    logger.info('GitHub sync triggered successfully', { 
      projectId, 
      operationType: syncData.operation_type,
      operationId: data.id 
    })

    return noCacheResponse(data)

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('GitHub sync trigger: Invalid request data', { error: error.issues })
      return noCacheErrorResponse('Invalid request data', 400)
    }

    logger.error('GitHub sync trigger: Unexpected error', error)
    return noCacheErrorResponse('Failed to trigger sync operation', 500)
  }
}