/**
 * DigestService
 *
 * Generates and sends daily digest emails for Run Hub.
 * Uses narrative format: headline, anomaly, recommended action, proof point.
 *
 * Part of Run Hub Phase 4: Proactive Digests
 */

import { Pool } from 'pg'
import { getPool } from './database'
import { getInhouseEmailService } from './inhouse/InhouseEmailService'
import { getAttributionService } from './attributionService'
import { Outcome } from '../types/run-contracts'
import { getUtcRangeForLocalDay } from '../utils/tzDay'

// Simple logging prefix for this service
const LOG_PREFIX = '[DigestService]'

// ============================================
// TYPES
// ============================================

export interface DigestCurrencyRevenue {
  currency: string
  valueCents: number
  deltaCents: number
  deltaPercent: number
}

export interface DigestKpis {
  revenue: { value: number; delta: number; deltaPercent: number; currency: string; currencies?: DigestCurrencyRevenue[] }
  leads: { value: number; delta: number; deltaPercent: number }
  orders: { value: number; delta: number; deltaPercent: number }
  conversion: { value: number; delta: number; deltaPercent: number }
}

export interface DigestHeadline {
  text: string
  type: 'revenue_up' | 'revenue_down' | 'leads_up' | 'leads_down' | 'orders_up' | 'orders_down' | 'steady'
  delta: number
  metric: 'revenue' | 'leads' | 'orders' | 'conversion'
}

export interface DigestAnomaly {
  type: 'lead_drop' | 'revenue_drop' | 'payment_failures' | 'conversion_drop'
  message: string
  severity: 'high' | 'medium'
  params: Record<string, unknown>
}

export interface DigestAction {
  id: string
  label: string
  reason: string
}

export interface DigestProof {
  actionLabel: string
  outcome: {
    conversions: number
    revenueCents: number
    currency: string
    confidence: 'high' | 'medium' | 'low'
  }
  when: string
}

export interface DigestContent {
  projectId: string
  projectName: string
  date: string  // YYYY-MM-DD of the day being summarized
  timezone: string
  industryTag: string
  locale: string

  // Narrative sections
  headline: DigestHeadline
  kpis: DigestKpis
  anomaly?: DigestAnomaly
  recommendedAction?: DigestAction
  lastOutcome?: DigestProof

  runHubUrl: string
}

export interface ProjectDigestInfo {
  id: string
  name: string
  timezone: string
  industryTag: string
  ownerEmail: string
  ownerName?: string
  locale: string
  digestHour: number
}

// ============================================
// HELPER: Compute next digest time
// ============================================

/**
 * Compute the next UTC timestamp when a digest should be sent.
 * Takes project timezone and preferred hour into account.
 */
export function computeNextDigestTime(timezone: string, hour: number): Date {
  // Use Intl.DateTimeFormat to get current time in project timezone
  const now = new Date()

  // Create a date formatter for the project timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })

  // Parse current time in project timezone
  const parts = formatter.formatToParts(now)
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0'

  const currentHour = parseInt(getPart('hour'), 10)
  const currentMinute = parseInt(getPart('minute'), 10)
  const currentYear = parseInt(getPart('year'), 10)
  const currentMonth = parseInt(getPart('month'), 10) - 1 // 0-indexed
  const currentDay = parseInt(getPart('day'), 10)

  // Create target time in project timezone
  // Start with today at the preferred hour
  let targetDate = new Date(Date.UTC(currentYear, currentMonth, currentDay, hour, 0, 0, 0))

  // Adjust for timezone offset
  // We need to find the UTC time that corresponds to the preferred hour in the project timezone
  const testFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false
  })

  // Binary search for the correct UTC time (handles DST)
  // Start with a rough estimate
  const tzOffset = getTimezoneOffset(timezone, targetDate)
  targetDate = new Date(targetDate.getTime() + tzOffset * 60000)

  // If we're past that hour today, schedule for tomorrow
  const targetInTz = parseInt(testFormatter.formatToParts(targetDate).find(p => p.type === 'hour')?.value || '0', 10)
  if (targetInTz < hour || (targetInTz === hour && currentMinute > 0)) {
    targetDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000)
  }

  // Fine-tune to exact hour
  let iterations = 0
  while (iterations < 10) {
    const checkHour = parseInt(testFormatter.formatToParts(targetDate).find(p => p.type === 'hour')?.value || '0', 10)
    if (checkHour === hour) break

    const diff = hour - checkHour
    targetDate = new Date(targetDate.getTime() + diff * 60 * 60 * 1000)
    iterations++
  }

  return targetDate
}

