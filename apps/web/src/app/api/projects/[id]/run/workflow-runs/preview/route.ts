/**
 * Workflow Preview API Route
 *
 * POST /api/projects/[id]/run/workflow-runs/preview - Preview recipients
 */

import { NextRequest, NextResponse } from 'next/server'
import { withProjectOwner } from '@/lib/api/with-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'
import { assertSameOrigin } from '@/lib/security/csrf'
import { NO_CACHE_HEADERS } from '@/lib/api/response-helpers'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/projects/[id]/run/workflow-runs/preview
 * Preview recipients for a workflow action (dry-run)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // CSRF protection for cookie-authenticated mutations
    assertSameOrigin(request)

    const { id: projectId } = await params
    const body = await request.json()

    const locale = await getLocaleFromRequest(request)

    return withProjectOwner(request, projectId, async ({ userId }) => {
      // Validate required fields
      if (!body.actionId) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'actionId is required' } },
          { status: 400 }
        )
      }

      // Validate params is an object (if provided)
      if (body.params !== undefined && (typeof body.params !== 'object' || Array.isArray(body.params) || body.params === null)) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'params must be an object' } },
          { status: 400 }
        )
      }

      const workerResult = await callWorker({
        method: 'POST',
        path: `/v1/inhouse/projects/${projectId}/run/workflow-runs/preview`,
        body: {
          userId,
          actionId: body.actionId,
          params: body.params,
        },
        claims: { userId },
        extraHeaders: { 'x-sheen-locale': locale },
      })

      if (!workerResult.ok) {
        return NextResponse.json(
          { ok: false, error: workerResult.error ?? { code: 'WORKER_ERROR', message: 'Failed to preview recipients' } },
          { status: workerResult.status }
        )
      }

      return NextResponse.json(
        { ok: true, data: workerResult.data },
        {
          status: 200,
          headers: NO_CACHE_HEADERS,
        }
      )
    })
  } catch (error) {
    console.error('[API] Preview workflow error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to preview recipients' } },
      { status: 500 }
    )
  }
}
