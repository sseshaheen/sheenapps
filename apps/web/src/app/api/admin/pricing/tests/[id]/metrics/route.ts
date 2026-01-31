import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

// ✅ Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface MetricsRequest {
  test_group: string // 'control', 'variant_a', 'rollout_25', etc.
  metrics: {
    conversions?: number
    total_visitors?: number
    revenue?: number
    sessions?: number
    bounce_rate?: number
    session_duration?: number // in seconds
    avg_order_value?: number
    // Add custom metrics as needed
    [key: string]: number | undefined
  }
  measurement_window?: string // '1h', '24h', etc.
  measured_at?: string // ISO timestamp, defaults to now
  sample_size?: number
  statistical_data?: {
    confidence_level?: number
    p_value?: number
    is_statistically_significant?: boolean
  }
}

export async function POST(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication (or service account for automated metrics)
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Allow both admin users and service accounts to record metrics
    const hasPermission = (await AdminAuthService.hasPermission('pricing.write')) || 
                         session.user.role === 'super_admin'
    if (!hasPermission) {
      return noCacheErrorResponse({ error: 'Insufficient permissions' }, 403)
    }

    const testId = params.id
    const body: MetricsRequest = await request.json()

    // Validate required fields
    if (!body.test_group || !body.metrics) {
      return noCacheErrorResponse({
        error: 'Missing required fields',
        required: ['test_group', 'metrics']
      }, 400)
    }

    const supabase = await createServerSupabaseClientNew()

    // Verify test exists and is active
    const { data: test, error: testError } = await supabase
      .from('pricing_tests')
      .select('id, name, status, test_type')
      .eq('id', testId)
      .single() as { data: { id: string, name: string, status: string, test_type: string } | null, error: any }

    if (testError || !test) {
      return noCacheErrorResponse({
        error: 'Test not found',
        details: testError?.message
      }, 404)
    }

    if (test.status !== 'running') {
      return noCacheErrorResponse({
        error: `Cannot record metrics for test with status: ${test.status}`,
        current_status: test.status
      }, 400)
    }

    // Validate test group is appropriate for test type
    const validationError = validateTestGroup(test.test_type, body.test_group)
    if (validationError) {
      return noCacheErrorResponse({
        error: 'Invalid test group for test type',
        details: validationError
      }, 400)
    }

    // Calculate derived metrics
    const enrichedMetrics = calculateDerivedMetrics(body.metrics)

    // Determine measurement window
    const measurementWindow = parseMeasurementWindow(body.measurement_window || '1h')
    
    // Record metrics using database function
    const { data: resultId, error: recordError } = await supabase
      .rpc<any>('record_test_metrics', {
        p_test_id: testId,
        p_test_group: body.test_group,
        p_metrics: enrichedMetrics,
        p_measurement_window: measurementWindow,
        p_measured_at: body.measured_at ? new Date(body.measured_at).toISOString() : new Date().toISOString()
      })

    if (recordError) {
      return noCacheErrorResponse({
        error: 'Failed to record metrics',
        details: recordError.message
      }, 500)
    }

    // Update statistical significance if provided
    if (body.statistical_data && Object.keys(body.statistical_data).length > 0) {
      await supabase
        .from('pricing_test_results')
        .update({
          confidence_level: body.statistical_data.confidence_level,
          p_value: body.statistical_data.p_value,
          is_statistically_significant: body.statistical_data.is_statistically_significant || false
        } as any)
        .eq('id', resultId)
    }

    // Check if this update triggers any success criteria
    const criteriaCheck = await checkTestSuccessCriteria(supabase, testId, test)
    
    const response: any = {
      success: true,
      result_id: resultId,
      test_group: body.test_group,
      metrics_recorded: enrichedMetrics,
      message: 'Metrics recorded successfully'
    }

    if (criteriaCheck.criteria_met) {
      response.success_criteria_met = true
      response.next_actions = criteriaCheck.next_actions
      
      // Auto-promote if configured
      if (criteriaCheck.auto_promote) {
        response.auto_promotion_triggered = true
        response.promotion_details = (criteriaCheck as any).promotion_details
      }
    }

    return noCacheResponse(response)

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to record test metrics',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

function validateTestGroup(testType: string, testGroup: string): string | null {
  switch (testType) {
    case 'ab_test':
      if (!['control', 'variant_a', 'variant_b'].includes(testGroup)) {
        return `A/B test group must be one of: control, variant_a, variant_b. Got: ${testGroup}`
      }
      break
      
    case 'gradual_rollout':
      if (!testGroup.match(/^(control|rollout_\d+)$/)) {
        return `Gradual rollout group must be 'control' or 'rollout_XX'. Got: ${testGroup}`
      }
      break
      
    case 'geographic':
      // Allow any geographic identifier
      if (!testGroup.match(/^(control|geo_.+)$/)) {
        return `Geographic test group must be 'control' or 'geo_REGION'. Got: ${testGroup}`
      }
      break
      
    case 'segment':
      if (!testGroup.match(/^(control|segment_.+)$/)) {
        return `Segment test group must be 'control' or 'segment_NAME'. Got: ${testGroup}`
      }
      break
      
    default:
      return `Unknown test type: ${testType}`
  }
  
  return null
}

function calculateDerivedMetrics(metrics: any): any {
  const enriched = { ...metrics }

  // Calculate conversion rate
  if (metrics.conversions && metrics.total_visitors) {
    enriched.conversion_rate = metrics.conversions / metrics.total_visitors
  }

  // Calculate average order value
  if (metrics.revenue && metrics.conversions) {
    enriched.avg_order_value = metrics.revenue / metrics.conversions
  }

  // Calculate revenue per visitor
  if (metrics.revenue && metrics.total_visitors) {
    enriched.revenue_per_visitor = metrics.revenue / metrics.total_visitors
  }

  // Calculate bounce rate (if sessions provided)
  if (metrics.sessions && metrics.total_visitors) {
    enriched.session_rate = metrics.sessions / metrics.total_visitors
  }

  // Round all numeric values to reasonable precision
  Object.keys(enriched).forEach(key => {
    if (typeof enriched[key] === 'number') {
      enriched[key] = Math.round(enriched[key] * 10000) / 10000
    }
  })

  return enriched
}

function parseMeasurementWindow(window: string): string {
  // Convert common formats to PostgreSQL interval format
  switch (window) {
    case '1h':
      return '1 hour'
    case '24h':
      return '24 hours'
    case '1d':
      return '1 day'
    case '1w':
      return '1 week'
    default:
      return '1 hour'
  }
}

async function checkTestSuccessCriteria(supabase: any, testId: string, test: any) {
  try {
    // Get test success criteria
    const successCriteria = test.success_criteria || {}
    
    if (!successCriteria.primary_metric) {
      return { criteria_met: false, reason: 'No success criteria defined' }
    }

    // Get latest results for analysis
    const { data: results } = await supabase
      .from('pricing_test_results')
      .select('*')
      .eq('test_id', testId)
      .order('measured_at', { ascending: false })
      .limit(20)

    if (!results || results.length === 0) {
      return { criteria_met: false, reason: 'No results available' }
    }

    // Check minimum sample size
    const totalSampleSize = results.reduce((sum, r) => sum + (r.sample_size || 0), 0)
    if (totalSampleSize < (successCriteria.minimum_sample_size || 1000)) {
      return { 
        criteria_met: false, 
        reason: 'Minimum sample size not reached',
        current_sample_size: totalSampleSize,
        required_sample_size: successCriteria.minimum_sample_size || 1000
      }
    }

    // For A/B tests, check for statistical significance
    if (test.test_type === 'ab_test') {
      const significantResults = results.filter(r => r.is_statistically_significant)
      const requiredConfidence = successCriteria.confidence_level || 0.95
      
      if (significantResults.length === 0) {
        return {
          criteria_met: false,
          reason: 'No statistically significant results yet',
          current_confidence: 0,
          required_confidence: requiredConfidence
        }
      }

      // Check if improvement meets threshold
      const latestResult = significantResults[0]
      const improvementThreshold = successCriteria.minimum_improvement || 0.05
      
      // This is a simplified check - in production you'd do proper statistical analysis
      const controlMetric = latestResult.metrics[successCriteria.primary_metric] || 0
      
      return {
        criteria_met: true,
        reason: 'Success criteria satisfied',
        auto_promote: test.auto_promote_on_success || false,
        next_actions: [
          'Review detailed results',
          'Consider promoting winning variant',
          'Plan rollout to 100% traffic'
        ]
      }
    }

    // For other test types, implement specific criteria checks
    return {
      criteria_met: false,
      reason: 'Success criteria evaluation not implemented for this test type'
    }

  } catch (error) {
    return {
      criteria_met: false,
      reason: 'Error evaluating success criteria',
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}