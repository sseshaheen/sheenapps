import 'server-only'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

/**
 * Core Testing Logic Service
 * Handles A/B testing, statistical analysis, rollout management, and success criteria
 */

// Type definitions for testing
export interface TestConfiguration {
  test_type: 'ab_test' | 'gradual_rollout' | 'geographic' | 'segment'
  test_config: {
    ab_split?: {
      control_percentage: number
      variant_percentage: number
    }
    rollout_stages?: RolloutStage[]
    geographic_rules?: GeographicRule[]
    segment_rules?: SegmentRule[]
  }
  success_criteria: SuccessCriteria
}

export interface RolloutStage {
  name: string
  percentage: number
  duration_hours: number
  success_criteria?: SuccessCriteria
  auto_advance?: boolean
}

export interface GeographicRule {
  regions: string[]
  percentage_per_region: number
}

export interface SegmentRule {
  user_segments: string[]
  allocation: Record<string, number>
}

export interface SuccessCriteria {
  primary_metric: string
  minimum_improvement: number // e.g., 0.05 for 5%
  confidence_level: number // e.g., 0.95 for 95%
  minimum_sample_size: number
  auto_stop_on_significance?: boolean
  minimum_duration_hours?: number
  maximum_duration_hours?: number
}

export interface TestResult {
  test_id: string
  test_group: string
  metrics: Record<string, number>
  sample_size: number
  measured_at: Date
  statistical_significance?: StatisticalResult
}

export interface StatisticalResult {
  p_value: number
  confidence_level: number
  effect_size: number
  is_significant: boolean
  confidence_interval: [number, number]
}

export interface RolloutDecision {
  should_advance: boolean
  current_stage: string
  next_stage?: string
  criteria_met: boolean
  safety_checks: SafetyCheck[]
  recommendation: string
}

export interface SafetyCheck {
  check_type: string
  passed: boolean
  details: string
  severity: 'info' | 'warning' | 'critical'
}

export class PricingTestService {
  
  /**
   * Validate test configuration before creation
   */
  static validateTestConfiguration(config: TestConfiguration): { isValid: boolean; errors: string[] } {
    const errors: string[] = []
    
    // Validate test type specific configuration
    switch (config.test_type) {
      case 'ab_test':
        if (!config.test_config.ab_split) {
          errors.push('A/B test requires ab_split configuration')
        } else {
          const { control_percentage, variant_percentage } = config.test_config.ab_split
          if (control_percentage + variant_percentage !== 100) {
            errors.push('A/B split percentages must sum to 100')
          }
          if (control_percentage < 10 || variant_percentage < 10) {
            errors.push('Each A/B test group must have at least 10% traffic')
          }
        }
        break
        
      case 'gradual_rollout':
        if (!config.test_config.rollout_stages || config.test_config.rollout_stages.length === 0) {
          errors.push('Gradual rollout requires at least one rollout stage')
        } else {
          const stages = config.test_config.rollout_stages
          let previousPercentage = 0
          
          for (const [index, stage] of stages.entries()) {
            if (stage.percentage <= previousPercentage) {
              errors.push(`Stage ${index + 1}: percentage must be greater than previous stage`)
            }
            if (stage.percentage > 100) {
              errors.push(`Stage ${index + 1}: percentage cannot exceed 100`)
            }
            if (stage.duration_hours < 1) {
              errors.push(`Stage ${index + 1}: duration must be at least 1 hour`)
            }
            previousPercentage = stage.percentage
          }
        }
        break
        
      case 'geographic':
        if (!config.test_config.geographic_rules || config.test_config.geographic_rules.length === 0) {
          errors.push('Geographic test requires geographic rules')
        }
        break
        
      case 'segment':
        if (!config.test_config.segment_rules || config.test_config.segment_rules.length === 0) {
          errors.push('Segment test requires segment rules')
        }
        break
    }
    
    // Validate success criteria
    if (config.success_criteria.minimum_improvement <= 0 || config.success_criteria.minimum_improvement > 1) {
      errors.push('Minimum improvement must be between 0 and 1 (e.g., 0.05 for 5%)')
    }
    
    if (config.success_criteria.confidence_level <= 0 || config.success_criteria.confidence_level >= 1) {
      errors.push('Confidence level must be between 0 and 1 (e.g., 0.95 for 95%)')
    }
    
    if (config.success_criteria.minimum_sample_size < 100) {
      errors.push('Minimum sample size should be at least 100 for reliable results')
    }
    
    return { isValid: errors.length === 0, errors }
  }
  
