/**
 * Workflow Run Detail API Route
 *
 * GET /api/projects/[id]/run/workflow-runs/[runId] - Get workflow run details
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string; runId: string }>
}

/**
 * GET /api/projects/[id]/run/workflow-runs/[runId]
 * Get a specific workflow run with outcome data
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, runId } = await params

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

    const workerResult = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/run/workflow-runs/${runId}`,
      queryParams: { userId: user.id },
      claims: { userId: user.id },
    })

    if (!workerResult.ok) {
      return NextResponse.json(
        { ok: false, error: workerResult.error ?? { code: 'WORKER_ERROR', message: 'Failed to get workflow run' } },
        { status: workerResult.status }
      )
    }

    return NextResponse.json(
      { ok: true, data: workerResult.data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
        },
      }
    )
  } catch (error) {
    console.error('[API] Get workflow run error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get workflow run' } },
      { status: 500 }
    )
  }
}
