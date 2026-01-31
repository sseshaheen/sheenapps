/**
 * Persistent Chat SSE Stream API Route
 * Server-side proxy for backend SSE events with HMAC authentication
 * 
 * CRITICAL: EventSource cannot send headers, so this proxy handles authentication
 */

import 'server-only'
import { NextRequest } from 'next/server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { logger } from '@/utils/logger'

const PERSISTENT_CHAT_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // Expert recommendation for stable timers/crypto
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/persistent-chat/stream
 * Stream live chat events via SSE
 *
 * Implementation of SSE_ARCHITECTURE_ANALYSIS.md
 * Supports client_instance_id for leader-tab pattern
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Get query parameters and Last-Event-ID header for SSE resume
    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')
    const clientInstanceId = searchParams.get('client_instance_id') // NEW: For leader-tab pattern
    const since = searchParams.get('since')
    const includeGitHubEvents = searchParams.get('include_github_events') === 'true'

    if (!projectId) {
      return new Response('project_id is required', { status: 400 })
    }

    // EXPERT FIX: Use request.headers directly (no need for await headers() in route handlers)
    const leiRaw = request.headers.get('last-event-id') ?? request.headers.get('Last-Event-ID') ?? ''
    const lastEventId = leiRaw.length <= 1024 ? leiRaw : leiRaw.slice(0, 1024)
    
    // Build query string with resume support (project_id is already in the URL path)
    const queryParams = new URLSearchParams()
    
    // Priority: explicit since parameter > Last-Event-ID header (SSE resume) > default (Expert feedback)
    if (since) {
      queryParams.set('from_seq', since)
      logger.info('SSE Start: Using explicit since parameter (overrides Last-Event-ID)', { 
        projectId, 
        fromSeq: since,
        userId: user?.id 
      }, 'persistent-chat')
    } else if (lastEventId) {
      queryParams.set('from_seq', lastEventId)
      logger.info('SSE Resume: Using Last-Event-ID for resuming stream', { 
        projectId, 
        fromSeq: lastEventId,
        userId: user?.id 
      }, 'persistent-chat')
    } else {
      // EXPERT FIX: Default to sequence 0 when starting fresh (from_seq is exclusive, so 0 gets message #1)
      queryParams.set('from_seq', '0')
      logger.info('SSE Start: Starting fresh stream from sequence 0', {
        projectId,
        fromSeq: '0',
        userId: user?.id
      }, 'persistent-chat')
    }

    // Add GitHub events parameter if requested
    if (includeGitHubEvents) {
      queryParams.set('include_github_events', 'true')
      logger.info('SSE: Including GitHub events in stream', {
        projectId,
        userId: user?.id
      }, 'persistent-chat')
    }

    // NEW: Forward client_instance_id for leader-tab pattern
    if (clientInstanceId) {
      queryParams.set('client_instance_id', clientInstanceId)
      logger.info('SSE: Using client_instance_id for leader-tab pattern', {
        projectId,
        clientInstanceId: clientInstanceId.substring(0, 8),
        userId: user?.id
      }, 'persistent-chat')
    }

    const path = `/v1/projects/${projectId}/chat/stream`
    const query = queryParams.toString()
    const pathWithQuery = query ? `${path}?${query}` : path
    const body = ''

    // Generate dual signature headers (V1 + V2 for rollout compatibility)
    const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, body)

    // Get locale from request headers
    const acceptLanguage = request.headers.get('accept-language')
    const locale = parseLocale(acceptLanguage)

    // Create upstream abort controller for proper cleanup
    const upstreamAbort = new AbortController()

    // Create upstream request to backend
    const upstreamResponse = await fetch(`${PERSISTENT_CHAT_BASE_URL}${pathWithQuery}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...authHeaders,
        'x-sheen-locale': locale,
        'x-user-id': user.id
        // EXPERT FIX Round 11: Resume is canonically handled via from_seq query param only
        // Last-Event-ID is extracted and converted to from_seq above; not forwarded to upstream
        // EXPERT FIX: Remove Authorization Bearer (not needed with HMAC)
        // 'Authorization': `Bearer ${user.id}` // Removed - HMAC auth is sufficient
      },
      // EXPERT FIX: Pass abort signal to upstream fetch for proper cleanup
      signal: upstreamAbort.signal
    })

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text()
      logger.error('Persistent chat SSE proxy error:', {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        body: errorText,
        projectId,
        userId: user.id
      })
      
      return new Response(
        `Backend SSE connection failed: ${upstreamResponse.status}`,
        { status: upstreamResponse.status }
      )
    }

    // Set up SSE response headers (expert-recommended complete set)
    // EXPERT FIX: Removed CORS headers (same-origin, unnecessary and risky)
    // EXPERT FIX: Removed Connection header (hop-by-hop, may be stripped by proxies)
    const responseHeaders = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, no-transform, must-revalidate',
      'Content-Encoding': 'identity', // No compression for SSE
      'X-Accel-Buffering': 'no', // Disable proxy buffering
      'X-Upstream-Status': String(upstreamResponse.status), // Helpful for debugging (Expert suggestion)
      'Vary': 'Accept-Language' // EXPERT FIX Round 13: Correct caching semantics
    })

    // Lifecycle management state (hoisted for cancel() access)
    let closed = false
    let hb: ReturnType<typeof setInterval> | null = null
    let lastPush = Date.now()
    // EXPERT FIX: Create TextEncoder once, not every heartbeat tick
    const encoder = new TextEncoder()
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null

    // Single idempotent cleanup function (Expert pattern) - hoisted for cancel() access
    const finalize = (reason = 'finalize') => {
      if (closed) return
      closed = true
      if (hb) { clearInterval(hb); hb = null }
      try { reader?.cancel().catch(() => {}) } catch {}
      try { upstreamAbort.abort() } catch {}
      try { controller?.close() } catch {}

      // Enhanced logging with privacy considerations (Expert suggestion)
      logger.debug('SSE finalize', 'persistent-chat', {
        reason,
        projectId,
        userId: user.id,
        upstreamStatus: upstreamResponse.status,
        lastEventIdLength: lastEventId?.length || 0
      })
    }

    // Stream the response back to client with lifecycle hardening
    const readable = new ReadableStream({
      start(ctrl) {
        controller = ctrl
        reader = upstreamResponse.body?.getReader() ?? null
        if (!reader) {
          controller.close()
          return
        }

        // Safe enqueue with state checking (Expert pattern)
        const safeEnqueue = (chunk: Uint8Array) => {
          if (closed) return
          try {
            if (controller!.desiredSize === null) {
              finalize('desiredSize-null')
              return
            }
            controller!.enqueue(chunk)
            lastPush = Date.now()
          } catch {
            finalize('enqueue-failed')
          }
        }

        // Smart heartbeat - only when upstream is quiet (Expert pattern)
        hb = setInterval(() => {
          if (closed) return
          if (Date.now() - lastPush < 20000) return // upstream active recently
          if (controller!.desiredSize === null) {
            finalize('hb-desiredSize-null')
            return
          }
          // EXPERT FIX Round 13: Skip heartbeats when backpressured (desiredSize <= 0)
          // Prevents memory accumulation if client stalls
          if (controller!.desiredSize <= 0) return
          // EXPERT FIX: Use pre-created encoder (created once above)
          safeEnqueue(encoder.encode(': proxy-heartbeat\n\n'))
        }, 20000)

        // Bridge client disconnect to upstream (Expert suggestion)
        request.signal.addEventListener('abort', () => finalize('client-abort'), { once: true })

        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader!.read()

              if (done) {
                logger.info('SSE stream ended for project', { projectId, userId: user.id })
                break
              }

              // Forward the chunk to client using safe enqueue
              safeEnqueue(value)
            }
          } catch (error) {
            logger.error('SSE stream error:', {
              error: error instanceof Error ? error.message : String(error),
              projectId,
              userId: user.id
            })
          } finally {
            finalize('pump-ended')
          }
        }

        pump()
      },

      // FIXED: Properly implement cancel() to call cleanup
      cancel() {
        logger.info('SSE stream cancelled by client', { projectId, userId: user.id })
        finalize('cancel')
      }
    })

    return new Response(readable, {
      headers: responseHeaders
    })

  } catch (error) {
    logger.error('Persistent chat SSE API error:', error)
    return new Response('Internal server error', { status: 500 })
  }
}

/**
 * Parse Accept-Language header to extract locale
 * EXPERT FIX Round 13: Changed return type to string (always returns 'en' fallback)
 */
function parseLocale(acceptLanguage: string | null): string {
  if (!acceptLanguage) return 'en'

  const locales = acceptLanguage.split(',').map(lang => {
    const [locale] = lang.trim().split(';')
    return locale.toLowerCase()
  })

  // Convert to base locale for backend compatibility
  for (const locale of locales) {
    const base = locale.split('-')[0]
    const supportedBaseLocales = ['en', 'ar', 'fr', 'es', 'de']
    if (supportedBaseLocales.includes(base)) {
      return base
    }
  }

  return 'en'
}