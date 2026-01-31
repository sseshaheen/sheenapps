import 'server-only'
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

/**
 * Test Allocation Service
 * Handles user assignment to test groups, traffic splitting, and rollout management
 */

export interface UserContext {
  userId?: string
  sessionId: string
  ipAddress?: string
  userAgent?: string
  location?: {
    country: string
    region: string
    city?: string
  }
  userSegment?: string
}

export interface AllocationResult {
  testId: string
  testGroup: string
  catalogId: string
  allocatedAt: Date
  reason: string
}

export interface TestAllocation {
  test_id: string
  user_id?: string
  session_id: string
  test_group: string
  allocated_catalog_id: string
  allocated_at: Date
  ip_address?: string
  user_agent?: string
  allocation_reason: string
}

export class TestAllocationService {
  
  /**
   * Determine which test group a user should be allocated to
   */
  static async allocateUserToTest(
    testId: string,
    userContext: UserContext
  ): Promise<AllocationResult | null> {
    
    const supabase = await createServerSupabaseClientNew()
    
    // Get test configuration
    const { data: test, error } = await supabase
      .from('pricing_tests')
      .select('*')
      .eq('id', testId)
      .eq('status', 'running')
      .single()
    
    if (error || !test) {
      return null // Test not found or not running
    }
    
    // Check if user already has an allocation for this test
    const existingAllocation = await this.getExistingAllocation(testId, userContext)
    if (existingAllocation) {
      return {
        testId: existingAllocation.test_id,
        testGroup: existingAllocation.test_group,
        catalogId: existingAllocation.allocated_catalog_id,
        allocatedAt: new Date(existingAllocation.allocated_at),
        reason: 'existing_allocation'
      }
    }
    
    // Allocate based on test type
    let allocation: AllocationResult | null = null
    
    switch (test.test_type) {
      case 'ab_test':
        allocation = await this.allocateABTest(test, userContext)
        break
      case 'gradual_rollout':
        allocation = await this.allocateGradualRollout(test, userContext)
        break
      case 'geographic':
        allocation = await this.allocateGeographic(test, userContext)
        break
      case 'segment':
        allocation = await this.allocateSegment(test, userContext)
        break
      default:
        return null
    }
    
    if (allocation) {
      // Store allocation in database
      await this.recordAllocation(allocation, userContext)
    }
    
    return allocation
  }
  
  /**
   * A/B Test allocation using deterministic hash-based assignment
   */
  private static async allocateABTest(
    test: any,
    userContext: UserContext
  ): Promise<AllocationResult | null> {
    
    const config = test.test_config.ab_split
    if (!config) return null
    
    // Use consistent hash for deterministic assignment
    const hashInput = `${test.id}-${userContext.userId || userContext.sessionId}`
    const hash = this.simpleHash(hashInput)
    const percentage = hash % 100
    
    let testGroup: string
    let catalogId: string
    
    if (percentage < config.control_percentage) {
      testGroup = 'control'
      catalogId = test.source_catalog_id
    } else {
      testGroup = 'variant_a'
      catalogId = test.test_catalog_id
    }
    
    return {
      testId: test.id,
      testGroup,
      catalogId,
      allocatedAt: new Date(),
      reason: 'ab_hash_assignment'
    }
  }
  
  /**
   * Gradual rollout allocation based on current stage
   */
  private static async allocateGradualRollout(
    test: any,
    userContext: UserContext
  ): Promise<AllocationResult | null> {
    
    const supabase = await createServerSupabaseClientNew()
    
    // Get current active rollout stage
    const { data: activeStage } = await supabase
      .from('pricing_test_rollout_progress')
      .select('*')
      .eq('test_id', test.id)
      .eq('status', 'active')
      .single()
    
    if (!activeStage) {
      // No active stage, assign to control
      return {
        testId: test.id,
        testGroup: 'control',
        catalogId: test.source_catalog_id,
        allocatedAt: new Date(),
        reason: 'no_active_rollout_stage'
      }
    }
    
    // Hash-based allocation within current stage percentage
    const hashInput = `${test.id}-${userContext.userId || userContext.sessionId}`
    const hash = this.simpleHash(hashInput)
    const percentage = hash % 100
    
    if (percentage < activeStage.target_percentage) {
      return {
        testId: test.id,
        testGroup: `rollout_${activeStage.target_percentage}`,
        catalogId: test.test_catalog_id,
        allocatedAt: new Date(),
        reason: `rollout_stage_${activeStage.stage_name}`
      }
    } else {
      return {
        testId: test.id,
        testGroup: 'control',
        catalogId: test.source_catalog_id,
        allocatedAt: new Date(),
        reason: 'rollout_control_group'
      }
    }
  }
  
