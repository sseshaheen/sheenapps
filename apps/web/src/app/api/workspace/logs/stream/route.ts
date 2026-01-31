/**
 * Workspace Log Streaming API
 *
 * Real-time log streaming via Server-Sent Events
 * Uses expert-validated SSE patterns from persistent chat implementation
 */

import { NextRequest } from 'next/server'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'

// Expert pattern: Force dynamic for SSE endpoints
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface LogEvent {
  id: string
  timestamp: string
  level: 'debug' | 'info' | 'warn' | 'error'
  tier: 'system' | 'application' | 'build' | 'deploy'
  message: string
  metadata?: Record<string, any>
}

// Expert lifecycle management pattern from persistent chat
class StreamController {
  private closed = false
  private controller: ReadableStreamDefaultController | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null

  initialize(controller: ReadableStreamDefaultController) {
    this.controller = controller
    this.startHeartbeat()
  }

  private startHeartbeat() {
    // Send heartbeat every 20 seconds when upstream is quiet
    this.heartbeatInterval = setInterval(() => {
      if (!this.closed && this.controller?.desiredSize !== null) {
        this.safeEnqueue('event: heartbeat\ndata: {}\n\n')
      }
    }, 20000)
  }

  private safeEnqueue(data: string) {
    try {
      if (!this.closed && this.controller?.desiredSize !== null) {
        this.controller.enqueue(new TextEncoder().encode(data))
      }
    } catch (error) {
      logger.warn('Failed to enqueue data', { error }, 'workspace-log-stream')
      this.finalize()
    }
  }

  sendEvent(event: LogEvent) {
    const sseData = `id: ${event.id}\nevent: log\ndata: ${JSON.stringify(event)}\n\n`
    this.safeEnqueue(sseData)
  }

  sendSystemEvent(type: string, data: any) {
    const sseData = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
    this.safeEnqueue(sseData)
  }

  finalize() {
    if (this.closed) return

    this.closed = true

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }

    try {
      if (this.controller?.desiredSize !== null) {
        this.controller.close()
      }
    } catch (error) {
      logger.debug('workspace-log-stream', 'Controller already closed', { error })
    }

    this.controller = null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('project_id')
  const advisorId = searchParams.get('advisor_id')
  const lastEventId = request.headers.get('last-event-id')

  if (!projectId || !advisorId) {
    return new Response('Missing required parameters: project_id and advisor_id', {
      status: 400
    })
  }

  // Security guard: Limit Last-Event-ID size
  if (lastEventId && lastEventId.length > 1024) {
    return new Response('Last-Event-ID too large', { status: 400 })
  }

  logger.info('Starting log stream', {
    projectId,
    advisorId,
    lastEventId,
    userAgent: request.headers.get('user-agent')
  }, 'workspace-log-stream')

  try {
    // Verify workspace access
    const userCtx = await makeUserCtx()
    const hasAccess = await userCtx.client
      .from('project_advisors')
      .select(`
        status,
        workspace_permissions (view_logs)
      `)
      .eq('project_id', projectId)
      .eq('advisor_id', advisorId)
      .eq('status', 'active')
      .maybeSingle()

    if (!hasAccess?.workspace_permissions?.view_logs) {
      return new Response('Access denied: No log viewing permissions', {
        status: 403
      })
    }

    // Create SSE stream with expert lifecycle management
    const streamController = new StreamController()

    const stream = new ReadableStream({
      start(controller) {
        streamController.initialize(controller)

        // Send connection established event
        streamController.sendSystemEvent('connection_status', {
          status: 'connected',
          project_id: projectId,
          timestamp: new Date().toISOString()
        })

        // Mock log events (in real implementation, this would connect to actual log stream)
        const mockLogs: LogEvent[] = [
          {
            id: 'log_1',
            timestamp: new Date().toISOString(),
            level: 'info',
            tier: 'build',
            message: 'Build process started',
            metadata: { build_id: 'build_123', step: 'init' }
          },
          {
            id: 'log_2',
            timestamp: new Date().toISOString(),
            level: 'info',
            tier: 'build',
            message: 'Installing dependencies...',
            metadata: { build_id: 'build_123', step: 'deps' }
          },
          {
            id: 'log_3',
            timestamp: new Date().toISOString(),
            level: 'warn',
            tier: 'application',
            message: 'Deprecated API usage detected',
            metadata: { file: 'src/utils/api.ts', line: 42 }
          }
        ]

        // Send initial log batch if no lastEventId
        if (!lastEventId) {
          mockLogs.forEach(log => streamController.sendEvent(log))
        }

        // Simulate periodic log events
        const logInterval = setInterval(() => {
          const newLog: LogEvent = {
            id: `log_${Date.now()}`,
            timestamp: new Date().toISOString(),
            level: 'info',
            tier: 'application',
            message: `Application activity at ${new Date().toLocaleTimeString()}`,
            metadata: { source: 'mock_generator' }
          }
          streamController.sendEvent(newLog)
        }, 5000)

        // Cleanup on client disconnect
        const cleanup = () => {
          clearInterval(logInterval)
          streamController.finalize()
        }

        // Handle client disconnect
        request.signal.addEventListener('abort', cleanup)

        return () => cleanup()
      },

      cancel() {
        streamController.finalize()
      }
    })

    logger.info('Log stream established', {
      projectId,
      advisorId
    }, 'workspace-log-stream')

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
        'X-Upstream-Status': 'connected'
      }
    })

  } catch (error) {
    logger.error('Stream setup failed', {
      projectId,
      advisorId,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 'workspace-log-stream')

    return new Response('Internal server error', { status: 500 })
  }
}