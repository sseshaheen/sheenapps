/**
 * Payments API Route
 *
 * POST /api/inhouse/projects/[id]/payments/checkout - Create checkout session
 * POST /api/inhouse/projects/[id]/payments/portal - Create billing portal session
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

// =============================================================================
// POST - Route to checkout or portal based on body
// =============================================================================

interface CheckoutBody {
  action: 'checkout'
  priceId: string
  successUrl: string
  cancelUrl: string
  customerId?: string
  customerEmail?: string
  mode?: 'payment' | 'subscription' | 'setup'
  quantity?: number
  metadata?: Record<string, string>
  idempotencyKey?: string
  allowPromotionCodes?: boolean
  clientReferenceId?: string
}

interface PortalBody {
  action: 'portal'
  customerId: string
  returnUrl: string
}

type RequestBody = CheckoutBody | PortalBody

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
    const body = await request.json() as RequestBody

    // Route based on action
    if (body.action === 'checkout') {
      return handleCheckout(projectId, user.id, body)
    } else if (body.action === 'portal') {
      return handlePortal(projectId, user.id, body)
    }

    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid action. Use "checkout" or "portal"' } },
      { status: 400 }
    )
  } catch (error) {
    console.error('[API] Payments error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process payment request' } },
      { status: 500 }
    )
  }
}

async function handleCheckout(projectId: string, userId: string, body: CheckoutBody) {
  // Validate required fields
  if (!body.priceId || typeof body.priceId !== 'string') {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'priceId is required' } },
      { status: 400 }
    )
  }

  if (!body.successUrl) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'successUrl is required' } },
      { status: 400 }
    )
  }

  if (!body.cancelUrl) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'cancelUrl is required' } },
      { status: 400 }
    )
  }

  const result = await callWorker({
    method: 'POST',
    path: `/v1/inhouse/projects/${projectId}/payments/checkout`,
    body: {
      priceId: body.priceId,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
      customerId: body.customerId,
      customerEmail: body.customerEmail,
      mode: body.mode,
      quantity: body.quantity,
      metadata: body.metadata,
      idempotencyKey: body.idempotencyKey,
      allowPromotionCodes: body.allowPromotionCodes,
      clientReferenceId: body.clientReferenceId
    },
    claims: { userId }
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
}

async function handlePortal(projectId: string, userId: string, body: PortalBody) {
  if (!body.customerId || typeof body.customerId !== 'string') {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'customerId is required' } },
      { status: 400 }
    )
  }

  if (!body.returnUrl) {
    return NextResponse.json(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'returnUrl is required' } },
      { status: 400 }
    )
  }

  const result = await callWorker({
    method: 'POST',
    path: `/v1/inhouse/projects/${projectId}/payments/portal`,
    body: {
      customerId: body.customerId,
      returnUrl: body.returnUrl
    },
    claims: { userId }
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
}
