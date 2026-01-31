import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import type { CleanBuildApiResponse, CleanBuildEvent } from '@/types/build-events'
import { logger } from '@/utils/logger'
import { NextRequest, NextResponse } from 'next/server'

// Helper to safely parse numeric fields (Supabase can return numeric as string)
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

// Ensure this API route is always dynamic and never cached
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ buildId: string }> }
) {
  const startTime = Date.now()

  try {
    const { buildId } = await params
    const { searchParams } = new URL(request.url)
    // Safely parse lastEventId - handle NaN from invalid input
    const lastEventIdRaw = Number(searchParams.get('lastEventId'))
    const lastEventId = Number.isFinite(lastEventIdRaw) ? lastEventIdRaw : 0
    // SECURITY: Only allow debug mode in development to prevent data leakage
    const debug = searchParams.get('debug') === 'true' && process.env.NODE_ENV !== 'production'

    // SECURITY FIX: Get userId from session, NOT from query parameters
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      logger.error('❌ Unauthorized request - invalid session')
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized - invalid session',
          events: [],
          lastEventId: 0
        },
        { status: 401 }
      )
    }

    const userId = user.id

    logger.info('🔍 BUILD EVENTS API REQUEST:', {
      buildId: buildId.slice(0, 8),
      userId: userId.slice(0, 8),
      lastEventId,
      debug,
      timestamp: new Date().toISOString()
    })

    // Validate buildId format (should be ULID)
    if (!buildId || buildId.length < 20) {
      logger.error('❌ Invalid buildId format:', { buildId })
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid buildId format',
          events: [],
          lastEventId: 0
        },
        { status: 400 }
      )
    }

    // STEP 1: Diagnostic Query - Only run when debug=true to avoid unnecessary queries
    let allEvents: any[] | null = null
    // SECURITY: Don't expose user IDs - just track counts
    const diagnostics = {
      totalEventsInDb: 0,
      uniqueUserCount: 0,
      currentUserEventCount: 0,
      eventsByVisibility: { visible: 0, hidden: 0 },
      eventIdRange: { min: 0, max: 0 },
      buildIdVariants: [] as string[]  // Array for JSON serialization
    }

    if (debug) {
      // Get ALL events for this build (no user filter) - helps debug data issues
      const { data: diagEvents } = await (supabase as any)
        .from('project_build_events')
        .select('id, build_id, user_id, user_visible, created_at, event_type')
        .eq('build_id', buildId)
        .order('id', { ascending: true })

      allEvents = diagEvents

      if (diagEvents && diagEvents.length > 0) {
        diagnostics.totalEventsInDb = diagEvents.length
        const uniqueUsers = new Set<string>()
        const buildVariants = new Set<string>()

        diagEvents.forEach((e: any) => {
          // Track unique users (don't expose IDs)
          uniqueUsers.add(e.user_id || 'null')
          if (e.user_id === userId) {
            diagnostics.currentUserEventCount++
          }

          // Track visibility
          if (e.user_visible === true) {
            diagnostics.eventsByVisibility.visible++
          } else {
            diagnostics.eventsByVisibility.hidden++
          }

          // Track build ID variants
          buildVariants.add(e.build_id)
        })

        diagnostics.uniqueUserCount = uniqueUsers.size
        diagnostics.buildIdVariants = Array.from(buildVariants)

        // Calculate ID range
        const ids = diagEvents.map((e: any) => parseInt(e.id))
        diagnostics.eventIdRange.min = Math.min(...ids)
        diagnostics.eventIdRange.max = Math.max(...ids)
      }

      logger.info('📊 DIAGNOSTICS - Events in Database:', {
        buildId: buildId.slice(0, 8),
        totalEvents: diagnostics.totalEventsInDb,
        uniqueUsers: diagnostics.uniqueUserCount,
        currentUserEvents: diagnostics.currentUserEventCount,
        visibilityBreakdown: diagnostics.eventsByVisibility,
        idRange: `${diagnostics.eventIdRange.min} to ${diagnostics.eventIdRange.max}`,
        buildVariants: diagnostics.buildIdVariants
      })
    }

    // STEP 2: Main Query - Get events for this user
    let query = (supabase as any)
      .from('project_build_events')
      .select(`
        id, build_id, event_type, event_data, created_at, user_id,
        event_phase, event_title, event_description, overall_progress,
        finished, preview_url, error_message, duration_seconds,
        event_code, event_params, user_visible,
        error_code, error_params, user_error_message,
        version_id, version_name
      `)

    // Apply filters with logging
    const appliedFilters: string[] = []

    // Filter 1: Build ID (exact match)
    query = query.eq('build_id', buildId)
    appliedFilters.push(`build_id = ${buildId.slice(0, 8)}...`)

    // Filter 2: User ID
    query = query.eq('user_id', userId)
    appliedFilters.push(`user_id = ${userId.slice(0, 8)}`)

    // Filter 3: Visibility
    query = query.eq('user_visible', true)
    appliedFilters.push('user_visible = true')

    // Filter 4: Last Event ID (only if provided)
    if (lastEventId > 0) {
      query = query.gt('id', lastEventId)
      appliedFilters.push(`id > ${lastEventId}`)
    }

    // Filter 5: Order and limit (use id for stable ordering - created_at can have duplicates)
    query = query.order('id', { ascending: true }).limit(500)
    appliedFilters.push('ordered by id ASC, limit 500')

    logger.info('🔧 QUERY FILTERS:', appliedFilters)

    const { data: rawEvents, error } = await query

    if (error) {
      logger.error('❌ Database query failed:', {
        error: error.message,
        code: error.code,
        buildId: buildId.slice(0, 8)
      })
      return NextResponse.json(
        {
          success: false,
          error: 'Database query failed',
          events: [],
          lastEventId: 0,
          diagnostics: debug ? diagnostics : undefined
        },
        { status: 500 }
      )
    }

    // STEP 3: Analyze what we got vs what exists
    const queryResults = {
      eventsReturned: rawEvents?.length || 0,
      eventIds: rawEvents?.map((e: any) => e.id) || [],
      uniqueBuildIds: [...new Set(rawEvents?.map((e: any) => e.build_id) || [])]
    }

    // Check for missing events
    let missingEventsAnalysis = null
    if (allEvents && rawEvents) {
      const returnedIds = new Set(rawEvents.map((e: any) => e.id))
      const allUserEvents = allEvents.filter((e: any) => e.user_id === userId)
      const missingUserEvents = allUserEvents.filter((e: any) => !returnedIds.has(e.id))

      if (missingUserEvents.length > 0) {
        missingEventsAnalysis = {
          totalUserEvents: allUserEvents.length,
          returned: rawEvents.length,
          missing: missingUserEvents.length,
          missingIds: missingUserEvents.map((e: any) => e.id),
          missingVisibility: missingUserEvents.map((e: any) => ({
            id: e.id,
            visible: e.user_visible
          }))
        }

        logger.warn('⚠️ MISSING EVENTS DETECTED:', missingEventsAnalysis)
      }
    }

    logger.info('✅ QUERY RESULTS:', {
      buildId: buildId.slice(0, 8),
      eventsFound: queryResults.eventsReturned,
      eventIdRange: rawEvents?.length > 0 ? {
        min: Math.min(...rawEvents.map((e: any) => parseInt(e.id))),
        max: Math.max(...rawEvents.map((e: any) => parseInt(e.id)))
      } : null,
      missingEvents: missingEventsAnalysis
    })

    // STEP 4: Transform events to API format
    const events: CleanBuildEvent[] = (rawEvents || []).map(event => {
      // Parse event_data
      let eventData: any = {}
      if (event.event_data) {
        try {
          eventData = typeof event.event_data === 'string'
            ? JSON.parse(event.event_data)
            : event.event_data
        } catch (e) {
          logger.warn('Failed to parse event_data:', { eventId: event.id })
          eventData = {}
        }
      }

      // Parse event_params
      let eventParams: any = {}
      if (event.event_params) {
        try {
          eventParams = typeof event.event_params === 'string'
            ? JSON.parse(event.event_params)
            : event.event_params
        } catch (e) {
          eventParams = {}
        }
      }

      // Parse error_params and build structured error object
      let structuredError: { code: string; params?: Record<string, any>; message?: string } | undefined
      if (event.error_code) {
        let errorParams: Record<string, any> | undefined
        if (event.error_params) {
          try {
            errorParams = typeof event.error_params === 'string'
              ? JSON.parse(event.error_params)
              : event.error_params
          } catch {
            errorParams = undefined
          }
        }
        structuredError = {
          code: event.error_code,
          params: errorParams,
          message: event.user_error_message || undefined
        }
      }

      return {
        id: String(event.id),
        build_id: event.build_id,
        event_type: event.event_type || eventData.type || 'progress',
        phase: event.event_phase || eventData.phase || 'development',
        title: event.event_title || eventData.title || 'Processing',
        description: event.event_description || eventData.description || eventData.message || 'Build in progress',
        // Use toNumber() to handle Supabase returning numeric fields as strings
        overall_progress: toNumber(event.overall_progress) ?? toNumber(eventData.progress) ?? 0,
        // Trust only the DB finished flag - event_type 'completed' means phase completed, not build
        finished: event.finished === true,
        // Use undefined (not null) for consistency with TS types
        preview_url: event.preview_url || eventParams.deploymentUrl || eventData.previewUrl || undefined,
        error: structuredError,
        error_message: event.error_message || event.user_error_message || eventData.error || undefined,
        created_at: event.created_at,
        duration_seconds: toNumber(event.duration_seconds) ?? toNumber(eventData.duration) ?? undefined,
        step_index: eventParams.stepIndex,
        total_steps: eventParams.totalSteps,
        // i18n: Pass through event_code and event_params for frontend translation
        event_code: event.event_code || undefined,
        event_params: Object.keys(eventParams).length > 0 ? eventParams : undefined,
        // Version info for completion events (persisted, survives refresh/polling)
        versionId: event.version_id || eventData.versionId || undefined,
        versionName: event.version_name || eventData.versionName || undefined
      }
    })

    const newLastEventId = events.length > 0
      ? Math.max(...events.map(e => parseInt(e.id)))
      : lastEventId

    // STEP 5: Prepare response
    const response: CleanBuildApiResponse = {
      buildId,
      events,
      lastEventId: newLastEventId
    }

    // Add debug info if requested
    const debugInfo = debug ? {
      diagnostics,
      queryResults,
      missingEventsAnalysis,
      appliedFilters,
      queryDuration: `${Date.now() - startTime}ms`,
      timestamp: new Date().toISOString()
    } : undefined

    logger.info('📤 API RESPONSE:', {
      buildId: buildId.slice(0, 8),
      eventsCount: events.length,
      newLastEventId,
      hasCompleteEvent: events.some(e => e.finished),
      previewUrl: events.find(e => e.preview_url)?.preview_url,
      duration: `${Date.now() - startTime}ms`
    })

    // Return with cache-busting headers
    return NextResponse.json(
      { ...response, debugInfo },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          'Pragma': 'no-cache',
          'Expires': '0',
          'Surrogate-Control': 'no-store',
          'X-Query-Duration': `${Date.now() - startTime}ms`
        }
      }
    )

  } catch (error) {
    logger.error('❌ Build events API error:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        events: [],
        lastEventId: 0
      },
      { status: 500 }
    )
  }
}
