/**
 * Admin Logs SSE Stream API Route
 * Real-time log streaming for active builds with connection limiting
 * Proxies backend SSE stream with frontend connection management
 */

import 'server-only'
import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { logger } from '@/utils/logger'
import { v4 as uuidv4 } from 'uuid'

// SSE connection management (cleanup only - no limiting, backend handles limits)

interface SSELogsQuery {
  tier?: 'system' | 'build' | 'deploy' | 'action' | 'lifecycle'
  buildId?: string
  userId?: string
  projectId?: string
  instanceId?: string
  since?: string // For resuming from a specific log entry
}

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'


export async function GET(request: NextRequest) {
  const correlationId = uuidv4()

  try {
    // Admin authentication
    const adminSession = await AdminAuthService.getAdminSession()

    if (!adminSession) {
      return new Response('Admin authentication required', { status: 401 })
    }

    // Permission check
    const hasPermission = adminSession.permissions.includes('read_logs') ||
                         adminSession.permissions.includes('admin:*') ||
                         adminSession.user.role === 'super_admin'

    if (!hasPermission) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient permissions',
          required: 'read_logs',
          current: adminSession.permissions
        }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse query parameters
    const searchParams = request.nextUrl.searchParams
    const query: SSELogsQuery = {
      tier: searchParams.get('tier') as SSELogsQuery['tier'] || 'build',
      buildId: searchParams.get('buildId') || undefined,
      userId: searchParams.get('userId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      instanceId: searchParams.get('instanceId') || undefined,
      since: searchParams.get('since') || undefined
    }

    // Validate required parameters for SSE
    if (!query.buildId && !query.projectId && !query.userId) {
      return new Response(
        JSON.stringify({ error: 'At least one of buildId, projectId, or userId is required for SSE streaming' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    }

    // Generate connection ID for logging
    const connectionId = correlationId

    logger.info('SSE connection established', {
      adminId: adminSession.user.id.slice(0, 8),
      connectionId,
      query
    })

    try {
      // Build query string for backend SSE endpoint
      const queryString = new URLSearchParams()
      Object.entries(query).forEach(([key, value]) => {
        if (value !== undefined) {
          queryString.append(key, value)
        }
      })

      // Connect to backend SSE endpoint
      const workerBaseUrl = process.env.WORKER_BASE_URL || process.env.NEXT_PUBLIC_WORKER_BASE_URL || 'http://localhost:8081'
      const path = `/admin/logs/stream-sse`
      const pathWithQuery = `${path}?${queryString.toString()}`
      const url = `${workerBaseUrl}${pathWithQuery}`

      // Create worker auth headers
      const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, '')

      const upstreamResponse = await fetch(url, {
        method: 'GET',
        headers: {
          ...authHeaders,
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(adminSession.token && { 'Authorization': `Bearer ${adminSession.token}` })
        },
        signal: AbortSignal.timeout(300000) // 5 minute timeout
      })

      if (!upstreamResponse.ok) {
        throw new Error(`Backend SSE failed: ${upstreamResponse.status} ${upstreamResponse.statusText}`)
      }

      // Create SSE response
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()

      // Handle cleanup on client disconnect
      const cleanup = () => {
        logger.info('SSE connection closed', { connectionId })
      }

      // Stream from backend to client
      const streamToClient = async () => {
        try {
          const reader = upstreamResponse.body?.getReader()
          if (!reader) {
            throw new Error('No response body')
          }

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            await writer.write(value)
          }
        } catch (error) {
          logger.error('SSE streaming error', {
            connectionId,
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
          'X-Connection-ID': connectionId,
          // Backend handles connection tracking
        }
      })

    } catch (backendError) {
      // Clean up connection on error
      // Backend handles connection tracking

      // Check for mock fallback
      const mockFallbackEnabled = process.env.ENABLE_ADMIN_MOCK_FALLBACK === 'true'

      logger.warn('Backend SSE connection failed', {
        adminId: adminSession.user.id.slice(0, 8),
        connectionId,
        mockFallbackEnabled,
        query,
        error: backendError instanceof Error ? backendError.message : String(backendError)
      })

      if (!mockFallbackEnabled) {
        throw backendError
      }

      // Mock SSE stream for development
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()

      // Generate mock SSE events
      const generateMockEvents = async () => {
        try {
          for (let i = 1; i <= 10; i++) {
            const mockEvent = {
              timestamp: new Date().toISOString(),
              instanceId: "01HMOCK",
              tier: query.tier || 'build',
              seq: i,
              buildId: query.buildId || 'mock-build-123',
              userId: query.userId || 'mock-user-456',
              projectId: query.projectId || 'mock-project-789',
              event: 'stdout',
              message: `Mock ${query.tier || 'build'} log entry #${i}`,
              metadata: {
                mockData: true,
                connectionId,
                tier: query.tier
              }
            }

            const sseData = `data: ${JSON.stringify(mockEvent)}\n\n`
            await writer.write(new TextEncoder().encode(sseData))

            // Wait 2 seconds between events
            await new Promise(resolve => setTimeout(resolve, 2000))
          }

          // Send completion event
          const completionEvent = `data: ${JSON.stringify({ type: 'complete', connectionId })}\n\n`
          await writer.write(new TextEncoder().encode(completionEvent))

        } catch (error) {
          logger.error('Mock SSE generation error', { connectionId, error })
        } finally {
          try {
            await writer.close()
          } catch (e) {
            // Ignore close errors
          }
          // Backend handles connection tracking
        }
      }

      // Start mock generation
      generateMockEvents()

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Last-Event-ID',
          'X-Connection-ID': connectionId,
          // Backend handles connection tracking,
          'X-Mock-Data': 'true',
          'X-Mock-Reason': 'Backend SSE unavailable'
        }
      })
    }

  } catch (error) {
    logger.error('Admin SSE logs API error', {
      correlationId,
      error: error instanceof Error ? error.message : String(error)
    })

    return new Response(
      JSON.stringify({
        error: 'Failed to establish SSE connection',
        details: error instanceof Error ? error.message : String(error),
        correlation_id: correlationId
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }
}