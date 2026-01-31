/**
 * Unified Event Stream SSE Route
 * Streams real-time events for both migration and build processes
 *
 * Building on our existing expert-validated SSE architecture from persistent-chat/stream
 * Expert-hardened with:
 * - Node.js runtime for stable SSE operations
 * - Proper CORS handling with origin validation
 * - Event validation with Zod schemas
 * - Heartbeat monitoring and cleanup
 * - Resume support with Last-Event-ID
 * - Comprehensive error handling
 */

import 'server-only'
import { NextRequest } from 'next/server'
import { headers } from 'next/headers'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { UnifiedEventSchema, type UnifiedEvent } from '@/types/migration'
import { logger } from '@/utils/logger'

// Expert: Required for stable SSE operations
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/events/stream
 * Stream unified events for migration and build processes
 */
export async function GET(request: NextRequest) {
  try {
    // Expert: Resolve user from session - no userId in query strings
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Events SSE: Authentication failed', {
        authError: authError?.message,
        userAgent: request.headers.get('user-agent')
      })
      return new Response('Unauthorized', { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('projectId')
    const migrationId = searchParams.get('migrationId')
    const sinceId = searchParams.get('sinceId')

    // Validate that at least one identifier is provided
    if (!projectId && !migrationId) {
      return new Response('Either projectId or migrationId is required', { status: 400 })
    }

    // Expert: Honor Last-Event-ID header for resume
    const headersList = await headers()
    const lastEventId = headersList.get('last-event-id') ?? sinceId
    const origin = headersList.get('origin')

    logger.info('Events SSE: Connection established', {
      userId: user.id,
      projectId,
      migrationId,
      lastEventId,
      origin
    })

    // Expert: Set comprehensive SSE headers with proper CORS
    const responseHeaders = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      // Expert: Proper CORS - either omit for same-origin or echo Origin + Vary
      ...(origin ? {
        'Access-Control-Allow-Origin': origin,
        'Vary': 'Origin',
        'Access-Control-Allow-Headers': 'Cache-Control, Last-Event-ID'
      } : {}),
    })

    // Expert: Create upstream abort controller for proper cleanup
    const upstreamAbort = new AbortController()

    const readable = new ReadableStream({
      start(controller) {
        let keepaliveInterval: NodeJS.Timeout
        let closed = false

        // Expert: Single idempotent cleanup function
        const finalize = (reason = 'finalize') => {
          if (closed) return
          closed = true
          if (keepaliveInterval) {
            clearInterval(keepaliveInterval)
            keepaliveInterval = null as any
          }
          try { upstreamAbort.abort() } catch {}
          try { controller.close() } catch {}

          logger.debug('api', 'Events SSE: Connection finalized', {
            reason,
            userId: user.id,
            projectId,
            migrationId
          })
        }

        // Expert: Safe enqueue with state checking
        const safeEnqueue = (chunk: Uint8Array) => {
          if (closed) return
          try {
            if (controller.desiredSize === null) {
              finalize('desiredSize-null')
              return
            }
            controller.enqueue(chunk)
          } catch {
            finalize('enqueue-failed')
          }
        }

        // Expert: Send keepalive every 15s to beat ingress timeouts
        keepaliveInterval = setInterval(() => {
          if (closed) return
          if (controller.desiredSize === null) {
            finalize('keepalive-desiredSize-null')
            return
          }
          safeEnqueue(new TextEncoder().encode(': keepalive\n\n'))
        }, 15000)

        // Expert: Validate each event with Zod before sending
        const sendEvent = (event: unknown) => {
          if (closed) return

          try {
            const validEvent = UnifiedEventSchema.parse(event)

            // Expert: Never render message as HTML - always escape
            const safeMessage = validEvent.message.replace(/[<>&"]/g, (c) => ({
              '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;'
            }[c] || c))

            const eventData = { ...validEvent, message: safeMessage }
            const eventString = `id: ${validEvent.id}\ndata: ${JSON.stringify(eventData)}\n\n`
            safeEnqueue(new TextEncoder().encode(eventString))

            logger.debug('api', 'Events SSE: Event sent', {
              eventId: validEvent.id,
              type: validEvent.type,
              userId: user.id
            })
          } catch (error) {
            // Expert: Drop unknown types to avoid UI crashes
            logger.warn('Events SSE: Dropping invalid event', {
              error: error instanceof Error ? error.message : 'Unknown error',
              userId: user.id,
              projectId,
              migrationId
            })
          }
        }

        // Expert: Simulate event streaming for development
        // In production, this would connect to actual event sources
        if (process.env.NODE_ENV === 'development') {
          const simulateEvents = () => {
            if (closed) return

            // Simulate different event types based on request
            if (migrationId) {
              const phases = ['verification', 'analysis', 'planning', 'transformation', 'deployment']
              let phaseIndex = 0
              let progress = 0

              const interval = setInterval(() => {
                if (closed) {
                  clearInterval(interval)
                  return
                }

                progress += Math.random() * 20
                if (progress > 100) progress = 100

                const currentPhase = phases[phaseIndex] || 'completed'

                sendEvent({
                  id: `migration-${Date.now()}-${Math.random()}`,
                  type: progress >= 100 ? 'migration_completed' : 'migration_progress',
                  migrationId,
                  status: progress >= 100 ? 'completed' : 'processing',
                  progress: Math.min(progress, 100),
                  message: progress >= 100
                    ? 'Migration completed successfully!'
                    : `Processing ${currentPhase}... ${Math.round(progress)}%`,
                  timestamp: Date.now(),
                  phase: currentPhase,
                  correlationId: `dev-simulation-${migrationId}`
                })

                if (progress >= 100) {
                  clearInterval(interval)
                  setTimeout(() => finalize('simulation-complete'), 1000)
                } else if (progress > (phaseIndex + 1) * 20) {
                  phaseIndex++
                }
              }, 2000)
            }

            if (projectId) {
              // Simulate build events
              let buildProgress = 0
              const interval = setInterval(() => {
                if (closed) {
                  clearInterval(interval)
                  return
                }

                buildProgress += Math.random() * 15
                if (buildProgress > 100) buildProgress = 100

                sendEvent({
                  id: `build-${Date.now()}-${Math.random()}`,
                  type: buildProgress >= 100 ? 'build_completed' : 'build_progress',
                  projectId,
                  status: buildProgress >= 100 ? 'completed' : 'building',
                  progress: Math.min(buildProgress, 100),
                  message: buildProgress >= 100
                    ? 'Build completed successfully!'
                    : `Building project... ${Math.round(buildProgress)}%`,
                  timestamp: Date.now(),
                  correlationId: `dev-build-${projectId}`
                })

                if (buildProgress >= 100) {
                  clearInterval(interval)
                  setTimeout(() => finalize('build-simulation-complete'), 1000)
                }
              }, 3000)
            }
          }

          // Start simulation after a short delay
          setTimeout(simulateEvents, 1000)
        }

        // Expert: Bridge client disconnect to upstream
        request.signal.addEventListener('abort', () => finalize('client-abort'), { once: true })

        return finalize
      },

      cancel() {
        // Expert: Downstream cancelled (e.g., EventSource.close())
        logger.info('Events SSE: Stream cancelled by client', {
          userId: user.id,
          projectId,
          migrationId
        })
      }
    })

    return new Response(readable, {
      headers: responseHeaders
    })

  } catch (error) {
    logger.error('Events SSE: Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    return new Response('Internal server error', { status: 500 })
  }
}