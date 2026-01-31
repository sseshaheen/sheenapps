/**
 * Individual Schedule API Route
 *
 * PATCH  /api/inhouse/projects/[id]/jobs/schedules/[scheduleId] - Update schedule
 * DELETE /api/inhouse/projects/[id]/jobs/schedules/[scheduleId] - Delete schedule
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string; scheduleId: string }>
}

// =============================================================================
// PATCH - Update schedule
// =============================================================================

interface UpdateScheduleRequest {
  cronExpression?: string
  payload?: Record<string, unknown>
  active?: boolean
  timezone?: string
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, scheduleId } = await params

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
    const body = await request.json() as UpdateScheduleRequest

    // Validate at least one field to update
    if (
      body.cronExpression === undefined &&
      body.payload === undefined &&
      body.active === undefined &&
      body.timezone === undefined
    ) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'At least one field to update is required' } },
        { status: 400 }
      )
    }

    // Call worker to update schedule
    const result = await callWorker({
      method: 'PATCH',
      path: `/v1/inhouse/jobs/schedules/${scheduleId}`,
      body,
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
    console.error('[API] Update schedule error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update schedule' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE - Delete schedule
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, scheduleId } = await params

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

    // Call worker to delete schedule
    const result = await callWorker({
      method: 'DELETE',
      path: `/v1/inhouse/jobs/schedules/${scheduleId}`,
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
    console.error('[API] Delete schedule error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete schedule' } },
      { status: 500 }
    )
  }
}
