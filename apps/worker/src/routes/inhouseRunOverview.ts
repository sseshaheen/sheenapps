/**
 * In-House Run Overview Routes
 *
 * Aggregated run dashboard endpoint that consolidates KPIs, alerts, trends,
 * and last event into a single worker call. Follows the emailOverview pattern.
 *
 * Previously, the Next.js proxy made 5 separate worker calls and aggregated
 * client-side. This moves the aggregation to the worker for a single
 * network round-trip.
 *
 * Routes:
 * - GET /v1/inhouse/projects/:projectId/run/overview - Aggregated run stats
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getBusinessKpiService } from '../services/businessKpiService'
import { getRunAlertsService } from '../services/runAlertsService'
import { getBusinessEventsService } from '../services/businessEventsService'
import { getPool } from '../services/database'
import { getInhouseProjectService } from '../services/inhouse/InhouseProjectService'

export async function inhouseRunOverviewRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId?: string; date?: string }
  }>('/v1/inhouse/projects/:projectId/run/overview', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'MISSING_USER_ID', message: 'userId is required' },
      })
    }

    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    const pool = getPool()

    // Get project timezone for date calculations
    // This ensures KPIs and alerts use the same day boundaries
    let projectTimezone = 'UTC'
    try {
      const tzResult = await pool.query(
        `SELECT COALESCE(timezone, 'UTC') AS timezone FROM projects WHERE id = $1`,
        [projectId]
      )
      projectTimezone = tzResult.rows[0]?.timezone || 'UTC'
    } catch {
      // Fall back to UTC if timezone lookup fails
    }

    // Validate and default date (using project timezone, not UTC)
    const dateParam = request.query.date
    let date: string
    if (dateParam) {
      date = dateParam
    } else {
      // Compute "today" in project timezone
      const tzResult = await pool.query(
        `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM-DD') AS today`,
        [projectTimezone]
      )
      date = tzResult.rows[0]?.today || new Date().toISOString().slice(0, 10)
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid date format. Use YYYY-MM-DD.' },
      })
    }

    // Calculate previous date for comparison (7 days ago)
    const previousDate = new Date(date)
    previousDate.setDate(previousDate.getDate() - 7)
    const previousDateStr = previousDate.toISOString().slice(0, 10)

    try {
      const kpiService = getBusinessKpiService()
      const alertsService = getRunAlertsService()
      const eventsService = getBusinessEventsService()
      const projectService = getInhouseProjectService()

      // Run all queries in parallel locally (no network round-trips)
      const [
        currentKpis, previousKpis, alerts, lastEventResult, trendData,
        alertCounts, lastRollupResult, workflowStatusResult, digestMetricsResult,
        currentKpisMulti, previousKpisMulti, quotaResult,
        stripeKeyResult, formsResult,
      ] = await Promise.allSettled([
        kpiService.getDaily(projectId, date),
        kpiService.getDaily(projectId, previousDateStr),
        alertsService.listAlerts(projectId, 7),
        eventsService.listEvents(projectId, { limit: 1 }),
        kpiService.getTrend(projectId, 7),
        // 6. Alert event counts for alert computation (using project timezone for day boundaries)
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE event_type = 'payment_failed') AS payment_failed_count,
             COUNT(*) FILTER (WHERE event_type = 'checkout_started') AS checkout_started_count
           FROM business_events be
           JOIN projects p ON p.id = be.project_id
           WHERE be.project_id = $1
             AND date(be.occurred_at AT TIME ZONE p.timezone) = $2::date`,
          [projectId, date]
        ),
        // 7. Last KPI rollup timestamp (data freshness indicator)
        pool.query(
          `SELECT MAX(updated_at) AS last_rollup_at
           FROM business_kpi_daily
           WHERE project_id = $1`,
          [projectId]
        ),
        // 8. Workflow run status counts (last 7 days)
        pool.query(
          `SELECT
             status,
             COUNT(*)::int AS count
           FROM workflow_runs
           WHERE project_id = $1
             AND created_at > now() - interval '7 days'
           GROUP BY status`,
          [projectId]
        ),
        // 9. Digest delivery metrics by locale (last 30 days)
        pool.query(
          `SELECT
             COALESCE(locale, 'en') AS locale,
             status,
             COUNT(*)::int AS count
           FROM inhouse_emails
           WHERE project_id = $1
             AND template_name = 'daily_digest'
             AND created_at > now() - interval '30 days'
           GROUP BY locale, status`,
          [projectId]
        ),
        // 10. Multi-currency KPIs (current + previous)
        kpiService.getDailyMultiCurrency(projectId, date),
        kpiService.getDailyMultiCurrency(projectId, previousDateStr),
        // 11. Project quota status (database, storage, requests)
        projectService.getQuotaStatus(projectId),
        // 12. Has Stripe key? (integration status)
        pool.query(
          `SELECT 1 FROM inhouse_secrets WHERE project_id = $1 AND name = 'stripe_secret_key' LIMIT 1`,
          [projectId]
        ),
        // 13. Has any forms? (integration status)
        pool.query(
          `SELECT 1 FROM inhouse_forms WHERE project_id = $1 LIMIT 1`,
          [projectId]
        ),
      ])

      // Current KPIs are required
      if (currentKpis.status === 'rejected') {
        request.log.error({ error: currentKpis.reason, projectId }, 'Failed to fetch current KPIs')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch KPIs' },
        })
      }

      // Alerts are required
      if (alerts.status === 'rejected') {
        request.log.error({ error: alerts.reason, projectId }, 'Failed to fetch alerts')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch alerts' },
        })
      }

      // Extract optional results (gracefully handle failures)
      const prevKpis = previousKpis.status === 'fulfilled' ? previousKpis.value : null

      const lastEventAt = lastEventResult.status === 'fulfilled'
        ? lastEventResult.value?.events?.[0]?.occurredAt ?? null
        : null

      // Transform trend data to arrays for sparkline consumption
      let trends: Record<string, (string | number)[]> | null = null
      if (trendData.status === 'fulfilled' && trendData.value) {
        trends = {
          dates: trendData.value.map(d => d.date),
          revenue: trendData.value.map(d => d.revenueCents),
          leads: trendData.value.map(d => d.leads),
          signups: trendData.value.map(d => d.signups),
          payments: trendData.value.map(d => d.payments),
          sessions: trendData.value.map(d => d.sessions),
        }
      }

      // Extract alert counts (gracefully default to 0)
      const paymentFailedCount = alertCounts.status === 'fulfilled'
        ? parseInt(alertCounts.value.rows[0]?.payment_failed_count ?? '0', 10)
        : 0
      const checkoutStartedCount = alertCounts.status === 'fulfilled'
        ? parseInt(alertCounts.value.rows[0]?.checkout_started_count ?? '0', 10)
        : 0

      // Extract last rollup timestamp (data freshness)
      const lastRollupAt = lastRollupResult.status === 'fulfilled'
        ? lastRollupResult.value.rows[0]?.last_rollup_at?.toISOString() ?? null
        : null

      // Extract workflow status counts (last 7 days)
      let workflowCounts: Record<string, number> | null = null
      if (workflowStatusResult.status === 'fulfilled') {
        workflowCounts = {}
        for (const row of workflowStatusResult.value.rows) {
          workflowCounts[row.status] = row.count
        }
      }

      // Check for stuck workflow runs (running past lease expiry)
      let stuckRunCount = 0
      if (workflowCounts && (workflowCounts['running'] ?? 0) > 0) {
        // Check if any running runs have expired leases
        try {
          const stuckResult = await pool.query(
            `SELECT COUNT(*)::int AS count
             FROM workflow_runs
             WHERE project_id = $1
               AND status = 'running'
               AND lease_expires_at < now()`,
            [projectId]
          )
          stuckRunCount = stuckResult.rows[0]?.count ?? 0
        } catch {
          // Non-critical, ignore
        }
      }

      // Extract digest metrics by locale (last 30 days)
      let digestMetrics: Array<{ locale: string; status: string; count: number }> | null = null
      if (digestMetricsResult.status === 'fulfilled') {
        digestMetrics = digestMetricsResult.value.rows.map((row: Record<string, unknown>) => ({
          locale: row.locale as string,
          status: row.status as string,
          count: row.count as number,
        }))
      }

      // Extract multi-currency KPIs (gracefully handle failures)
      const multiCurrencyKpis = currentKpisMulti.status === 'fulfilled' ? currentKpisMulti.value : null
      const multiCurrencyPrevious = previousKpisMulti.status === 'fulfilled' ? previousKpisMulti.value : null

      // Extract quota status (gracefully handle failures)
      const quotas = quotaResult.status === 'fulfilled' ? quotaResult.value : null

      // Extract integration status (gracefully default to false)
      const hasStripe = stripeKeyResult.status === 'fulfilled'
        ? (stripeKeyResult.value.rows?.length ?? 0) > 0
        : false
      const hasForms = formsResult.status === 'fulfilled'
        ? (formsResult.value.rows?.length ?? 0) > 0
        : false

      const failures: string[] = []
      if (previousKpis.status === 'rejected') failures.push('previousKpis')
      if (lastEventResult.status === 'rejected') failures.push('lastEvent')
      if (trendData.status === 'rejected') failures.push('trends')
      if (alertCounts.status === 'rejected') failures.push('alertCounts')
      if (lastRollupResult.status === 'rejected') failures.push('lastRollupAt')
      if (workflowStatusResult.status === 'rejected') failures.push('workflowCounts')
      if (digestMetricsResult.status === 'rejected') failures.push('digestMetrics')
      if (currentKpisMulti.status === 'rejected') failures.push('multiCurrencyKpis')
      if (previousKpisMulti.status === 'rejected') failures.push('multiCurrencyPrevious')
      if (quotaResult.status === 'rejected') failures.push('quotas')
      if (stripeKeyResult.status === 'rejected') failures.push('integrations.payments')
      if (formsResult.status === 'rejected') failures.push('integrations.forms')

      return reply.code(200).send({
        ok: true,
        data: {
          kpis: currentKpis.value,
          alerts: alerts.value,
          previousKpis: prevKpis,
          lastEventAt,
          trends,
          alertCounts: {
            paymentFailedCount,
            checkoutStartedCount,
          },
          // Phase 2.5: Observability
          lastRollupAt,
          workflowCounts,
          stuckRunCount,
          digestMetrics,
          // Multi-currency support
          multiCurrencyKpis,
          multiCurrencyPrevious,
          // Quota usage
          quotas,
          // Integration status (Phase 4)
          integrations: {
            tracking: !!lastEventAt,
            payments: hasStripe,
            forms: hasForms,
          },
        },
        meta: failures.length > 0 ? { partial: true, failures } : undefined,
      })
    } catch (error) {
      request.log.error({ error, projectId, userId }, 'Failed to fetch run overview')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch run overview' },
      })
    }
  })
}
