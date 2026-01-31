/**
 * In-House Mode: CMS Entry Update Admin API
 *
 * PATCH /api/inhouse/projects/[id]/cms/entries/[entryId]
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
import type { CmsContentEntry } from '@/types/inhouse-cms'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const EntryStatusSchema = z.enum(['draft', 'published', 'archived'])

const UpdateEntrySchema = z.object({
  data: z.record(z.string(), z.any()).optional(),
  status: EntryStatusSchema.optional(),
  slug: z.string().min(1).max(160).nullable().optional(),
  locale: z.string().min(2).max(10).optional()
}).refine(
  (v) => v.data !== undefined || v.status !== undefined || v.slug !== undefined || v.locale !== undefined,
  { message: 'At least one field must be provided' }
)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
): Promise<NextResponse> {
  try {
    assertSameOrigin(request)
    const { id, entryId } = await params
    const projectId = parseUuid(id, 'projectId')
    const entryUuid = parseUuid(entryId, 'entryId')
    const authState = await getServerAuthState()

    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    await assertProjectOwnership(authState.user.id, projectId)

    const body = await request.json().catch(() => null)
    const parsed = UpdateEntrySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid payload' } },
        { status: 400 }
      )
    }

    const result = await callWorker({
      method: 'PATCH',
      path: `/v1/inhouse/cms/admin/entries/${entryUuid}`,
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
            message: result.error?.message || 'Failed to update entry'
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

    logger.error('Failed to update CMS entry', {
      error: error instanceof Error ? error.message : String(error)
    })

    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update entry' } },
      { status: 500 }
    )
  }
}
