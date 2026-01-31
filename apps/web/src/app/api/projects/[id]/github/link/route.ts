/**
 * GitHub Repository Link API Route
 * POST /api/projects/[id]/github/link
 * Links a project to a GitHub repository
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
const LinkRequestSchema = z.object({
  installation_id: z.number(),
  repository_id: z.number(),
  repository_full_name: z.string(),
  branch: z.string().default('main'),
  sync_mode: z.enum(['protected_pr', 'hybrid', 'direct_commit']).default('protected_pr'),
  auto_sync: z.boolean().default(true),
  sync_path: z.string().optional()
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const userId = await getCurrentUserId()
    if (!userId) {
      logger.error('GitHub link: Unauthorized access attempt')
      return noCacheErrorResponse('Unauthorized', 401)
    }

    const { id: projectId } = await params
    logger.info('GitHub link request', { projectId, userId })

    // Validate request body
    const body = await request.json()
    const linkData = LinkRequestSchema.parse(body)

    // Prepare worker API call
    const workerUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerUrl) {
      logger.error('GitHub link: Worker URL not configured')
      return noCacheErrorResponse('Service configuration error', 500)
    }

    const endpoint = `/v1/projects/${projectId}/github/link`
    const requestBody = {
      ...linkData,
      user_id: userId
    }

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
      logger.error('GitHub link: Worker API error', {
        status: response.status,
        error: errorData,
        projectId
      })

      // Handle specific error cases
      if (response.status === 403) {
        return noCacheErrorResponse('Insufficient permissions for this repository', 403)
      }
      if (response.status === 404) {
        return noCacheErrorResponse('Repository not found or not accessible', 404)
      }
      if (response.status === 409) {
        return noCacheErrorResponse('Repository is already linked to another project', 409)
      }

      return noCacheErrorResponse(
        errorData.message || 'Failed to link repository', 
        response.status
      )
    }

    const data = await response.json()
    logger.info('GitHub link successful', { projectId, repositoryFullName: linkData.repository_full_name })

    return noCacheResponse(data)

  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error('GitHub link: Invalid request data', { error: error.issues })
      return noCacheErrorResponse('Invalid request data', 400)
    }

    logger.error('GitHub link: Unexpected error', error)
    return noCacheErrorResponse('Failed to link repository', 500)
  }
}