/**
 * Customer Health Service
 *
 * Implements transparent, heuristic-based customer health scoring.
 * Formula: 100-point scale (+ 5 bonus max)
 *
 * Signals:
 *   - Usage Recency (0-30): Last active timing
 *   - Activation (0-20): First successful build completed
 *   - Build Health (0-20): Build success rate last 30d
 *   - Billing Risk (0-20): Payment failures last 90d
 *   - Support Load (0-10): Open support tickets
 *   - Recent Success (+5 bonus): Successful build in last 7d
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { ServerLoggingService } from '../serverLoggingService'

export type HealthStatus = 'healthy' | 'monitor' | 'at_risk' | 'critical' | 'onboarding'

export interface HealthScoreBreakdown {
  score: number
  status: HealthStatus
  usageRecencyScore: number
  activationScore: number
  buildHealthScore: number
  billingRiskScore: number
  supportLoadScore: number
  recentSuccessBonus: number
  reasons: string[]
  trend: 'up' | 'down' | 'stable'
  score7dAgo: number | null
  score30dAgo: number | null
  accountAgeDays: number
  accountCreatedAt: string
  calculatedAt: string
}

export interface CustomerHealthSummary {
  healthy: number
  monitor: number
  atRisk: number
  critical: number
  onboarding: number
  total: number
}

export interface AtRiskCustomer {
  userId: string
  email: string
  score: number
  status: HealthStatus
  trend: 'up' | 'down' | 'stable'
  topReason: string
  subscriptionPlan?: string | undefined
  renewalDate?: string | undefined
  daysUntilRenewal?: number | undefined
  tags: string[]
}

export interface ScoreChange {
  userId: string
  email: string
  previousScore: number
  currentScore: number
  change: number
  topReason: string
  changedAt: string
}

export class CustomerHealthService {
  private logger = ServerLoggingService.getInstance()

  constructor(private supabase: SupabaseClient) {}

  /**
   * Calculate health score for a single user
   */
  async calculateHealthScore(userId: string): Promise<HealthScoreBreakdown | null> {
    try {
      // Get user info
      const { data: user, error: userError } = await this.supabase
        .from('auth.users')
        .select('id, email, created_at, last_sign_in_at')
        .eq('id', userId)
        .single()

      if (userError || !user) {
        // Try alternative query through billing_customers
        const { data: customer, error: customerError } = await this.supabase
          .from('billing_customers')
          .select('user_id, email, created_at')
          .eq('user_id', userId)
          .single()

        if (customerError || !customer) {
          this.logger.warn('User not found for health score calculation', { userId })
          return null
        }

        // Get last sign in from auth.users using raw query
        const { data: authUser } = await this.supabase.rpc('get_user_last_sign_in', { p_user_id: userId })

        const accountCreatedAt = customer.created_at
        const lastSignIn = authUser?.last_sign_in_at || null

        return this.calculateScoreFromData(userId, customer.email, accountCreatedAt, lastSignIn)
      }

      return this.calculateScoreFromData(userId, user.email, user.created_at, user.last_sign_in_at)
    } catch (error) {
      this.logger.error('Failed to calculate health score', { userId, error })
      throw error
    }
  }

  /**
   * Core score calculation logic
   */
  private async calculateScoreFromData(
    userId: string,
    email: string,
    accountCreatedAt: string,
    lastSignIn: string | null
  ): Promise<HealthScoreBreakdown> {
    const now = new Date()
    const accountAge = Math.floor((now.getTime() - new Date(accountCreatedAt).getTime()) / (24 * 60 * 60 * 1000))
    const reasons: string[] = []

    // Check if onboarding (< 14 days old)
    if (accountAge < 14) {
      return {
        score: 0,
        status: 'onboarding',
        usageRecencyScore: 0,
        activationScore: 0,
        buildHealthScore: 0,
        billingRiskScore: 0,
        supportLoadScore: 0,
        recentSuccessBonus: 0,
        reasons: ['New account - onboarding period'],
        trend: 'stable',
        score7dAgo: null,
        score30dAgo: null,
        accountAgeDays: accountAge,
        accountCreatedAt,
        calculatedAt: now.toISOString(),
      }
    }

    // 1. Usage Recency (0-30 points)
    const usageRecencyScore = await this.calculateUsageRecencyScore(userId, lastSignIn)
    if (usageRecencyScore === 30) reasons.push('Active today')
    else if (usageRecencyScore === 0) reasons.push('Inactive for 60+ days')
    else if (usageRecencyScore <= 10) reasons.push('Low recent activity')

    // 2. Activation (0-20 points)
    const activationScore = await this.calculateActivationScore(userId)
    if (activationScore === 0) reasons.push('No successful build yet')

    // 3. Build Health (0-20 points)
    const { score: buildHealthScore, successRate } = await this.calculateBuildHealthScore(userId)
    if (buildHealthScore < 10 && successRate !== null) {
      reasons.push(`Build success rate: ${Math.round(successRate)}%`)
    }

    // 4. Billing Risk (0-20 points)
    const { score: billingRiskScore, failures } = await this.calculateBillingRiskScore(userId)
    if (failures > 0) {
      reasons.push(`${failures} payment failure${failures > 1 ? 's' : ''} in 90 days`)
    }

    // 5. Support Load (0-10 points)
    const { score: supportLoadScore, openTickets } = await this.calculateSupportLoadScore(userId)
    if (openTickets > 0) {
      reasons.push(`${openTickets} open support ticket${openTickets > 1 ? 's' : ''}`)
    }

    // 6. Recent Success Bonus (+5 points)
    const recentSuccessBonus = await this.calculateRecentSuccessBonus(userId)
    if (recentSuccessBonus > 0) reasons.push('Recent successful build')

    // Calculate total score
    const score =
      usageRecencyScore +
      activationScore +
      buildHealthScore +
      billingRiskScore +
      supportLoadScore +
      recentSuccessBonus

    // Determine status
    const status = this.getStatus(score)

    // Get trend data
    const { score7dAgo, score30dAgo, trend } = await this.getTrendData(userId, score)

    // Add trend reason
    if (trend === 'down' && score7dAgo && score - score7dAgo <= -10) {
      reasons.unshift(`Score dropped ${score7dAgo - score} points this week`)
    }

    return {
      score,
      status,
      usageRecencyScore,
      activationScore,
      buildHealthScore,
      billingRiskScore,
      supportLoadScore,
      recentSuccessBonus,
      reasons,
      trend,
      score7dAgo,
      score30dAgo,
      accountAgeDays: accountAge,
      accountCreatedAt,
      calculatedAt: now.toISOString(),
    }
  }

  /**
   * Usage Recency: 0-30 points
   * Last active: today=30, 7d=25, 14d=20, 30d=10, 60d+=0
   */
  private async calculateUsageRecencyScore(userId: string, lastSignIn: string | null): Promise<number> {
    // Also check last project activity
    const { data: lastProject } = await this.supabase
      .from('projects')
      .select('last_accessed_at, updated_at')
      .eq('owner_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()

    const lastProjectActivity = lastProject?.last_accessed_at || lastProject?.updated_at
    const lastActivity = this.getMostRecentDate(lastSignIn, lastProjectActivity)

    if (!lastActivity) return 0

    const daysSinceActive = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))

    if (daysSinceActive === 0) return 30
    if (daysSinceActive <= 7) return 25
    if (daysSinceActive <= 14) return 20
    if (daysSinceActive <= 30) return 10
    return 0
  }

  /**
   * Activation: 0-20 points
   * First build success completed: yes=20, no=0
   */
  private async calculateActivationScore(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('project_build_metrics')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['completed', 'deployed'])
      .limit(1)

    if (error || !data || data.length === 0) {
      // Also check project_build_records
      const { data: records } = await this.supabase
        .from('project_build_records')
        .select('id')
        .eq('user_id', userId)
        .in('status', ['completed', 'deployed'])
        .limit(1)

      return records && records.length > 0 ? 20 : 0
    }

    return 20
  }

  /**
   * Build Health: 0-20 points
   * Success rate last 30d: >90%=20, >70%=15, >50%=10, else=5
   */
  private async calculateBuildHealthScore(userId: string): Promise<{ score: number; successRate: number | null }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await this.supabase
      .from('project_build_metrics')
      .select('status')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)

    if (error || !data || data.length === 0) {
      // No builds in 30 days, give neutral score
      return { score: 15, successRate: null }
    }

    const total = data.length
    const successful = data.filter((b) => b.status === 'completed' || b.status === 'deployed').length
    const successRate = (successful / total) * 100

    if (successRate > 90) return { score: 20, successRate }
    if (successRate > 70) return { score: 15, successRate }
    if (successRate > 50) return { score: 10, successRate }
    return { score: 5, successRate }
  }

  /**
   * Billing Risk: 0-20 points
   * Payment failures last 90d: 0=20, 1=10, 2+=0
   */
  private async calculateBillingRiskScore(userId: string): Promise<{ score: number; failures: number }> {
    // First get customer_id from billing_customers
    const { data: customer } = await this.supabase
      .from('billing_customers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (!customer) {
      // No billing customer record, assume no risk
      return { score: 20, failures: 0 }
    }

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await this.supabase
      .from('billing_payments')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('status', 'failed')
      .gte('created_at', ninetyDaysAgo)

    if (error) {
      return { score: 15, failures: 0 } // Neutral on error
    }

    const failures = data?.length || 0

    if (failures === 0) return { score: 20, failures }
    if (failures === 1) return { score: 10, failures }
    return { score: 0, failures }
  }

  /**
   * Support Load: 0-10 points
   * Open tickets: 0=10, 1=7, 2=4, 3+=0
   */
  private async calculateSupportLoadScore(userId: string): Promise<{ score: number; openTickets: number }> {
    const { data, error } = await this.supabase
      .from('support_tickets')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['open', 'in_progress', 'waiting_third_party'])

    if (error) {
      return { score: 7, openTickets: 0 } // Neutral on error
    }

    const openTickets = data?.length || 0

    if (openTickets === 0) return { score: 10, openTickets }
    if (openTickets === 1) return { score: 7, openTickets }
    if (openTickets === 2) return { score: 4, openTickets }
    return { score: 0, openTickets }
  }

  /**
   * Recent Success Bonus: +5 points
   * Successful build in last 7 days
   */
  private async calculateRecentSuccessBonus(userId: string): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await this.supabase
      .from('project_build_metrics')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['completed', 'deployed'])
      .gte('completed_at', sevenDaysAgo)
      .limit(1)

    return !error && data && data.length > 0 ? 5 : 0
  }

  /**
   * Determine health status from score
   */
  private getStatus(score: number): HealthStatus {
    if (score >= 80) return 'healthy'
    if (score >= 60) return 'monitor'
    if (score >= 40) return 'at_risk'
    return 'critical'
  }

  /**
   * Get trend data from history
   */
  private async getTrendData(
    userId: string,
    currentScore: number
  ): Promise<{ score7dAgo: number | null; score30dAgo: number | null; trend: 'up' | 'down' | 'stable' }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Get 7-day ago score
    const { data: weekAgo } = await this.supabase
      .from('user_health_score_history')
      .select('score')
      .eq('user_id', userId)
      .lte('calculated_at', sevenDaysAgo)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    // Get 30-day ago score
    const { data: monthAgo } = await this.supabase
      .from('user_health_score_history')
      .select('score')
      .eq('user_id', userId)
      .lte('calculated_at', thirtyDaysAgo)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single()

    const score7dAgo = weekAgo?.score ?? null
    const score30dAgo = monthAgo?.score ?? null

    // Determine trend based on 7-day comparison
    let trend: 'up' | 'down' | 'stable' = 'stable'
    if (score7dAgo !== null) {
      const diff = currentScore - score7dAgo
      if (diff >= 5) trend = 'up'
      else if (diff <= -5) trend = 'down'
    }

    return { score7dAgo, score30dAgo, trend }
  }

  /**
   * Save health score to database
   */
  async saveHealthScore(userId: string, breakdown: HealthScoreBreakdown): Promise<void> {
    const { error } = await this.supabase.from('user_health_scores').upsert(
      {
        user_id: userId,
        score: breakdown.score,
        status: breakdown.status,
        usage_recency_score: breakdown.usageRecencyScore,
        activation_score: breakdown.activationScore,
        build_health_score: breakdown.buildHealthScore,
        billing_risk_score: breakdown.billingRiskScore,
        support_load_score: breakdown.supportLoadScore,
        recent_success_bonus: breakdown.recentSuccessBonus,
        score_reasons: breakdown.reasons,
        score_7d_ago: breakdown.score7dAgo,
        score_30d_ago: breakdown.score30dAgo,
        trend: breakdown.trend,
        account_created_at: breakdown.accountCreatedAt,
        account_age_days: breakdown.accountAgeDays,
        calculated_at: breakdown.calculatedAt,
      },
      { onConflict: 'user_id' }
    )

    if (error) {
      this.logger.error('Failed to save health score', { userId, error })
      throw error
    }

    // Also save to history for trend tracking
    await this.supabase.from('user_health_score_history').insert({
      user_id: userId,
      score: breakdown.score,
      status: breakdown.status,
      breakdown: {
        usageRecencyScore: breakdown.usageRecencyScore,
        activationScore: breakdown.activationScore,
        buildHealthScore: breakdown.buildHealthScore,
        billingRiskScore: breakdown.billingRiskScore,
        supportLoadScore: breakdown.supportLoadScore,
        recentSuccessBonus: breakdown.recentSuccessBonus,
        reasons: breakdown.reasons,
      },
      calculated_at: breakdown.calculatedAt,
    })
  }

  /**
   * Get health summary counts
   */
  async getHealthSummary(): Promise<CustomerHealthSummary> {
    const { data, error } = await this.supabase
      .from('user_health_scores')
      .select('status')

    if (error) {
      this.logger.error('Failed to get health summary', { error })
      throw error
    }

    const summary: CustomerHealthSummary = {
      healthy: 0,
      monitor: 0,
      atRisk: 0,
      critical: 0,
      onboarding: 0,
      total: 0,
    }

    for (const row of data || []) {
      summary.total++
      switch (row.status) {
        case 'healthy':
          summary.healthy++
          break
        case 'monitor':
          summary.monitor++
          break
        case 'at_risk':
          summary.atRisk++
          break
        case 'critical':
          summary.critical++
          break
        case 'onboarding':
          summary.onboarding++
          break
      }
    }

    return summary
  }

  /**
   * Get at-risk customers list
   */
  async getAtRiskCustomers(
    limit: number = 50,
    offset: number = 0,
    filters?: {
      plan?: string | undefined
      renewalDays?: number | undefined
      tag?: string | undefined
    }
  ): Promise<{ customers: AtRiskCustomer[]; total: number }> {
    let query = this.supabase
      .from('user_health_scores')
      .select(
        `
        user_id,
        score,
        status,
        trend,
        score_reasons
      `,
        { count: 'exact' }
      )
      .in('status', ['at_risk', 'critical'])
      .order('score', { ascending: true })

    const { data, error, count } = await query.range(offset, offset + limit - 1)

    if (error) {
      this.logger.error('Failed to get at-risk customers', { error })
      throw error
    }

    if (!data || data.length === 0) {
      return { customers: [], total: count || 0 }
    }

    // Batch load all related data to avoid N+1 queries
    const userIds = data.map((row) => row.user_id)

    // Batch: Get all customer records (for email and customer_id mapping)
    const { data: customers } = await this.supabase
      .from('billing_customers')
      .select('id, user_id, email')
      .in('user_id', userIds)

    const customerByUserId = new Map(customers?.map((c) => [c.user_id, c]) || [])

    // Batch: Get all tags
    const { data: allTags } = await this.supabase
      .from('user_admin_tags')
      .select('user_id, tag')
      .in('user_id', userIds)

    const tagsByUserId = new Map<string, string[]>()
    for (const t of allTags || []) {
      const existing = tagsByUserId.get(t.user_id) || []
      existing.push(t.tag)
      tagsByUserId.set(t.user_id, existing)
    }

    // Batch: Get all subscriptions using correct customer_id (not user_id!)
    const customerIds = customers?.map((c) => c.id).filter(Boolean) || []
    const { data: subscriptions } = customerIds.length > 0
      ? await this.supabase
          .from('billing_subscriptions')
          .select('customer_id, plan_key, current_period_end')
          .in('customer_id', customerIds)
          .in('status', ['active', 'trialing', 'past_due'])
      : { data: [] }

    // Map subscriptions by customer_id, then we'll look up by user_id through the customer mapping
    const subscriptionByCustomerId = new Map(subscriptions?.map((s) => [s.customer_id, s]) || [])

    // Enrich with batched data
    const enrichedCustomers: AtRiskCustomer[] = []

    for (const row of data) {
      const customer = customerByUserId.get(row.user_id)
      const tags = tagsByUserId.get(row.user_id) || []
      const subscription = customer ? subscriptionByCustomerId.get(customer.id) : null

      let daysUntilRenewal: number | undefined
      if (subscription?.current_period_end) {
        daysUntilRenewal = Math.ceil(
          (new Date(subscription.current_period_end).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        )
      }

      // Apply filters
      if (filters?.renewalDays && daysUntilRenewal && daysUntilRenewal > filters.renewalDays) {
        continue
      }
      if (filters?.plan && subscription?.plan_key !== filters.plan) {
        continue
      }
      if (filters?.tag && !tags.some((t) => t === filters.tag)) {
        continue
      }

      enrichedCustomers.push({
        userId: row.user_id,
        email: customer?.email || 'unknown',
        score: row.score,
        status: row.status,
        trend: row.trend || 'stable',
        topReason: row.score_reasons?.[0] || 'Unknown',
        subscriptionPlan: subscription?.plan_key,
        renewalDate: subscription?.current_period_end,
        daysUntilRenewal,
        tags,
      })
    }

    return {
      customers: enrichedCustomers,
      total: count || 0,
    }
  }

  /**
   * Get score changes in last 7 days
   */
  async getScoreChanges(
    direction: 'dropped' | 'recovered',
    threshold: number = 20,
    limit: number = 20
  ): Promise<ScoreChange[]> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Get current scores with 7-day-ago scores
    const { data: scores } = await this.supabase
      .from('user_health_scores')
      .select('user_id, score, score_7d_ago, score_reasons, calculated_at')
      .not('score_7d_ago', 'is', null)

    if (!scores) return []

    const changes: ScoreChange[] = []

    for (const row of scores) {
      if (row.score_7d_ago === null) continue

      const change = row.score - row.score_7d_ago

      if (direction === 'dropped' && change <= -threshold) {
        // Get email
        const { data: customer } = await this.supabase
          .from('billing_customers')
          .select('email')
          .eq('user_id', row.user_id)
          .single()

        changes.push({
          userId: row.user_id,
          email: customer?.email || 'unknown',
          previousScore: row.score_7d_ago,
          currentScore: row.score,
          change,
          topReason: row.score_reasons?.[0] || 'Unknown',
          changedAt: row.calculated_at,
        })
      } else if (direction === 'recovered' && change >= threshold) {
        const { data: customer } = await this.supabase
          .from('billing_customers')
          .select('email')
          .eq('user_id', row.user_id)
          .single()

        changes.push({
          userId: row.user_id,
          email: customer?.email || 'unknown',
          previousScore: row.score_7d_ago,
          currentScore: row.score,
          change,
          topReason: row.score_reasons?.[0] || 'Score improved',
          changedAt: row.calculated_at,
        })
      }
    }

    // Sort by absolute change magnitude
    changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

    return changes.slice(0, limit)
  }

  /**
   * Get all users that need health score calculation
   */
  async getUsersForCalculation(): Promise<string[]> {
    // Get all users with projects or billing records
    const { data: projectUsers } = await this.supabase
      .from('projects')
      .select('owner_id')
      .not('owner_id', 'is', null)

    const { data: billingUsers } = await this.supabase.from('billing_customers').select('user_id')

    const userIds = new Set<string>()

    projectUsers?.forEach((p) => userIds.add(p.owner_id))
    billingUsers?.forEach((b) => userIds.add(b.user_id))

    return Array.from(userIds)
  }

  /**
   * Helper: Get most recent date from two nullable dates
   */
  private getMostRecentDate(date1: string | null, date2: string | null): string | null {
    if (!date1 && !date2) return null
    if (!date1) return date2
    if (!date2) return date1
    return new Date(date1) > new Date(date2) ? date1 : date2
  }

  /**
   * Add admin note to user
   */
  async addAdminNote(userId: string, note: string, adminId: string): Promise<void> {
    const { error } = await this.supabase.from('user_admin_notes').insert({
      user_id: userId,
      note,
      created_by: adminId,
    })

    if (error) throw error
  }

  /**
   * Get admin notes for user
   */
  async getAdminNotes(userId: string): Promise<Array<{ id: string; note: string; createdBy: string; createdAt: string }>> {
    const { data, error } = await this.supabase
      .from('user_admin_notes')
      .select('id, note, created_by, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map((n) => ({
      id: n.id,
      note: n.note,
      createdBy: n.created_by,
      createdAt: n.created_at,
    }))
  }

  /**
   * Add/remove tags
   */
  async addTag(userId: string, tag: string, adminId: string): Promise<void> {
    const { error } = await this.supabase.from('user_admin_tags').upsert(
      {
        user_id: userId,
        tag,
        added_by: adminId,
      },
      { onConflict: 'user_id,tag' }
    )

    if (error) throw error
  }

  async removeTag(userId: string, tag: string): Promise<void> {
    const { error } = await this.supabase.from('user_admin_tags').delete().eq('user_id', userId).eq('tag', tag)

    if (error) throw error
  }

  /**
   * Log contact with user
   */
  async logContact(
    userId: string,
    contactType: 'email' | 'call' | 'meeting' | 'chat' | 'other',
    summary: string,
    adminId: string
  ): Promise<void> {
    const { error } = await this.supabase.from('user_contact_log').insert({
      user_id: userId,
      contact_type: contactType,
      summary,
      created_by: adminId,
    })

    if (error) throw error
  }

  /**
   * Get contact log for user
   */
  async getContactLog(
    userId: string
  ): Promise<Array<{ id: string; contactType: string; summary: string; createdBy: string; createdAt: string }>> {
    const { data, error } = await this.supabase
      .from('user_contact_log')
      .select('id, contact_type, summary, created_by, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return (data || []).map((c) => ({
      id: c.id,
      contactType: c.contact_type,
      summary: c.summary,
      createdBy: c.created_by,
      createdAt: c.created_at,
    }))
  }
}
