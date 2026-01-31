/**
 * Catch-all proxy for inhouse project-scoped routes.
 *
 * Handles GET, POST, PUT, PATCH, DELETE for thin proxy routes that only
 * do: withProjectOwner → callWorker → workerResponse.
 *
 * Routes with custom logic (Zod validation, CSRF, intParam, direct DB calls,
 * SecretsService, extraHeaders, streaming, etc.) are kept as separate files
 * and take priority over this catch-all via Next.js route matching.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'
import type { WorkerCallResult } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Pragma': 'no-cache',
}

function workerResultToResponse(result: WorkerCallResult): NextResponse {
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status, headers: NO_CACHE_HEADERS }
    )
  }
  return NextResponse.json(
    { ok: true, data: result.data },
    { status: 200, headers: NO_CACHE_HEADERS }
  )
}

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  try {
    const { id: projectId, path: pathSegments } = await params

    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: { code: 'MISSING_PROJECT_ID', message: 'Project ID is required' } },
        { status: 400, headers: NO_CACHE_HEADERS }
      )
    }

    // Authenticate user
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401, headers: NO_CACHE_HEADERS }
      )
    }

    // Verify project ownership
    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    const method = request.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
    const joinedPath = pathSegments.map(s => encodeURIComponent(s)).join('/')
    const workerPath = `/v1/inhouse/projects/${projectId}/${joinedPath}`

    if (method === 'GET' || method === 'DELETE') {
      // Forward userId as query param + any original search params
      const queryParams: Record<string, string> = {}
      const { searchParams } = new URL(request.url)
      searchParams.forEach((value, key) => {
        queryParams[key] = value
      })
      // Force trusted userId last — prevents client-supplied ?userId= from overwriting
      queryParams.userId = user.id

      const result = await callWorker({
        method,
        path: workerPath,
        queryParams,
        claims: { userId: user.id },
      })
      return workerResultToResponse(result)
    }

    // POST, PUT, PATCH — forward body with userId injected
    let body: Record<string, unknown> = { userId: user.id }
    try {
      const parsed = await request.json()
      body = { ...parsed, userId: user.id }
    } catch {
      // Some endpoints send no body (e.g. restore, suspend actions)
    }

    const result = await callWorker({
      method,
      path: workerPath,
      body,
      claims: { userId: user.id },
    })
    return workerResultToResponse(result)
  } catch (error) {
    console.error('[API] Inhouse project catch-all error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500, headers: NO_CACHE_HEADERS }
    )
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
