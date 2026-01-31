/**
 * Workflow Runs API Route
 *
 * POST /api/projects/[id]/run/workflow-runs - Create workflow run
 * GET  /api/projects/[id]/run/workflow-runs - List workflow runs
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
 * POST /api/projects/[id]/run/workflow-runs
 * Create a new workflow run
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

      if (!body.idempotencyKey) {
        return NextResponse.json(
          { ok: false, error: { code: 'VALIDATION_ERROR', message: 'idempotencyKey is required' } },
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
        path: `/v1/inhouse/projects/${projectId}/run/workflow-runs`,
        body: {
          userId,
          actionId: body.actionId,
          idempotencyKey: body.idempotencyKey,
          clientRequestedAt: body.clientRequestedAt,
          params: body.params,
          recipientCountEstimate: body.recipientCountEstimate,
        },
        claims: { userId },
        extraHeaders: { 'x-sheen-locale': locale },
      })

      if (!workerResult.ok) {
        return NextResponse.json(
          { ok: false, error: workerResult.error ?? { code: 'WORKER_ERROR', message: 'Failed to create workflow run' } },
          { status: workerResult.status }
        )
      }

      return NextResponse.json(
        { ok: true, data: workerResult.data },
        {
          status: workerResult.data?.status === 'queued' ? 201 : 200,
          headers: NO_CACHE_HEADERS,
        }
      )
    })
  } catch (error) {
    console.error('[API] Create workflow run error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create workflow run' } },
      { status: 500 }
    )
  }
}

/**
 * GET /api/projects/[id]/run/workflow-runs
 * List workflow runs
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params
    const searchParams = request.nextUrl.searchParams

    const locale = await getLocaleFromRequest(request)

    return withProjectOwner(request, projectId, async ({ userId }) => {
      const queryParams: Record<string, string> = { userId }

      // Optional filters with validation
      const actionId = searchParams.get('actionId')
      if (actionId) queryParams.actionId = actionId

      // Validate status enum
      const statusRaw = searchParams.get('status')
      const allowedStatuses = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
      if (statusRaw && allowedStatuses.has(statusRaw)) {
        queryParams.status = statusRaw
      }

      // Validate limit is numeric
      const limitRaw = searchParams.get('limit')
      if (limitRaw && /^\d+$/.test(limitRaw)) {
        queryParams.limit = limitRaw
      }

      const cursor = searchParams.get('cursor')
      if (cursor) queryParams.cursor = cursor

      const workerResult = await callWorker({
        method: 'GET',
        path: `/v1/inhouse/projects/${projectId}/run/workflow-runs`,
        queryParams,
        claims: { userId },
        extraHeaders: { 'x-sheen-locale': locale },
      })

      if (!workerResult.ok) {
        return NextResponse.json(
          { ok: false, error: workerResult.error ?? { code: 'WORKER_ERROR', message: 'Failed to list workflow runs' } },
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
    console.error('[API] List workflow runs error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list workflow runs' } },
      { status: 500 }
    )
  }
}
