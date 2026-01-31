/**
 * Integration Events SSE API Route
 *
 * Frontend proxy to the backend integration events SSE endpoint.
 * Provides real-time integration status updates via Server-Sent Events.
 *
 * GET /api/integrations/events?projectId={id}&userId={userId}&lastEventId={id}
 * Returns: Server-Sent Events stream
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'

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
    const lastEventId = searchParams.get('lastEventId')

    // Validate required parameters
    if (!projectId || !userId) {
      return new Response(
        JSON.stringify({
          error: 'missing_parameters',
          message: 'Both projectId and userId are required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify session: caller must be the same user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized', message: 'Authentication required' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ error: 'forbidden', message: 'Access denied' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Build backend API URL
    const workerBaseUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

    const backendParams = new URLSearchParams({
      projectId,
      userId
    })

    if (lastEventId) {
      backendParams.append('lastEventId', lastEventId)
    }

    const backendPath = `/api/integrations/events?${backendParams}`
    const backendUrl = `${workerBaseUrl}${backendPath}`

    // Create authentication headers for backend
    const authHeaders = createWorkerAuthHeaders('GET', backendPath, '')

    logger.info('Establishing integration events SSE proxy', {
      correlationId,
      projectId: projectId.slice(0, 8),
      userId: userId.slice(0, 8),
      hasLastEventId: !!lastEventId,
      backendUrl: backendUrl.replace(workerBaseUrl, '[WORKER_BASE_URL]')
    })

    // Connect to backend SSE stream
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        ...authHeaders,
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'User-Agent': 'SheenApps-Frontend/1.0',
        'X-Correlation-ID': correlationId
      },
      signal: AbortSignal.timeout(300000) // 5 minute timeout
    })

    if (!response.ok) {
      let errorDetails: any
      try {
        errorDetails = await response.json()
      } catch {
        errorDetails = { message: response.statusText }
      }

      logger.error('Backend integration events SSE connection failed', {
        correlationId,
        status: response.status,
        statusText: response.statusText,
        error: errorDetails
      })

      return new Response(
        JSON.stringify({
          error: 'backend_connection_failed',
          message: 'Failed to connect to integration events stream',
          details: errorDetails
        }),
        {
          status: response.status >= 500 ? 503 : response.status,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Create SSE response stream
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Handle cleanup on client disconnect
    const cleanup = () => {
      logger.info('Integration events SSE connection closed', {
        correlationId,
        projectId: projectId.slice(0, 8)
      })
    }

    // Stream from backend to client
    const streamToClient = async () => {
      try {
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body from backend')
        }

        logger.info('Integration events SSE streaming started', {
          correlationId,
          projectId: projectId.slice(0, 8)
        })

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            logger.info('Integration events SSE stream completed', {
              correlationId,
              projectId: projectId.slice(0, 8)
            })
            break
          }

          await writer.write(value)
        }
      } catch (error) {
        logger.error('Integration events SSE streaming error', {
          correlationId,
          projectId: projectId.slice(0, 8),
          error: error instanceof Error ? error.message : String(error)
        })
      } finally {
        try {
          await writer.close()
        } catch (e) {
          // Ignore close errors
        }
        cleanup()
      }
    }

    // Start streaming in background
    streamToClient()

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Last-Event-ID',
        'X-Correlation-ID': correlationId
      }
    })

  } catch (error) {
    logger.error('Integration events SSE API error', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return new Response(
      JSON.stringify({
        error: 'internal_error',
        message: 'Internal server error while establishing SSE connection',
        correlationId
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}