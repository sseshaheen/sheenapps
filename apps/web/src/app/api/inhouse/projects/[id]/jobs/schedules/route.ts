/**
 * Job Schedules API Route
 *
 * POST /api/inhouse/projects/[id]/jobs/schedules - Create a schedule
 * GET  /api/inhouse/projects/[id]/jobs/schedules - List schedules
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

// =============================================================================
// POST - Create a schedule
// =============================================================================

interface CreateScheduleRequest {
  name: string
  cronExpression: string
  payload: Record<string, unknown>
  timezone?: string
  timeoutMs?: number
  maxAttempts?: number
  metadata?: Record<string, unknown>
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
    const body = await request.json() as CreateScheduleRequest

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } },
        { status: 400 }
      )
    }

    if (!body.cronExpression || typeof body.cronExpression !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'cronExpression is required' } },
        { status: 400 }
      )
    }

    // Validate reserved prefix
    if (body.name.startsWith('sys:')) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Job names starting with "sys:" are reserved' } },
        { status: 400 }
      )
    }

    // Call worker to create schedule
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/jobs/schedules`,
      body: {
        name: body.name,
        cronExpression: body.cronExpression,
        payload: body.payload || {},
        timezone: body.timezone || 'UTC',
        timeoutMs: body.timeoutMs,
        maxAttempts: body.maxAttempts,
        metadata: body.metadata
      },
      claims: { userId: user.id },
      extraHeaders: { 'x-project-id': projectId }
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
    console.error('[API] Create schedule error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create schedule' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET - List schedules
// =============================================================================

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

    // Call worker to list schedules
    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/jobs/schedules`,
      claims: { userId: user.id },
      extraHeaders: { 'x-project-id': projectId }
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
    console.error('[API] List schedules error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list schedules' } },
      { status: 500 }
    )
  }
}
