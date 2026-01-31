import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { v4 as uuidv4 } from 'uuid'

// ✅ Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface RolloutRequest {
  action: 'advance' | 'rollback' | 'skip'
  target_stage?: string
  override_success_criteria?: boolean
  reason?: string
}

export async function POST(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Only super_admin can manage rollouts
    if (session.user.role !== 'super_admin') {
      return noCacheErrorResponse({
        error: 'Insufficient permissions. Super admin required for rollout management.',
        required: 'super_admin',
        current: session.user.role
      }, 403)
    }

    const testId = params.id
    const body: RolloutRequest = await request.json()
    const adminReason = request.headers.get('x-admin-reason') || 'Managing test rollout'
    const correlationId = uuidv4()

    const supabase = await createServerSupabaseClientNew()

    // Get current test and verify it's a gradual rollout
    const { data: test, error: testError } = await supabase
      .from('pricing_tests')
      .select('*')
      .eq('id', testId)
      .single()

    if (testError || !test) {
      return noCacheErrorResponse({
        error: 'Test not found',
        details: testError?.message
      }, 404)
    }

    if (test.test_type !== 'gradual_rollout') {
      return noCacheErrorResponse({
        error: 'Rollout management only available for gradual_rollout tests'
      }, 400)
    }

    if (test.status !== 'running') {
      return noCacheErrorResponse({
        error: `Cannot manage rollout for test with status: ${test.status}`
      }, 400)
    }

    // Get current rollout progress
    const { data: progress, error: progressError } = await supabase
      .from('pricing_test_rollout_progress')
      .select('*')
      .eq('test_id', testId)
      .order('target_percentage', { ascending: true })

    if (progressError || !progress) {
      return noCacheErrorResponse({
        error: 'Failed to fetch rollout progress',
        details: progressError?.message
      }, 500)
    }

    let result: any = {}
    
    switch (body.action) {
      case 'advance':
        result = await advanceRollout(supabase, testId, progress, body, session, adminReason, correlationId)
        break
      
      case 'rollback':
        result = await rollbackStage(supabase, testId, progress, body, session, adminReason, correlationId)
        break
      
      case 'skip':
        result = await skipStage(supabase, testId, progress, body, session, adminReason, correlationId)
        break
      
      default:
        return noCacheErrorResponse({
          error: 'Invalid rollout action',
          valid_actions: ['advance', 'rollback', 'skip']
        }, 400)
    }

    if (result.error) {
      return noCacheErrorResponse(result, 400)
    }

    return noCacheResponse({
      success: true,
      ...result,
      correlation_id: correlationId
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to manage rollout',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

async function advanceRollout(
  supabase: any,
  testId: string,
  progress: any[],
  body: RolloutRequest,
  session: any,
  adminReason: string,
  correlationId: string
) {
  // Find current active stage
  const activeStage = progress.find(p => p.status === 'active')
  const nextStage = progress.find(p => 
    p.status === 'pending' && p.target_percentage > (activeStage?.target_percentage || 0)
  )

  if (!nextStage) {
    return {
      error: 'No next stage available to advance to',
      current_stage: activeStage?.stage_name,
      completed_stages: progress.filter(p => p.status === 'completed').length
    }
  }

  // Check success criteria for current stage (unless overridden)
  if (activeStage && !body.override_success_criteria) {
    const criteriaResult = await checkSuccessCriteria(supabase, testId, activeStage)
    if (!criteriaResult.met) {
      return {
        error: 'Current stage success criteria not met',
        current_stage: activeStage.stage_name,
        criteria_status: criteriaResult,
        message: 'Use override_success_criteria: true to advance anyway'
      }
    }
  }

  // Complete current stage
  if (activeStage) {
    await supabase
      .from('pricing_test_rollout_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        actual_percentage: activeStage.target_percentage,
        criteria_met: true
      })
      .eq('id', activeStage.id)
  }

  // Activate next stage
  const { error: activateError } = await supabase
    .from('pricing_test_rollout_progress')
    .update({
      status: 'active',
      started_at: new Date().toISOString()
    })
    .eq('id', nextStage.id)

  if (activateError) {
    return { error: 'Failed to activate next stage', details: activateError.message }
  }

  // Create audit log
  await supabase
    .from('pricing_test_audit_logs')
    .insert({
      test_id: testId,
      action: 'rollout_advanced',
      actor_id: session.user.id,
      actor_email: session.user.email,
      reason: adminReason,
      correlation_id: correlationId,
      metadata: {
        from_stage: activeStage?.stage_name,
        to_stage: nextStage.stage_name,
        from_percentage: activeStage?.target_percentage || 0,
        to_percentage: nextStage.target_percentage,
        override_criteria: body.override_success_criteria
      }
    })

  return {
    message: 'Rollout advanced successfully',
    previous_stage: activeStage?.stage_name,
    current_stage: nextStage.stage_name,
    current_percentage: nextStage.target_percentage,
    estimated_users: Math.round((nextStage.target_percentage / 100) * 10000), // Estimate based on 10k total users
    next_actions: [
      'Monitor new stage performance',
      'Check success criteria before next advance',
      'Set up alerts for key metrics'
    ]
  }
}

async function rollbackStage(
  supabase: any,
  testId: string,
  progress: any[],
  body: RolloutRequest,
  session: any,
  adminReason: string,
  correlationId: string
) {
  const activeStage = progress.find(p => p.status === 'active')
  if (!activeStage) {
    return { error: 'No active stage to rollback from' }
  }

  // Find previous stage to rollback to
  const previousStage = progress
    .filter(p => p.target_percentage < activeStage.target_percentage && p.status === 'completed')
    .sort((a, b) => b.target_percentage - a.target_percentage)[0]

  if (!previousStage) {
    return { error: 'No previous stage to rollback to' }
  }

  // Mark current stage as rolled back
  await supabase
    .from('pricing_test_rollout_progress')
    .update({
      status: 'rolled_back',
      completed_at: new Date().toISOString(),
      error_message: body.reason || 'Manual rollback'
    })
    .eq('id', activeStage.id)

  // Reactivate previous stage
  await supabase
    .from('pricing_test_rollout_progress')
    .update({
      status: 'active',
      started_at: new Date().toISOString()
    })
    .eq('id', previousStage.id)

  // Create audit log
  await supabase
    .from('pricing_test_audit_logs')
    .insert({
      test_id: testId,
      action: 'rollout_rolled_back',
      actor_id: session.user.id,
      actor_email: session.user.email,
      reason: adminReason,
      correlation_id: correlationId,
      metadata: {
        from_stage: activeStage.stage_name,
        to_stage: previousStage.stage_name,
        from_percentage: activeStage.target_percentage,
        to_percentage: previousStage.target_percentage,
        rollback_reason: body.reason
      }
    })

  return {
    message: 'Rollout rolled back successfully',
    previous_stage: activeStage.stage_name,
    current_stage: previousStage.stage_name,
    current_percentage: previousStage.target_percentage,
    rollback_reason: body.reason,
    impact: 'Traffic reduced to previous stage level'
  }
}

async function skipStage(
  supabase: any,
  testId: string,
  progress: any[],
  body: RolloutRequest,
  session: any,
  adminReason: string,
  correlationId: string
) {
  // Find stage to skip
  const stageToSkip = body.target_stage 
    ? progress.find(p => p.stage_name === body.target_stage)
    : progress.find(p => p.status === 'pending')

  if (!stageToSkip || stageToSkip.status !== 'pending') {
    return { error: 'Invalid stage to skip or stage not in pending status' }
  }

  // Mark stage as skipped
  await supabase
    .from('pricing_test_rollout_progress')
    .update({
      status: 'completed', // Mark as completed but with note
      completed_at: new Date().toISOString(),
      actual_percentage: 0, // Indicate it was skipped
      error_message: `Skipped: ${body.reason || 'Manual skip'}`
    })
    .eq('id', stageToSkip.id)

  // Create audit log
  await supabase
    .from('pricing_test_audit_logs')
    .insert({
      test_id: testId,
      action: 'rollout_stage_skipped',
      actor_id: session.user.id,
      actor_email: session.user.email,
      reason: adminReason,
      correlation_id: correlationId,
      metadata: {
        skipped_stage: stageToSkip.stage_name,
        target_percentage: stageToSkip.target_percentage,
        skip_reason: body.reason
      }
    })

  return {
    message: 'Stage skipped successfully',
    skipped_stage: stageToSkip.stage_name,
    skipped_percentage: stageToSkip.target_percentage,
    skip_reason: body.reason,
    next_pending_stage: progress.find(p => p.status === 'pending' && p.id !== stageToSkip.id)?.stage_name
  }
}

async function checkSuccessCriteria(supabase: any, testId: string, stage: any) {
  // Get recent results for this stage
  const { data: results } = await supabase
    .from('pricing_test_results')
    .select('*')
    .eq('test_id', testId)
    .gte('measured_at', stage.started_at)
    .order('measured_at', { ascending: false })
    .limit(10)

  if (!results || results.length === 0) {
    return {
      met: false,
      reason: 'No recent results available for criteria evaluation',
      sample_size: 0
    }
  }

  // Simple success criteria check (can be expanded)
  const latestResult = results[0]
  const metrics = latestResult.metrics
  
  const conversionRate = metrics.conversion_rate || 0
  const sampleSize = latestResult.sample_size || 0

  // Basic criteria: minimum sample size and reasonable conversion rate
  const minimumSampleSize = stage.stage_success_criteria?.minimum_sample_size || 100
  const minimumConversionRate = stage.stage_success_criteria?.minimum_conversion_rate || 0.05

  const criteriasMet = sampleSize >= minimumSampleSize && conversionRate >= minimumConversionRate

  return {
    met: criteriasMet,
    reason: criteriasMet ? 'Success criteria satisfied' : 'Criteria not met',
    details: {
      sample_size: sampleSize,
      required_sample_size: minimumSampleSize,
      conversion_rate: conversionRate,
      required_conversion_rate: minimumConversionRate
    }
  }
}