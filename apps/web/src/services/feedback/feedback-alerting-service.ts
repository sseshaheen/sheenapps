/**
 * Feedback Alerting Service
 * Monitors feedback metrics and sends alerts for negative trends
 *
 * Alert Types:
 * - High detractor rate (NPS)
 * - Frustration signal spikes (rage clicks, dead clicks)
 * - Unprocessed feedback backlog
 * - Critical bug reports
 *
 * Integration:
 * - Can be called from cron job or API route
 * - Sends alerts via Slack, email, or other configured channels
 *
 * SECURITY: This is a server-only service. Never import from client code.
 */

import 'server-only'
import { getServiceClient } from '@/lib/server/supabase-clients'

// Use service client for server-side database operations
const supabase = getServiceClient()

// Alert thresholds - these can be adjusted based on baseline
const THRESHOLDS = {
  // NPS alerts
  nps_detractor_rate_critical: 50, // Alert if > 50% are detractors
  nps_detractor_rate_warning: 30, // Warn if > 30%
  nps_sample_minimum: 10, // Need at least 10 responses to alert

  // Frustration alerts
  rage_clicks_critical: 50, // Per day
  rage_clicks_warning: 20,
  dead_clicks_critical: 100, // Per day
  dead_clicks_warning: 50,
  frustration_comparison_window: 7, // Compare to 7-day average

  // Backlog alerts
  unprocessed_critical: 50, // Items
  unprocessed_warning: 20,
  oldest_unprocessed_hours_critical: 48, // Hours
  oldest_unprocessed_hours_warning: 24,

  // Bug report alerts
  critical_bug_reports_unprocessed: 1, // Any critical bug unprocessed triggers alert
} as const

export interface FeedbackAlert {
  key: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  title: string
  message: string
  metrics: NPSMetrics | FrustrationMetrics | BacklogMetrics
  timestamp: string
}

export interface AlertCheckResult {
  alerts: FeedbackAlert[]
  metrics: {
    nps: NPSMetrics | null
    frustration: FrustrationMetrics | null
    backlog: BacklogMetrics | null
  }
  checkedAt: string
}

interface NPSMetrics {
  total: number
  detractors: number
  passives: number
  promoters: number
  detractorRate: number
  npsScore: number
  period: string
}

interface FrustrationMetrics {
  rageClicks: number
  deadClicks: number
  errors: number
  uniqueSessions: number
  rageClicksChange: number // Percentage change vs previous period
  deadClicksChange: number
  period: string
}

interface BacklogMetrics {
  unprocessed: number
  acknowledged: number
  inProgress: number
  criticalUnprocessed: number
  oldestHours: number | null
}

/**
 * Run all alert checks and return any triggered alerts
 */
