/**
 * Business Events API Route
 *
 * POST /api/inhouse/projects/[id]/business-events - Emit a funnel/business event
 * GET  /api/inhouse/projects/[id]/business-events - List business events (leads, signups, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker, intParam } from '@/lib/api/worker-helpers'
import { assertSameOrigin } from '@/lib/security/csrf'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params

    // Get user session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Verify project ownership
    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    // Parse query params
    const { searchParams } = new URL(request.url)
    const queryParams: Record<string, string | number> = {}

    // Parse and validate eventTypes (comma-separated, max 20)
    const eventTypesRaw = searchParams.get('eventTypes')
    if (eventTypesRaw) {
      const types = eventTypesRaw
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      if (types.length > 20) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Too many eventTypes (max 20)' } },
          { status: 400 }
        )
      }

      if (types.length > 0) {
        queryParams.eventTypes = types.join(',')
      }
    }

    const limit = intParam(searchParams.get('limit'), { min: 1, max: 100, defaultValue: 50 })
    if (limit !== undefined) queryParams.limit = limit

    const offset = intParam(searchParams.get('offset'), { min: 0, max: 1_000_000 })
    const cursor = intParam(searchParams.get('cursor'), { min: 1 })

    // Reject if both cursor and offset are provided (ambiguous)
    if (cursor !== undefined && offset !== undefined) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Use either cursor OR offset, not both.' } },
        { status: 400 }
      )
    }

    // Prefer cursor over offset for "Load More" pagination
    if (cursor !== undefined) {
      queryParams.cursor = cursor
    } else if (offset !== undefined) {
      queryParams.offset = offset
    }

    // Validate date formats (YYYY-MM-DD)
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    const startDate = searchParams.get('startDate')
    if (startDate) {
      if (!dateRe.test(startDate)) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid startDate. Use YYYY-MM-DD.' } },
          { status: 400 }
        )
      }
      queryParams.startDate = startDate
    }

    const endDate = searchParams.get('endDate')
    if (endDate) {
      if (!dateRe.test(endDate)) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid endDate. Use YYYY-MM-DD.' } },
          { status: 400 }
        )
      }
      queryParams.endDate = endDate
    }

    // Call worker to list events
    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/business-events`,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      claims: { userId: user.id }
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(
      { ok: true, data: result.data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] List business events error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list events' } },
      { status: 500 }
    )
  }
}

/**
 * POST - Emit a funnel/business event from the frontend
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // CSRF protection for cookie-authenticated mutations
    assertSameOrigin(request)

    const { id: projectId } = await params

    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    const body = await request.json()
    const { eventType, payload } = body

    if (!eventType || typeof eventType !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'eventType is required' } },
        { status: 400 }
      )
    }

    // Generate idempotency key if not provided (allows client retries with same key)
    const idempotencyKey =
      typeof body.idempotencyKey === 'string' && body.idempotencyKey.length > 0
        ? body.idempotencyKey
        : randomUUID()

    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/projects/${projectId}/business-events`,
      body: {
        projectId,
        userId: user.id,
        eventType,
        occurredAt: new Date().toISOString(),
        source: 'server',
        payload: payload || {},
        idempotencyKey,
      },
      claims: { userId: user.id },
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      )
    }

    // Return idempotency key so client can use it for retries
    return NextResponse.json({ ok: true, data: { idempotencyKey } }, { status: 201 })
  } catch (error) {
    console.error('[API] Emit business event error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to emit event' } },
      { status: 500 }
    )
  }
}
