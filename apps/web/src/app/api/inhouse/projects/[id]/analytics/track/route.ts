/**
 * Analytics Track API Route
 *
 * POST /api/inhouse/projects/[id]/analytics/track - Track custom event
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

interface TrackRequest {
  event: string
  properties?: Record<string, unknown>
  userId?: string
  anonymousId?: string
  timestamp?: string
  context?: {
    userAgent?: string
    ip?: string
    locale?: string
    timezone?: string
    screen?: { width?: number; height?: number }
    page?: { url?: string; path?: string; referrer?: string }
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
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

    // Parse request body
    const body = await request.json() as TrackRequest

    // Validate event name
    if (!body.event || typeof body.event !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'event is required' } },
        { status: 400 }
      )
    }

    // Validate identity (at least one of userId or anonymousId)
    if (!body.userId && !body.anonymousId) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Either userId or anonymousId is required' } },
        { status: 400 }
      )
    }

    // Call worker to track event
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/projects/${projectId}/analytics/track`,
      body: {
        event: body.event,
        properties: body.properties,
        userId: body.userId,
        anonymousId: body.anonymousId,
        timestamp: body.timestamp,
        context: body.context
      },
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
        status: 201,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] Track event error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to track event' } },
      { status: 500 }
    )
  }
}
