import { NextRequest } from 'next/server'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// GET /api/admin/inhouse/support/impersonate/proxy/[...path]
// Proxy endpoint for impersonated requests
// Authentication is done via X-Impersonation-Token header at the worker level
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params
  const proxyPath = pathSegments.join('/')

  // Get the impersonation token from the request header
  const impersonationToken = request.headers.get('x-impersonation-token')

  if (!impersonationToken) {
    return noCacheErrorResponse({ error: 'X-Impersonation-Token header required' }, 401)
  }

  // Forward to the worker proxy endpoint
  const workerPath = `/v1/admin/inhouse/support/impersonate/proxy/${proxyPath}`

  const result = await workerFetch(workerPath, {
    method: 'GET',
    headers: {
      'X-Impersonation-Token': impersonationToken,
    },
  })

  if (!result.ok) {
    const code = (result.data as { code?: string } | undefined)?.code
    return noCacheErrorResponse({ error: result.error, ...(code && { code }) }, result.status)
  }
  return noCacheResponse(result.data)
}