/**
 * Get timezone offset in minutes for a given timezone and date
 */
function getTimezoneOffset(timezone: string, date: Date): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }))
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }))
  return (utcDate.getTime() - tzDate.getTime()) / 60000
}

// ============================================
// SERVICE IMPLEMENTATION
// ============================================

export class DigestService {
  private pool: Pool

  constructor() {
    this.pool = getPool()
  }

  /**
   * Generate digest content for a project.
   * @param projectId Project ID
   * @param date Date to summarize (YYYY-MM-DD in project timezone)
   */
  async generateDigest(projectId: string, date: string): Promise<DigestContent | null> {
    // Get project info
    const projectInfo = await this.getProjectInfo(projectId)
    if (!projectInfo) {
      console.warn(`${LOG_PREFIX} Project ${projectId} not found`)
      return null
    }

    // Get KPIs for yesterday and day before
    const kpis = await this.getKpis(projectId, date)

    // Check if project has any activity - skip digest if no data at all
    const hasActivity = kpis.revenue.value > 0 || kpis.leads.value > 0 || kpis.orders.value > 0
    if (!hasActivity) {
      console.log(`${LOG_PREFIX} Skipping digest for project ${projectId} - no activity on ${date}`)
      return null
    }

    // Pick headline based on most significant change
    const headline = this.pickHeadline(kpis)

    // Get top anomaly
    const anomaly = await this.getTopAnomaly(projectId, date, kpis)

    // Get recommended action
    const recommendedAction = await this.getRecommendedAction(projectId, kpis)

    // Get last outcome
    const lastOutcome = await this.getLastOutcome(projectId)

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.sheenapps.com'

    return {
      projectId,
      projectName: projectInfo.name,
      date,
      timezone: projectInfo.timezone,
      industryTag: projectInfo.industryTag,
      locale: projectInfo.locale,
      headline,
      kpis,
      anomaly,
      recommendedAction,
      lastOutcome,
      runHubUrl: `${baseUrl}/project/${projectId}/run`
    }
  }