export async function checkFeedbackAlerts(): Promise<AlertCheckResult> {
  const alerts: FeedbackAlert[] = []
  const timestamp = new Date().toISOString()

  // Gather metrics
  const [npsMetrics, frustrationMetrics, backlogMetrics] = await Promise.all([
    getNPSMetrics(30), // 30-day window
    getFrustrationMetrics(1, 7), // Current day vs 7-day average
    getBacklogMetrics(),
  ])

  // Check NPS alerts
  if (npsMetrics && npsMetrics.total >= THRESHOLDS.nps_sample_minimum) {
    if (npsMetrics.detractorRate >= THRESHOLDS.nps_detractor_rate_critical) {
      alerts.push({
        key: 'nps_detractor_rate_critical',
        severity: 'critical',
        title: 'Critical: High NPS Detractor Rate',
        message: `${npsMetrics.detractorRate.toFixed(1)}% of NPS responses are detractors (threshold: ${THRESHOLDS.nps_detractor_rate_critical}%). NPS Score: ${npsMetrics.npsScore}. Review recent feedback immediately.`,
        metrics: npsMetrics,
        timestamp,
      })
    } else if (
      npsMetrics.detractorRate >= THRESHOLDS.nps_detractor_rate_warning
    ) {
      alerts.push({
        key: 'nps_detractor_rate_warning',
        severity: 'high',
        title: 'Warning: Elevated NPS Detractor Rate',
        message: `${npsMetrics.detractorRate.toFixed(1)}% of NPS responses are detractors. NPS Score: ${npsMetrics.npsScore}. Consider reviewing recent feedback.`,
        metrics: npsMetrics,
        timestamp,
      })
    }
  }

  // Check frustration signal alerts
  if (frustrationMetrics) {
    if (frustrationMetrics.rageClicks >= THRESHOLDS.rage_clicks_critical) {
      alerts.push({
        key: 'rage_clicks_critical',
        severity: 'critical',
        title: 'Critical: Rage Click Spike',
        message: `${frustrationMetrics.rageClicks} rage clicks detected today (${frustrationMetrics.rageClicksChange > 0 ? '+' : ''}${frustrationMetrics.rageClicksChange.toFixed(0)}% vs 7-day avg). Indicates severe UX frustration.`,
        metrics: frustrationMetrics,
        timestamp,
      })
    } else if (frustrationMetrics.rageClicks >= THRESHOLDS.rage_clicks_warning) {
      alerts.push({
        key: 'rage_clicks_warning',
        severity: 'medium',
        title: 'Warning: Elevated Rage Clicks',
        message: `${frustrationMetrics.rageClicks} rage clicks detected today. Review affected pages.`,
        metrics: frustrationMetrics,
        timestamp,
      })
    }

    if (frustrationMetrics.deadClicks >= THRESHOLDS.dead_clicks_critical) {
      alerts.push({
        key: 'dead_clicks_critical',
        severity: 'high',
        title: 'High Dead Click Volume',
        message: `${frustrationMetrics.deadClicks} dead clicks today. Users clicking non-interactive elements.`,
        metrics: frustrationMetrics,
        timestamp,
      })
    }
  }

  // Check backlog alerts
  if (backlogMetrics) {
    if (backlogMetrics.criticalUnprocessed >= THRESHOLDS.critical_bug_reports_unprocessed) {
      alerts.push({
        key: 'critical_feedback_unprocessed',
        severity: 'critical',
        title: 'Critical: Unprocessed Critical Feedback',
        message: `${backlogMetrics.criticalUnprocessed} critical priority item(s) awaiting review. Requires immediate attention.`,
        metrics: backlogMetrics,
        timestamp,
      })
    }

    if (backlogMetrics.unprocessed >= THRESHOLDS.unprocessed_critical) {
      alerts.push({
        key: 'feedback_backlog_critical',
        severity: 'high',
        title: 'Feedback Backlog Growing',
        message: `${backlogMetrics.unprocessed} unprocessed feedback items. Risk of losing valuable user insights.`,
        metrics: backlogMetrics,
        timestamp,
      })
    } else if (backlogMetrics.unprocessed >= THRESHOLDS.unprocessed_warning) {
      alerts.push({
        key: 'feedback_backlog_warning',
        severity: 'medium',
        title: 'Feedback Backlog Building',
        message: `${backlogMetrics.unprocessed} unprocessed items. Consider scheduling triage time.`,
        metrics: backlogMetrics,
        timestamp,
      })
    }

    if (
      backlogMetrics.oldestHours &&
      backlogMetrics.oldestHours >= THRESHOLDS.oldest_unprocessed_hours_critical
    ) {
      alerts.push({
        key: 'feedback_aging_critical',
        severity: 'high',
        title: 'Stale Feedback Alert',
        message: `Oldest unprocessed feedback is ${Math.round(backlogMetrics.oldestHours)} hours old. SLA at risk.`,
        metrics: backlogMetrics,
        timestamp,
      })
    }
  }

  return {
    alerts,
    metrics: {
      nps: npsMetrics,
      frustration: frustrationMetrics,
      backlog: backlogMetrics,
    },
    checkedAt: timestamp,
  }
}

/**
 * Send alerts via configured channels
 */
export async function sendFeedbackAlerts(
  alerts: FeedbackAlert[]
): Promise<{ sent: number; failed: number }> {
  let sent = 0
  let failed = 0

  for (const alert of alerts) {
    try {
      // Send to Slack if configured
      const slackWebhook = process.env.FEEDBACK_ALERTS_SLACK_WEBHOOK
      if (slackWebhook) {
        const color =
          alert.severity === 'critical'
            ? '#dc2626'
            : alert.severity === 'high'
              ? '#ea580c'
              : alert.severity === 'medium'
                ? '#ca8a04'
                : '#64748b'

        await fetch(slackWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            attachments: [
              {
                color,
                title: alert.title,
                text: alert.message,
                fields: [
                  {
                    title: 'Severity',
                    value: alert.severity.toUpperCase(),
                    short: true,
                  },
                  {
                    title: 'Time',
                    value: new Date(alert.timestamp).toLocaleString(),
                    short: true,
                  },
                ],
                footer: 'Feedback Alerting Service',
              },
            ],
          }),
        })
        sent++
      }

      // Send email for critical alerts
      if (alert.severity === 'critical') {
        const adminEmails = process.env.ADMIN_EMAILS?.split(',') || []
        for (const email of adminEmails) {
          // Email sending would go here - integrate with existing NotificationService
          console.log(`[FEEDBACK_ALERT] Would send email to ${email.trim()}:`, {
            subject: `[CRITICAL] ${alert.title}`,
            body: alert.message,
          })
        }
      }

      // Log alert for audit purposes
      console.log('[FEEDBACK_ALERT]', {
        key: alert.key,
        severity: alert.severity,
        title: alert.title,
        metrics: alert.metrics,
      })
    } catch (error) {
      console.error(`Failed to send alert ${alert.key}:`, error)
      failed++
    }
  }

  return { sent, failed }
}

