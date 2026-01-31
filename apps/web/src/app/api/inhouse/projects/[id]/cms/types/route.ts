/**
 * In-House Mode: CMS Content Types Admin API
 *
 * GET /api/inhouse/projects/[id]/cms/types
 * POST /api/inhouse/projects/[id]/cms/types
 *
 * Session-authenticated + ownership-checked. Proxies to worker HMAC admin routes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuthState } from '@/lib/auth-server'
import { assertProjectOwnership } from '@/lib/security/project-access'
import { assertSameOrigin } from '@/lib/security/csrf'
import { callWorker } from '@/lib/api/worker-helpers'
import { parseUuid, isHttpError } from '@/lib/validation/params'
import { logger } from '@/utils/logger'
import type { ApiResponse } from '@/types/inhouse-api'
import type { CmsContentType } from '@/types/inhouse-cms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const CreateTypeSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120),
  schema: z.record(z.string(), z.any())
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const projectId = parseUuid(id, 'projectId')
    const authState = await getServerAuthState()

    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    await assertProjectOwnership(authState.user.id, projectId)

    const result = await callWorker({
      method: 'GET',
      path: '/v1/inhouse/cms/admin/types',
      queryParams: { projectId }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to load content types'
          }
        },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<{ types: CmsContentType[] }>>({
      ok: true,
      data: { types: result.data?.types || [] }
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Failed to fetch CMS content types', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load content types' } },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request)
    const { id } = await params
    const projectId = parseUuid(id, 'projectId')
    const authState = await getServerAuthState()

    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    await assertProjectOwnership(authState.user.id, projectId)

    const body = await request.json().catch(() => null)
    const parsed = CreateTypeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } },
        { status: 400 }
      )
    }

    const result = await callWorker({
      method: 'POST',
      path: '/v1/inhouse/cms/admin/types',
      body: {
        projectId,
        ...parsed.data
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to create content type'
          }
        },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<{ type: CmsContentType }>>({
      ok: true,
      data: { type: result.data?.type }
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Failed to create CMS content type', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create content type' } },
      { status: 500 }
    )
  }
}
