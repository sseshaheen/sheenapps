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

export async function GET(request: NextRequest, props: RouteParams) {
  const params = await props.params;
  try {
    // Check admin authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({ error: 'Authentication required' }, 401)
    }

    // Check permissions
    const hasPermission = (await AdminAuthService.hasPermission('pricing.read')) || 
                         session.user.role === 'super_admin'
    if (!hasPermission) {
      return noCacheErrorResponse({ error: 'Insufficient permissions' }, 403)
    }

    const testId = params.id
    const { searchParams } = new URL(request.url)
    
    const timeRange = searchParams.get('time_range') || '24h' // '1h', '24h', '7d', '30d', 'all'
    const testGroup = searchParams.get('test_group') // Filter by specific test group
    const metric = searchParams.get('metric') // Focus on specific metric
    const aggregation = searchParams.get('aggregation') || 'hourly' // 'hourly', 'daily'
    const limit = parseInt(searchParams.get('limit') || '100')

    const supabase = await createServerSupabaseClientNew()

    // Verify test exists
    const { data: test, error: testError } = await supabase
      .from('pricing_tests')
      .select('id, name, test_type, status, actual_start_at')
      .eq('id', testId)
      .single()

    if (testError || !test) {
      return noCacheErrorResponse({
        error: 'Test not found',
        details: testError?.message
      }, 404)
    }

    // Calculate time range filter
    const now = new Date()
    let timeFilter: Date | null = null
    
    switch (timeRange) {
      case '1h':
        timeFilter = new Date(now.getTime() - (60 * 60 * 1000))
        break
      case '24h':
        timeFilter = new Date(now.getTime() - (24 * 60 * 60 * 1000))
        break
      case '7d':
        timeFilter = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000))
        break
      case '30d':
        timeFilter = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000))
        break
      case 'all':
      default:
        timeFilter = null
        break
    }

    // Build results query
    let resultsQuery = supabase
      .from('pricing_test_results')
      .select('*')
      .eq('test_id', testId)
      .order('measured_at', { ascending: false })
      .limit(limit)

    if (timeFilter) {
      resultsQuery = resultsQuery.gte('measured_at', timeFilter.toISOString())
    }

    if (testGroup) {
      resultsQuery = resultsQuery.eq('test_group', testGroup)
    }

    const { data: results, error: resultsError } = await resultsQuery

    if (resultsError) {
      return noCacheErrorResponse({
        error: 'Failed to fetch test results',
        details: resultsError.message
      }, 500)
    }

    // Process and aggregate results
    const processedResults = processResults(results || [], aggregation, metric)

    // Calculate summary statistics
    const summary = calculateSummaryStats(results || [], test.test_type)

    // Get rollout progress if applicable
    let rolloutProgress = null
    if (test.test_type === 'gradual_rollout') {
      const { data: progress } = await supabase
        .from('pricing_test_rollout_progress')
        .select('*')
        .eq('test_id', testId)
        .order('target_percentage', { ascending: true })
      
      rolloutProgress = progress
    }

    return noCacheResponse({
      success: true,
      test: {
        id: test.id,
        name: test.name,
        test_type: test.test_type,
        status: test.status,
        started_at: test.actual_start_at
      },
      results: {
        raw_data: results || [],
        processed_data: processedResults,
        summary: summary,
        rollout_progress: rolloutProgress,
        query_params: {
          time_range: timeRange,
          test_group: testGroup,
          metric: metric,
          aggregation: aggregation,
          total_results: results?.length || 0
        }
      }
    })

  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to fetch test results',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}

function processResults(results: any[], aggregation: string, focusMetric?: string | null) {
  if (results.length === 0) return []

  // Group results by test group
  const groupedResults = results.reduce((acc: any, result: any) => {
    const group = result.test_group
    if (!acc[group]) {
      acc[group] = []
    }
    acc[group].push(result)
    return acc
  }, {})

  // Process each group
  return Object.keys(groupedResults).map(testGroup => {
    const groupResults = groupedResults[testGroup]
    
    // Aggregate by time period
    const timeAggregated = aggregateByTime(groupResults, aggregation)
    
    // Calculate trends
    const trends = calculateTrends(groupResults, focusMetric)

    return {
      test_group: testGroup,
      sample_size: groupResults.reduce((sum: number, r: any) => sum + (r.sample_size || 0), 0),
      data_points: groupResults.length,
      time_series: timeAggregated,
      trends: trends,
      latest_metrics: groupResults[0]?.metrics || {},
      statistical_significance: groupResults[0]?.is_statistically_significant || false,
      confidence_level: groupResults[0]?.confidence_level || null,
      p_value: groupResults[0]?.p_value || null
    }
  })
}

