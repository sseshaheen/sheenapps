/**
 * Secrets API Routes
 *
 * GET  /api/inhouse/projects/[id]/secrets - List secrets (metadata only)
 * POST /api/inhouse/projects/[id]/secrets - Create a new secret
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { SecretsService, type CreateSecretInput, type ListSecretsInput } from '@/lib/server/services/secrets-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

// =============================================================================
// GET - List secrets
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
    const input: ListSecretsInput = {
      category: searchParams.get('category') as ListSecretsInput['category'] || undefined,
      status: searchParams.get('status') as ListSecretsInput['status'] || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : undefined
    }

    // List secrets
    const service = new SecretsService(supabase, projectId, user.id)
    const result = await service.list(input)

    if (result.error) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.error.code === 'NOT_FOUND' ? 404 : 500 }
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
    console.error('[API] List secrets error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list secrets' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST - Create secret
// =============================================================================

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
    const body = await request.json() as CreateSecretInput

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } },
        { status: 400 }
      )
    }
    if (!body.value || typeof body.value !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'value is required' } },
        { status: 400 }
      )
    }

    // Create secret
    const service = new SecretsService(supabase, projectId, user.id)
    const result = await service.create(body)

    if (result.error) {
      const status = result.error.code === 'ALREADY_EXISTS' ? 409
        : result.error.code === 'VALIDATION_ERROR' ? 400
        : 500
      return NextResponse.json(
        { ok: false, error: result.error },
        { status }
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
    console.error('[API] Create secret error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create secret' } },
      { status: 500 }
    )
  }
}
