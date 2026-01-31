/**
 * Customer 360 Service
 *
 * Aggregates all customer context into a single view for admin support operations.
 * Consolidates: profile, health score, billing, projects/builds, support, activity timeline.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { ServerLoggingService } from '../serverLoggingService'
import { CustomerHealthService, HealthScoreBreakdown, HealthStatus } from './CustomerHealthService'

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface Customer360Profile {
  userId: string
  email: string
  name?: string | undefined
  avatarUrl?: string | undefined
  createdAt: string
  lastSignInAt?: string | undefined
  region?: string | undefined
}

export interface Customer360Subscription {
  subscriptionId?: string | undefined
  planKey?: string | undefined
  status?: string | undefined
  amountCents?: number | undefined
  currency?: string | undefined
  billingInterval?: string | undefined
  currentPeriodEnd?: string | undefined
  daysUntilRenewal?: number | undefined
  cancelAtPeriodEnd?: boolean | undefined
}

export interface Customer360Billing {
  subscription: Customer360Subscription
  mrrCents: number
  ltvCents: number
  totalPayments: number
  failedPayments: number
  lastPaymentAt?: string | undefined
  lastPaymentStatus?: string | undefined
  stripeCustomerId?: string | undefined
}

export interface Customer360Usage {
  totalProjects: number
  activeProjects: number
  buildsThisMonth: number
  lastBuildAt?: string | undefined
  lastBuildStatus?: string | undefined
  buildSuccessRate?: number | undefined
}

export interface Customer360Support {
  openTickets: number
  totalTickets: number
  avgResolutionTimeHours?: number | undefined
  lastTicketAt?: string | undefined
  csat?: number | undefined
}

export interface Customer360Error {
  buildId: string
  projectId: string
  projectName?: string | undefined
  errorMessage: string
  failureStage?: string | undefined
  occurredAt: string
}

export interface ActivityTimelineItem {
  id: string
  type: 'build' | 'billing' | 'support' | 'auth' | 'project' | 'admin'
  title: string
  description?: string | undefined
  status?: string | undefined
  occurredAt: string
  metadata?: Record<string, any> | undefined
}

export interface Customer360AdminNote {
  id: string
  note: string
  createdBy: string
  createdByEmail?: string | undefined
  createdAt: string
}

export interface Customer360ContactLog {
  id: string
  contactType: string
  summary: string
  createdBy: string
  createdByEmail?: string | undefined
  createdAt: string
}

export interface Customer360Data {
  profile: Customer360Profile
  health: HealthScoreBreakdown | null
  billing: Customer360Billing
  usage: Customer360Usage
  support: Customer360Support
  recentErrors: Customer360Error[]
  activityTimeline: ActivityTimelineItem[]
  notes: Customer360AdminNote[]
  contactLog: Customer360ContactLog[]
  tags: string[]
  quickActions: {
    canRefund: boolean
    canExtendTrial: boolean
    canSuspend: boolean
    isSuspended: boolean
  }
}

export class Customer360Service {
  private logger = ServerLoggingService.getInstance()
  private healthService: CustomerHealthService

  constructor(private supabase: SupabaseClient) {
    this.healthService = new CustomerHealthService(supabase)
  }

  /**
   * Get complete Customer 360 data
   */
  async getCustomer360(userId: string): Promise<Customer360Data | null> {
    try {
      // Fetch all data in parallel for performance
      const [
        profile,
        health,
        billing,
        usage,
        support,
        recentErrors,
        activityTimeline,
        notes,
        contactLog,
        tags,
      ] = await Promise.all([
        this.getProfile(userId),
        this.healthService.calculateHealthScore(userId),
        this.getBilling(userId),
        this.getUsage(userId),
        this.getSupport(userId),
        this.getRecentErrors(userId),
        this.getActivityTimeline(userId),
        this.getNotes(userId),
        this.getContactLog(userId),
        this.getTags(userId),
      ])

      if (!profile) {
        this.logger.warn('Customer not found', { userId })
        return null
      }

      // Determine quick actions
      const quickActions = {
        canRefund: billing.totalPayments > 0,
        canExtendTrial: billing.subscription.status === 'trialing',
        canSuspend: billing.subscription.status === 'active',
        isSuspended: billing.subscription.status === 'paused',
      }

      return {
        profile,
        health,
        billing,
        usage,
        support,
        recentErrors,
        activityTimeline,
        notes,
        contactLog,
        tags,
        quickActions,
      }
    } catch (error) {
      this.logger.error('Failed to get Customer 360 data', { userId, error })
      throw error
    }
  }

  /**
   * Get customer profile
   */
  private async getProfile(userId: string): Promise<Customer360Profile | null> {
    // Try billing_customers first (has more reliable email)
    const { data: customer } = await this.supabase
      .from('billing_customers')
      .select('user_id, email, created_at, stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (!customer) {
      // Fall back to checking projects for owner
      const { data: project } = await this.supabase
        .from('projects')
        .select('owner_id, created_at')
        .eq('owner_id', userId)
        .limit(1)
        .single()

      if (!project) {
        return null
      }

      return {
        userId,
        email: 'unknown',
        createdAt: project.created_at,
      }
    }

    return {
      userId: customer.user_id,
      email: customer.email,
      createdAt: customer.created_at,
    }
  }

  /**
   * Get billing information
   */
  private async getBilling(userId: string): Promise<Customer360Billing> {
    // Get customer record
    const { data: customer } = await this.supabase
      .from('billing_customers')
      .select('id, stripe_customer_id')
      .eq('user_id', userId)
      .single()

    if (!customer) {
      return {
        subscription: {},
        mrrCents: 0,
        ltvCents: 0,
        totalPayments: 0,
        failedPayments: 0,
      }
    }

    // Get active subscription
    const { data: subscription } = await this.supabase
      .from('billing_subscriptions')
      .select(`
        id,
        plan_key,
        status,
        amount_cents,
        currency,
        billing_interval,
        current_period_end,
        cancel_at_period_end
      `)
      .eq('customer_id', customer.id)
      .in('status', ['active', 'trialing', 'past_due', 'paused'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // Get payment history
    const { data: payments } = await this.supabase
      .from('billing_payments')
      .select('id, status, amount_cents, created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })

    const totalPayments = payments?.length || 0
    const failedPayments = payments?.filter((p) => p.status === 'failed').length || 0
    const successfulPayments = payments?.filter((p) => p.status === 'succeeded') || []
    const ltvCents = successfulPayments.reduce((sum, p) => sum + (p.amount_cents || 0), 0)
    const lastPayment = payments?.[0]

    // Calculate days until renewal
    let daysUntilRenewal: number | undefined
    if (subscription?.current_period_end) {
      daysUntilRenewal = Math.ceil(
        (new Date(subscription.current_period_end).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      )
    }

    // Normalize MRR based on billing interval
    let mrrCents = 0
    if (subscription?.amount_cents) {
      if (subscription.billing_interval === 'year' || subscription.billing_interval === 'yearly') {
        mrrCents = Math.round(subscription.amount_cents / 12)
      } else {
        // Default to monthly
        mrrCents = subscription.amount_cents
      }
    }

    return {
      subscription: {
        subscriptionId: subscription?.id,
        planKey: subscription?.plan_key,
        status: subscription?.status,
        amountCents: subscription?.amount_cents,
        currency: subscription?.currency,
        billingInterval: subscription?.billing_interval,
        currentPeriodEnd: subscription?.current_period_end,
        daysUntilRenewal,
        cancelAtPeriodEnd: subscription?.cancel_at_period_end,
      },
      mrrCents,
      ltvCents,
      totalPayments,
      failedPayments,
      lastPaymentAt: lastPayment?.created_at,
      lastPaymentStatus: lastPayment?.status,
      stripeCustomerId: customer.stripe_customer_id,
    }
  }

  /**
   * Get usage statistics
   */
  private async getUsage(userId: string): Promise<Customer360Usage> {
    // Get projects
    const { data: projects } = await this.supabase
      .from('projects')
      .select('id, archived_at, last_accessed_at')
      .eq('owner_id', userId)

    const totalProjects = projects?.length || 0
    const activeProjects = projects?.filter((p) => !p.archived_at).length || 0

    // Get builds this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { data: monthlyBuilds, count: buildsThisMonth } = await this.supabase
      .from('project_build_metrics')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .gte('created_at', startOfMonth.toISOString())

    // Get last build
    const { data: lastBuild } = await this.supabase
      .from('project_build_metrics')
      .select('build_id, status, completed_at')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .single()

    // Get build success rate (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: recentBuilds } = await this.supabase
      .from('project_build_metrics')
      .select('status')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo)

    let buildSuccessRate: number | undefined
    if (recentBuilds && recentBuilds.length > 0) {
      const successful = recentBuilds.filter((b) => b.status === 'completed' || b.status === 'deployed').length
      buildSuccessRate = Math.round((successful / recentBuilds.length) * 100)
    }

    return {
      totalProjects,
      activeProjects,
      buildsThisMonth: buildsThisMonth || 0,
      lastBuildAt: lastBuild?.completed_at,
      lastBuildStatus: lastBuild?.status,
      buildSuccessRate,
    }
  }

  /**
   * Get support ticket statistics
   */
  private async getSupport(userId: string): Promise<Customer360Support> {
    // Get all tickets
    const { data: tickets } = await this.supabase
      .from('support_tickets')
      .select('id, status, created_at, resolved_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    const totalTickets = tickets?.length || 0
    const openTickets = tickets?.filter((t) =>
      t.status === 'open' || t.status === 'in_progress' || t.status === 'waiting_third_party'
    ).length || 0

    // Calculate average resolution time from resolved tickets
    // Note: This is time from creation to resolution, not first response time
    const resolvedTickets = tickets?.filter((t) => t.resolved_at) || []
    let avgResolutionTimeHours: number | undefined
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum, t) => {
        const createdAt = new Date(t.created_at).getTime()
        const resolvedAt = new Date(t.resolved_at).getTime()
        return sum + (resolvedAt - createdAt) / (1000 * 60 * 60)
      }, 0)
      avgResolutionTimeHours = Math.round((totalHours / resolvedTickets.length) * 10) / 10
    }

    const lastTicket = tickets?.[0]

    return {
      openTickets,
      totalTickets,
      avgResolutionTimeHours,
      lastTicketAt: lastTicket?.created_at,
    }
  }

  /**
   * Get last 3 build errors
   */
  private async getRecentErrors(userId: string): Promise<Customer360Error[]> {
    const { data: failedBuilds } = await this.supabase
      .from('project_build_metrics')
      .select(`
        build_id,
        project_id,
        failure_stage,
        completed_at
      `)
      .eq('user_id', userId)
      .eq('status', 'failed')
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(3)

    if (!failedBuilds || failedBuilds.length === 0) {
      return []
    }

    // Get project names
    const projectIds = [...new Set(failedBuilds.map((b) => b.project_id))]
    const { data: projects } = await this.supabase
      .from('projects')
      .select('id, name')
      .in('id', projectIds)

    const projectMap = new Map(projects?.map((p) => [p.id, p.name]) || [])

    // Get error messages from build logs if available
    const errors: Customer360Error[] = []
    for (const build of failedBuilds) {
      // Try to get error details from project_build_records if exists
      const { data: record } = await this.supabase
        .from('project_build_records')
        .select('response_data')
        .eq('build_id', build.build_id)
        .single()

      let errorMessage = build.failure_stage || 'Build failed'
      if (record?.response_data?.error) {
        errorMessage = record.response_data.error
      } else if (record?.response_data?.message) {
        errorMessage = record.response_data.message
      }

      errors.push({
        buildId: build.build_id,
        projectId: build.project_id,
        projectName: projectMap.get(build.project_id),
        errorMessage,
        failureStage: build.failure_stage,
        occurredAt: build.completed_at,
      })
    }

    return errors
  }

  /**
   * Get unified activity timeline
   */
  private async getActivityTimeline(userId: string, limit: number = 20): Promise<ActivityTimelineItem[]> {
    const activities: ActivityTimelineItem[] = []
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    // Get builds
    const { data: builds } = await this.supabase
      .from('project_build_metrics')
      .select('build_id, project_id, status, completed_at')
      .eq('user_id', userId)
      .gte('completed_at', cutoffDate)
      .order('completed_at', { ascending: false })
      .limit(10)

    for (const build of builds || []) {
      activities.push({
        id: `build-${build.build_id}`,
        type: 'build',
        title: `Build ${build.status === 'completed' || build.status === 'deployed' ? 'succeeded' : build.status}`,
        description: `Build #${build.build_id.slice(0, 8)}`,
        status: build.status,
        occurredAt: build.completed_at,
        metadata: { buildId: build.build_id, projectId: build.project_id },
      })
    }

    // Get billing events
    const { data: customer } = await this.supabase
      .from('billing_customers')
      .select('id')
      .eq('user_id', userId)
      .single()

    if (customer) {
      const { data: payments } = await this.supabase
        .from('billing_payments')
        .select('id, status, amount_cents, currency, created_at')
        .eq('customer_id', customer.id)
        .gte('created_at', cutoffDate)
        .order('created_at', { ascending: false })
        .limit(10)

      for (const payment of payments || []) {
        const amountDisplay = payment.amount_cents
          ? `${(payment.amount_cents / 100).toFixed(2)} ${payment.currency || 'USD'}`
          : ''
        activities.push({
          id: `billing-${payment.id}`,
          type: 'billing',
          title: payment.status === 'succeeded' ? 'Payment succeeded' : `Payment ${payment.status}`,
          description: amountDisplay ? `Invoice paid ${amountDisplay}` : undefined,
          status: payment.status,
          occurredAt: payment.created_at,
          metadata: { paymentId: payment.id, amountCents: payment.amount_cents },
        })
      }
    }

    // Get support tickets
    const { data: tickets } = await this.supabase
      .from('support_tickets')
      .select('id, ticket_number, subject, status, created_at, resolved_at')
      .eq('user_id', userId)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(10)

    for (const ticket of tickets || []) {
      activities.push({
        id: `support-open-${ticket.id}`,
        type: 'support',
        title: 'Opened support ticket',
        description: ticket.subject,
        status: ticket.status,
        occurredAt: ticket.created_at,
        metadata: { ticketId: ticket.id, ticketNumber: ticket.ticket_number },
      })

      if (ticket.resolved_at) {
        activities.push({
          id: `support-resolved-${ticket.id}`,
          type: 'support',
          title: 'Ticket resolved',
          description: ticket.subject,
          status: 'resolved',
          occurredAt: ticket.resolved_at,
          metadata: { ticketId: ticket.id, ticketNumber: ticket.ticket_number },
        })
      }
    }

    // Get project creation
    const { data: projects } = await this.supabase
      .from('projects')
      .select('id, name, created_at')
      .eq('owner_id', userId)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(5)

    for (const project of projects || []) {
      activities.push({
        id: `project-${project.id}`,
        type: 'project',
        title: 'Created project',
        description: project.name,
        occurredAt: project.created_at,
        metadata: { projectId: project.id },
      })
    }

    // Get admin actions on this user
    const { data: contactLogs } = await this.supabase
      .from('user_contact_log')
      .select('id, contact_type, summary, created_at')
      .eq('user_id', userId)
      .gte('created_at', cutoffDate)
      .order('created_at', { ascending: false })
      .limit(5)

    for (const log of contactLogs || []) {
      activities.push({
        id: `contact-${log.id}`,
        type: 'admin',
        title: `Admin ${log.contact_type}`,
        description: log.summary,
        occurredAt: log.created_at,
        metadata: { contactType: log.contact_type },
      })
    }

    // Sort all activities by date and return top N
    activities.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    return activities.slice(0, limit)
  }

  /**
   * Get admin notes for user
   */
  private async getNotes(userId: string): Promise<Customer360AdminNote[]> {
    const { data, error } = await this.supabase
      .from('user_admin_notes')
      .select('id, note, created_by, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      this.logger.error('Failed to get admin notes', { userId, error })
      return []
    }

    return (data || []).map((n) => ({
      id: n.id,
      note: n.note,
      createdBy: n.created_by,
      createdAt: n.created_at,
    }))
  }

  /**
   * Get contact log for user
   */
  private async getContactLog(userId: string): Promise<Customer360ContactLog[]> {
    const { data, error } = await this.supabase
      .from('user_contact_log')
      .select('id, contact_type, summary, created_by, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      this.logger.error('Failed to get contact log', { userId, error })
      return []
    }

    return (data || []).map((c) => ({
      id: c.id,
      contactType: c.contact_type,
      summary: c.summary,
      createdBy: c.created_by,
      createdAt: c.created_at,
    }))
  }

  /**
   * Get tags for user
   */
  private async getTags(userId: string): Promise<string[]> {
    const { data, error } = await this.supabase
      .from('user_admin_tags')
      .select('tag')
      .eq('user_id', userId)

    if (error) {
      this.logger.error('Failed to get tags', { userId, error })
      return []
    }

    return (data || []).map((t) => t.tag)
  }

  /**
   * Search customers by email or name
   */
  async searchCustomers(
    query: string,
    limit: number = 20
  ): Promise<Array<{ userId: string; email: string; name?: string }>> {
    const { data, error } = await this.supabase
      .from('billing_customers')
      .select('user_id, email')
      .ilike('email', `%${query}%`)
      .limit(limit)

    if (error) {
      this.logger.error('Failed to search customers', { query, error })
      throw error
    }

    return (data || []).map((c) => ({
      userId: c.user_id,
      email: c.email,
    }))
  }

  /**
   * Get list of all customers with basic info
   */
  async listCustomers(
    offset: number = 0,
    limit: number = 50,
    filters?: {
      status?: HealthStatus | undefined
      plan?: string | undefined
      hasOpenTickets?: boolean | undefined
    }
  ): Promise<{ customers: Array<Customer360Profile & { healthScore?: number; plan?: string }>; total: number }> {
    // Start with health scores if filtering by status
    let userIds: string[] | null = null

    if (filters?.status) {
      const { data: healthData } = await this.supabase
        .from('user_health_scores')
        .select('user_id')
        .eq('status', filters.status)

      if (healthData) {
        userIds = healthData.map((h) => h.user_id)
      }
    }

    // Build customer query
    let query = this.supabase
      .from('billing_customers')
      .select('id, user_id, email, created_at', { count: 'exact' })

    if (userIds) {
      query = query.in('user_id', userIds)
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1).order('created_at', { ascending: false })

    if (error) {
      this.logger.error('Failed to list customers', { error })
      throw error
    }

    if (!data || data.length === 0) {
      return { customers: [], total: count || 0 }
    }

    // Batch load all related data to avoid N+1 queries
    const customerUserIds = data.map((c) => c.user_id)
    const customerIds = data.map((c) => c.id)

    // Batch: Get all health scores
    const { data: healthScores } = await this.supabase
      .from('user_health_scores')
      .select('user_id, score')
      .in('user_id', customerUserIds)

    const healthByUserId = new Map(healthScores?.map((h) => [h.user_id, h.score]) || [])

    // Batch: Get all subscriptions using correct customer_id (not user_id!)
    const { data: subscriptions } = await this.supabase
      .from('billing_subscriptions')
      .select('customer_id, plan_key')
      .in('customer_id', customerIds)
      .in('status', ['active', 'trialing', 'past_due'])

    const planByCustomerId = new Map(subscriptions?.map((s) => [s.customer_id, s.plan_key]) || [])

    // Enrich with batched data
    const enriched = data.map((c) => ({
      userId: c.user_id,
      email: c.email,
      createdAt: c.created_at,
      healthScore: healthByUserId.get(c.user_id),
      plan: planByCustomerId.get(c.id),
    }))

    return {
      customers: enriched,
      total: count || 0,
    }
  }
}
