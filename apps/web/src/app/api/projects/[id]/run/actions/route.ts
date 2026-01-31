/**
 * Run Actions API Route
 *
 * GET /api/projects/[id]/run/actions - List available actions
 */

import { NextRequest, NextResponse } from 'next/server'
import { withProjectOwner } from '@/lib/api/with-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'
import { NO_CACHE_HEADERS } from '@/lib/api/response-helpers'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/projects/[id]/run/actions
 * List available actions with their definitions and last run info
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params

    const locale = await getLocaleFromRequest(request)

    return withProjectOwner(request, projectId, async ({ userId }) => {
      const workerResult = await callWorker({
        method: 'GET',
        path: `/v1/inhouse/projects/${projectId}/run/actions`,
        queryParams: { userId },
        claims: { userId },
        extraHeaders: { 'x-sheen-locale': locale },
      })

      if (!workerResult.ok) {
        return NextResponse.json(
          { ok: false, error: workerResult.error ?? { code: 'WORKER_ERROR', message: 'Failed to list actions' } },
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
    console.error('[API] List actions error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list actions' } },
      { status: 500 }
    )
  }
}