  /**
   * Geographic-based allocation
   */
  private static async allocateGeographic(
    test: any,
    userContext: UserContext
  ): Promise<AllocationResult | null> {
    
    const config = test.test_config.geographic_rules
    if (!config || !userContext.location) {
      // Default to control if no location data
      return {
        testId: test.id,
        testGroup: 'control',
        catalogId: test.source_catalog_id,
        allocatedAt: new Date(),
        reason: 'no_location_data'
      }
    }
    
    // Find matching geographic rule
    for (const rule of config) {
      if (rule.regions.includes(userContext.location.country) || 
          rule.regions.includes(userContext.location.region)) {
        
        // Hash-based allocation within region percentage
        const hashInput = `${test.id}-${userContext.userId || userContext.sessionId}`
        const hash = this.simpleHash(hashInput)
        const percentage = hash % 100
        
        if (percentage < rule.percentage_per_region) {
          return {
            testId: test.id,
            testGroup: `geo_${userContext.location.country.toLowerCase()}`,
            catalogId: test.test_catalog_id,
            allocatedAt: new Date(),
            reason: `geographic_${userContext.location.country}`
          }
        }
      }
    }
    
    // Not in test regions or not selected for test
    return {
      testId: test.id,
      testGroup: 'control',
      catalogId: test.source_catalog_id,
      allocatedAt: new Date(),
      reason: 'geographic_control'
    }
  }
  
  /**
   * Segment-based allocation
   */
  private static async allocateSegment(
    test: any,
    userContext: UserContext
  ): Promise<AllocationResult | null> {
    
    const config = test.test_config.segment_rules
    if (!config || !userContext.userSegment) {
      return {
        testId: test.id,
        testGroup: 'control',
        catalogId: test.source_catalog_id,
        allocatedAt: new Date(),
        reason: 'no_segment_data'
      }
    }
    
    // Check if user segment is included in test
    if (config.user_segments.includes(userContext.userSegment)) {
      const allocationPercentage = config.allocation[userContext.userSegment] || 0
      
      const hashInput = `${test.id}-${userContext.userId || userContext.sessionId}`
      const hash = this.simpleHash(hashInput)
      const percentage = hash % 100
      
      if (percentage < allocationPercentage) {
        return {
          testId: test.id,
          testGroup: `segment_${userContext.userSegment}`,
          catalogId: test.test_catalog_id,
          allocatedAt: new Date(),
          reason: `segment_${userContext.userSegment}`
        }
      }
    }
    
    return {
      testId: test.id,
      testGroup: 'control',
      catalogId: test.source_catalog_id,
      allocatedAt: new Date(),
      reason: 'segment_control'
    }
  }
  
  /**
   * Get existing allocation for user/session
   */
  private static async getExistingAllocation(
    testId: string,
    userContext: UserContext
  ): Promise<TestAllocation | null> {
    
    const supabase = await createServerSupabaseClientNew()
    
    // First try to find by user ID if available
    if (userContext.userId) {
      const { data: allocation } = await supabase
        .from('pricing_test_allocations')
        .select('*')
        .eq('test_id', testId)
        .eq('user_id', userContext.userId)
        .single()
      
      if (allocation) return allocation
    }
    
    // Fallback to session ID
    const { data: allocation } = await supabase
      .from('pricing_test_allocations')
      .select('*')
      .eq('test_id', testId)
      .eq('session_id', userContext.sessionId)
      .single()
    
    return allocation || null
  }
  
  /**
   * Record allocation in database
   */
  private static async recordAllocation(
    allocation: AllocationResult,
    userContext: UserContext
  ): Promise<void> {
    
    const supabase = await createServerSupabaseClientNew()
    
    const allocationRecord: Partial<TestAllocation> = {
      test_id: allocation.testId,
      user_id: userContext.userId,
      session_id: userContext.sessionId,
      test_group: allocation.testGroup,
      allocated_catalog_id: allocation.catalogId,
      allocated_at: allocation.allocatedAt,
      ip_address: userContext.ipAddress,
      user_agent: userContext.userAgent,
      allocation_reason: allocation.reason
    }
    
    try {
      await supabase
        .from('pricing_test_allocations')
        .insert(allocationRecord)
    } catch (error) {
      // Log error but don't fail the request
      console.error('Failed to record test allocation:', error)
    }
  }
  