  /**
   * Send digest email for a project.
   */
  async sendDigest(projectId: string, content: DigestContent, recipient: string): Promise<void> {
    const emailService = getInhouseEmailService(projectId)

    // Build email subject based on headline
    const subject = this.buildSubject(content)

    // Helper: format delta color based on value (green for positive, red for negative, gray for zero)
    const deltaColor = (n: number) => (n > 0 ? '#16a34a' : n < 0 ? '#dc2626' : '#6b7280')

    // Helper: format delta text with sign
    const deltaText = (n: number) => (n > 0 ? `+${n}%` : n < 0 ? `${n}%` : '0%')

    // Helper: format currency (cents to dollars)
    const formatCents = (cents: number, currency: string) => {
      const dollars = (cents / 100).toFixed(2)
      return `${currency} ${dollars}`
    }

    // Flatten variables for email template (only primitive values)
    const variables: Record<string, string | number | boolean> = {
      projectName: content.projectName,
      date: content.date,
      subject,
      runHubUrl: content.runHubUrl,
      industryTag: content.industryTag,
      locale: content.locale,
      // Headline
      headlineText: content.headline.text,
      headlineType: content.headline.type,
      headlineDelta: content.headline.delta,
      headlineMetric: content.headline.metric,
      // KPIs - revenue (formatted as dollars, not cents!)
      revenueValue: formatCents(content.kpis.revenue.value, content.kpis.revenue.currency),
      revenueDelta: content.kpis.revenue.delta,
      revenueDeltaPercent: content.kpis.revenue.deltaPercent,
      revenueDeltaColor: deltaColor(content.kpis.revenue.delta),
      revenueDeltaText: deltaText(content.kpis.revenue.deltaPercent),
      revenueCurrency: content.kpis.revenue.currency,
      // KPIs - leads
      leadsValue: content.kpis.leads.value,
      leadsDelta: content.kpis.leads.delta,
      leadsDeltaPercent: content.kpis.leads.deltaPercent,
      leadsDeltaColor: deltaColor(content.kpis.leads.delta),
      leadsDeltaText: deltaText(content.kpis.leads.deltaPercent),
      // KPIs - orders
      ordersValue: content.kpis.orders.value,
      ordersDelta: content.kpis.orders.delta,
      ordersDeltaPercent: content.kpis.orders.deltaPercent,
      ordersDeltaColor: deltaColor(content.kpis.orders.delta),
      ordersDeltaText: deltaText(content.kpis.orders.deltaPercent),
      // KPIs - conversion
      conversionValue: content.kpis.conversion.value,
      conversionDelta: content.kpis.conversion.delta,
      conversionDeltaPercent: content.kpis.conversion.deltaPercent,
      // Flags
      hasAnomaly: !!content.anomaly,
      hasAction: !!content.recommendedAction,
      hasOutcome: !!content.lastOutcome,
    }

    // Add anomaly if present
    if (content.anomaly) {
      variables.anomalyType = content.anomaly.type
      variables.anomalyMessage = content.anomaly.message
      variables.anomalySeverity = content.anomaly.severity
    }

    // Add recommended action if present
    if (content.recommendedAction) {
      variables.actionId = content.recommendedAction.id
      variables.actionLabel = content.recommendedAction.label
      variables.actionReason = content.recommendedAction.reason
    }

    // Add last outcome if present
    if (content.lastOutcome) {
      const formattedRevenue = formatCents(
        content.lastOutcome.outcome.revenueCents,
        content.lastOutcome.outcome.currency
      )
      variables.outcomeActionLabel = content.lastOutcome.actionLabel
      variables.outcomeConversions = content.lastOutcome.outcome.conversions
      variables.outcomeRevenueFormatted = formattedRevenue
      variables.outcomeConfidence = content.lastOutcome.outcome.confidence
      variables.outcomeWhen = content.lastOutcome.when
    }

    await emailService.send({
      to: recipient,
      template: 'daily_digest',
      variables,
      idempotencyKey: `daily-digest:${projectId}:${content.date}`
    })

    console.log(`${LOG_PREFIX} Sent digest to ${recipient} for project ${projectId} (${content.date})`)
  }

  /**
   * Get project info needed for digest
   */
  private async getProjectInfo(projectId: string): Promise<ProjectDigestInfo | null> {
    const result = await this.pool.query(
      `SELECT
        p.id,
        p.name,
        COALESCE(p.timezone, 'UTC') as timezone,
        p.config,
        u.email as owner_email,
        u.raw_user_meta_data->>'name' as owner_name
      FROM projects p
      JOIN auth.users u ON p.owner_id = u.id
      WHERE p.id = $1`,
      [projectId]
    )

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    const runSettings = row.config?.run_settings || {}
    const notifications = runSettings.notifications || {}

    return {
      id: row.id,
      name: row.name || 'Your Project',
      timezone: row.timezone || 'UTC',
      industryTag: runSettings.industry_tag || 'generic',
      ownerEmail: notifications.email_recipient || row.owner_email,
      ownerName: row.owner_name,
      locale: row.config?.locale || 'en', // Fallback to English if no locale set
      digestHour: notifications.daily_digest_hour ?? 9
    }
  }

  /**
   * Get KPIs for the digest date and compare with previous day.
   *
   * CRITICAL: Uses UTC ranges instead of occurred_at::date to handle timezones correctly.
   * The date parameter is in project timezone (e.g., "2026-01-29" in America/New_York),
   * but occurred_at is stored in UTC. We must convert the local date to UTC boundaries.
   */
  private async getKpis(projectId: string, date: string): Promise<DigestKpis> {
    // Get project timezone (needed for correct day bucketing)
    const projectInfo = await this.getProjectInfo(projectId)
    const timeZone = projectInfo?.timezone || 'UTC'

    // Convert local date to UTC ranges
    // Example: "2026-01-29" in America/New_York (UTC-5) becomes:
    //   startUtc: 2026-01-29T05:00:00Z
    //   endUtc:   2026-01-30T05:00:00Z
    const { startUtc, endUtc } = getUtcRangeForLocalDay(date, timeZone)

    // Get previous day range
    const prevDayMs = startUtc.getTime() - 24 * 60 * 60 * 1000
    const prevDayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(prevDayMs))
    const { startUtc: prevStartUtc, endUtc: prevEndUtc } = getUtcRangeForLocalDay(prevDayStr, timeZone)

