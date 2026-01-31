/**
 * Individual Secret API Routes
 *
 * GET    /api/inhouse/projects/[id]/secrets/[name] - Get secret with value
 * PATCH  /api/inhouse/projects/[id]/secrets/[name] - Update secret
 * DELETE /api/inhouse/projects/[id]/secrets/[name] - Delete secret (soft)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { SecretsService, type UpdateSecretInput } from '@/lib/server/services/secrets-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string; name: string }>
}

// =============================================================================
// GET - Get secret with decrypted value
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, name: secretName } = await params
    const decodedName = decodeURIComponent(secretName)

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

    // Get secret
    const service = new SecretsService(supabase, projectId, user.id)
    const result = await service.get(decodedName)

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
    console.error('[API] Get secret error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get secret' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// PATCH - Update secret
// =============================================================================

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, name: secretName } = await params
    const decodedName = decodeURIComponent(secretName)

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
    const body = await request.json() as UpdateSecretInput

    // Update secret
    const service = new SecretsService(supabase, projectId, user.id)
    const result = await service.update(decodedName, body)

    if (result.error) {
      const status = result.error.code === 'NOT_FOUND' ? 404
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
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] Update secret error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update secret' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE - Soft delete secret
// =============================================================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId, name: secretName } = await params
    const decodedName = decodeURIComponent(secretName)

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

    // Delete secret
    const service = new SecretsService(supabase, projectId, user.id)
    const result = await service.delete(decodedName)

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
    console.error('[API] Delete secret error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete secret' } },
      { status: 500 }
    )
  }
}
