/**
 * Inbox Messages List API Route
 *
 * GET /api/inhouse/projects/[id]/inbox/messages - List messages
 */

import { NextRequest, NextResponse } from 'next/server'
import { withProjectOwner } from '@/lib/api/with-project-owner'
import { callWorker, intParam } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id: projectId } = await params
  const searchParams = req.nextUrl.searchParams

  return withProjectOwner(req, projectId, async ({ userId }) => {
    const queryParams: Record<string, string | number> = { userId }

  const limit = intParam(searchParams.get('limit'), { min: 1, max: 100, defaultValue: 50 })
  if (limit !== undefined) queryParams.limit = limit

  const offset = intParam(searchParams.get('offset'), { min: 0, max: 1_000_000 })
  if (offset !== undefined) queryParams.offset = offset

  const threadId = searchParams.get('threadId')
  if (threadId) queryParams.threadId = threadId

  const unreadOnly = searchParams.get('unreadOnly')
  if (unreadOnly) queryParams.unreadOnly = unreadOnly

    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/inbox/messages`,
      queryParams,
      claims: { userId },
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? { code: 'WORKER_ERROR', message: 'Failed to fetch messages' } },
        { status: result.status }
      )
    }

    return NextResponse.json({ ok: true, data: result.data }, { status: 200 })
  })
}
