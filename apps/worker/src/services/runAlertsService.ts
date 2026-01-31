import { Pool } from 'pg'
import { getPool } from './database'

export type AlertType =
  | 'payment_failed'
  | 'build_failed'
  | 'abandoned_checkout'
  | 'low_bookings'
  | 'refund_spike'
  | 'churn_risk'

export interface RunAlert {
  type: AlertType
  title: string
  description?: string | null
  occurredAt: string
  metadata?: Record<string, unknown>
}

// Industry tags that should receive specific alert types
const LOW_BOOKINGS_INDUSTRIES = ['restaurant', 'services', 'fitness']
const REFUND_SPIKE_INDUSTRIES = ['ecommerce']
const CHURN_RISK_INDUSTRIES = ['saas', 'fitness']

export class RunAlertsService {
  private pool: Pool

  constructor() {
    this.pool = getPool()
  }

  async listAlerts(projectId: string, days = 7): Promise<RunAlert[]> {
    const alerts: RunAlert[] = []

    // Get project's industry tag for industry-specific alerts
    const projectResult = await this.pool.query(
      `SELECT industry_tag FROM projects WHERE id = $1`,
      [projectId]
    )
    const industryTag: string | null = projectResult.rows[0]?.industry_tag || null

    // Failed payment events (parameterized interval for safety)
    const payments = await this.pool.query(
      `
        SELECT stripe_event_id, event_type, created_at
        FROM inhouse_payment_events
        WHERE project_id = $1
          AND status = 'failed'
          AND created_at >= NOW() - make_interval(days => $2)
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [projectId, days]
    )

    for (const row of payments.rows) {
      alerts.push({
        type: 'payment_failed',
        title: 'Payment failed',
        description: row.event_type,
        occurredAt: row.created_at.toISOString(),
        metadata: { stripeEventId: row.stripe_event_id }
      })
    }

    // Build failures (parameterized interval for safety)
    const builds = await this.pool.query(
      `
        SELECT event_code, event_title, event_description, created_at
        FROM project_build_events
        WHERE project_id = $1
          AND event_type = 'failed'
          AND created_at >= NOW() - make_interval(days => $2)
        ORDER BY created_at DESC
        LIMIT 50
      `,
      [projectId, days]
    )

    for (const row of builds.rows) {
      alerts.push({
        type: 'build_failed',
        title: row.event_title || 'Build failed',
        description: row.event_description || null,
        occurredAt: row.created_at.toISOString(),
        metadata: { eventCode: row.event_code }
      })
    }

    // Abandoned checkouts: checkout_started without payment_succeeded within 24h
    // Uses session_id or correlation_id to match checkout → payment flow
    const abandonedCheckouts = await this.pool.query(
      `
        SELECT
          cs.public_id,
          cs.occurred_at,
          cs.session_id,
          cs.correlation_id,
          cs.payload
        FROM business_events cs
        WHERE cs.project_id = $1
          AND cs.event_type = 'checkout_started'
          AND cs.occurred_at >= NOW() - make_interval(days => $2)
          AND cs.occurred_at <= NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM business_events ps
            WHERE ps.project_id = cs.project_id
              AND ps.event_type = 'payment_succeeded'
              AND ps.occurred_at > cs.occurred_at
              AND ps.occurred_at <= cs.occurred_at + INTERVAL '24 hours'
              AND (
                (cs.session_id IS NOT NULL AND ps.session_id = cs.session_id)
                OR (cs.correlation_id IS NOT NULL AND ps.correlation_id = cs.correlation_id)
                OR (cs.anonymous_id IS NOT NULL AND ps.anonymous_id = cs.anonymous_id)
              )
          )
        ORDER BY cs.occurred_at DESC
        LIMIT 50
      `,
      [projectId, days]
    )

    for (const row of abandonedCheckouts.rows) {
      const amount = row.payload?.amount_cents
        ? `${((row.payload.amount_cents as number) / 100).toFixed(2)} ${row.payload.currency || ''}`.trim()
        : null
      alerts.push({
        type: 'abandoned_checkout',
        title: 'Abandoned checkout',
        description: amount ? `Cart value: ${amount}` : null,
        occurredAt: row.occurred_at.toISOString(),
        metadata: {
          publicId: row.public_id,
          sessionId: row.session_id,
          correlationId: row.correlation_id
        }
      })
    }

    // Low bookings alert: for service industries, detect when recent bookings
    // are significantly below the 30-day average
    if (industryTag && LOW_BOOKINGS_INDUSTRIES.includes(industryTag)) {
      const lowBookings = await this.pool.query(
        `
          WITH daily_counts AS (
            SELECT
              DATE(occurred_at) AS day,
              COUNT(*) AS cnt
            FROM business_events
            WHERE project_id = $1
              AND event_type IN ('lead_captured', 'booking_created', 'appointment_scheduled')
              AND occurred_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(occurred_at)
          ),
          stats AS (
            SELECT
              AVG(cnt) AS avg_daily,
              STDDEV(cnt) AS stddev_daily
            FROM daily_counts
            WHERE day < CURRENT_DATE - INTERVAL '1 day'
          )
          SELECT
            dc.day,
            dc.cnt,
            s.avg_daily,
            s.stddev_daily
          FROM daily_counts dc
          CROSS JOIN stats s
          WHERE dc.day >= CURRENT_DATE - make_interval(days => $2)
            AND dc.cnt < GREATEST(s.avg_daily - s.stddev_daily, s.avg_daily * 0.5)
            AND s.avg_daily > 0
          ORDER BY dc.day DESC
          LIMIT 10
        `,
        [projectId, days]
      )

      for (const row of lowBookings.rows) {
        const pctBelow = row.avg_daily > 0
          ? Math.round((1 - row.cnt / row.avg_daily) * 100)
          : 0
        alerts.push({
          type: 'low_bookings',
          title: 'Low bookings',
          description: `${pctBelow}% below average (${row.cnt} vs ${Math.round(row.avg_daily)} avg)`,
          occurredAt: new Date(row.day).toISOString(),
          metadata: {
            count: row.cnt,
            avgDaily: Math.round(row.avg_daily),
            pctBelow
          }
        })
      }
    }

    // Refund spike alert: for ecommerce, detect when refunds exceed normal levels
    if (industryTag && REFUND_SPIKE_INDUSTRIES.includes(industryTag)) {
      const refundSpike = await this.pool.query(
        `
          WITH daily_refunds AS (
            SELECT
              DATE(created_at) AS day,
              COUNT(*) AS refund_count,
              SUM(CASE WHEN (payload->>'amount_cents') ~ '^[0-9]+$'
                  THEN (payload->>'amount_cents')::numeric / 100 ELSE 0 END) AS refund_amount
            FROM inhouse_payment_events
            WHERE project_id = $1
              AND event_type LIKE '%refund%'
              AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
          ),
          stats AS (
            SELECT
              AVG(refund_count) AS avg_count,
              AVG(refund_amount) AS avg_amount,
              STDDEV(refund_count) AS stddev_count
            FROM daily_refunds
            WHERE day < CURRENT_DATE - INTERVAL '1 day'
          )
          SELECT
            dr.day,
            dr.refund_count,
            dr.refund_amount,
            s.avg_count,
            s.avg_amount,
            s.stddev_count
          FROM daily_refunds dr
          CROSS JOIN stats s
          WHERE dr.day >= CURRENT_DATE - make_interval(days => $2)
            AND dr.refund_count > GREATEST(s.avg_count + s.stddev_count, s.avg_count * 1.5, 3)
          ORDER BY dr.day DESC
          LIMIT 10
        `,
        [projectId, days]
      )

      for (const row of refundSpike.rows) {
        const pctAbove = row.avg_count > 0
          ? Math.round((row.refund_count / row.avg_count - 1) * 100)
          : 0
        alerts.push({
          type: 'refund_spike',
          title: 'Refund spike',
          description: `${row.refund_count} refunds (${pctAbove}% above average)`,
          occurredAt: new Date(row.day).toISOString(),
          metadata: {
            count: row.refund_count,
            amount: Math.round(row.refund_amount),
            avgCount: Math.round(row.avg_count || 0),
            pctAbove
          }
        })
      }
    }

    // Churn risk alert: for subscription businesses, detect cancellation events
    if (industryTag && CHURN_RISK_INDUSTRIES.includes(industryTag)) {
      const churnRisk = await this.pool.query(
        `
          SELECT
            public_id,
            occurred_at,
            payload,
            user_id,
            anonymous_id
          FROM business_events
          WHERE project_id = $1
            AND event_type IN ('subscription_canceled', 'membership_canceled', 'plan_downgraded')
            AND occurred_at >= NOW() - make_interval(days => $2)
          ORDER BY occurred_at DESC
          LIMIT 50
        `,
        [projectId, days]
      )

      for (const row of churnRisk.rows) {
        const planName = row.payload?.plan_name || row.payload?.membership_type || null
        alerts.push({
          type: 'churn_risk',
          title: 'Churn risk',
          description: planName ? `${planName} canceled` : 'Subscription canceled',
          occurredAt: row.occurred_at.toISOString(),
          metadata: {
            publicId: row.public_id,
            userId: row.user_id,
            anonymousId: row.anonymous_id,
            payload: row.payload
          }
        })
      }
    }

    return alerts
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

let instance: RunAlertsService | null = null

export function getRunAlertsService(): RunAlertsService {
  if (!instance) {
    instance = new RunAlertsService()
  }
  return instance
}

/** Reset singleton for testing */
export function resetRunAlertsServiceInstance(): void {
  instance = null
}
