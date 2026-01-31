/**
 * In-House Mode: CMS Entries Admin API
 *
 * GET /api/inhouse/projects/[id]/cms/entries
 * POST /api/inhouse/projects/[id]/cms/entries
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getServerAuthState } from '@/lib/auth-server'
import { assertProjectOwnership } from '@/lib/security/project-access'
import { assertSameOrigin } from '@/lib/security/csrf'
import { callWorker } from '@/lib/api/worker-helpers'
import { parseLimit, parseOffset } from '@/lib/api/pagination'
import { parseUuid, isHttpError } from '@/lib/validation/params'
import { logger } from '@/utils/logger'
import type { ApiResponse } from '@/types/inhouse-api'
import type { CmsContentEntry } from '@/types/inhouse-cms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const EntryStatusSchema = z.enum(['draft', 'published', 'archived'])

const CreateEntrySchema = z.object({
  contentTypeId: z.string().min(1),
  slug: z.string().min(1).max(160).optional(),
  data: z.record(z.string(), z.any()),
  status: EntryStatusSchema.optional(),
  locale: z.string().min(2).max(10).optional()
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

    const { searchParams } = request.nextUrl
    const contentTypeId = searchParams.get('contentTypeId') || undefined
    const contentType = searchParams.get('contentType') || undefined
    const status = searchParams.get('status') || undefined
    const locale = searchParams.get('locale') || undefined
    const limitNum = parseLimit(searchParams.get('limit'), 50, 200)
    const offsetNum = parseOffset(searchParams.get('offset'), 0)

    const result = await callWorker({
      method: 'GET',
      path: '/v1/inhouse/cms/admin/entries',
      queryParams: {
        projectId,
        ...(contentTypeId ? { contentTypeId } : {}),
        ...(contentType ? { contentType } : {}),
        ...(status ? { status } : {}),
        ...(locale ? { locale } : {}),
        limit: limitNum,
        offset: offsetNum
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        {
          ok: false,
          error: {
            code: result.error?.code || 'INTERNAL_ERROR',
            message: result.error?.message || 'Failed to load entries'
          }
        },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<{ entries: CmsContentEntry[] }>>({
      ok: true,
      data: { entries: result.data?.entries || [] }
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Failed to fetch CMS entries', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load entries' } },
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
    const parsed = CreateEntrySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } },
        { status: 400 }
      )
    }

    const result = await callWorker({
      method: 'POST',
      path: '/v1/inhouse/cms/admin/entries',
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
            message: result.error?.message || 'Failed to create entry'
          }
        },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<{ entry: CmsContentEntry }>>({
      ok: true,
      data: { entry: result.data?.entry }
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Failed to create CMS entry', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create entry' } },
      { status: 500 }
    )
  }
}
