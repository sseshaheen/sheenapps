import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// POST /api/admin/inhouse/database/projects/[projectId]/query
// Execute a read-only SQL query (requires inhouse.support permission)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  // Query execution requires elevated inhouse.support permission
  const { error } = await requireAdmin('inhouse.support')
  if (error) return error

  const { projectId } = await params
  const body = await request.json()
  const path = `/v1/admin/inhouse/database/projects/${projectId}/query`

  const result = await workerFetch(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000, // Longer timeout for queries (15s)
  })

  if (!result.ok) {
    const code = (result.data as { code?: string } | undefined)?.code
    return noCacheErrorResponse({ error: result.error, ...(code && { code }) }, result.status)
  }
  return noCacheResponse(result.data)
}
