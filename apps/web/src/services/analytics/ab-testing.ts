/**
 * A/B Testing Framework for Component Mappings
 * Enables testing different component mappings to optimize conversion
 */

import { createClient } from '@/lib/supabase-client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FEATURE_FLAGS } from '@/lib/feature-flags'

// A/B Test Types
export interface ABTest {
  id: string
  name: string
  description: string
  status: 'draft' | 'active' | 'completed' | 'paused'
  start_date: string
  end_date?: string
  traffic_percentage: number
  created_at: string
  updated_at: string
}

export interface ABTestVariant {
  id: string
  test_id: string
  name: string
  description: string
  is_control: boolean
  traffic_percentage: number
  component_mappings: ComponentMappingOverride[]
  created_at: string
}

export interface ComponentMappingOverride {
  ai_component_name: string
  builder_section_type: string
  industry?: string
  priority?: number
}

export interface ABTestAssignment {
  id: string
  test_id: string
  variant_id: string
  user_id?: string
  session_id: string
  assigned_at: string
}

export interface ABTestResult {
  id: string
  test_id: string
  variant_id: string
  user_id?: string
  session_id: string
  event_type: 'conversion' | 'error' | 'engagement'
  event_data: Record<string, any>
  timestamp: string
}

// A/B Testing Service
class ABTestingService {
  private supabase = createClient()
  private isEnabled = FEATURE_FLAGS.ENABLE_SUPABASE && !FEATURE_FLAGS.ENABLE_SERVER_AUTH

