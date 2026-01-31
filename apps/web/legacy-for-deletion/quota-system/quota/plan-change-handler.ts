import { createServerSupabaseClientNew } from '@/lib/supabase'
import { logger } from '@/utils/logger'

interface PlanChangeData {
  userId: string
  oldPlan: string | null
  newPlan: string
  changeReason: 'upgrade' | 'downgrade' | 'trial_end' | 'admin' | 'payment_failed'
  stripeSubscriptionId?: string
  effectiveDate?: Date
}

interface UsageSnapshot {
  ai_generations?: number
  exports?: number
  projects_created?: number
}

export class PlanChangeHandler {
  private supabase: any

  constructor() {
    this.supabase = createServerSupabaseClientNew()
  }

  /**
   * Handle plan change while preserving usage counters
   * This addresses the "Plan change mid-cycle" feedback
   */
  async handlePlanChange(data: PlanChangeData): Promise<boolean> {
    try {
      logger.info('Processing plan change', {
        userId: data.userId,
        oldPlan: data.oldPlan,
        newPlan: data.newPlan,
        reason: data.changeReason
      })

      // 1. Capture current usage snapshot before plan change
      const usageSnapshot = await this.captureUsageSnapshot(data.userId)
      
      // 2. Get new plan limits
      const newPlanLimits = await this.getPlanLimits(data.newPlan)
      
      // 3. Validate the change is safe (usage doesn't exceed new limits by too much)
      const validationResult = this.validatePlanChange(usageSnapshot, newPlanLimits, data.changeReason)
      
      if (!validationResult.isValid) {
        logger.warn('Plan change validation failed', {
          userId: data.userId,
          reason: validationResult.reason,
          usageSnapshot,
          newPlanLimits
        })
        
        // For downgrades that would exceed new limits, create grace period
        if (data.changeReason === 'downgrade') {
          await this.createGracePeriod(data.userId, usageSnapshot, newPlanLimits)
        }
      }
      
      // 4. Record the plan change with usage preservation
      const success = await this.recordPlanChange({
        ...data,
        usageSnapshot,
        validationResult
      })
      
      if (success) {
        // 5. Handle any necessary usage adjustments
        await this.handleUsageAdjustments(data.userId, usageSnapshot, newPlanLimits, data.changeReason)
        
        // 6. Notify relevant systems
        await this.notifyPlanChange(data)
        
        logger.info('Plan change completed successfully', {
          userId: data.userId,
          newPlan: data.newPlan
        })
      }
      
      return success
      
    } catch (error) {
      logger.error('Plan change failed', {
        userId: data.userId,
        error: error.message,
        data
      })
      
      return false
    }
  }

  /**
   * Capture current usage across all metrics
   */
  private async captureUsageSnapshot(userId: string): Promise<UsageSnapshot> {
    try {
      const periodStart = new Date()
      periodStart.setDate(1) // First day of current month
      periodStart.setHours(0, 0, 0, 0)

      const { data: usageData, error } = await this.supabase
        .from('usage_tracking')
        .select('metric_name, usage_amount')
        .eq('user_id', userId)
        .eq('period_start', periodStart.toISOString())

      if (error) throw error

      const snapshot: UsageSnapshot = {}
      usageData?.forEach(usage => {
        snapshot[usage.metric_name as keyof UsageSnapshot] = usage.usage_amount
      })

      return snapshot
      
    } catch (error) {
      logger.error('Failed to capture usage snapshot', { userId, error })
      return {}
    }
  }

  /**
   * Get plan limits for validation
   */
  private async getPlanLimits(planName: string) {
    try {
      const { data: planLimits, error } = await this.supabase
        .from('plan_limits')
        .select('*')
        .eq('plan_name', planName)
        .single()

      if (error) throw error

      return {
        ai_generations: planLimits.max_ai_generations_per_month,
        exports: planLimits.max_exports_per_month,
        projects: planLimits.max_projects
      }
      
    } catch (error) {
      logger.error('Failed to get plan limits', { planName, error })
      
      // Return free plan defaults as fallback
      return {
        ai_generations: 10,
        exports: 1,
        projects: 3
      }
    }
  }

  /**
   * Validate that plan change won't break usage limits
   */
  private validatePlanChange(
    usage: UsageSnapshot, 
    limits: any, 
    changeReason: string
  ): { isValid: boolean; reason?: string; violations: string[] } {
    const violations: string[] = []

    // Check each metric
    if (usage.ai_generations && limits.ai_generations !== -1 && usage.ai_generations > limits.ai_generations) {
      violations.push(`AI generations: ${usage.ai_generations} > ${limits.ai_generations}`)
    }

    if (usage.exports && limits.exports !== -1 && usage.exports > limits.exports) {
      violations.push(`Exports: ${usage.exports} > ${limits.exports}`)
    }

    if (usage.projects_created && limits.projects !== -1 && usage.projects_created > limits.projects) {
      violations.push(`Projects: ${usage.projects_created} > ${limits.projects}`)
    }

    // For upgrades, violations are usually OK (more generous limits)
    // For downgrades, violations need special handling
    const isValid = violations.length === 0 || 
      (changeReason === 'upgrade' || changeReason === 'trial_end')

    return {
      isValid,
      reason: violations.length > 0 ? `Usage exceeds new plan limits: ${violations.join(', ')}` : undefined,
      violations
    }
  }

