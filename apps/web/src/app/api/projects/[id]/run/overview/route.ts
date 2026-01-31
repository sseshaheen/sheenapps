/**
 * Run Overview API Route
 *
 * GET /api/projects/[id]/run/overview?date=YYYY-MM-DD
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'
import { assertSameOrigin } from '@/lib/security/csrf'
import { computeAlerts, canComputeAlerts, type KpiData, type AlertContext, type AlertResult } from '@/lib/run/alert-rules'
import { RunSettingsPatchSchema } from '@/lib/run/run-settings-schema'
import { NO_CACHE_HEADERS } from '@/lib/api/response-helpers'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: projectId } = await params
    const searchParams = request.nextUrl.searchParams
    const dateParam = searchParams.get('date')

    // Only validate date if provided; worker computes timezone-aware "today" when omitted
    if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid date format. Use YYYY-MM-DD.' } },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    const locale = await getLocaleFromRequest(request)

    // Build query params - only include date if explicitly provided
    const queryParams: Record<string, string> = { userId: user.id }
    if (dateParam) queryParams.date = dateParam

    // Fetch runSettings from Supabase and worker overview in parallel
    const [projectRowResult, workerResult] = await Promise.all([
      supabase
        .from('projects')
        .select('config')
        .eq('id', projectId)
        .single(),
      callWorker({
        method: 'GET',
        path: `/v1/inhouse/projects/${projectId}/run/overview`,
        queryParams,
        claims: { userId: user.id },
        extraHeaders: { 'x-sheen-locale': locale },
      }),
    ])

    // Handle missing project row (critical: prevent weird behavior)
    if (projectRowResult.error || !projectRowResult.data) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      )
    }

    // Extract runSettings from project config
    const projectRow = projectRowResult.data
    const currentConfig = (projectRow as any)?.config ?? {}
    const storedRunSettings = currentConfig.run_settings ?? null
    const fallbackRunSettings = currentConfig.templateData?.metadata?.runSettings ?? null
    const runSettings = storedRunSettings || fallbackRunSettings

    // REMOVED: Fire-and-forget migration inside GET (concurrency risk)
    // Migration should be done via one-time backfill script or on first PATCH
    // Keeping side-effects in GET can clobber concurrent config updates

    // Handle worker failure
    if (!workerResult.ok) {
      return NextResponse.json(
        { ok: false, error: workerResult.error ?? { code: 'WORKER_ERROR', message: 'Failed to load run overview' } },
        { status: workerResult.status }
      )
    }

    const {
      kpis, alerts, previousKpis, lastEventAt, trends, alertCounts,
      lastRollupAt, workflowCounts, stuckRunCount, digestMetrics,
      multiCurrencyKpis, multiCurrencyPrevious, quotas, integrations,
    } = workerResult.data

    // Compute rule-based alerts (Run Hub Phase 2)
    let computedAlerts: AlertResult[] = []
    if (previousKpis && canComputeAlerts(previousKpis)) {
      const currentKpis: KpiData = {
        sessions: kpis?.sessions ?? 0,
        leads: kpis?.leads ?? 0,
        signups: kpis?.signups ?? 0,
        payments: kpis?.payments ?? 0,
        refunds: kpis?.refunds ?? 0,
        revenueCents: kpis?.revenueCents ?? 0,
        refundsCents: kpis?.refundsCents ?? 0,
      }

      const alertContext: AlertContext = {
        lastEventAt,
        paymentFailedCount: alertCounts?.paymentFailedCount ?? 0,
        checkoutStartedCount: alertCounts?.checkoutStartedCount ?? 0,
        paymentSucceededCount: currentKpis.payments,
      }

      computedAlerts = computeAlerts(currentKpis, previousKpis, alertContext)
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          kpis,
          alerts,
          computedAlerts, // Rule-based alerts (Run Hub Phase 2)
          runSettings,
          lastEventAt,
          previousKpis, // For potential UI comparison display
          trends, // 7-day sparkline data (Run Hub Phase 3)
          // Phase 2.5: Observability
          lastRollupAt,
          workflowCounts,
          stuckRunCount,
          digestMetrics,
          multiCurrencyKpis,
          multiCurrencyPrevious,
          quotas,
          integrations,
        }
      },
      {
        status: 200,
        headers: NO_CACHE_HEADERS
      }
    )
  } catch (error) {
    console.error('[API] Run overview error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load run overview' } },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/projects/[id]/run/overview
 * Update run_settings (e.g., industry_tag)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    // CSRF protection for cookie-authenticated mutations
    assertSameOrigin(request)

    const { id: projectId } = await params
    const body = await request.json()

    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
    if (!ownerCheck.ok) return ownerCheck.response

    // Validate payload using Zod schema (single source of truth)
    const parsed = RunSettingsPatchSchema.safeParse(body)
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]
      return NextResponse.json(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: firstError?.message ?? 'Invalid payload' } },
        { status: 400 }
      )
    }

    const validatedBody = parsed.data

    // Get current config WITH updated_at for optimistic locking
    const { data: projectRow } = await supabase
      .from('projects')
      .select('config, updated_at')
      .eq('id', projectId)
      .single()

    if (!projectRow) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      )
    }

    const currentConfig = (projectRow as any)?.config || {}
    const currentUpdatedAt = (projectRow as any).updated_at
    const currentRunSettings = currentConfig.run_settings || {}
    const currentNotifications = currentRunSettings.notifications || {}

    // Merge updates
    const updatedRunSettings = {
      ...currentRunSettings,
      ...(validatedBody.industry_tag && { industry_tag: validatedBody.industry_tag }),
      ...(validatedBody.notifications && {
        notifications: {
          ...currentNotifications,
          ...validatedBody.notifications
        }
      })
    }

    // Update project config WITH optimistic locking (updated_at guard)
    // This prevents lost updates from concurrent PATCHes
    const { data: updated, error: updateError } = await supabase
      .from('projects')
      .update({
        config: {
          ...currentConfig,
          run_settings: updatedRunSettings
        }
      })
      .eq('id', projectId)
      .eq('updated_at', currentUpdatedAt) // Optimistic lock
      .select('config')
      .maybeSingle() // Use maybeSingle to detect conflicts reliably

    if (updateError) {
      console.error('[API] Failed to update run settings:', updateError)
      return NextResponse.json(
        { ok: false, error: { code: 'UPDATE_FAILED', message: 'Failed to update settings' } },
        { status: 500 }
      )
    }

    if (!updated) {
      // No row matched = conflict (someone updated between our read and write)
      return NextResponse.json(
        { ok: false, error: { code: 'CONFLICT', message: 'Settings changed elsewhere. Please retry.' } },
        { status: 409 }
      )
    }

    // If digest settings changed, update digest_next_at via worker
    const digestChanged = validatedBody.notifications && (
      validatedBody.notifications.daily_digest_enabled !== undefined ||
      validatedBody.notifications.daily_digest_hour !== undefined
    )

    if (digestChanged) {
      const finalRunSettings = (updated as any).config?.run_settings || {}
      const newNotifications = finalRunSettings.notifications || {}
      const digestEnabled = newNotifications.daily_digest_enabled ?? false
      const digestHour = newNotifications.daily_digest_hour ?? 9

      // Call worker to update digest_next_at
      // Fire-and-forget - don't block the response
      const patchLocale = await getLocaleFromRequest(request)
      callWorker({
        method: 'POST',
        path: `/v1/inhouse/projects/${projectId}/run/digest-settings`,
        body: {
          userId: user.id,
          enabled: digestEnabled,
          hour: digestHour
        },
        claims: { userId: user.id },
        extraHeaders: { 'x-sheen-locale': patchLocale },
      }).catch((err: unknown) => {
        console.error('[API] Failed to update digest_next_at:', err)
      })
    }

    return NextResponse.json(
      { ok: true, data: { runSettings: (updated as any).config?.run_settings } },
      { status: 200 }
    )
  } catch (error) {
    console.error('[API] Run settings update error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update run settings' } },
      { status: 500 }
    )
  }
}
