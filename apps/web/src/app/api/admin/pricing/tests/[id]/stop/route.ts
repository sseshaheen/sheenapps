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

interface StopTestRequest {
  reason?: string
  save_results?: boolean
  promote_winner?: boolean // For A/B tests
  promote_catalog_id?: string // Which catalog to promote
}

export async function POST(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Only super_admin can stop tests
    if (session.user.role !== 'super_admin') {
      return noCacheErrorResponse({
        error: 'Insufficient permissions. Super admin required to stop tests.',
        required: 'super_admin',
        current: session.user.role
      }, 403)
    }

    const testId = params.id
    const body: StopTestRequest = await request.json()
    const adminReason = request.headers.get('x-admin-reason') || 'Stopping pricing test'
    const correlationId = uuidv4()

    const supabase = await createServerSupabaseClientNew()

    // Get current test state
    const { data: currentTest, error: fetchError } = await supabase
      .from('pricing_tests')
      .select(`
        *,
        source_catalog:pricing_catalogs!source_catalog_id(id, version_tag, name),
        test_catalog:pricing_catalogs!test_catalog_id(id, version_tag, name)
      `)
      .eq('id', testId)
      .single()

    if (fetchError || !currentTest) {
      return noCacheErrorResponse({
        error: 'Test not found',
        details: fetchError?.message
      }, 404)
    }

    // Check if test can be stopped
    if (!['running', 'paused'].includes(currentTest.status)) {
      return noCacheErrorResponse({
        error: `Cannot stop test with status: ${currentTest.status}`
      }, 400)
    }

    // Calculate final test results
    const { data: finalResults } = await supabase
      .from('pricing_test_results')
      .select('*')
      .eq('test_id', testId)
      .order('measured_at', { ascending: false })
      .limit(50)

    // Determine winner for A/B tests
    const testSummary: any = {
      duration_hours: Math.round(
        (new Date().getTime() - new Date(currentTest.actual_start_at).getTime()) / (1000 * 60 * 60)
      ),
      total_results: finalResults?.length || 0
    }

    if (currentTest.test_type === 'ab_test' && finalResults && finalResults.length > 0) {
      const summaryByGroup = finalResults.reduce((acc: any, result: any) => {
        if (!acc[result.test_group]) {
          acc[result.test_group] = {
            conversions: 0,
            visitors: 0,
            revenue: 0,
            results_count: 0
          }
        }
        const metrics = result.metrics
        acc[result.test_group].conversions += metrics.conversions || 0
        acc[result.test_group].visitors += metrics.total_visitors || 0
        acc[result.test_group].revenue += metrics.revenue || 0
        acc[result.test_group].results_count += 1
        return acc
      }, {})

      // Calculate conversion rates and determine winner
      let winner = null
      let bestConversionRate = 0
      
      Object.keys(summaryByGroup).forEach(group => {
        const data = summaryByGroup[group]
        data.conversion_rate = data.visitors > 0 ? data.conversions / data.visitors : 0
        
        if (data.conversion_rate > bestConversionRate) {
          bestConversionRate = data.conversion_rate
          winner = group
        }
      })

      testSummary.ab_results = summaryByGroup
      testSummary.winner = winner
    }

    // Update test status to completed
    const { data: updatedTest, error: updateError } = await supabase
      .from('pricing_tests')
      .update({
        status: 'completed',
        actual_end_at: new Date().toISOString(),
        current_metrics: testSummary,
        updated_at: new Date().toISOString()
      })
      .eq('id', testId)
      .select()
      .single()

    if (updateError) {
      return noCacheErrorResponse({
        error: 'Failed to stop test',
        details: updateError.message
      }, 500)
    }

    // Complete any active rollout stages
    if (currentTest.test_type === 'gradual_rollout') {
      await supabase
        .from('pricing_test_rollout_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          actual_percentage: 100 // Mark as fully completed
        })
        .eq('test_id', testId)
        .eq('status', 'active')
    }

    // Handle winner promotion for A/B tests
    let promotionResult = null
    if (body.promote_winner && currentTest.test_type === 'ab_test' && testSummary.winner) {
      const catalogToPromote = testSummary.winner === 'control' 
        ? currentTest.source_catalog_id 
        : currentTest.test_catalog_id

      // This would typically activate the winning catalog
      // For now, we'll just log the intention
      promotionResult = {
        promoted_catalog: catalogToPromote,
        winner_group: testSummary.winner,
        improvement: calculateImprovement(testSummary.ab_results, testSummary.winner)
      }

      await supabase
        .from('pricing_test_audit_logs')
        .insert({
          test_id: testId,
          action: 'winner_promoted',
          actor_id: session.user.id,
          actor_email: session.user.email,
          reason: `Promoted winning variant: ${testSummary.winner}`,
          correlation_id: correlationId,
          metadata: promotionResult
        })
    }

    // Create comprehensive audit log
    await supabase
      .from('pricing_test_audit_logs')
      .insert({
        test_id: testId,
        action: 'test_stopped',
        actor_id: session.user.id,
        actor_email: session.user.email,
        reason: adminReason,
        correlation_id: correlationId,
        before_state: { status: currentTest.status },
        after_state: { 
          status: 'completed', 
          ended_at: new Date().toISOString(),
          final_results: testSummary
        },
        metadata: {
          user_reason: body.reason,
          save_results: body.save_results,
          promote_winner: body.promote_winner
        }
      })

    return noCacheResponse({
      success: true,
      test: updatedTest,
      test_summary: testSummary,
      promotion_result: promotionResult,
      correlation_id: correlationId,
      message: 'Test stopped successfully',
      recommendations: generateStopRecommendations(currentTest, testSummary)
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to stop test',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

function calculateImprovement(abResults: any, winner: string): number | null {
  if (!abResults || !winner) return null

  const winnerData = abResults[winner]
  const otherGroups = Object.keys(abResults).filter(g => g !== winner)
  
  if (otherGroups.length === 0) return null

  const baselineRate = abResults[otherGroups[0]].conversion_rate
  if (baselineRate === 0) return null

  const improvement = ((winnerData.conversion_rate - baselineRate) / baselineRate) * 100
  return Math.round(improvement * 100) / 100 // Round to 2 decimal places
}

function generateStopRecommendations(test: any, summary: any): string[] {
  const recommendations = []

  if (test.test_type === 'ab_test' && summary.winner) {
    const improvement = calculateImprovement(summary.ab_results, summary.winner)
    if (improvement && improvement > 5) {
      recommendations.push(`Strong winner detected: ${summary.winner} showed ${improvement}% improvement`)
      recommendations.push('Consider activating the winning variant for all users')
    } else if (improvement && improvement < 2) {
      recommendations.push('Results show minimal difference between variants')
      recommendations.push('Consider running test longer or with larger sample size')
    }
  }

  if (summary.duration_hours < 24) {
    recommendations.push('Test duration was less than 24 hours - consider longer tests for more reliable results')
  }

  if (summary.total_results < 100) {
    recommendations.push('Low sample size detected - results may not be statistically significant')
  }

  recommendations.push('Review detailed analytics before making final pricing decisions')
  recommendations.push('Document learnings for future test configurations')

  return recommendations
}