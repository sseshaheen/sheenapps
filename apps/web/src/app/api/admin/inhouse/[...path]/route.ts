import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Paths that require inhouse.support regardless of HTTP method.
// All other paths default to inhouse.read (GET) / inhouse.write (POST/PUT/PATCH/DELETE).
const SUPPORT_PERMISSION_PATHS = new Set([
  'support/impersonate/confirm',
  'support/impersonate/start',
  'support/replay/requests',
])

// Prefix patterns for inhouse.support — matches any sub-path
const SUPPORT_PERMISSION_PREFIXES = [
  'support/replay/requests/',
]

function matchesSupportPath(joined: string): boolean {
  if (SUPPORT_PERMISSION_PATHS.has(joined)) return true

  for (const prefix of SUPPORT_PERMISSION_PREFIXES) {
    if (joined.startsWith(prefix)) return true
  }

  // Wildcard match for database/projects/*/tables/*/sample
  const parts = joined.split('/')
  if (
    parts.length === 6 &&
    parts[0] === 'database' &&
    parts[1] === 'projects' &&
    parts[3] === 'tables' &&
    parts[5] === 'sample'
  ) {
    return true
  }

  return false
}

function getPermission(pathSegments: string[], method: string): string {
  const joined = pathSegments.join('/')

  if (matchesSupportPath(joined)) {
    return 'inhouse.support'
  }

  return method === 'GET' ? 'inhouse.read' : 'inhouse.write'
}

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const method = request.method
  const permission = getPermission(path, method)

  const { error } = await requireAdmin(permission)
  if (error) return error

  // Build worker path
  const joinedPath = path.map(s => encodeURIComponent(s)).join('/')
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const workerPath = `/v1/admin/inhouse/${joinedPath}${qs ? `?${qs}` : ''}`

  // Forward body for non-GET methods
  const fetchOptions: Record<string, unknown> = { method }
  if (method !== 'GET') {
    try {
      const body = await request.json()
      fetchOptions.body = JSON.stringify(body)
      fetchOptions.headers = { 'Content-Type': 'application/json' }
    } catch {
      // Some POST endpoints (like support/impersonate/end) send no body
    }
  }

  const result = await workerFetch(workerPath, fetchOptions)
  if (!result.ok) {
    return noCacheErrorResponse({ error: result.error }, result.status)
  }
  return noCacheResponse(result.data)
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
