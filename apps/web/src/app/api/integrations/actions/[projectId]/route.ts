/**
 * Integration Actions API Route
 *
 * Frontend proxy to the backend integration actions endpoint.
 * Handles idempotent action execution with proper authentication.
 *
 * POST /api/integrations/actions/{projectId}
 * Body: IntegrationActionRequest
 * Returns: IntegrationActionResponse
 */

import { NextRequest, NextResponse } from 'next/server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import type {
  IntegrationActionRequest,
  IntegrationActionResponse,
  IntegrationErrorResponse
} from '@/types/integrationStatus'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const correlationId = crypto.randomUUID()
  const { projectId } = params

  try {
    // Validate projectId parameter
    if (!projectId) {
      const error: IntegrationErrorResponse = {
        error: 'missing_project_id',
        message: 'Project ID is required',
        code: 'MISSING_PROJECT_ID'
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

    // Parse request body
    let actionRequest: IntegrationActionRequest & { userId: string }
    try {
      actionRequest = await request.json()
    } catch (parseError) {
      const error: IntegrationErrorResponse = {
        error: 'invalid_json',
        message: 'Request body must be valid JSON',
        code: 'INVALID_REQUEST_BODY'
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

    // Validate required fields
    if (!actionRequest.provider || !actionRequest.action || !actionRequest.userId) {
      const error: IntegrationErrorResponse = {
        error: 'missing_required_fields',
        message: 'provider, action, and userId are required',
        code: 'MISSING_REQUIRED_FIELDS',
        params: {
          provider: !!actionRequest.provider,
          action: !!actionRequest.action,
          userId: !!actionRequest.userId
        }
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

    // Extract idempotency key from headers
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey) {
      const error: IntegrationErrorResponse = {
        error: 'missing_idempotency_key',
        message: 'Idempotency-Key header is required',
        code: 'MISSING_IDEMPOTENCY_KEY'
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

    // Build backend API URL
    const workerBaseUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL
    if (!workerBaseUrl) {
      throw new Error('Worker base URL not configured')
    }

    const backendPath = `/api/integrations/actions/${projectId}`
    const backendUrl = `${workerBaseUrl}${backendPath}`
    const requestBody = JSON.stringify(actionRequest)

    // Create authentication headers for backend
    const authHeaders = createWorkerAuthHeaders('POST', backendPath, requestBody)

    logger.info('Executing integration action via backend', {
      correlationId,
      projectId: projectId.slice(0, 8),
      userId: actionRequest.userId.slice(0, 8),
      provider: actionRequest.provider,
      action: actionRequest.action,
      idempotencyKey: idempotencyKey.slice(0, 8),
      hasPayload: !!actionRequest.payload
    })

    // Forward request to backend with authentication
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Idempotency-Key': idempotencyKey,
        'User-Agent': 'SheenApps-Frontend/1.0',
        'X-Correlation-ID': correlationId
      },
      body: requestBody,
      signal: AbortSignal.timeout(30000) // 30 second timeout for actions
    })

    // Handle non-200 responses
    if (!response.ok) {
      let errorDetails: any
      try {
        errorDetails = await response.json()
      } catch {
        errorDetails = { message: response.statusText }
      }

      logger.error('Backend integration action request failed', {
        correlationId,
        projectId: projectId.slice(0, 8),
        provider: actionRequest.provider,
        action: actionRequest.action,
        status: response.status,
        statusText: response.statusText,
        error: errorDetails
      })

      const error: IntegrationErrorResponse = {
        error: 'action_failed',
        message: errorDetails.message || 'Integration action failed',
        code: 'ACTION_EXECUTION_FAILED',
        params: {
          provider: actionRequest.provider,
          action: actionRequest.action,
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
    const data: IntegrationActionResponse = await response.json()

    logger.info('Integration action executed successfully', {
      correlationId,
      projectId: projectId.slice(0, 8),
      provider: actionRequest.provider,
      action: actionRequest.action,
      success: data.success,
      operationId: data.operationId?.slice(0, 8)
    })

    // Return successful response
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Correlation-ID': correlationId
      }
    })

  } catch (error) {
    logger.error('Integration action API error', {
      correlationId,
      projectId: projectId?.slice(0, 8),
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    const errorResponse: IntegrationErrorResponse = {
      error: 'internal_error',
      message: 'Internal server error while executing integration action',
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