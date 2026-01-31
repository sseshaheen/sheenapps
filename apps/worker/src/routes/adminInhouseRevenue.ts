/**
 * Admin In-House Revenue Routes
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'

interface RevenueSummaryQuery {
  period?: 'month' | 'quarter' | 'year'
}

interface TopProjectsQuery {
  limit?: string
}

interface ChurnQuery {
  period?: 'month' | 'quarter'
}

function resolvePeriodStart(period: 'month' | 'quarter' | 'year') {
  const now = new Date()
  if (period === 'year') {
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  }
  if (period === 'quarter') {
    const quarter = Math.floor(now.getUTCMonth() / 3)
    return new Date(Date.UTC(now.getUTCFullYear(), quarter * 3, 1))
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export default async function adminInhouseRevenueRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/revenue/summary
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: RevenueSummaryQuery }>(
    '/v1/admin/inhouse/revenue/summary',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()

        const { totals, projectCount } = await withStatementTimeout(db, '5s', async (client) => {
          const totalsResult = await client.query(
            `WITH inhouse_owners AS (
              SELECT DISTINCT owner_id FROM projects WHERE infra_mode = 'easy'
            ), active_subs AS (
              SELECT bs.*, bc.user_id
              FROM billing_subscriptions bs
              JOIN billing_customers bc ON bc.id = bs.customer_id
              JOIN inhouse_owners io ON io.owner_id = bc.user_id
              WHERE bs.status = 'active'
            )
            SELECT
              COALESCE(SUM(CASE WHEN billing_interval = 'year' THEN amount_cents / 12.0 ELSE amount_cents END), 0) AS mrr_cents,
              COALESCE(SUM(CASE WHEN billing_interval = 'year' THEN amount_cents ELSE amount_cents * 12 END), 0) AS arr_cents,
              COUNT(DISTINCT user_id) AS customer_count
            FROM active_subs`
          )

          const projectCountResult = await client.query(
            `SELECT COUNT(*)::int AS project_count FROM projects WHERE infra_mode = 'easy'`
          )

          return {
            totals: totalsResult.rows[0],
            projectCount: projectCountResult.rows[0]?.project_count || 0,
          }
        })

        const mrrCents = Math.round(Number(totals?.mrr_cents || 0))
        const arrCents = Math.round(Number(totals?.arr_cents || 0))
        const customerCount = Number(totals?.customer_count || 0)
        const avgRevenuePerProject = projectCount > 0 ? Math.round(mrrCents / projectCount) : 0

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'revenue_summary',
          resourceType: 'revenue',
          metadata: { mrrCents, arrCents, customerCount, projectCount },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            mrr_cents: mrrCents,
            arr_cents: arrCents,
            customer_count: customerCount,
            project_count: projectCount,
            avg_revenue_per_project_cents: avgRevenuePerProject,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch revenue summary')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch revenue summary',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/revenue/by-plan
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/admin/inhouse/revenue/by-plan',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()

        const plans = await withStatementTimeout(db, '5s', async (client) => {
          const result = await client.query(
            `WITH inhouse_owners AS (
              SELECT DISTINCT owner_id FROM projects WHERE infra_mode = 'easy'
            ), active_subs AS (
              SELECT bs.*, bc.user_id
              FROM billing_subscriptions bs
              JOIN billing_customers bc ON bc.id = bs.customer_id
              JOIN inhouse_owners io ON io.owner_id = bc.user_id
              WHERE bs.status = 'active'
            )
            SELECT
              bs.plan_key,
              pi.display_name,
              COALESCE(SUM(CASE WHEN bs.billing_interval = 'year' THEN bs.amount_cents / 12.0 ELSE bs.amount_cents END), 0) AS mrr_cents,
              COUNT(DISTINCT bs.customer_id) AS customer_count
            FROM active_subs bs
            LEFT JOIN pricing_items pi ON pi.id = bs.pricing_item_id
            GROUP BY bs.plan_key, pi.display_name
            ORDER BY mrr_cents DESC`
          )
          return result.rows
        })

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'revenue_by_plan',
          resourceType: 'revenue',
          metadata: { planCount: plans.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { plans } })
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch revenue by plan')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch revenue by plan',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/revenue/top-projects
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: TopProjectsQuery }>(
    '/v1/admin/inhouse/revenue/top-projects',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const { limit } = parseLimitOffset(request.query.limit, undefined)

        const projects = await withStatementTimeout(db, '5s', async (client) => {
          const result = await client.query(
            `WITH inhouse_projects AS (
              SELECT DISTINCT ON (owner_id)
                id,
                name,
                owner_id,
                created_at
              FROM projects
              WHERE infra_mode = 'easy'
              ORDER BY owner_id, created_at DESC
            ), active_subs AS (
              SELECT bs.*, bc.user_id
              FROM billing_subscriptions bs
              JOIN billing_customers bc ON bc.id = bs.customer_id
              WHERE bs.status = 'active'
            )
            SELECT
              p.id as project_id,
              p.name as project_name,
              COALESCE(SUM(CASE WHEN s.billing_interval = 'year' THEN s.amount_cents / 12.0 ELSE s.amount_cents END), 0) AS mrr_cents,
              COUNT(DISTINCT s.id) AS subscriptions
            FROM inhouse_projects p
            JOIN active_subs s ON s.user_id = p.owner_id
            GROUP BY p.id, p.name
            ORDER BY mrr_cents DESC
            LIMIT $1`,
            [limit]
          )
          return result.rows
        })

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'revenue_top_projects',
          resourceType: 'revenue',
          metadata: { resultCount: projects.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { projects } })
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch top projects')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch top projects',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/revenue/churn
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: ChurnQuery }>(
    '/v1/admin/inhouse/revenue/churn',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const period = request.query.period || 'month'
        const periodStart = resolvePeriodStart(period)

        const churnStats = await withStatementTimeout(db, '5s', async (client) => {
          const result = await client.query(
            `WITH inhouse_owners AS (
              SELECT DISTINCT owner_id FROM projects WHERE infra_mode = 'easy'
            ), active_subs AS (
              SELECT bs.*, bc.user_id
              FROM billing_subscriptions bs
              JOIN billing_customers bc ON bc.id = bs.customer_id
              JOIN inhouse_owners io ON io.owner_id = bc.user_id
              WHERE bs.status = 'active'
            ), churned_subs AS (
              SELECT bs.*, bc.user_id
              FROM billing_subscriptions bs
              JOIN billing_customers bc ON bc.id = bs.customer_id
              JOIN inhouse_owners io ON io.owner_id = bc.user_id
              WHERE bs.status IN ('canceled', 'cancelled')
                AND bs.canceled_at >= $1
            )
            SELECT
              (SELECT COUNT(DISTINCT user_id) FROM active_subs) AS active_count,
              (SELECT COUNT(DISTINCT user_id) FROM churned_subs) AS churned_count`,
            [periodStart.toISOString()]
          )
          return result.rows[0]
        })

        const activeCount = Number(churnStats?.active_count || 0)
        const churnedCount = Number(churnStats?.churned_count || 0)
        const denominator = activeCount + churnedCount
        const churnRate = denominator > 0 ? churnedCount / denominator : 0

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'revenue_churn',
          resourceType: 'revenue',
          metadata: { period, activeCount, churnedCount },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            period,
            active_count: activeCount,
            churned_count: churnedCount,
            churn_rate: churnRate,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch churn stats')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch churn stats',
        })
      }
    }
  )
}
