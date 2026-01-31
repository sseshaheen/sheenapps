import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ messageId: string; index: string }> }
) {
  const { error } = await requireAdmin('inhouse.read')
  if (error) return error

  const { messageId, index } = await params
  const { searchParams } = new URL(request.url)
  const queryString = searchParams.toString()
  const path = `/v1/admin/inhouse/inbox/messages/${messageId}/attachments/${index}${queryString ? `?${queryString}` : ''}`

  const result = await workerFetch(path, { method: 'GET' })
  if (!result.ok) return noCacheErrorResponse({ error: result.error }, result.status)
  return noCacheResponse(result.data)
}