  /**
   * Calculate statistical significance for A/B test results
   */
  static calculateStatisticalSignificance(
    controlResults: TestResult[],
    variantResults: TestResult[],
    metric: string = 'conversion_rate'
  ): StatisticalResult | null {
    
    if (controlResults.length === 0 || variantResults.length === 0) {
      return null
    }
    
    // Aggregate results
    const controlData = this.aggregateResults(controlResults, metric)
    const variantData = this.aggregateResults(variantResults, metric)
    
    if (controlData.sample_size < 30 || variantData.sample_size < 30) {
      return null // Need minimum sample size for statistical analysis
    }
    
    // Calculate z-score for conversion rate comparison
    const p1 = controlData.metric_value
    const n1 = controlData.sample_size
    const p2 = variantData.metric_value
    const n2 = variantData.sample_size
    
    // Pooled proportion
    const pooledP = (p1 * n1 + p2 * n2) / (n1 + n2)
    const pooledSE = Math.sqrt(pooledP * (1 - pooledP) * (1/n1 + 1/n2))
    
    if (pooledSE === 0) return null
    
    const zScore = (p2 - p1) / pooledSE
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore))) // Two-tailed test
    
    // Effect size (Cohen's d approximation)
    const effectSize = Math.abs(p2 - p1) / Math.sqrt((p1 * (1 - p1) + p2 * (1 - p2)) / 2)
    
    // Confidence interval for difference
    const diffSE = Math.sqrt((p1 * (1 - p1) / n1) + (p2 * (1 - p2) / n2))
    const zCritical = this.getZCritical(0.95) // 95% confidence
    const diff = p2 - p1
    const confidenceInterval: [number, number] = [
      diff - zCritical * diffSE,
      diff + zCritical * diffSE
    ]
    
    return {
      p_value: pValue,
      confidence_level: 0.95,
      effect_size: effectSize,
      is_significant: pValue < 0.05,
      confidence_interval: confidenceInterval
    }
  }
  
  /**
   * Evaluate if test meets success criteria
   */
  static async evaluateSuccessCriteria(
    testId: string,
    successCriteria: SuccessCriteria
  ): Promise<{ met: boolean; details: any; next_actions: string[] }> {
    
    const supabase = await createServerSupabaseClientNew()
    
    // Get recent test results
    const { data: results } = await supabase
      .from('pricing_test_results')
      .select('*')
      .eq('test_id', testId)
      .order('measured_at', { ascending: false })
      .limit(100)
    
    if (!results || results.length === 0) {
      return {
        met: false,
        details: { reason: 'No results available' },
        next_actions: ['Wait for test results to accumulate']
      }
    }
    
    // Check minimum sample size
    const totalSampleSize = results.reduce((sum, r) => sum + (r.sample_size || 0), 0)
    if (totalSampleSize < successCriteria.minimum_sample_size) {
      return {
        met: false,
        details: {
          reason: 'Insufficient sample size',
          current_sample_size: totalSampleSize,
          required_sample_size: successCriteria.minimum_sample_size,
          progress: (totalSampleSize / successCriteria.minimum_sample_size) * 100
        },
        next_actions: [
          'Continue test to reach minimum sample size',
          `Need ${successCriteria.minimum_sample_size - totalSampleSize} more samples`
        ]
      }
    }
    
    // Check minimum duration
    const testStart = new Date(results[results.length - 1].measured_at)
    const testDuration = (new Date().getTime() - testStart.getTime()) / (1000 * 60 * 60) // hours
    
    if (successCriteria.minimum_duration_hours && testDuration < successCriteria.minimum_duration_hours) {
      return {
        met: false,
        details: {
          reason: 'Minimum test duration not reached',
          current_duration_hours: Math.round(testDuration),
          required_duration_hours: successCriteria.minimum_duration_hours,
          time_remaining: successCriteria.minimum_duration_hours - testDuration
        },
        next_actions: [
          `Continue test for ${Math.round(successCriteria.minimum_duration_hours - testDuration)} more hours`,
          'Monitor for statistical significance'
        ]
      }
    }
    
    // Group results by test group
    const groupedResults = results.reduce((acc: any, result) => {
      if (!acc[result.test_group]) acc[result.test_group] = []
      acc[result.test_group].push(result)
      return acc
    }, {})
    
    const testGroups = Object.keys(groupedResults)
    
    // For A/B tests, check statistical significance
    if (testGroups.length === 2) {
      const [groupA, groupB] = testGroups
      const significance = this.calculateStatisticalSignificance(
        groupedResults[groupA],
        groupedResults[groupB],
        successCriteria.primary_metric
      )
      
      if (!significance) {
        return {
          met: false,
          details: { reason: 'Unable to calculate statistical significance' },
          next_actions: ['Check data quality and sample sizes']
        }
      }
      
      if (!significance.is_significant) {
        return {
          met: false,
          details: {
            reason: 'Results not statistically significant',
            p_value: significance.p_value,
            required_significance: 0.05,
            confidence_level: significance.confidence_level
          },
          next_actions: [
            'Continue test to reach statistical significance',
            'Consider increasing traffic allocation',
            'Monitor effect size trends'
          ]
        }
      }
      
      // Check if improvement meets minimum threshold
      const controlData = this.aggregateResults(groupedResults[groupA], successCriteria.primary_metric)
      const variantData = this.aggregateResults(groupedResults[groupB], successCriteria.primary_metric)
      
      const improvement = Math.abs(variantData.metric_value - controlData.metric_value) / controlData.metric_value
      
      if (improvement < successCriteria.minimum_improvement) {
        return {
          met: false,
          details: {
            reason: 'Improvement below minimum threshold',
            observed_improvement: improvement,
            required_improvement: successCriteria.minimum_improvement,
            effect_size: significance.effect_size
          },
          next_actions: [
            'Consider if observed improvement is practically significant',
            'Review test design and hypothesis',
            'Consider stopping test if improvement is unlikely'
          ]
        }
      }
      
      // Success criteria met!
      return {
        met: true,
        details: {
          reason: 'All success criteria satisfied',
          statistical_significance: significance,
          observed_improvement: improvement,
          sample_sizes: {
            [groupA]: controlData.sample_size,
            [groupB]: variantData.sample_size
          },
          winner: variantData.metric_value > controlData.metric_value ? groupB : groupA
        },
        next_actions: [
          'Review detailed results',
          'Consider promoting winning variant',
          'Plan full rollout strategy',
          'Document learnings for future tests'
        ]
      }
    }
    
    // For other test types, implement specific criteria
    return {
      met: false,
      details: { reason: 'Success criteria evaluation not implemented for this test type' },
      next_actions: ['Manual review required']
    }
  }
  
  /**
   * Determine if gradual rollout should advance to next stage
   */
  static async evaluateRolloutAdvancement(
    testId: string,
    currentStage: any,
    nextStage: any
  ): Promise<RolloutDecision> {
    
    const supabase = await createServerSupabaseClientNew()
    
    // Get results since current stage started
    const { data: stageResults } = await supabase
      .from('pricing_test_results')
      .select('*')
      .eq('test_id', testId)
      .gte('measured_at', currentStage.started_at)
      .order('measured_at', { ascending: false })
    
    const safetyChecks: SafetyCheck[] = []
    
    // Safety check 1: Minimum stage duration
    const stageDuration = (new Date().getTime() - new Date(currentStage.started_at).getTime()) / (1000 * 60 * 60)
    const minDuration = currentStage.stage_success_criteria?.minimum_duration_hours || 2
    
    if (stageDuration < minDuration) {
      safetyChecks.push({
        check_type: 'minimum_duration',
        passed: false,
        details: `Stage has only run for ${Math.round(stageDuration)} hours, minimum is ${minDuration}`,
        severity: 'warning'
      })
    } else {
      safetyChecks.push({
        check_type: 'minimum_duration',
        passed: true,
        details: `Stage duration (${Math.round(stageDuration)}h) meets minimum requirement`,
        severity: 'info'
      })
    }
    
    // Safety check 2: Error rate monitoring
    if (stageResults && stageResults.length > 0) {
      const latestMetrics = stageResults[0].metrics
      const errorRate = latestMetrics.error_rate || 0
      const bounceRate = latestMetrics.bounce_rate || 0
      
      if (errorRate > 0.05) { // 5% error rate threshold
        safetyChecks.push({
          check_type: 'error_rate',
          passed: false,
          details: `High error rate detected: ${(errorRate * 100).toFixed(2)}%`,
          severity: 'critical'
        })
      }
      
      if (bounceRate > 0.7) { // 70% bounce rate threshold
        safetyChecks.push({
          check_type: 'bounce_rate',
          passed: false,
          details: `High bounce rate detected: ${(bounceRate * 100).toFixed(2)}%`,
          severity: 'warning'
        })
      }
    }
    
    // Safety check 3: Sample size adequacy
    const stageSampleSize = stageResults?.reduce((sum, r) => sum + (r.sample_size || 0), 0) || 0
    const minSampleSize = currentStage.stage_success_criteria?.minimum_sample_size || 100
    
    if (stageSampleSize < minSampleSize) {
      safetyChecks.push({
        check_type: 'sample_size',
        passed: false,
        details: `Insufficient sample size: ${stageSampleSize}/${minSampleSize}`,
        severity: 'warning'
      })
    }
    
    // Determine if advancement should proceed
    const criticalFailures = safetyChecks.filter(check => !check.passed && check.severity === 'critical')
    const shouldAdvance = criticalFailures.length === 0
    
    let recommendation = ''
    if (criticalFailures.length > 0) {
      recommendation = 'Do not advance - critical issues detected'
    } else if (safetyChecks.filter(check => !check.passed).length > 0) {
      recommendation = 'Proceed with caution - monitor closely'
    } else {
      recommendation = 'Safe to advance to next stage'
    }
    
    return {
      should_advance: shouldAdvance,
      current_stage: currentStage.stage_name,
      next_stage: nextStage?.stage_name,
      criteria_met: safetyChecks.filter(check => check.passed).length === safetyChecks.length,
      safety_checks: safetyChecks,
      recommendation
    }
  }
  
  /**
   * Generate test recommendations based on current state
   */
  static generateTestRecommendations(
    testResults: TestResult[],
    testConfig: TestConfiguration
  ): string[] {
    const recommendations: string[] = []
    
    if (testResults.length === 0) {
      recommendations.push('No data yet - ensure test traffic is being recorded')
      return recommendations
    }
    
    // Check sample sizes
    const totalSamples = testResults.reduce((sum, r) => sum + r.sample_size, 0)
    if (totalSamples < 1000) {
      recommendations.push('Consider increasing traffic allocation for faster results')
    }
    
    // Check for uneven group sizes in A/B tests
    if (testConfig.test_type === 'ab_test') {
      const groupSizes = testResults.reduce((acc: any, result) => {
        acc[result.test_group] = (acc[result.test_group] || 0) + result.sample_size
        return acc
      }, {})
      
      const groups = Object.keys(groupSizes)
      if (groups.length === 2) {
        const [groupA, groupB] = groups
        const ratio = Math.max(groupSizes[groupA], groupSizes[groupB]) / Math.min(groupSizes[groupA], groupSizes[groupB])
        
        if (ratio > 1.2) {
          recommendations.push('Group sizes are uneven - check traffic allocation')
        }
      }
    }
    
    // Check for concerning metrics
    const latestResults = testResults.slice(0, 5) // Last 5 measurements
    const avgBounceRate = latestResults.reduce((sum, r) => sum + (r.metrics.bounce_rate || 0), 0) / latestResults.length
    
    if (avgBounceRate > 0.8) {
      recommendations.push('High bounce rate detected - review user experience changes')
    }
    
    // Test duration recommendations
    const testStart = new Date(Math.min(...testResults.map(r => r.measured_at.getTime())))
    const durationDays = (new Date().getTime() - testStart.getTime()) / (1000 * 60 * 60 * 24)
    
    if (durationDays > 14) {
      recommendations.push('Long-running test detected - consider external factors affecting results')
    }
    
    if (durationDays < 1) {
      recommendations.push('Early in test - wait for more data before making decisions')
    }
    
    return recommendations
  }
  
  // Helper methods
  
  private static aggregateResults(results: TestResult[], metric: string) {
    const totalSampleSize = results.reduce((sum, r) => sum + r.sample_size, 0)
    
    // Weight metrics by sample size
    const weightedMetricSum = results.reduce((sum, r) => {
      return sum + (r.metrics[metric] || 0) * r.sample_size
    }, 0)
    
    const metricValue = totalSampleSize > 0 ? weightedMetricSum / totalSampleSize : 0
    
    return {
      metric_value: metricValue,
      sample_size: totalSampleSize
    }
  }
  
  private static normalCDF(z: number): number {
    // Approximation of the cumulative standard normal distribution
    const a1 =  0.254829592
    const a2 = -0.284496736
    const a3 =  1.421413741
    const a4 = -1.453152027
    const a5 =  1.061405429
    const p  =  0.3275911
    
    const sign = z >= 0 ? 1 : -1
    z = Math.abs(z) / Math.sqrt(2)
    
    const t = 1.0 / (1.0 + p * z)
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z)
    
    return 0.5 * (1.0 + sign * y)
  }
  
  private static getZCritical(confidenceLevel: number): number {
    // Common z-critical values
    const zValues: Record<number, number> = {
      0.90: 1.645,
      0.95: 1.960,
      0.99: 2.576
    }
    
    return zValues[confidenceLevel] || 1.960
  }
}