  /**
   * Get active tests for current user context
   */
  static async getActiveTestsForUser(
    userContext: UserContext
  ): Promise<AllocationResult[]> {
    
    const supabase = await createServerSupabaseClientNew()
    
    // Get all running tests
    const { data: activeTests } = await supabase
      .from('pricing_tests')
      .select('id')
      .eq('status', 'running')
    
    if (!activeTests || activeTests.length === 0) {
      return []
    }
    
    const allocations: AllocationResult[] = []
    
    // Check allocation for each active test
    for (const test of activeTests) {
      const allocation = await this.allocateUserToTest(test.id, userContext)
      if (allocation) {
        allocations.push(allocation)
      }
    }
    
    return allocations
  }
  
  /**
   * Override allocation for specific user (admin function)
   */
  static async overrideUserAllocation(
    testId: string,
    userContext: UserContext,
    forceGroup: string,
    reason: string,
    adminUserId: string
  ): Promise<AllocationResult> {
    
    const supabase = await createServerSupabaseClientNew()
    
    // Get test details
    const { data: test } = await supabase
      .from('pricing_tests')
      .select('*')
      .eq('id', testId)
      .single()
    
    if (!test) {
      throw new Error('Test not found')
    }
    
    const catalogId = forceGroup === 'control' ? test.source_catalog_id : test.test_catalog_id
    
    const allocation: AllocationResult = {
      testId,
      testGroup: forceGroup,
      catalogId,
      allocatedAt: new Date(),
      reason: `admin_override_${reason}`
    }
    
    // Delete existing allocation
    await supabase
      .from('pricing_test_allocations')
      .delete()
      .eq('test_id', testId)
      .or(`user_id.eq.${userContext.userId},session_id.eq.${userContext.sessionId}`)
    
    // Record new allocation with override flag
    await this.recordAllocation(allocation, userContext)
    
    // Log admin override
    await supabase
      .from('pricing_test_audit_logs')
      .insert({
        test_id: testId,
        action: 'allocation_overridden',
        actor_id: adminUserId,
        reason: `Admin override: ${reason}`,
        metadata: {
          user_id: userContext.userId,
          session_id: userContext.sessionId,
          forced_group: forceGroup,
          original_reason: allocation.reason
        }
      })
    
    return allocation
  }
  
  /**
   * Simple hash function for consistent user assignment
   */
  private static simpleHash(input: string): number {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }
  
  /**
   * Get allocation statistics for a test
   */
  static async getAllocationStats(testId: string): Promise<{
    total_allocations: number
    group_distribution: Record<string, number>
    allocation_rate_by_hour: Array<{ hour: string; count: number }>
  }> {
    
    const supabase = await createServerSupabaseClientNew()
    
    const { data: allocations } = await supabase
      .from('pricing_test_allocations')
      .select('test_group, allocated_at')
      .eq('test_id', testId)
    
    if (!allocations || allocations.length === 0) {
      return {
        total_allocations: 0,
        group_distribution: {},
        allocation_rate_by_hour: []
      }
    }
    
    // Calculate group distribution
    const groupDistribution = allocations.reduce((acc: Record<string, number>, allocation) => {
      acc[allocation.test_group] = (acc[allocation.test_group] || 0) + 1
      return acc
    }, {})
    
    // Calculate hourly allocation rate for last 24 hours
    const hourlyStats: Record<string, number> = {}
    const now = new Date()
    
    allocations.forEach(allocation => {
      const allocatedAt = new Date(allocation.allocated_at)
      const hourKey = allocatedAt.toISOString().substring(0, 13) // YYYY-MM-DDTHH
      hourlyStats[hourKey] = (hourlyStats[hourKey] || 0) + 1
    })
    
    const allocationRateByHour = Object.entries(hourlyStats)
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour))
    
    return {
      total_allocations: allocations.length,
      group_distribution: groupDistribution,
      allocation_rate_by_hour: allocationRateByHour
    }
  }
}

// Additional table needed for allocation tracking
export const ALLOCATION_TABLE_SCHEMA = `
CREATE TABLE IF NOT EXISTS pricing_test_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES pricing_tests(id) ON DELETE CASCADE,
  user_id UUID,
  session_id TEXT NOT NULL,
  test_group VARCHAR(100) NOT NULL,
  allocated_catalog_id UUID NOT NULL,
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT,
  allocation_reason VARCHAR(255),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  UNIQUE(test_id, user_id) WHERE user_id IS NOT NULL,
  UNIQUE(test_id, session_id)
);

CREATE INDEX idx_test_allocations_test_id ON pricing_test_allocations(test_id);
CREATE INDEX idx_test_allocations_user_id ON pricing_test_allocations(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_test_allocations_session_id ON pricing_test_allocations(session_id);
CREATE INDEX idx_test_allocations_allocated_at ON pricing_test_allocations(allocated_at);
`