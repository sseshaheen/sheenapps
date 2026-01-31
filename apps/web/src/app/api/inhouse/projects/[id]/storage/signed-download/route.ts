/**
 * Storage Signed Download URL API Route
 *
 * POST /api/inhouse/projects/[id]/storage/signed-download
 * Creates a pre-signed URL for downloading private files.
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

interface SignedDownloadRequest {
  path: string
  expiresIn?: string
  downloadFilename?: string
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
    const body = await request.json() as SignedDownloadRequest

    // Validate required fields
    if (!body.path || typeof body.path !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'path is required' } },
        { status: 400 }
      )
    }

    // Validate path doesn't escape project scope
    if (body.path.includes('..') || body.path.startsWith('/')) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid path' } },
        { status: 400 }
      )
    }

    // Call worker to generate signed URL
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/storage/signed-download`,
      body: {
        path: body.path,
        expiresIn: body.expiresIn || '1h',
        downloadFilename: body.downloadFilename
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
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] Create signed download URL error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create download URL' } },
      { status: 500 }
    )
  }
}
