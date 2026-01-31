/**
 * Analytics Counts API Route
 *
 * GET /api/inhouse/projects/[id]/analytics/counts - Get event counts
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
    const queryParams: Record<string, string> = {}

    const eventType = searchParams.get('eventType')
    if (eventType) queryParams.eventType = eventType

    const startDate = searchParams.get('startDate')
    if (startDate) queryParams.startDate = startDate

    const endDate = searchParams.get('endDate')
    if (endDate) queryParams.endDate = endDate

    const groupBy = searchParams.get('groupBy')
    if (groupBy) queryParams.groupBy = groupBy

    // Call worker to get counts
    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/analytics/counts`,
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
    console.error('[API] Get counts error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get counts' } },
      { status: 500 }
    )
  }
}