function aggregateByTime(results: any[], aggregation: string) {
  // Group results by time period
  const timeGroups: any = {}
  
  results.forEach(result => {
    const date = new Date(result.measured_at)
    let timeKey: string
    
    if (aggregation === 'hourly') {
      timeKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`
    } else {
      timeKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    }
    
    if (!timeGroups[timeKey]) {
      timeGroups[timeKey] = []
    }
    timeGroups[timeKey].push(result)
  })

  // Aggregate metrics for each time period
  return Object.keys(timeGroups).map(timeKey => {
    const periodResults = timeGroups[timeKey]
    const aggregatedMetrics: any = {}
    
    // Sum up numeric metrics
    const numericFields = ['conversions', 'total_visitors', 'revenue', 'sessions']
    numericFields.forEach(field => {
      aggregatedMetrics[field] = periodResults.reduce((sum: number, r: any) => 
        sum + (r.metrics[field] || 0), 0
      )
    })
    
    // Calculate derived metrics
    if (aggregatedMetrics.total_visitors > 0) {
      aggregatedMetrics.conversion_rate = aggregatedMetrics.conversions / aggregatedMetrics.total_visitors
    }
    if (aggregatedMetrics.conversions > 0) {
      aggregatedMetrics.avg_order_value = aggregatedMetrics.revenue / aggregatedMetrics.conversions
    }
    
    return {
      time_key: timeKey,
      period_start: periodResults[periodResults.length - 1].measured_at,
      period_end: periodResults[0].measured_at,
      data_points: periodResults.length,
      metrics: aggregatedMetrics
    }
  }).sort((a, b) => new Date(a.period_start).getTime() - new Date(b.period_start).getTime())
}

function calculateTrends(results: any[], focusMetric?: string | null) {
  if (results.length < 2) return { trend: 'insufficient_data' }

  const latest = results[0]?.metrics
  const previous = results[Math.min(1, results.length - 1)]?.metrics

  if (!latest || !previous) return { trend: 'insufficient_data' }

  const metric = focusMetric || 'conversion_rate'
  const latestValue = latest[metric] || 0
  const previousValue = previous[metric] || 0

  if (previousValue === 0) return { trend: 'no_baseline' }

  const change = latestValue - previousValue
  const percentChange = (change / previousValue) * 100

  return {
    trend: change > 0 ? 'improving' : change < 0 ? 'declining' : 'stable',
    absolute_change: Math.round(change * 10000) / 10000,
    percent_change: Math.round(percentChange * 100) / 100,
    metric: metric,
    latest_value: latestValue,
    previous_value: previousValue
  }
}

function calculateSummaryStats(results: any[], testType: string) {
  if (results.length === 0) {
    return {
      total_results: 0,
      test_groups: [],
      overall_metrics: {},
      statistical_summary: null
    }
  }

  // Group by test group
  const groupStats: any = {}
  const allGroups = [...new Set(results.map(r => r.test_group))]

  allGroups.forEach(group => {
    const groupResults = results.filter(r => r.test_group === group)
    const totalSample = groupResults.reduce((sum, r) => sum + (r.sample_size || 0), 0)
    const latestMetrics = groupResults[0]?.metrics || {}

    groupStats[group] = {
      sample_size: totalSample,
      data_points: groupResults.length,
      latest_metrics: latestMetrics,
      avg_metrics: calculateAverageMetrics(groupResults)
    }
  })

  // For A/B tests, calculate statistical comparison
  let statisticalSummary = null
  if (testType === 'ab_test' && allGroups.length === 2) {
    const [groupA, groupB] = allGroups
    statisticalSummary = {
      groups_compared: [groupA, groupB],
      sample_sizes: {
        [groupA]: groupStats[groupA].sample_size,
        [groupB]: groupStats[groupB].sample_size
      },
      conversion_rates: {
        [groupA]: groupStats[groupA].latest_metrics.conversion_rate || 0,
        [groupB]: groupStats[groupB].latest_metrics.conversion_rate || 0
      },
      improvement: calculateImprovement(groupStats[groupA], groupStats[groupB]),
      significance_test: results[0]?.is_statistically_significant || false
    }
  }

  return {
    total_results: results.length,
    test_groups: allGroups,
    group_statistics: groupStats,
    statistical_summary: statisticalSummary,
    time_range: {
      earliest: results[results.length - 1]?.measured_at,
      latest: results[0]?.measured_at,
      duration_hours: Math.round(
        (new Date(results[0]?.measured_at).getTime() - 
         new Date(results[results.length - 1]?.measured_at).getTime()) / (1000 * 60 * 60)
      )
    }
  }
}

function calculateAverageMetrics(results: any[]) {
  if (results.length === 0) return {}

  const avgMetrics: any = {}
  const numericFields = ['conversion_rate', 'avg_order_value', 'bounce_rate', 'session_duration']
  
  numericFields.forEach(field => {
    const values = results.map(r => r.metrics[field]).filter(v => v !== undefined && v !== null)
    if (values.length > 0) {
      avgMetrics[field] = values.reduce((sum, val) => sum + val, 0) / values.length
    }
  })

  return avgMetrics
}

function calculateImprovement(groupA: any, groupB: any) {
  const rateA = groupA.latest_metrics.conversion_rate || 0
  const rateB = groupB.latest_metrics.conversion_rate || 0
  
  if (rateA === 0) return null
  
  const improvement = ((rateB - rateA) / rateA) * 100
  return {
    percentage: Math.round(improvement * 100) / 100,
    absolute: Math.round((rateB - rateA) * 10000) / 10000,
    winner: rateB > rateA ? groupB : groupA
  }
}