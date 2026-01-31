/**
 * In-House Mode: Custom Domains (Placeholder)
 *
 * GET /api/inhouse/projects/[id]/domains
 * POST /api/inhouse/projects/[id]/domains
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerAuthState } from '@/lib/auth-server'
import { callWorker } from '@/lib/api/worker-helpers'
import { assertProjectOwnership } from '@/lib/security/project-access'
import { assertSameOrigin } from '@/lib/security/csrf'
import { parseUuid, parseDomain, isHttpError } from '@/lib/validation/params'
import type { ApiResponse } from '@/types/inhouse-api'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const projectId = parseUuid(id, 'projectId')
    const authState = await getServerAuthState()

    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Defense-in-depth: verify project ownership before calling worker
    await assertProjectOwnership(authState.user.id, projectId)

    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/domains`,
      queryParams: {}
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: result.error?.code || 'WORKER_ERROR', message: result.error?.message || 'Failed to load domains' } },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<{ domains: Array<Record<string, unknown>> }>>({
      ok: true,
      data: result.data
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Domains placeholder failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load domains' } },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    // CSRF protection for mutation endpoints
    assertSameOrigin(request)

    const { id } = await params
    const projectId = parseUuid(id, 'projectId')
    const authState = await getServerAuthState()

    if (!authState.isAuthenticated || !authState.user) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Defense-in-depth: verify project ownership before calling worker
    await assertProjectOwnership(authState.user.id, projectId)

    const body = await request.json().catch(() => ({}))
    const rawDomain = typeof body?.domain === 'string' ? body.domain : ''

    if (!rawDomain) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'domain is required' } },
        { status: 400 }
      )
    }

    // Normalize and validate domain (lowercase, strip protocol, validate format)
    const domain = parseDomain(rawDomain)

    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/projects/${projectId}/domains`,
      body: {
        domain
      }
    })

    if (!result.ok) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: result.error?.code || 'WORKER_ERROR', message: result.error?.message || 'Failed to add domain' } },
        { status: result.status }
      )
    }

    return NextResponse.json<ApiResponse<Record<string, unknown>>>({
      ok: true,
      data: result.data
    })
  } catch (error) {
    if (isHttpError(error)) {
      return NextResponse.json<ApiResponse<never>>(
        { ok: false, error: { code: error.code ?? 'ERROR', message: error.message ?? 'Error' } },
        { status: error.status }
      )
    }

    logger.error('Domains placeholder create failed', { error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json<ApiResponse<never>>(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to add domain' } },
      { status: 500 }
    )
  }
}