    // Two queries: one for non-monetary aggregates, one for per-currency revenue
    const [aggResult, revenueResult] = await Promise.all([
      // Non-monetary aggregates (no currency grouping needed)
      this.pool.query(
        `WITH buckets AS (
          SELECT
            CASE
              WHEN occurred_at >= $2 AND occurred_at < $3 THEN 'curr'
              WHEN occurred_at >= $4 AND occurred_at < $5 THEN 'prev'
            END as bucket,
            event_type
          FROM business_events
          WHERE project_id = $1
            AND (
              (occurred_at >= $2 AND occurred_at < $3)
              OR
              (occurred_at >= $4 AND occurred_at < $5)
            )
        )
        SELECT
          bucket,
          COUNT(*) FILTER (WHERE event_type IN ('lead_created', 'signup')) as leads,
          COUNT(*) FILTER (WHERE event_type = 'payment_succeeded') as orders,
          COUNT(*) FILTER (WHERE event_type = 'page_view') as page_views
        FROM buckets
        WHERE bucket IS NOT NULL
        GROUP BY bucket`,
        [projectId, startUtc, endUtc, prevStartUtc, prevEndUtc]
      ),
      // Per-currency revenue (grouped by currency properly)
      this.pool.query(
        `WITH buckets AS (
          SELECT
            CASE
              WHEN occurred_at >= $2 AND occurred_at < $3 THEN 'curr'
              WHEN occurred_at >= $4 AND occurred_at < $5 THEN 'prev'
            END as bucket,
            event_type,
            payload
          FROM business_events
          WHERE project_id = $1
            AND event_type = 'payment_succeeded'
            AND (
              (occurred_at >= $2 AND occurred_at < $3)
              OR
              (occurred_at >= $4 AND occurred_at < $5)
            )
        )
        SELECT
          bucket,
          COALESCE(payload->>'currency', 'USD') as currency,
          COALESCE(SUM((payload->>'amount_cents')::bigint), 0) as revenue_cents
        FROM buckets
        WHERE bucket IS NOT NULL
        GROUP BY bucket, COALESCE(payload->>'currency', 'USD')
        ORDER BY revenue_cents DESC`,
        [projectId, startUtc, endUtc, prevStartUtc, prevEndUtc]
      ),
    ])

    const curr = aggResult.rows.find((r: any) => r.bucket === 'curr') || { leads: 0, orders: 0, page_views: 0 }
    const prev = aggResult.rows.find((r: any) => r.bucket === 'prev') || { leads: 0, orders: 0, page_views: 0 }

    // Group revenue by currency for current and previous periods
    const currRevByCurrency = new Map<string, number>()
    const prevRevByCurrency = new Map<string, number>()
    for (const row of revenueResult.rows) {
      const cents = Number(row.revenue_cents)
      if (row.bucket === 'curr') currRevByCurrency.set(row.currency, cents)
      else prevRevByCurrency.set(row.currency, cents)
    }

    // Build per-currency breakdown
    const allCurrencies = new Set([...currRevByCurrency.keys(), ...prevRevByCurrency.keys()])
    const currencies: DigestCurrencyRevenue[] = []
    for (const code of allCurrencies) {
      const c = currRevByCurrency.get(code) || 0
      const p = prevRevByCurrency.get(code) || 0
      currencies.push({
        currency: code,
        valueCents: c,
        deltaCents: c - p,
        deltaPercent: p > 0 ? Math.round(((c - p) / p) * 100) : c > 0 ? 100 : 0,
      })
    }
    // Sort by value descending
    currencies.sort((a, b) => b.valueCents - a.valueCents)

    // Total revenue across currencies (for backward compat)
    const totalCurrRevenue = [...currRevByCurrency.values()].reduce((a, b) => a + b, 0)
    const totalPrevRevenue = [...prevRevByCurrency.values()].reduce((a, b) => a + b, 0)
    const primaryCurrency = currencies[0]?.currency || 'USD'

    // Calculate conversion rates (orders / page_views)
    const currConv = curr.page_views > 0 ? Math.round((curr.orders / curr.page_views) * 10_000) / 100 : 0
    const prevConv = prev.page_views > 0 ? Math.round((prev.orders / prev.page_views) * 10_000) / 100 : 0

