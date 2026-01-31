/**
 * Storage Signed Upload URL API Route
 *
 * POST /api/inhouse/projects/[id]/storage/signed-upload
 * Creates a pre-signed URL for direct browser-to-R2 uploads.
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

interface SignedUploadRequest {
  path: string
  contentType: string
  maxSizeBytes?: number
  expiresIn?: string
  public?: boolean
  metadata?: Record<string, string>
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
    const body = await request.json() as SignedUploadRequest

    // Validate required fields
    if (!body.path || typeof body.path !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'path is required' } },
        { status: 400 }
      )
    }
    if (!body.contentType || typeof body.contentType !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'contentType is required' } },
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
      path: `/v1/inhouse/storage/signed-upload`,
      body: {
        path: body.path,
        contentType: body.contentType,
        maxSizeBytes: body.maxSizeBytes,
        expiresIn: body.expiresIn || '1h',
        public: body.public ?? false,
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
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] Create signed upload URL error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create upload URL' } },
      { status: 500 }
    )
  }
}