  /**
   * Get active A/B tests
   */
  async getActiveTests(): Promise<ABTest[]> {
    if (!this.isEnabled) {
      return []
    }
    
    try {
      const { data, error } = await this.supabase
        .from('ab_tests')
        .select('*')
        .eq('status', 'active')
        .lte('start_date', new Date().toISOString())
        .or('end_date.is.null,end_date.gte.' + new Date().toISOString())

      if (error) {
        console.error('[AB Testing] Failed to fetch active tests:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('[AB Testing] Error getting active tests:', error)
      return []
    }
  }

  /**
   * Get variants for a specific test
   */
  async getTestVariants(testId: string): Promise<ABTestVariant[]> {
    const { data, error } = await this.supabase
      .from('ab_test_variants')
      .select('*')
      .eq('test_id', testId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[AB Testing] Failed to fetch test variants:', error)
      return []
    }

    return data || []
  }

  /**
   * Assign user to A/B test variant
   */
  async assignToVariant(
    testId: string,
    sessionId: string,
    userId?: string
  ): Promise<ABTestAssignment | null> {
    try {
      // Check if user already assigned
      const { data: existingAssignment } = await this.supabase
        .from('ab_test_assignments')
        .select('*')
        .eq('test_id', testId)
        .eq('session_id', sessionId)
        .single()

      if (existingAssignment) {
        return existingAssignment
      }

      // Get test variants
      const variants = await this.getTestVariants(testId)
      if (variants.length === 0) {
        return null
      }

      // Select variant based on traffic percentage
      const random = Math.random() * 100
      let cumulativePercentage = 0
      let selectedVariant: ABTestVariant | null = null

      for (const variant of variants) {
        cumulativePercentage += variant.traffic_percentage
        if (random <= cumulativePercentage) {
          selectedVariant = variant
          break
        }
      }

      // Fallback to control variant
      if (!selectedVariant) {
        selectedVariant = variants.find(v => v.is_control) || variants[0]
      }

      // Create assignment
      const { data: assignment, error } = await this.supabase
        .from('ab_test_assignments')
        .insert({
          test_id: testId,
          variant_id: selectedVariant.id,
          user_id: userId,
          session_id: sessionId,
          assigned_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        console.error('[AB Testing] Failed to create assignment:', error)
        return null
      }

      return assignment
    } catch (error) {
      console.error('[AB Testing] Error in assignToVariant:', error)
      return null
    }
  }

  /**
   * Get component mappings for a user (including A/B test overrides)
   */
  async getComponentMappingsForUser(
    sessionId: string,
    industry?: string,
    userId?: string
  ): Promise<ComponentMappingOverride[]> {
    try {
      // Get active tests
      const activeTests = await this.getActiveTests()
      
      // Get user assignments for active tests
      const assignments = await Promise.all(
        activeTests.map(test => this.assignToVariant(test.id, sessionId, userId))
      )

      // Collect all mapping overrides
      const mappingOverrides: ComponentMappingOverride[] = []

      for (const assignment of assignments) {
        if (!assignment) continue

        // Get variant mappings
        const { data: variant } = await this.supabase
          .from('ab_test_variants')
          .select('component_mappings')
          .eq('id', assignment.variant_id)
          .single()

        if (variant?.component_mappings) {
          mappingOverrides.push(...variant.component_mappings)
        }
      }

      return mappingOverrides
    } catch (error) {
      console.error('[AB Testing] Error getting mappings for user:', error)
      return []
    }
  }

  /**
   * Record A/B test result
   */
  async recordResult(
    testId: string,
    variantId: string,
    sessionId: string,
    eventType: 'conversion' | 'error' | 'engagement',
    eventData: Record<string, any>,
    userId?: string
  ): Promise<void> {
    try {
      await this.supabase
        .from('ab_test_results')
        .insert({
          test_id: testId,
          variant_id: variantId,
          user_id: userId,
          session_id: sessionId,
          event_type: eventType,
          event_data: eventData,
          timestamp: new Date().toISOString()
        })
    } catch (error) {
      console.error('[AB Testing] Error recording result:', error)
    }
  }

  /**
   * Get test results for analysis
   */
  async getTestResults(testId: string): Promise<{
    variants: ABTestVariant[]
    results: ABTestResult[]
    summary: {
      total_assignments: number
      conversion_rate_by_variant: Record<string, number>
      error_rate_by_variant: Record<string, number>
    }
  }> {
    try {
      const [variants, results, assignments] = await Promise.all([
        this.getTestVariants(testId),
        this.supabase
          .from('ab_test_results')
          .select('*')
          .eq('test_id', testId),
        this.supabase
          .from('ab_test_assignments')
          .select('variant_id')
          .eq('test_id', testId)
      ])

      // Calculate summary statistics
      const assignmentCounts = assignments.data?.reduce((acc, assignment) => {
        acc[assignment.variant_id] = (acc[assignment.variant_id] || 0) + 1
        return acc
      }, {} as Record<string, number>) || {}

      const conversionCounts = results.data?.filter(r => r.event_type === 'conversion')
        .reduce((acc, result) => {
          acc[result.variant_id] = (acc[result.variant_id] || 0) + 1
          return acc
        }, {} as Record<string, number>) || {}

      const errorCounts = results.data?.filter(r => r.event_type === 'error')
        .reduce((acc, result) => {
          acc[result.variant_id] = (acc[result.variant_id] || 0) + 1
          return acc
        }, {} as Record<string, number>) || {}

      const conversion_rate_by_variant: Record<string, number> = {}
      const error_rate_by_variant: Record<string, number> = {}

      for (const variant of variants || []) {
        const assignments = assignmentCounts[variant.id] || 0
        const conversions = conversionCounts[variant.id] || 0
        const errors = errorCounts[variant.id] || 0

        conversion_rate_by_variant[variant.id] = assignments > 0 ? conversions / assignments : 0
        error_rate_by_variant[variant.id] = assignments > 0 ? errors / assignments : 0
      }

      return {
        variants: variants || [],
        results: results.data || [],
        summary: {
          total_assignments: Object.values(assignmentCounts as Record<string, number>).reduce((a: number, b: number) => a + b, 0),
          conversion_rate_by_variant,
          error_rate_by_variant
        }
      }
    } catch (error) {
      console.error('[AB Testing] Error getting test results:', error)
      return {
        variants: [],
        results: [],
        summary: {
          total_assignments: 0,
          conversion_rate_by_variant: {},
          error_rate_by_variant: {}
        }
      }
    }
  }
}

// Export singleton instance
export const abTestingService = new ABTestingService()

// React hooks for A/B testing
export function useABTest(testName: string) {
  const sessionId = getSessionId()
  
  return useQuery({
    queryKey: ['ab-test', testName, sessionId],
    queryFn: async () => {
      const activeTests = await abTestingService.getActiveTests()
      const test = activeTests.find(t => t.name === testName)
      
      if (!test) {
        return { assignment: null, variant: null }
      }

      const assignment = await abTestingService.assignToVariant(test.id, sessionId)
      let variant = null
      
      if (assignment) {
        const variants = await abTestingService.getTestVariants(test.id)
        variant = variants.find(v => v.id === assignment.variant_id)
      }

      return { assignment, variant }
    },
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
  })
}

export function useComponentMappingsWithAB(industry?: string) {
  const sessionId = getSessionId()
  
  return useQuery({
    queryKey: ['component-mappings-ab', industry, sessionId],
    queryFn: () => abTestingService.getComponentMappingsForUser(sessionId, industry),
    staleTime: 1000 * 60 * 30, // 30 minutes
  })
}

// Helper function to get/create session ID
function getSessionId(): string {
  if (typeof window === 'undefined') return 'server'
  
  let sessionId = sessionStorage.getItem('ab-session-id')
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('ab-session-id', sessionId)
  }
  return sessionId
}