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

export async function POST(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Only super_admin can start tests
    if (session.user.role !== 'super_admin') {
      return noCacheErrorResponse({
        error: 'Insufficient permissions. Super admin required to start tests.',
        required: 'super_admin',
        current: session.user.role
      }, 403)
    }

    const testId = params.id
    const reason = request.headers.get('x-admin-reason') || 'Starting pricing test'
    const correlationId = uuidv4()

    const supabase = await createServerSupabaseClientNew()

    // Use the database function to start the test (includes validation and audit logging)
    const { data: success, error } = await supabase
      .rpc('start_pricing_test', {
        p_test_id: testId,
        p_actor_id: session.user.id,
        p_reason: reason,
        p_correlation_id: correlationId
      })

    if (error) {
      return noCacheErrorResponse({
        error: 'Failed to start test',
        details: error.message
      }, 400)
    }

    // Get the updated test details
    const { data: test } = await supabase
      .from('pricing_tests')
      .select(`
        id, name, status, actual_start_at, test_type, test_config,
        source_catalog:pricing_catalogs!source_catalog_id(version_tag, name),
        test_catalog:pricing_catalogs!test_catalog_id(version_tag, name)
      `)
      .eq('id', testId)
      .single()

    // Initialize rollout progress for gradual rollout tests
    if (test?.test_type === 'gradual_rollout' && test.test_config?.rollout_stages) {
      const stages = test.test_config.rollout_stages

      // Create progress records for each stage
      for (const [index, stage] of stages.entries()) {
        await supabase
          .from('pricing_test_rollout_progress')
          .insert({
            test_id: testId,
            stage_name: stage.name || `stage_${index + 1}`,
            target_percentage: stage.percentage,
            status: index === 0 ? 'active' : 'pending', // First stage starts immediately
            stage_success_criteria: stage.success_criteria || null,
            started_at: index === 0 ? new Date().toISOString() : null
          })
      }

      // If first stage is starting, log it
      if (stages.length > 0) {
        await supabase
          .from('pricing_test_audit_logs')
          .insert({
            test_id: testId,
            action: 'rollout_stage_started',
            actor_id: session.user.id,
            actor_email: session.user.email,
            reason: `Started first rollout stage: ${stages[0].name || 'stage_1'}`,
            correlation_id: correlationId,
            metadata: {
              stage_name: stages[0].name || 'stage_1',
              target_percentage: stages[0].percentage
            }
          })
      }
    }

    return noCacheResponse({
      success: true,
      test: test,
      correlation_id: correlationId,
      message: 'Test started successfully',
      next_actions: getNextActions(test)
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to start test',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

function getNextActions(test: any): string[] {
  const actions = []

  switch (test.test_type) {
    case 'ab_test':
      actions.push('Monitor conversion metrics for both variants')
      actions.push('Check for statistical significance after minimum sample size')
      break
    
    case 'gradual_rollout':
      actions.push('Monitor first stage performance')
      actions.push('Advance to next stage when success criteria are met')
      break
    
    case 'geographic':
      actions.push('Monitor regional performance differences')
      actions.push('Check for geographic-specific issues')
      break
    
    case 'segment':
      actions.push('Monitor segment-specific conversion rates')
      actions.push('Validate segment targeting accuracy')
      break
  }

  actions.push('Set up real-time monitoring dashboard')
  actions.push('Define alert thresholds for key metrics')

  return actions
}