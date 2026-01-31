import { NextRequest } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/admin/require-admin'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const SuspendBodySchema = z.object({
  reason: z.string().trim().min(3, 'Reason must be at least 3 characters').max(500, 'Reason must be at most 500 characters'),
})

// POST /api/admin/inhouse/projects/[projectId]/suspend - Suspend project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { session, error } = await requireAdmin('inhouse.write')
  if (error) return error

  const { projectId } = await params
  const rawBody = await request.json().catch(() => null)

  const parsed = SuspendBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return noCacheErrorResponse({ error: parsed.error.issues[0]?.message || 'Invalid request body' }, 400)
  }

  const body = parsed.data

  logger.info('Project suspension requested', {
    projectId,
    adminId: session.user.id,
    reason: body.reason,
  })

  const result = await workerFetch(`/v1/admin/inhouse/projects/${projectId}/suspend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!result.ok) {
    return noCacheErrorResponse({ error: result.error }, result.status)
  }
  return noCacheResponse(result.data)
}
