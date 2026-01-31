/**
 * Jobs API Route
 *
 * POST /api/inhouse/projects/[id]/jobs - Enqueue a job
 * GET  /api/inhouse/projects/[id]/jobs - List jobs
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker, intParam } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

// =============================================================================
// POST - Enqueue a job
// =============================================================================

interface EnqueueRequest {
  name: string
  payload: Record<string, unknown>
  delay?: string
  timeoutMs?: number
  maxAttempts?: number
  backoffType?: 'fixed' | 'exponential'
  backoffDelay?: number
  concurrencyKey?: string
  idempotencyKey?: string
  metadata?: Record<string, unknown>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params

    // Get user session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Verify project ownership
    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    // Parse request body
    const body = await request.json() as EnqueueRequest

    // Validate required fields
    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'name is required' } },
        { status: 400 }
      )
    }

    // Validate reserved prefix
    if (body.name.startsWith('sys:')) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Job names starting with "sys:" are reserved' } },
        { status: 400 }
      )
    }

    // Call worker to enqueue job
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/jobs`,
      body: {
        name: body.name,
        payload: body.payload || {},
        delay: body.delay,
        timeoutMs: body.timeoutMs,
        maxAttempts: body.maxAttempts,
        backoffType: body.backoffType,
        backoffDelay: body.backoffDelay,
        concurrencyKey: body.concurrencyKey,
        idempotencyKey: body.idempotencyKey,
        metadata: body.metadata
      },
      claims: { userId: user.id },
      extraHeaders: { 'x-project-id': projectId }
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(
      { ok: true, data: result.data },
      {
        status: 201,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] Enqueue job error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to enqueue job' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET - List jobs
// =============================================================================

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params

    // Get user session
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Verify project ownership
    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    // Parse query params
    const { searchParams } = new URL(request.url)
    const queryParams: Record<string, string | number> = {}

    const name = searchParams.get('name')
    if (name) queryParams.name = name

    const status = searchParams.getAll('status')
    if (status.length > 0) queryParams.status = status.join(',')

    const limit = intParam(searchParams.get('limit'), { min: 1, max: 100, defaultValue: 50 })
    if (limit !== undefined) queryParams.limit = limit

    const offset = intParam(searchParams.get('offset'), { min: 0, max: 1_000_000 })
    if (offset !== undefined) queryParams.offset = offset

    const orderBy = searchParams.get('orderBy')
    if (orderBy) queryParams.orderBy = orderBy

    const orderDir = searchParams.get('orderDir')
    if (orderDir) queryParams.orderDir = orderDir

    // Call worker to list jobs
    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/jobs`,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      claims: { userId: user.id },
      extraHeaders: { 'x-project-id': projectId }
    })

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      )
    }

    return NextResponse.json(
      { ok: true, data: result.data },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] List jobs error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list jobs' } },
      { status: 500 }
    )
  }
}
