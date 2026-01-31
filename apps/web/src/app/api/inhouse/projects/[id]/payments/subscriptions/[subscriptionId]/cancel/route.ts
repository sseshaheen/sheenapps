/**
 * Cancel Subscription API Route
 *
 * POST /api/inhouse/projects/[id]/payments/subscriptions/[subscriptionId]/cancel - Cancel subscription
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string; subscriptionId: string }>
}

interface CancelBody {
  immediately?: boolean
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, subscriptionId } = await params

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
    const body = await request.json() as CancelBody

    // Call worker to cancel subscription
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/projects/${projectId}/payments/subscriptions/${subscriptionId}/cancel`,
      body: { immediately: body.immediately },
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
    console.error('[API] Cancel subscription error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to cancel subscription' } },
      { status: 500 }
    )
  }
}
