/**
 * Batch Secrets API Route
 *
 * POST /api/inhouse/projects/[id]/secrets/batch - Get multiple secrets by name
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { SecretsService } from '@/lib/server/services/secrets-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
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
    const body = await request.json() as { names: string[] }

    // Validate input
    if (!body.names || !Array.isArray(body.names) || body.names.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'names array is required' } },
        { status: 400 }
      )
    }

    if (body.names.length > 50) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 50 secrets per batch request' } },
        { status: 400 }
      )
    }

    // Get secrets
    const service = new SecretsService(supabase, projectId, user.id)
    const result = await service.getMultiple(body.names)

    if (result.error) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
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
    console.error('[API] Batch get secrets error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get secrets' } },
      { status: 500 }
    )
  }
}
