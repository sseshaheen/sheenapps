/**
 * API Key Regeneration Route
 *
 * POST /api/inhouse/projects/[id]/api-keys/[type]/regenerate
 *
 * INHOUSE_MODE_REMAINING.md Task 4:
 * - Regenerates API key with 15-minute grace period for old key
 * - Rate limited: 3/hour, 10/day per project
 * - Session-based authentication
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'
import { safeJson } from '@/lib/api/safe-json'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string; type: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, type: keyType } = await params

    // Validate key type
    if (keyType !== 'public' && keyType !== 'server') {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'INVALID_KEY_TYPE',
            message: 'Key type must be "public" or "server"',
          },
        },
        { status: 400 }
      )
    }

    // Get user session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'You must be logged in to regenerate API keys',
          },
        },
        { status: 401 }
      )
    }

    // EXPERT FIX ROUND 7: Use shared helper for ownership check (reduces drift)
    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    // Call worker endpoint
    // EXPERT FIX ROUND 5: Use explicit body variable for signature consistency
    const workerUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'
    const path = `/v1/inhouse/projects/${projectId}/keys/${keyType}/regenerate`
    const body = JSON.stringify({})

    const headers = {
      ...createWorkerAuthHeaders('POST', path, body),
      'Content-Type': 'application/json',
    }

    const workerResponse = await fetch(`${workerUrl}${path}`, {
      method: 'POST',
      headers,
      body,
    })

    // EXPERT FIX ROUND 5: Use safe JSON parsing (worker might return HTML on 502)
    const data = await safeJson(workerResponse)

    // EXPERT FIX ROUND 7: Better status handling
    // - If response not ok but has valid status, use it
    // - If JSON parse failed (data is null) on a 200, use 502
    if (!workerResponse.ok || !data) {
      return NextResponse.json(
        data ?? {
          ok: false,
          error: {
            code: 'BAD_UPSTREAM',
            message: 'Worker returned invalid response',
          },
        },
        { status: workerResponse.ok ? 502 : workerResponse.status }
      )
    }

    // EXPERT FIX ROUND 7: Pass through worker status (could be 200 or 201)
    return NextResponse.json(data, {
      status: workerResponse.status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    })
  } catch (error) {
    console.error('[API] Regenerate API key error:', error)
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'Failed to regenerate API key',
        },
      },
      { status: 500 }
    )
  }
}
