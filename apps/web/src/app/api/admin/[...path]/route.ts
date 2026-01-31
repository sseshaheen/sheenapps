/**
 * Catch-all proxy for admin routes (non-inhouse).
 *
 * Handles GET, POST, PUT, PATCH, DELETE for thin proxy routes that only
 * do: requireAdmin(permission) → workerFetch → return response.
 *
 * Routes with custom logic (Zod validation, binary exports, streaming,
 * AdminAuthService, custom timeouts, etc.) are kept as separate files
 * and take priority over this catch-all via Next.js route matching.
 */

import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { workerFetch } from '@/lib/admin/worker-proxy'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Domain extracted from path[0], mapped to permission prefix (dashes → underscores)
const DOMAIN_PERMISSION_PREFIX: Record<string, string> = {
  'alerts': 'alerts',
  'customer-360': 'customer_360',
  'customer-health': 'customer_health',
  'feature-flags': 'feature_flags',
  'incidents': 'incidents',
  'system-health': 'system_health',
}

// Suffix-based overrides within a domain for non-standard permissions
function getPermissionOverride(domain: string, pathSegments: string[], method: string): string | null {
  if (domain === 'alerts') {
    const lastSegment = pathSegments[pathSegments.length - 1]
    if (lastSegment === 'acknowledge') return 'alerts.acknowledge'
    if (lastSegment === 'create-incident') return 'incidents.create'
  }

  if (domain === 'incidents') {
    const lastSegment = pathSegments[pathSegments.length - 1]
    if (lastSegment === 'resolve') return 'incidents.resolve'
    if (lastSegment === 'postmortem') return 'incidents.edit_postmortem'
    // All other incident mutations (POST to root, PATCH to [id], POST timeline) use .create
    if (method !== 'GET') return 'incidents.create'
  }

  return null
}

function getPermission(pathSegments: string[], method: string): string | null {
  const domain = pathSegments[0]
  const prefix = DOMAIN_PERMISSION_PREFIX[domain]
  if (!prefix) return null // Unknown domain — not handled by this catch-all

  // Check suffix-based overrides first
  const override = getPermissionOverride(domain, pathSegments, method)
  if (override) return override

  // Default: read for GET, write for mutations
  return method === 'GET' ? `${prefix}.read` : `${prefix}.write`
}

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const method = request.method

  const permission = getPermission(path, method)
  if (!permission) {
    return noCacheErrorResponse({ error: 'Not found' }, 404)
  }

  const { error } = await requireAdmin(permission)
  if (error) return error

  // Build worker path — 1:1 mapping: /api/admin/X → /v1/admin/X
  const joinedPath = path.map(s => encodeURIComponent(s)).join('/')
  const { searchParams } = new URL(request.url)
  const qs = searchParams.toString()
  const workerPath = `/v1/admin/${joinedPath}${qs ? `?${qs}` : ''}`

  // Forward body for non-GET methods
  const fetchOptions: Record<string, unknown> = { method }
  if (method !== 'GET') {
    try {
      const body = await request.json()
      fetchOptions.body = JSON.stringify(body)
      fetchOptions.headers = { 'Content-Type': 'application/json' }
    } catch {
      // Some endpoints send no body (e.g. acknowledge, toggle)
    }
  }

  const result = await workerFetch(workerPath, fetchOptions)
  if (!result.ok) {
    return noCacheErrorResponse(
      { error: result.error, correlationId: result.correlationId },
      result.status
    )
  }
  return noCacheResponse(result.data, {
    headers: { 'x-correlation-id': result.correlationId ?? '' },
  })
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE }
