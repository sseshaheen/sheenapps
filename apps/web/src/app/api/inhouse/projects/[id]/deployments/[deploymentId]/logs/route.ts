/**
 * Deployment Logs SSE Route
 *
 * GET /api/inhouse/projects/[id]/deployments/[deploymentId]/logs
 *
 * INHOUSE_MODE_REMAINING.md Task 5: Live Deployment Logs with Hybrid SSE
 *
 * Streams deployment events to the client via Server-Sent Events.
 * - Polls worker for events and streams them
 * - Supports Last-Event-ID for reconnection
 * - Auto-closes when deployment completes
 */

import { NextRequest } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { safeJson } from '@/lib/api/safe-json'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'

export const dynamic = 'force-dynamic'
export const revalidate = 0
// EXPERT FIX ROUND 6: Use Node.js runtime to avoid edge runtime stream issues
export const runtime = 'nodejs'

interface RouteParams {
  params: Promise<{ id: string; deploymentId: string }>
}

interface DeploymentEvent {
  id: number
  deploymentId: string
  ts: string
  level: 'info' | 'warn' | 'error'
  step: string
  message: string
  meta?: Record<string, unknown>
}

interface EventsResponse {
  ok: boolean
  data?: {
    events: DeploymentEvent[]
    isComplete: boolean
    status: string
  }
  error?: {
    code: string
    message: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: projectId, deploymentId } = await params

  // Get user session for authorization
  const supabase = await createServerSupabaseClientNew()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  // EXPERT FIX ROUND 7: Use shared helper for ownership check (reduces drift)
  const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
  if (!ownerCheck.ok) return ownerCheck.response

  // Get Last-Event-ID for reconnection support
  const lastEventId = request.headers.get('Last-Event-ID')
  let afterId = 0
  if (lastEventId) {
    const parsed = parseInt(lastEventId, 10)
    if (!isNaN(parsed)) {
      afterId = parsed
    }
  }

  // Create SSE stream
  const encoder = new TextEncoder()
  const workerUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

  // EXPERT FIX ROUND 5: Use async loop instead of setInterval to prevent overlapping requests
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  // EXPERT FIX ROUND 7: Fetch with timeout to prevent hung requests eating workers
  const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) => {
    const { timeoutMs = 8000, ...rest } = init
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), timeoutMs)
    try {
      return await fetch(input, { ...rest, signal: ac.signal })
    } finally {
      clearTimeout(t)
    }
  }

  // EXPERT FIX ROUND 7: Hoist `closed` so cancel() can access it (was a real bug)
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      let currentAfterId = afterId
      let polls = 0
      const maxPolls = 120 // ~60 seconds at 500ms interval
      let isComplete = false

      // Safe close helper to prevent double-close errors
      const closeSafely = () => {
        if (closed) return
        closed = true
        try { controller.close() } catch { /* ignore */ }
      }

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        closeSafely()
      })

      // Send retry hint for browser reconnection
      controller.enqueue(encoder.encode('retry: 1000\n'))

      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: ${JSON.stringify({ deploymentId })}\n\n`))

      // Keep-alive tracking
      let lastPing = Date.now()

      // Async polling loop (no overlap)
      while (!closed && !request.signal.aborted) {
        polls++

        // Safety limit to prevent infinite polling
        if (polls > maxPolls) {
          controller.enqueue(encoder.encode(`event: timeout\ndata: ${JSON.stringify({ message: 'Stream timeout' })}\n\n`))
          closeSafely()
          break
        }

        // Keep-alive ping every 15s to prevent proxy timeouts
        if (Date.now() - lastPing > 15000) {
          controller.enqueue(encoder.encode('event: ping\ndata: {}\n\n'))
          lastPing = Date.now()
        }

        try {
          const path = `/v1/inhouse/deployments/${encodeURIComponent(deploymentId)}/events?after=${currentAfterId}`
          const headers = {
            ...createWorkerAuthHeaders('GET', path, ''),
          }

          // EXPERT FIX ROUND 7: Use timeout + safeJson to handle hung requests and HTML error pages
          const response = await fetchWithTimeout(`${workerUrl}${path}`, {
            headers,
            cache: 'no-store',
            timeoutMs: 8000,
          })
          const data = await safeJson<EventsResponse>(response)

          if (!response.ok || !data?.ok) {
            // Non-fatal: log and continue
            console.error('[SSE] Worker error:', data?.error ?? { status: response.status })
            await sleep(500)
            continue
          }

          // Stream new events (data is guaranteed non-null here due to early continue)
          for (const event of data?.data?.events || []) {
            const eventData = JSON.stringify({
              step: event.step,
              level: event.level,
              message: event.message,
              ts: event.ts,
              meta: event.meta,
            })
            controller.enqueue(encoder.encode(`id: ${event.id}\nevent: log\ndata: ${eventData}\n\n`))
            currentAfterId = event.id
          }

          // Check if deployment is complete
          if (data?.data?.isComplete && !isComplete) {
            isComplete = true
            const status = data.data.status
            controller.enqueue(encoder.encode(`event: complete\ndata: ${JSON.stringify({ status })}\n\n`))

            // Give client a moment to process final events, then close
            await sleep(1000)
            closeSafely()
            break
          }
        } catch (error) {
          console.error('[SSE] Poll error:', error)
          // Non-fatal: continue polling
        }

        await sleep(500)
      }
    },

    // EXPERT FIX ROUND 6: Ensure cleanup even if consumer cancels the stream
    cancel() {
      closed = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