// ============================================================================
// Metric Gathering Functions
// ============================================================================

async function getNPSMetrics(days: number): Promise<NPSMetrics | null> {
  try {
    const { data, error } = await supabase.rpc('get_nps_detractor_rate', {
      p_days: days,
    })

    if (error || !data?.[0]) return null

    const row = data[0]
    return {
      total: row.total_nps,
      detractors: row.detractor_count,
      passives: row.passive_count,
      promoters: row.promoter_count,
      detractorRate: row.detractor_rate || 0,
      npsScore: row.nps_score || 0,
      period: `${days} days`,
    }
  } catch (error) {
    console.error('Failed to get NPS metrics:', error)
    return null
  }
}

async function getFrustrationMetrics(
  currentDays: number,
  compareDays: number
): Promise<FrustrationMetrics | null> {
  try {
    // Get current period
    const { data: currentData } = await supabase.rpc(
      'get_frustration_signal_rate',
      { p_days: currentDays }
    )

    // Get comparison period for trend calculation
    const { data: compareData } = await supabase.rpc(
      'get_frustration_signal_rate',
      { p_days: compareDays }
    )

    if (!currentData) return null

    let rageClicks = 0
    let deadClicks = 0
    let errors = 0
    let uniqueSessions = 0

    for (const row of currentData) {
      if (row.signal_type === 'rage_click') {
        rageClicks = row.count
        uniqueSessions += row.unique_sessions
      } else if (row.signal_type === 'dead_click') {
        deadClicks = row.count
      } else if (row.signal_type === 'error') {
        errors = row.count
      }
    }

    // Calculate comparison (7-day daily average)
    let compareRageClicks = 0
    let compareDeadClicks = 0

    if (compareData) {
      for (const row of compareData) {
        if (row.signal_type === 'rage_click') {
          compareRageClicks = row.daily_avg || row.count / compareDays
        } else if (row.signal_type === 'dead_click') {
          compareDeadClicks = row.daily_avg || row.count / compareDays
        }
      }
    }

    return {
      rageClicks,
      deadClicks,
      errors,
      uniqueSessions,
      rageClicksChange:
        compareRageClicks > 0
          ? ((rageClicks - compareRageClicks) / compareRageClicks) * 100
          : 0,
      deadClicksChange:
        compareDeadClicks > 0
          ? ((deadClicks - compareDeadClicks) / compareDeadClicks) * 100
          : 0,
      period: `${currentDays} day(s)`,
    }
  } catch (error) {
    console.error('Failed to get frustration metrics:', error)
    return null
  }
}

async function getBacklogMetrics(): Promise<BacklogMetrics | null> {
  try {
    const { data, error } = await supabase.rpc('get_feedback_triage_stats')

    if (error || !data) return null

    let unprocessed = 0
    let acknowledged = 0
    let inProgress = 0
    let criticalUnprocessed = 0
    let oldestHours: number | null = null

    for (const row of data) {
      switch (row.status) {
        case 'unprocessed':
          unprocessed = row.count
          criticalUnprocessed = row.critical_count || 0
          if (row.oldest_unprocessed) {
            oldestHours =
              (Date.now() - new Date(row.oldest_unprocessed).getTime()) /
              (1000 * 60 * 60)
          }
          break
        case 'acknowledged':
          acknowledged = row.count
          break
        case 'in_progress':
          inProgress = row.count
          break
      }
    }

    return {
      unprocessed,
      acknowledged,
      inProgress,
      criticalUnprocessed,
      oldestHours,
    }
  } catch (error) {
    console.error('Failed to get backlog metrics:', error)
    return null
  }
}

/**
 * Convenience function to check and send alerts in one call
 */
export async function runFeedbackAlertCheck(): Promise<{
  result: AlertCheckResult
  sent: number
  failed: number
}> {
  const result = await checkFeedbackAlerts()

  if (result.alerts.length > 0) {
    const { sent, failed } = await sendFeedbackAlerts(result.alerts)
    return { result, sent, failed }
  }

  return { result, sent: 0, failed: 0 }
}