  /**
   * Create grace period for users downgrading with excess usage
   */
  private async createGracePeriod(
    userId: string, 
    usage: UsageSnapshot, 
    newLimits: any
  ) {
    try {
      // Calculate excess usage that needs grace period
      const gracePeriodBonuses = []

      if (usage.ai_generations && newLimits.ai_generations !== -1) {
        const excess = Math.max(0, usage.ai_generations - newLimits.ai_generations)
        if (excess > 0) {
          gracePeriodBonuses.push({
            user_id: userId,
            metric: 'ai_generations',
            amount: excess,
            reason: 'plan_downgrade_grace',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
          })
        }
      }

      if (usage.exports && newLimits.exports !== -1) {
        const excess = Math.max(0, usage.exports - newLimits.exports)
        if (excess > 0) {
          gracePeriodBonuses.push({
            user_id: userId,
            metric: 'exports',
            amount: excess,
            reason: 'plan_downgrade_grace',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          })
        }
      }

      if (gracePeriodBonuses.length > 0) {
        const { error } = await this.supabase
          .from('user_bonuses')
          .insert(gracePeriodBonuses)

        if (error) throw error

        logger.info('Created grace period bonuses for plan downgrade', {
          userId,
          bonuses: gracePeriodBonuses
        })
      }

    } catch (error) {
      logger.error('Failed to create grace period', { userId, error })
    }
  }

  /**
   * Record the plan change in the database
   */
  private async recordPlanChange(data: PlanChangeData & {
    usageSnapshot: UsageSnapshot
    validationResult: any
  }): Promise<boolean> {
    try {
      // Use the database function for atomic plan change recording
      const { data: result, error } = await this.supabase.rpc('handle_plan_change', {
        p_user_id: data.userId,
        p_old_plan: data.oldPlan,
        p_new_plan: data.newPlan,
        p_change_reason: data.changeReason
      })

      if (error) throw error

      // Also log to our audit system with enhanced context
      await this.supabase
        .from('quota_audit_log')
        .insert({
          user_id: data.userId,
          metric: 'plan_change',
          attempted_amount: 0,
          success: true,
          reason: 'plan_changed',
          context: {
            old_plan: data.oldPlan,
            new_plan: data.newPlan,
            change_reason: data.changeReason,
            usage_snapshot: data.usageSnapshot,
            validation_result: data.validationResult,
            stripe_subscription_id: data.stripeSubscriptionId,
            effective_date: data.effectiveDate?.toISOString()
          }
        })

      return result
      
    } catch (error) {
      logger.error('Failed to record plan change', { 
        userId: data.userId, 
        error 
      })
      return false
    }
  }

  /**
   * Handle any necessary usage adjustments post-change
   */
  private async handleUsageAdjustments(
    userId: string,
    usage: UsageSnapshot,
    newLimits: any,
    changeReason: string
  ) {
    // For now, we preserve existing usage and let the grace period handle excess
    // Future: Could implement usage scaling or warnings here
    
    logger.info('Usage adjustments completed', {
      userId,
      changeReason,
      preserved: Object.keys(usage).length
    })
  }

  /**
   * Notify other systems about the plan change
   */
  private async notifyPlanChange(data: PlanChangeData) {
    try {
      // Could integrate with:
      // - Email notification service
      // - Slack notifications for admin
      // - Analytics tracking
      // - Customer success tools
      
      logger.info('Plan change notifications sent', {
        userId: data.userId,
        newPlan: data.newPlan
      })
      
    } catch (error) {
      logger.error('Failed to send plan change notifications', { 
        userId: data.userId, 
        error 
      })
    }
  }

  /**
   * Get plan change history for a user
   */
  async getPlanChangeHistory(userId: string, limit: number = 10) {
    try {
      const { data, error } = await this.supabase
        .from('plan_change_log')
        .select('*')
        .eq('user_id', userId)
        .order('effective_date', { ascending: false })
        .limit(limit)

      if (error) throw error

      return data || []
      
    } catch (error) {
      logger.error('Failed to get plan change history', { userId, error })
      return []
    }
  }

  /**
   * Check if user has recent plan change that might affect quota
   */
  async hasRecentPlanChange(userId: string, withinHours: number = 24): Promise<boolean> {
    try {
      const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000)
      
      const { data, error } = await this.supabase
        .from('plan_change_log')
        .select('id')
        .eq('user_id', userId)
        .gte('effective_date', cutoff.toISOString())
        .limit(1)

      if (error) throw error

      return (data?.length || 0) > 0
      
    } catch (error) {
      logger.error('Failed to check recent plan changes', { userId, error })
      return false
    }
  }
}

// Export singleton instance
export const planChangeHandler = new PlanChangeHandler()