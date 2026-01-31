/**
 * Limits API Route
 *
 * GET /api/inhouse/projects/[id]/limits - Returns current usage and limits
 *
 * Provides self-service quota debugging for users. When they hit limits,
 * they can check this endpoint to understand their usage.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

interface UsageMetric {
  used: number
  limit: number
  unlimited: boolean
  unit: string
}

interface LimitsResponse {
  plan: string
  periodStart: string
  periodEnd: string
  limits: {
    storage_bytes: UsageMetric
    email_sends_monthly: UsageMetric
    job_runs_monthly: UsageMetric
    secrets_count: UsageMetric
    ai_operations_monthly: UsageMetric
    projects: UsageMetric
    exports_monthly: UsageMetric
  }
}

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

    // Get user's subscription/plan
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    let planName = 'free'
    let periodStart = new Date()
    let periodEnd = new Date()

    // Set default period (current month)
    periodStart.setDate(1)
    periodStart.setHours(0, 0, 0, 0)
    periodEnd = new Date(periodStart)
    periodEnd.setMonth(periodEnd.getMonth() + 1)

    if (customer) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan_name, status, current_period_start, current_period_end')
        .eq('customer_id', customer.id)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (subscription) {
        planName = subscription.plan_name
        if (subscription.current_period_start) {
          periodStart = new Date(subscription.current_period_start)
        }
        if (subscription.current_period_end) {
          periodEnd = new Date(subscription.current_period_end)
        }
      }
    }

    // Get plan limits from database
    const { data: planLimits } = await supabase
      .from('plan_limits')
      .select('*')
      .eq('plan_name', planName)
      .single()

    // Get usage tracking data for this user in current period
    const { data: usageData } = await supabase
      .from('usage_tracking')
      .select('metric_name, metric_value')
      .eq('user_id', user.id)
      .gte('period_start', periodStart.toISOString())
      .lte('period_end', periodEnd.toISOString())

    // Build usage map
    const usageMap: Record<string, number> = {}
    for (const row of usageData || []) {
      usageMap[row.metric_name] = (usageMap[row.metric_name] || 0) + row.metric_value
    }

    // Count user's projects
    const { count: projectsCount } = await supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', user.id)

    // Count secrets for this project
    const { count: secretsCount } = await supabase
      .from('inhouse_secrets')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'active')

    // Build limits response with defaults
    const maxProjects = planLimits?.max_projects ?? 3
    const maxAiOps = planLimits?.max_ai_operations_per_month ?? 100
    const maxExports = planLimits?.max_exports_per_month ?? 5
    const maxStorageMb = planLimits?.max_storage_mb ?? 1000

    const limits: LimitsResponse['limits'] = {
      storage_bytes: {
        used: (usageMap['storage_mb'] || 0) * 1_000_000,
        limit: maxStorageMb === -1 ? -1 : maxStorageMb * 1_000_000,
        unlimited: maxStorageMb === -1,
        unit: 'bytes',
      },
      email_sends_monthly: {
        used: usageMap['email_sends'] || 0,
        limit: 1000, // TODO: Add to plan_limits table
        unlimited: false,
        unit: 'sends',
      },
      job_runs_monthly: {
        used: usageMap['job_runs'] || 0,
        limit: 10000, // TODO: Add to plan_limits table
        unlimited: false,
        unit: 'runs',
      },
      secrets_count: {
        used: secretsCount || 0,
        limit: 100, // Per-project limit
        unlimited: false,
        unit: 'secrets',
      },
      ai_operations_monthly: {
        used: usageMap['ai_operations'] || 0,
        limit: maxAiOps,
        unlimited: maxAiOps === -1,
        unit: 'operations',
      },
      projects: {
        used: projectsCount || 0,
        limit: maxProjects,
        unlimited: maxProjects === -1,
        unit: 'projects',
      },
      exports_monthly: {
        used: usageMap['exports'] || 0,
        limit: maxExports,
        unlimited: maxExports === -1,
        unit: 'exports',
      },
    }

    const response: LimitsResponse = {
      plan: planName,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      limits,
    }

    return NextResponse.json(
      { ok: true, data: response },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache'
        }
      }
    )
  } catch (error) {
    console.error('[API] Get limits error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get limits' } },
      { status: 500 }
    )
  }
}
