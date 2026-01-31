/**
 * Capabilities API Route
 *
 * GET /api/inhouse/projects/[id]/capabilities - Returns enabled primitives + versions
 *
 * Used by AI code generation to know which SDKs are available,
 * and by apps to check feature availability before use.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireProjectOwner } from '@/lib/auth/require-project-owner'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface RouteParams {
  params: Promise<{ id: string }>
}

// SDK versions - update when packages are published
const SDK_VERSIONS = {
  auth: '1.0.0',
  db: '1.0.0',
  cms: '1.0.0',
  storage: '1.0.0',
  secrets: '1.0.0',
  jobs: '1.0.0',
  email: '1.0.0',
  payments: '1.0.0',
  realtime: '1.0.0',
  analytics: '1.0.0',
} as const

type PrimitiveName = keyof typeof SDK_VERSIONS

interface PrimitiveStatus {
  enabled: boolean
  version: string | null
  status?: 'active' | 'beta' | 'coming_soon'
}

interface CapabilitiesResponse {
  primitives: Record<PrimitiveName, PrimitiveStatus>
  plan: string
  limits: {
    storage_bytes: { used: number; limit: number }
    email_sends_monthly: { used: number; limit: number }
    job_runs_monthly: { used: number; limit: number }
    secrets_count: { used: number; limit: number }
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

    // Get project details for plan info
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, mode')
      .eq('id', projectId)
      .single()

    if (!project) {
      return NextResponse.json(
        { ok: false, error: { code: 'NOT_FOUND', message: 'Project not found' } },
        { status: 404 }
      )
    }

    // Get user's subscription/plan
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    let planName = 'free'
    if (customer) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('plan_name, status')
        .eq('customer_id', customer.id)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (subscription) {
        planName = subscription.plan_name
      }
    }

    // Get current usage (secrets count for now, expand later)
    const { count: secretsCount } = await supabase
      .from('inhouse_secrets')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .eq('status', 'active')

    // Define which primitives are enabled
    // Currently: auth, db, cms, secrets are active
    // Storage, jobs have backend but SDK pending
    // Email, payments, realtime, analytics are coming soon
    const primitives: Record<PrimitiveName, PrimitiveStatus> = {
      auth: { enabled: true, version: SDK_VERSIONS.auth, status: 'active' },
      db: { enabled: true, version: SDK_VERSIONS.db, status: 'active' },
      cms: { enabled: true, version: SDK_VERSIONS.cms, status: 'active' },
      secrets: { enabled: true, version: SDK_VERSIONS.secrets, status: 'active' },
      storage: { enabled: true, version: SDK_VERSIONS.storage, status: 'beta' },
      jobs: { enabled: true, version: SDK_VERSIONS.jobs, status: 'beta' },
      email: { enabled: false, version: null, status: 'coming_soon' },
      payments: { enabled: false, version: null, status: 'coming_soon' },
      realtime: { enabled: false, version: null, status: 'coming_soon' },
      analytics: { enabled: false, version: null, status: 'coming_soon' },
    }

    // Get plan limits from database
    const { data: planLimits } = await supabase
      .from('plan_limits')
      .select('*')
      .eq('plan_name', planName)
      .single()

    // Default limits if no plan_limits row
    const defaultLimits = {
      storage_bytes: { used: 0, limit: 1_000_000_000 }, // 1GB
      email_sends_monthly: { used: 0, limit: 100 },
      job_runs_monthly: { used: 0, limit: 1000 },
      secrets_count: { used: secretsCount || 0, limit: 50 },
    }

    // Build limits from plan_limits table if available
    const limits = planLimits ? {
      storage_bytes: {
        used: 0, // TODO: Get from usage tracking
        limit: (planLimits.max_storage_mb || 1000) * 1_000_000,
      },
      email_sends_monthly: {
        used: 0, // TODO: Get from usage tracking
        limit: 1000, // Default, expand plan_limits table
      },
      job_runs_monthly: {
        used: 0, // TODO: Get from usage tracking
        // Note: Job runs have a fixed limit for now. Add max_job_runs_per_month
        // to plan_limits table if differentiation by plan is needed.
        limit: 10000,
      },
      secrets_count: {
        used: secretsCount || 0,
        limit: 100, // Default secrets limit
      },
    } : defaultLimits

    const response: CapabilitiesResponse = {
      primitives,
      plan: planName,
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
    console.error('[API] Get capabilities error:', error)
    return NextResponse.json(
      { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get capabilities' } },
      { status: 500 }
    )
  }
}
