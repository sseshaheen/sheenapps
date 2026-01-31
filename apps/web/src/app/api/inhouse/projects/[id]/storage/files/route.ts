/**
 * Storage Files API Route
 *
 * GET    /api/inhouse/projects/[id]/storage/files - List files
 * DELETE /api/inhouse/projects/[id]/storage/files - Delete files
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
// GET - List files
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

    // Parse query params
    const { searchParams } = new URL(request.url)
    const prefix = searchParams.get('prefix') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100
    const cursor = searchParams.get('cursor') || undefined

    // Call worker to list files
    const queryParams: Record<string, string | number> = { limit }
    if (prefix) queryParams.prefix = prefix
    if (cursor) queryParams.cursor = cursor

    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/storage/files`,
      queryParams,
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
    console.error('[API] List files error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list files' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE - Delete files
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
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
    const body = await request.json() as { paths: string[] }

    // Validate required fields
    if (!body.paths || !Array.isArray(body.paths) || body.paths.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'paths array is required' } },
        { status: 400 }
      )
    }

    if (body.paths.length > 100) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 100 paths per request' } },
        { status: 400 }
      )
    }

    // Validate paths don't escape project scope
    for (const path of body.paths) {
      if (path.includes('..') || path.startsWith('/')) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: `Invalid path: ${path}` } },
          { status: 400 }
        )
      }
    }

    // Call worker to delete files
    const result = await callWorker({
      method: 'DELETE',
      path: `/v1/inhouse/storage/files`,
      body: { paths: body.paths },
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
    console.error('[API] Delete files error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete files' } },
      { status: 500 }
    )
  }
}
