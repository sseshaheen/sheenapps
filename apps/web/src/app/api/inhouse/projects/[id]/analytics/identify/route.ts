/**
 * Analytics Identify API Route
 *
 * POST /api/inhouse/projects/[id]/analytics/identify - Identify user
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

interface IdentifyRequest {
  userId: string
  traits?: Record<string, unknown>
  anonymousId?: string
  timestamp?: string
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
    const body = await request.json() as IdentifyRequest

    // Validate userId
    if (!body.userId || typeof body.userId !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'userId is required' } },
        { status: 400 }
      )
    }

    // Call worker to identify user
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/projects/${projectId}/analytics/identify`,
      body: {
        userId: body.userId,
        traits: body.traits,
        anonymousId: body.anonymousId,
        timestamp: body.timestamp
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
    console.error('[API] Identify user error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to identify user' } },
      { status: 500 }
    )
  }
}
