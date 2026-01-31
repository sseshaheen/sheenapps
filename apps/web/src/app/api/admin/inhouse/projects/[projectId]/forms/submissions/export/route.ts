import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/admin/inhouse/projects/[projectId]/forms/submissions/export
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { error } = await requireAdmin('inhouse.read')
  if (error) return error

  const { projectId } = await params
  const { searchParams } = new URL(request.url)
  const queryString = searchParams.toString()
  const path = `/v1/admin/inhouse/projects/${projectId}/forms/submissions/export${queryString ? `?${queryString}` : ''}`

  const authHeaders = await AdminAuthService.getAuthHeaders()
  const workerBaseUrl = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

  const response = await fetch(`${workerBaseUrl}${path}`, {
    method: 'GET',
    headers: {
      ...authHeaders,
      'x-correlation-id': crypto.randomUUID(),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    return new Response(JSON.stringify({ error: errorText || 'Failed to export' }), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await response.arrayBuffer()
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const contentDisposition = response.headers.get('content-disposition') || 'attachment'

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': contentDisposition,
    },
  })
}
