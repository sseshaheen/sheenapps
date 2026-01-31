/**
 * Events Polling Fallback Endpoint
 * Provides polling-based access to events when SSE fails
 *
 * Expert: Same auth semantics as SSE route, no userId in query
 * Designed for graceful degradation when EventSource connections fail
 */

import 'server-only'
import { NextRequest } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { UnifiedEventSchema, type UnifiedEvent } from '@/types/migration'
import { logger } from '@/utils/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * Simulated event storage for development
 * In production, this would query the actual events database
 */
const eventStorage = new Map<string, UnifiedEvent[]>()

/**
 * Get latest events for polling (simulated for development)
 */
async function getLatestEventsForPolling(
  userId: string,
  projectId?: string | null,
  migrationId?: string | null,
  sinceId?: string | null
): Promise<UnifiedEvent[]> {
  // In development, return simulated events
  if (process.env.NODE_ENV === 'development') {
    const key = projectId || migrationId || 'unknown'
    const events = eventStorage.get(key) || []

    // If sinceId is provided, return events after that ID
    if (sinceId) {
      const sinceIndex = events.findIndex(e => e.id === sinceId)
      return sinceIndex >= 0 ? events.slice(sinceIndex + 1) : events.slice(-10)
    }

    // Return latest 10 events
    return events.slice(-10)
  }

  // In production, this would query the events table
  // Example query structure:
  /*
  const { data: events } = await supabase
    .from('unified_events')
    .select('*')
    .or(`project_id.eq.${projectId},migration_id.eq.${migrationId}`)
    .gte('created_at', sinceId ? getEventTimestamp(sinceId) : new Date(Date.now() - 5 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })
    .limit(50)
  */

  return []
}

/**
 * Generate simulated events for development
 */
function generateSimulatedEvent(
  projectId?: string | null,
  migrationId?: string | null
): UnifiedEvent {
  const now = Date.now()
  const id = `${migrationId || projectId}-${now}-${Math.random()}`

  if (migrationId) {
    const phases = ['verification', 'analysis', 'planning', 'transformation', 'deployment']
    const phase = phases[Math.floor(Math.random() * phases.length)]
    const progress = Math.floor(Math.random() * 100)

    return {
      id,
      type: 'migration_progress',
      migrationId,
      status: 'processing',
      progress,
      message: `Processing ${phase}... ${progress}%`,
      timestamp: now,
      phase,
      correlationId: `dev-polling-${migrationId}`
    }
  }

  if (projectId) {
    const progress = Math.floor(Math.random() * 100)
    return {
      id,
      type: 'build_progress',
      projectId,
      status: 'building',
      progress,
      message: `Building project... ${progress}%`,
      timestamp: now,
      correlationId: `dev-polling-${projectId}`
    }
  }

  // Fallback event
  return {
    id,
    type: 'connection_status',
    status: 'connected',
    message: 'Polling connection active',
    timestamp: now,
    correlationId: `dev-polling-fallback`
  }
}

/**
 * GET /api/events/status
 * Polling fallback for SSE events
 */
export async function GET(request: NextRequest) {
  const correlationId = randomUUID()

  try {
    // Expert: Resolve user from session - same auth pattern as SSE route
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.warn('Events polling: Authentication failed', {
        correlationId,
        authError: authError?.message
      })
      return Response.json({
        error: 'Unauthorized',
        correlationId
      }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('projectId')
    const migrationId = searchParams.get('migrationId')
    const sinceId = searchParams.get('sinceId')

    // Validate that at least one identifier is provided
    if (!projectId && !migrationId) {
      return Response.json({
        error: 'Either projectId or migrationId is required',
        correlationId
      }, { status: 400 })
    }

    logger.debug('api', 'Events polling: Request received', {
      correlationId,
      userId: user.id,
      projectId,
      migrationId,
      sinceId
    })

    // Expert: Fetch latest events using same data source as SSE
    let events = await getLatestEventsForPolling(user.id, projectId, migrationId, sinceId)

    // In development, also generate a new simulated event
    if (process.env.NODE_ENV === 'development' && Math.random() > 0.3) {
      const newEvent = generateSimulatedEvent(projectId, migrationId)

      // Store the event for consistency
      const key = projectId || migrationId || 'unknown'
      const storedEvents = eventStorage.get(key) || []
      storedEvents.push(newEvent)

      // Keep only last 100 events per key
      if (storedEvents.length > 100) {
        storedEvents.splice(0, storedEvents.length - 100)
      }
      eventStorage.set(key, storedEvents)

      events = [...events, newEvent]
    }

    // Validate events with Zod schema
    const validatedEvents = events
      .map(event => {
        try {
          return UnifiedEventSchema.parse(event)
        } catch (error) {
          logger.warn('Events polling: Invalid event dropped', {
            correlationId,
            eventId: event.id || 'unknown',
            error: error instanceof Error ? error.message : 'Unknown error'
          })
          return null
        }
      })
      .filter((event): event is UnifiedEvent => event !== null)

    const response = {
      events: validatedEvents,
      hasMore: validatedEvents.length >= 50, // Indicates if client should continue polling
      nextSinceId: validatedEvents.length > 0 ? validatedEvents[validatedEvents.length - 1].id : sinceId
    }

    logger.debug('api', 'Events polling: Response sent', {
      correlationId,
      userId: user.id,
      eventCount: validatedEvents.length,
      hasMore: response.hasMore
    })

    return Response.json(response, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Correlation-ID': correlationId
      }
    })

  } catch (error) {
    logger.error('Events polling: Unexpected error', {
      correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })

    return Response.json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while fetching events',
      correlationId
    }, { status: 500 })
  }
}