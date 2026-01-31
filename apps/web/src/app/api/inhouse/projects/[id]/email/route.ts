/**
 * Email API Route
 *
 * POST /api/inhouse/projects/[id]/email - Send an email
 * GET  /api/inhouse/projects/[id]/email - List emails
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker, intParam } from '@/lib/api/worker-helpers'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'
import { assertSameOrigin } from '@/lib/security/csrf'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

// =============================================================================
// POST - Send an email
// =============================================================================

type BuiltInTemplate =
  | 'welcome'
  | 'magic-link'
  | 'password-reset'
  | 'email-verification'
  | 'receipt'
  | 'notification'

interface SendEmailRequest {
  to: string | string[]
  subject?: string
  template?: BuiltInTemplate
  variables?: Record<string, string>
  html?: string
  text?: string
  from?: string
  replyTo?: string
  tags?: Record<string, string>
  sendAt?: string
  idempotencyKey?: string
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // CSRF protection for cookie-authenticated mutations
    assertSameOrigin(request)

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
    const body = await request.json() as SendEmailRequest

    // Validate recipient(s)
    if (!body.to) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'to is required' } },
        { status: 400 }
      )
    }

    // Validate content - must have either:
    // - template (uses built-in template), OR
    // - subject AND (html OR text) for custom emails
    const hasTemplate = !!body.template
    const hasContent = !!body.subject && (!!body.html || !!body.text)

    if (!hasTemplate && !hasContent) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Provide template OR (subject + html/text)' } },
        { status: 400 }
      )
    }

    // Validate recipient list bounds
    const toList = Array.isArray(body.to) ? body.to : [body.to]
    if (toList.length === 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'At least one recipient is required' } },
        { status: 400 }
      )
    }
    if (toList.length > 50) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Maximum 50 recipients allowed' } },
        { status: 400 }
      )
    }

    // Call worker to send email (locale determines template language)
    const locale = await getLocaleFromRequest(request)
    const result = await callWorker({
      method: 'POST',
      path: `/v1/inhouse/projects/${projectId}/email`,
      body: {
        to: body.to,
        subject: body.subject,
        template: body.template,
        variables: body.variables,
        html: body.html,
        text: body.text,
        from: body.from,
        replyTo: body.replyTo,
        tags: body.tags,
        sendAt: body.sendAt,
        idempotencyKey: body.idempotencyKey
      },
      claims: { userId: user.id },
      extraHeaders: { 'x-sheen-locale': locale },
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
    console.error('[API] Send email error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to send email' } },
      { status: 500 }
    )
  }
}

// =============================================================================
// GET - List emails
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

    // Parse query params with safe integer parsing
    const { searchParams } = new URL(request.url)
    const queryParams: Record<string, string | number> = {}

    const status = searchParams.get('status')
    if (status) queryParams.status = status

    const limit = intParam(searchParams.get('limit'), { min: 1, max: 100, defaultValue: 50 })
    if (limit !== undefined) queryParams.limit = limit

    const offset = intParam(searchParams.get('offset'), { min: 0, max: 1_000_000 })
    if (offset !== undefined) queryParams.offset = offset

    // Call worker to list emails
    const locale = await getLocaleFromRequest(request)
    const result = await callWorker({
      method: 'GET',
      path: `/v1/inhouse/projects/${projectId}/email`,
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      claims: { userId: user.id },
      extraHeaders: { 'x-sheen-locale': locale },
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
    console.error('[API] List emails error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to list emails' } },
      { status: 500 }
    )
  }
}