    const calcDelta = (c: number, p: number) => ({
      value: c,
      delta: c - p,
      deltaPercent: p > 0 ? Math.round(((c - p) / p) * 100) : c > 0 ? 100 : 0,
    })

    return {
      revenue: {
        ...calcDelta(totalCurrRevenue, totalPrevRevenue),
        currency: primaryCurrency,
        currencies: currencies.length > 1 ? currencies : undefined,
      },
      leads: calcDelta(Number(curr.leads), Number(prev.leads)),
      orders: calcDelta(Number(curr.orders), Number(prev.orders)),
      conversion: calcDelta(Number(currConv), Number(prevConv)),
    }
  }

  /**
   * Pick the most significant KPI change for the headline
   */
  private pickHeadline(kpis: DigestKpis): DigestHeadline {
    // Priority: revenue > orders > leads > conversion
    // Only highlight changes > 10%

    if (Math.abs(kpis.revenue.deltaPercent) >= 10) {
      return {
        text: kpis.revenue.deltaPercent > 0
          ? `Revenue up ${kpis.revenue.deltaPercent}% yesterday`
          : `Revenue down ${Math.abs(kpis.revenue.deltaPercent)}% yesterday`,
        type: kpis.revenue.deltaPercent > 0 ? 'revenue_up' : 'revenue_down',
        delta: kpis.revenue.deltaPercent,
        metric: 'revenue'
      }
    }

    if (Math.abs(kpis.orders.deltaPercent) >= 10) {
      return {
        text: kpis.orders.deltaPercent > 0
          ? `${kpis.orders.value} new orders yesterday (+${kpis.orders.deltaPercent}%)`
          : `Orders down ${Math.abs(kpis.orders.deltaPercent)}% yesterday`,
        type: kpis.orders.deltaPercent > 0 ? 'orders_up' : 'orders_down',
        delta: kpis.orders.deltaPercent,
        metric: 'orders'
      }
    }

    if (Math.abs(kpis.leads.deltaPercent) >= 10) {
      return {
        text: kpis.leads.deltaPercent > 0
          ? `${kpis.leads.value} new leads yesterday (+${kpis.leads.deltaPercent}%)`
          : `Leads down ${Math.abs(kpis.leads.deltaPercent)}% yesterday`,
        type: kpis.leads.deltaPercent > 0 ? 'leads_up' : 'leads_down',
        delta: kpis.leads.deltaPercent,
        metric: 'leads'
      }
    }

    // Default: steady day
    return {
      text: 'Steady day yesterday',
      type: 'steady',
      delta: 0,
      metric: 'revenue'
    }
  }

  /**
   * Get top anomaly (if any)
   */
  private async getTopAnomaly(
    projectId: string,
    date: string,
    kpis: DigestKpis
  ): Promise<DigestAnomaly | undefined> {
    // Check for significant drops (> 50%)
    if (kpis.revenue.deltaPercent <= -50 && kpis.revenue.value > 0) {
      return {
        type: 'revenue_drop',
        message: `Revenue dropped ${Math.abs(kpis.revenue.deltaPercent)}% vs previous day`,
        severity: 'high',
        params: { percent: Math.abs(kpis.revenue.deltaPercent) }
      }
    }

    if (kpis.leads.deltaPercent <= -50 && kpis.leads.value > 0) {
      return {
        type: 'lead_drop',
        message: `Leads dropped ${Math.abs(kpis.leads.deltaPercent)}% vs previous day`,
        severity: 'high',
        params: { percent: Math.abs(kpis.leads.deltaPercent) }
      }
    }

    // Check for payment failures using timezone-safe UTC ranges
    const projectInfo = await this.getProjectInfo(projectId)
    const timeZone = projectInfo?.timezone || 'UTC'
    const { startUtc, endUtc } = getUtcRangeForLocalDay(date, timeZone)

    const failureResult = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM business_events
       WHERE project_id = $1
         AND event_type = 'payment_failed'
         AND occurred_at >= $2 AND occurred_at < $3`,
      [projectId, startUtc, endUtc]
    )

    const failureCount = parseInt(failureResult.rows[0]?.count || '0', 10)
    if (failureCount >= 3) {
      return {
        type: 'payment_failures',
        message: `${failureCount} payment failures yesterday`,
        severity: failureCount >= 5 ? 'high' : 'medium',
        params: { count: failureCount }
      }
    }

    return undefined
  }

  /**
   * Get recommended action based on signals
   */
  private async getRecommendedAction(
    projectId: string,
    kpis: DigestKpis
  ): Promise<DigestAction | undefined> {
    // Check for abandoned checkouts to recover
    const abandonedResult = await this.pool.query(
      `SELECT COUNT(*) as count
       FROM business_events be
       WHERE be.project_id = $1
         AND be.event_type = 'checkout_started'
         AND be.occurred_at > NOW() - INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM business_events pe
           WHERE pe.project_id = $1
             AND pe.event_type = 'payment_succeeded'
             AND pe.correlation_id = be.correlation_id
         )`,
      [projectId]
    )

    const abandonedCount = parseInt(abandonedResult.rows[0]?.count || '0', 10)
    if (abandonedCount >= 3) {
      return {
        id: 'recover_abandoned',
        label: 'Recover abandoned carts',
        reason: `${abandonedCount} abandoned checkouts in the last 24h`
      }
    }

    // Check for new leads to follow up
    if (kpis.leads.value >= 3) {
      return {
        id: 'follow_up_leads',
        label: 'Follow up leads',
        reason: `${kpis.leads.value} new leads yesterday`
      }
    }

    return undefined
  }

  /**
   * Get last successful workflow outcome (proof point)
   */
  private async getLastOutcome(projectId: string): Promise<DigestProof | undefined> {
    const result = await this.pool.query(
      `SELECT
        wr.id,
        wr.action_id,
        wr.completed_at,
        wr.result,
        COALESCE(SUM(wa.amount_cents), 0) as total_revenue_cents,
        COUNT(wa.id) as conversions,
        MAX(wa.currency) as currency,
        MAX(wa.confidence) as confidence
       FROM workflow_runs wr
       LEFT JOIN workflow_attributions wa ON wa.workflow_run_id = wr.id
       WHERE wr.project_id = $1
         AND wr.status = 'succeeded'
         AND wr.completed_at > NOW() - INTERVAL '7 days'
       GROUP BY wr.id
       HAVING COUNT(wa.id) > 0
       ORDER BY wr.completed_at DESC
       LIMIT 1`,
      [projectId]
    )

    if (result.rows.length === 0) {
      return undefined
    }

    const row = result.rows[0]
    const actionLabels: Record<string, string> = {
      'recover_abandoned': 'Cart recovery',
      'send_promo': 'Promo campaign',
      'post_update': 'Update email'
    }

    return {
      actionLabel: actionLabels[row.action_id] || row.action_id,
      outcome: {
        conversions: parseInt(row.conversions, 10),
        revenueCents: parseInt(row.total_revenue_cents, 10),
        currency: row.currency || 'USD',
        confidence: row.confidence || 'medium'
      },
      when: this.formatRelativeTime(new Date(row.completed_at))
    }
  }

  /**
   * Build email subject based on headline
   */
  private buildSubject(content: DigestContent): string {
    const prefix = content.projectName
    switch (content.headline.type) {
      case 'revenue_up':
        return `${prefix}: Revenue up ${content.headline.delta}% yesterday`
      case 'revenue_down':
        return `${prefix}: Revenue down ${Math.abs(content.headline.delta)}% yesterday`
      case 'orders_up':
        return `${prefix}: ${content.kpis.orders.value} new orders yesterday`
      case 'orders_down':
        return `${prefix}: Orders down ${Math.abs(content.headline.delta)}% yesterday`
      case 'leads_up':
        return `${prefix}: ${content.kpis.leads.value} new leads yesterday`
      case 'leads_down':
        return `${prefix}: Leads down ${Math.abs(content.headline.delta)}% yesterday`
      default:
        return `${prefix}: Your daily summary`
    }
  }

  /**
   * Format relative time (e.g., "2 days ago")
   */
  private formatRelativeTime(date: Date): string {
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`
  }
}

// ============================================
// SINGLETON FACTORY
// ============================================

let digestServiceInstance: DigestService | null = null

export function getDigestService(): DigestService {
  if (!digestServiceInstance) {
    digestServiceInstance = new DigestService()
  }
  return digestServiceInstance
}

/** Reset singleton for testing */
export function resetDigestServiceInstance(): void {
  digestServiceInstance = null
}
