/**
 * Payment Webhooks API Route
 *
 * POST /api/inhouse/projects/[id]/payments/webhooks - Handle Stripe webhooks
 *
 * Note: This endpoint does NOT require authentication since it receives
 * webhooks directly from Stripe. Security is enforced via signature verification.
 *
 * We use a direct fetch instead of callWorker because webhook signature
 * verification requires the raw body bytes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createWorkerAuthHeaders } from '@/utils/worker-auth'

// Force Node.js runtime - this route uses Buffer which is not available in Edge
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

const WORKER_BASE_URL = process.env.WORKER_BASE_URL ?? 'http://localhost:8081'

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Missing stripe-signature header' } },
        { status: 400 }
      )
    }

    // Get raw body as bytes for signature verification
    // Using arrayBuffer() instead of text() ensures byte-perfect body forwarding
    // which is critical for Stripe HMAC signature verification
    const rawBuffer = await request.arrayBuffer()
    const rawBody = Buffer.from(rawBuffer)
    const path = `/v1/inhouse/projects/${projectId}/payments/webhooks`

    // Create auth headers - HMAC over exact bytes
    const authHeaders = createWorkerAuthHeaders('POST', path, rawBody.toString('utf8'))

    // Call worker directly with raw body for signature verification
    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/octet-stream',
        'stripe-signature': signature
      },
      body: rawBody
    })

    const json = await response.json()

    if (!response.ok || !json.ok) {
      return NextResponse.json(
        { ok: false, error: json.error || { code: 'WEBHOOK_ERROR', message: 'Webhook processing failed' } },
        { status: response.status }
      )
    }

    return NextResponse.json(
      { ok: true, data: json.data },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] Webhook error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to process webhook' } },
      { status: 500 }
    )
  }
}
