/**
 * Feature Flag Service
 *
 * Manages feature flags for kill switches and targeted releases.
 * Includes in-memory caching with TTL for performance.
 *
 * Usage:
 *   const isEnabled = await featureFlagService.isEnabled('new_feature', userId, userPlan)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { ServerLoggingService } from '../serverLoggingService'

export interface FeatureFlag {
  id: string
  name: string
  description: string | null
  status: 'on' | 'off'
  targetUserIds: string[]
  targetPlans: string[]
  isKillSwitch: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface FeatureFlagAudit {
  id: string
  flagId: string
  flagName: string
  action: 'created' | 'updated' | 'toggled' | 'deleted'
  oldValue: Record<string, any> | null
  newValue: Record<string, any> | null
  reason: string
  changedBy: string | null
  changedByEmail: string | null
  changedAt: string
}

export interface CreateFlagInput {
  name: string
  description?: string | undefined
  status?: 'on' | 'off' | undefined
  targetUserIds?: string[] | undefined
  targetPlans?: string[] | undefined
  isKillSwitch?: boolean | undefined
}

export interface UpdateFlagInput {
  description?: string | undefined
  status?: 'on' | 'off' | undefined
  targetUserIds?: string[] | undefined
  targetPlans?: string[] | undefined
  isKillSwitch?: boolean | undefined
}

// Cache configuration
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const cache = new Map<string, { flag: FeatureFlag | null; expiresAt: number }>()

export class FeatureFlagService {
  private logger = ServerLoggingService.getInstance()

  constructor(private supabase: SupabaseClient) {}

  /**
   * Check if a feature is enabled for a user
   *
   * Logic:
   * 1. Flag 'off' → false
   * 2. Flag 'on' + no targeting → true (enabled for all)
   * 3. Flag 'on' + targeting → user matches target_user_ids OR target_plans
   */
  async isEnabled(flagName: string, userId?: string, userPlan?: string): Promise<boolean> {
    try {
      const flag = await this.getFlagByName(flagName)

      if (!flag) {
        // Flag doesn't exist - default to disabled
        return false
      }

      if (flag.status === 'off') {
        return false
      }

      // Status is 'on'
      const hasUserTargeting = flag.targetUserIds.length > 0
      const hasPlanTargeting = flag.targetPlans.length > 0

      // No targeting = enabled for everyone
      if (!hasUserTargeting && !hasPlanTargeting) {
        return true
      }

      // Check if user matches targeting (OR logic)
      const userMatch = userId && hasUserTargeting && flag.targetUserIds.includes(userId)
      const planMatch = userPlan && hasPlanTargeting && flag.targetPlans.includes(userPlan)

      return userMatch || planMatch || false
    } catch (error) {
      this.logger.error('Failed to check feature flag', { flagName, userId, error })
      // Default to disabled on error
      return false
    }
  }

  /**
   * Get flag by name (with caching)
   */
  async getFlagByName(name: string): Promise<FeatureFlag | null> {
    // Check cache first
    const cached = cache.get(name)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.flag
    }

    // Fetch from database
    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('name', name)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found - cache null to avoid repeated queries
        cache.set(name, { flag: null, expiresAt: Date.now() + CACHE_TTL_MS })
        return null
      }
      throw error
    }

    const flag = this.mapToFeatureFlag(data)
    cache.set(name, { flag, expiresAt: Date.now() + CACHE_TTL_MS })
    return flag
  }

  /**
   * Get flag by ID
   */
  async getFlagById(id: string): Promise<FeatureFlag | null> {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw error
    }

    return this.mapToFeatureFlag(data)
  }

  /**
   * List all flags
   */
  async listFlags(): Promise<FeatureFlag[]> {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .select('*')
      .order('is_kill_switch', { ascending: false })
      .order('name', { ascending: true })

    if (error) throw error

    return (data || []).map(this.mapToFeatureFlag)
  }

  /**
   * Create a new flag
   */
  async createFlag(
    input: CreateFlagInput,
    adminId: string,
    adminEmail: string,
    reason: string
  ): Promise<FeatureFlag> {
    const { data, error } = await this.supabase
      .from('feature_flags')
      .insert({
        name: input.name,
        description: input.description || null,
        status: input.status || 'off',
        target_user_ids: input.targetUserIds || [],
        target_plans: input.targetPlans || [],
        is_kill_switch: input.isKillSwitch || false,
        created_by: adminId,
      })
      .select()
      .single()

    if (error) throw error

    const flag = this.mapToFeatureFlag(data)

    // Audit log
    await this.logAudit(flag.id, flag.name, 'created', null, data, reason, adminId, adminEmail)

    // Invalidate cache
    this.invalidateCache(flag.name)

    this.logger.info('Feature flag created', { flagName: flag.name, adminId })
    return flag
  }

  /**
   * Update a flag
   */
  async updateFlag(
    id: string,
    input: UpdateFlagInput,
    adminId: string,
    adminEmail: string,
    reason: string
  ): Promise<FeatureFlag> {
    // Get current value for audit
    const { data: oldData, error: fetchError } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    const updateData: Record<string, any> = {}
    if (input.description !== undefined) updateData.description = input.description
    if (input.status !== undefined) updateData.status = input.status
    if (input.targetUserIds !== undefined) updateData.target_user_ids = input.targetUserIds
    if (input.targetPlans !== undefined) updateData.target_plans = input.targetPlans
    if (input.isKillSwitch !== undefined) updateData.is_kill_switch = input.isKillSwitch

    const { data, error } = await this.supabase
      .from('feature_flags')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const flag = this.mapToFeatureFlag(data)

    // Audit log
    await this.logAudit(flag.id, flag.name, 'updated', oldData, data, reason, adminId, adminEmail)

    // Invalidate cache
    this.invalidateCache(oldData.name)
    this.invalidateCache(flag.name)

    this.logger.info('Feature flag updated', { flagName: flag.name, adminId })
    return flag
  }

  /**
   * Toggle a flag on/off
   */
  async toggleFlag(
    id: string,
    adminId: string,
    adminEmail: string,
    reason: string
  ): Promise<FeatureFlag> {
    // Get current value
    const { data: oldData, error: fetchError } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    const newStatus = oldData.status === 'on' ? 'off' : 'on'

    const { data, error } = await this.supabase
      .from('feature_flags')
      .update({ status: newStatus })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    const flag = this.mapToFeatureFlag(data)

    // Audit log
    await this.logAudit(flag.id, flag.name, 'toggled', oldData, data, reason, adminId, adminEmail)

    // Invalidate cache immediately
    this.invalidateCache(flag.name)

    this.logger.info('Feature flag toggled', { flagName: flag.name, newStatus, adminId })
    return flag
  }

  /**
   * Delete a flag
   */
  async deleteFlag(id: string, adminId: string, adminEmail: string, reason: string): Promise<void> {
    // Get current value for audit
    const { data: oldData, error: fetchError } = await this.supabase
      .from('feature_flags')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError) throw fetchError

    // Audit log first (before deletion)
    await this.logAudit(id, oldData.name, 'deleted', oldData, null, reason, adminId, adminEmail)

    const { error } = await this.supabase.from('feature_flags').delete().eq('id', id)

    if (error) throw error

    // Invalidate cache
    this.invalidateCache(oldData.name)

    this.logger.info('Feature flag deleted', { flagName: oldData.name, adminId })
  }

  /**
   * Get audit log for a flag
   */
  async getAuditLog(flagId: string, limit: number = 50): Promise<FeatureFlagAudit[]> {
    const { data, error } = await this.supabase
      .from('feature_flag_audit')
      .select('*')
      .eq('flag_id', flagId)
      .order('changed_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return (data || []).map((row) => ({
      id: row.id,
      flagId: row.flag_id,
      flagName: row.flag_name,
      action: row.action,
      oldValue: row.old_value,
      newValue: row.new_value,
      reason: row.reason,
      changedBy: row.changed_by,
      changedByEmail: row.changed_by_email,
      changedAt: row.changed_at,
    }))
  }

  /**
   * Get all audit logs (recent)
   */
  async getRecentAuditLogs(limit: number = 100): Promise<FeatureFlagAudit[]> {
    const { data, error } = await this.supabase
      .from('feature_flag_audit')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(limit)

    if (error) throw error

    return (data || []).map((row) => ({
      id: row.id,
      flagId: row.flag_id,
      flagName: row.flag_name,
      action: row.action,
      oldValue: row.old_value,
      newValue: row.new_value,
      reason: row.reason,
      changedBy: row.changed_by,
      changedByEmail: row.changed_by_email,
      changedAt: row.changed_at,
    }))
  }

  /**
   * Invalidate cache for a flag
   */
  invalidateCache(flagName: string): void {
    cache.delete(flagName)
  }

  /**
   * Clear entire cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    cache.clear()
  }

  /**
   * Log audit entry
   */
  private async logAudit(
    flagId: string,
    flagName: string,
    action: 'created' | 'updated' | 'toggled' | 'deleted',
    oldValue: Record<string, any> | null,
    newValue: Record<string, any> | null,
    reason: string,
    changedBy: string,
    changedByEmail: string
  ): Promise<void> {
    const { error } = await this.supabase.from('feature_flag_audit').insert({
      flag_id: flagId,
      flag_name: flagName,
      action,
      old_value: oldValue,
      new_value: newValue,
      reason,
      changed_by: changedBy,
      changed_by_email: changedByEmail,
    })

    if (error) {
      this.logger.error('Failed to log feature flag audit', { flagId, action, error })
    }
  }

  /**
   * Map database row to FeatureFlag
   */
  private mapToFeatureFlag(row: any): FeatureFlag {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      status: row.status,
      targetUserIds: row.target_user_ids || [],
      targetPlans: row.target_plans || [],
      isKillSwitch: row.is_kill_switch,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }
}

// ============================================================================
// Singleton instance for easy access
// ============================================================================

let serviceInstance: FeatureFlagService | null = null

/**
 * Get or create the FeatureFlagService singleton
 */
export function getFeatureFlagService(supabase: SupabaseClient): FeatureFlagService {
  if (!serviceInstance) {
    serviceInstance = new FeatureFlagService(supabase)
  }
  return serviceInstance
}

/**
 * Quick helper to check if a feature is enabled
 * This is the main function to use throughout the codebase
 */
export async function isFeatureEnabled(
  supabase: SupabaseClient,
  flagName: string,
  userId?: string,
  userPlan?: string
): Promise<boolean> {
  const service = getFeatureFlagService(supabase)
  return service.isEnabled(flagName, userId, userPlan)
}
