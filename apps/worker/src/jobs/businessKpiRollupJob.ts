import { pool } from '../services/database'
import { ServerLoggingService } from '../services/serverLoggingService'

const loggingService = ServerLoggingService.getInstance()

/**
 * Roll up business_events into business_kpi_daily.
 * Uses project timezone for date boundaries.
 * Creates separate rows per currency (uses event currency when present, else project default).
 *
 * @param backfillDays - Number of days to scan (default 2 for frequent runs, 7 for full backfill)
 */
export async function businessKpiRollupJob(backfillDays: number = 2): Promise<void> {
  if (!pool) {
    console.warn('[BusinessKpiRollup] No database pool available')
    return
  }

  try {
    // Roll up events per project, date, and currency
    // Events with payload.currency get their own row; events without use project default
    //
    // Event type aliases - keep in sync with src/shared/businessEventTypes.ts:
    //   - sessions: 'session_started' only (pageviews are separate, not inflated into sessions)
    //   - signups: 'signup' | 'user_signed_up' | 'account_created'
    //
    // Currency is normalized to uppercase to prevent 'usd'/'USD' creating separate rows
    const query = `
      INSERT INTO business_kpi_daily (
        project_id,
        date,
        currency_code,
        sessions,
        leads,
        signups,
        payments,
        refunds,
        revenue_cents,
        refunds_cents,
        created_at,
        updated_at
      )
      SELECT
        be.project_id,
        (be.occurred_at AT TIME ZONE p.timezone)::date AS date,
        UPPER(COALESCE(NULLIF(be.payload->>'currency', ''), p.currency_code)) AS currency_code,
        SUM(CASE WHEN event_type = 'session_started' THEN 1 ELSE 0 END) AS sessions,
        SUM(CASE WHEN event_type = 'lead_created' THEN 1 ELSE 0 END) AS leads,
        SUM(CASE WHEN event_type IN ('signup', 'user_signed_up', 'account_created') THEN 1 ELSE 0 END) AS signups,
        SUM(CASE WHEN event_type = 'payment_succeeded' THEN 1 ELSE 0 END) AS payments,
        SUM(CASE WHEN event_type = 'refund_issued' THEN 1 ELSE 0 END) AS refunds,
        SUM(CASE WHEN event_type = 'payment_succeeded'
          AND (payload->>'amount_cents') ~ '^[0-9]+$'
          THEN (payload->>'amount_cents')::bigint
          ELSE 0 END
        ) AS revenue_cents,
        SUM(CASE WHEN event_type = 'refund_issued'
          AND (payload->>'amount_cents') ~ '^[0-9]+$'
          THEN (payload->>'amount_cents')::bigint
          ELSE 0 END
        ) AS refunds_cents,
        NOW() AS created_at,
        NOW() AS updated_at
      FROM business_events be
      JOIN projects p ON p.id = be.project_id
      WHERE be.occurred_at >= NOW() - make_interval(days => $1)
      GROUP BY
        be.project_id,
        (be.occurred_at AT TIME ZONE p.timezone)::date,
        UPPER(COALESCE(NULLIF(be.payload->>'currency', ''), p.currency_code))
      ON CONFLICT (project_id, date, currency_code)
      DO UPDATE SET
        sessions = EXCLUDED.sessions,
        leads = EXCLUDED.leads,
        signups = EXCLUDED.signups,
        payments = EXCLUDED.payments,
        refunds = EXCLUDED.refunds,
        revenue_cents = EXCLUDED.revenue_cents,
        refunds_cents = EXCLUDED.refunds_cents,
        updated_at = NOW()
    `

    await pool.query(query, [backfillDays])
    console.log(`[BusinessKpiRollup] Completed rollup (last ${backfillDays} days)`)
  } catch (error) {
    const err = error as Error
    console.error('[BusinessKpiRollup] Failed:', err)
    await loggingService.logCriticalError('business_kpi_rollup_failed', err, {
      job: 'business-kpi-rollup',
      schedule: '*/15 * * * *'
    })
  }
}
