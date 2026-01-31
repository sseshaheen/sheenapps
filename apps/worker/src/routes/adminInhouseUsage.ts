/**
 * Admin In-House Usage + Quota Routes
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseMeteringService } from '../services/inhouse/InhouseMeteringService'

interface UsageOverviewQuery {
  period?: 'day' | 'week' | 'month'
}

interface UsageProjectQuery {
  period?: 'day' | 'week' | 'month'
}

interface ApproachingLimitsQuery {
  threshold?: string
}

interface OverrideBody {
  metric: string
  newLimit: number
  reason: string
  expiresAt?: string
}

interface AdjustmentBody {
  metric: string
  delta: number
  reason: string
}

function resolvePeriodBounds(period: 'day' | 'week' | 'month') {
  const now = new Date()
  if (period === 'day') {
    return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now }
  }
  if (period === 'week') {
    return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now }
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0))
  return { start, end: now }
}

const METRIC_TO_PLAN_LIMIT: Record<string, string> = {
  storage_bytes: 'maxStorageBytes',
  job_runs: 'maxJobRunsMonthly',
  email_sends: 'maxEmailSendsMonthly',
  ai_operations: 'maxAiOperationsMonthly',
  exports: 'maxExportsMonthly',
}

export default async function adminInhouseUsageRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/usage/overview
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: UsageOverviewQuery }>(
    '/v1/admin/inhouse/usage/overview',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const period = request.query.period || 'month'
        const { start, end } = resolvePeriodBounds(period)

        const { totals, byProject } = await withStatementTimeout(db, '5s', async (client) => {
          const totalsResult = await client.query(
            `SELECT metric, SUM(delta)::bigint AS total
             FROM inhouse_usage_events
             WHERE created_at >= $1 AND created_at < $2
             GROUP BY metric`,
            [start.toISOString(), end.toISOString()]
          )

          const byProjectResult = await client.query(
            `SELECT e.project_id, p.name as project_name, e.metric, SUM(e.delta)::bigint AS total
             FROM inhouse_usage_events e
             LEFT JOIN projects p ON p.id = e.project_id
             WHERE e.created_at >= $1 AND e.created_at < $2
             GROUP BY e.project_id, p.name, e.metric
             ORDER BY total DESC`,
            [start.toISOString(), end.toISOString()]
          )

          return { totals: totalsResult.rows, byProject: byProjectResult.rows }
        })

        const totalsMap: Record<string, number> = {}
        for (const row of totals) {
          totalsMap[row.metric] = Number(row.total)
        }

        const byProjectMap = new Map<string, { projectId: string; projectName: string | null; metrics: Record<string, number> }>()
        for (const row of byProject || []) {
          const existing = byProjectMap.get(row.project_id) || {
            projectId: row.project_id,
            projectName: row.project_name || null,
            metrics: {} as Record<string, number>,
          }
          const metricKey = String(row.metric)
          existing.metrics[metricKey] = Number(row.total)
          byProjectMap.set(row.project_id, existing)
        }

        const adminRequest = request as AdminRequest
        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'usage_overview',
          resourceType: 'usage',
          metadata: { period },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            period,
            totals: totalsMap,
            byProject: Array.from(byProjectMap.values()),
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to load usage overview')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load usage overview',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/usage/projects/:projectId
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string }; Querystring: UsageProjectQuery }>(
    '/v1/admin/inhouse/usage/projects/:projectId',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const { projectId } = request.params
        const period = request.query.period || 'month'
        const { start, end } = resolvePeriodBounds(period)

        const { rows: totals } = await db.query(
          `SELECT metric, SUM(delta)::bigint AS total
           FROM inhouse_usage_events
           WHERE project_id = $1 AND created_at >= $2 AND created_at < $3
           GROUP BY metric`,
          [projectId, start.toISOString(), end.toISOString()]
        )

        const { rows: trends } = await db.query(
          `SELECT metric,
                  date_trunc('day', created_at) as day,
                  SUM(delta)::bigint AS total
           FROM inhouse_usage_events
           WHERE project_id = $1 AND created_at >= $2 AND created_at < $3
           GROUP BY metric, day
           ORDER BY day ASC`,
          [projectId, start.toISOString(), end.toISOString()]
        )

        const totalsMap: Record<string, number> = {}
        for (const row of totals) {
          totalsMap[row.metric] = Number(row.total)
        }

        const adminRequest = request as AdminRequest
        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'usage_project',
          projectId,
          resourceType: 'usage',
          resourceId: projectId,
          metadata: { period },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            period,
            totals: totalsMap,
            trends,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to load project usage')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load project usage',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/usage/approaching-limits
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: ApproachingLimitsQuery }>(
    '/v1/admin/inhouse/usage/approaching-limits',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const threshold = Math.min(Math.max(parseFloat(request.query.threshold || '0.9'), 0.5), 0.99)

        const { rows } = await db.query(
          `SELECT p.id as project_id, p.name as project_name,
                  q.storage_size_used_bytes, q.storage_size_limit_bytes,
                  q.requests_used_today, q.requests_limit_daily
           FROM inhouse_quotas q
           JOIN projects p ON p.id = q.project_id`
        )

        const projects = rows
          .map((row) => {
            const storagePercent = row.storage_size_limit_bytes > 0
              ? row.storage_size_used_bytes / row.storage_size_limit_bytes
              : 0
            const requestPercent = row.requests_limit_daily > 0
              ? row.requests_used_today / row.requests_limit_daily
              : 0
            const maxPercent = Math.max(storagePercent, requestPercent)
            return {
              projectId: row.project_id,
              projectName: row.project_name,
              metric: storagePercent >= requestPercent ? 'storage_bytes' : 'requests_daily',
              usage: storagePercent >= requestPercent ? row.storage_size_used_bytes : row.requests_used_today,
              limit: storagePercent >= requestPercent ? row.storage_size_limit_bytes : row.requests_limit_daily,
              percentUsed: maxPercent,
            }
          })
          .filter((row) => row.percentUsed >= threshold)
          .sort((a, b) => b.percentUsed - a.percentUsed)

        const adminRequest = request as AdminRequest
        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'usage_approaching_limits',
          resourceType: 'usage',
          metadata: { threshold, resultCount: projects.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: { projects },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to load approaching limits')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load approaching limits',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/quotas/projects/:projectId
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string } }>(
    '/v1/admin/inhouse/quotas/projects/:projectId',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const { projectId } = request.params
        const quotaResult = await db.query(
          `SELECT * FROM inhouse_quotas WHERE project_id = $1`,
          [projectId]
        )

        const overridesResult = await db.query(
          `SELECT * FROM inhouse_quota_overrides
           WHERE project_id = $1
           ORDER BY created_at DESC`,
          [projectId]
        )

        const adjustmentsResult = await db.query(
          `SELECT * FROM inhouse_usage_events
           WHERE project_id = $1 AND actor_type = 'admin'
           ORDER BY created_at DESC
           LIMIT 100`,
          [projectId]
        )

        const adminRequest = request as AdminRequest
        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'quota_project',
          projectId,
          resourceType: 'quota',
          resourceId: projectId,
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            quotas: quotaResult.rows[0] || null,
            overrides: overridesResult.rows,
            adjustments: adjustmentsResult.rows,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to load quotas')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load quotas',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/quotas/projects/:projectId/override
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { projectId: string }; Body: OverrideBody }>(
    '/v1/admin/inhouse/quotas/projects/:projectId/override',
    { preHandler: writeMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { projectId } = request.params
      const { metric, newLimit, reason, expiresAt } = request.body

      if (!metric || !reason) {
        return reply.status(400).send({ success: false, error: 'metric and reason are required' })
      }

      try {
        const db = requirePool()
        const meteringService = getInhouseMeteringService()
        const ownerId = await meteringService.getProjectOwnerId(projectId)
        let originalLimit = newLimit

        if (ownerId) {
          const plan = await meteringService.getUserPlan(ownerId)
          const limits = meteringService.getPlanLimits(plan)
          const limitField = METRIC_TO_PLAN_LIMIT[metric]
          if (limitField && (limits as any)[limitField] !== undefined) {
            originalLimit = (limits as any)[limitField]
          }
        }

        const result = await db.query(
          `INSERT INTO inhouse_quota_overrides
           (project_id, metric, original_limit, new_limit, reason, created_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [projectId, metric, originalLimit, newLimit, reason, adminRequest.adminClaims.sub, expiresAt || null]
        )

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'quota_override',
          projectId,
          resourceType: 'quota_override',
          resourceId: result.rows[0]?.id || null,
          reason,
          metadata: { metric, newLimit },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { overrideId: result.rows[0]?.id } })
      } catch (error) {
        request.log.error({ error }, 'Failed to create quota override')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create override',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/quotas/projects/:projectId/adjust
  // -------------------------------------------------------------------------
  fastify.post<{ Params: { projectId: string }; Body: AdjustmentBody }>(
    '/v1/admin/inhouse/quotas/projects/:projectId/adjust',
    { preHandler: writeMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { projectId } = request.params
      const { metric, delta, reason } = request.body

      if (!metric || typeof delta !== 'number' || !reason) {
        return reply.status(400).send({ success: false, error: 'metric, delta, and reason are required' })
      }

      try {
        const db = requirePool()
        const periodStart = new Date()
        periodStart.setDate(1)
        periodStart.setHours(0, 0, 0, 0)

        const result = await db.query(
          `INSERT INTO inhouse_usage_events
           (project_id, metric, delta, reason, actor_type, actor_id, period_start)
           VALUES ($1, $2, $3, $4, 'admin', $5, $6)
           RETURNING id`,
          [projectId, metric, delta, reason, adminRequest.adminClaims.sub, periodStart.toISOString()]
        )

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'usage_adjustment',
          projectId,
          resourceType: 'usage_event',
          resourceId: result.rows[0]?.id || null,
          reason,
          metadata: { metric, delta },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { adjustmentId: result.rows[0]?.id } })
      } catch (error) {
        request.log.error({ error }, 'Failed to apply usage adjustment')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to apply adjustment',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/quotas/projects/:projectId/adjustments
  // -------------------------------------------------------------------------
  fastify.get<{ Params: { projectId: string }; Querystring: { metric?: string; limit?: string; offset?: string } }>(
    '/v1/admin/inhouse/quotas/projects/:projectId/adjustments',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const { projectId } = request.params
        const { metric, limit: limitStr, offset: offsetStr } = request.query
        const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

        const conditions = [`project_id = $1`, `actor_type = 'admin'`]
        const params: any[] = [projectId]
        let paramIndex = 2

        if (metric) {
          conditions.push(`metric = $${paramIndex}`)
          params.push(metric)
          paramIndex++
        }

        const whereClause = `WHERE ${conditions.join(' AND ')}`

        const countResult = await db.query(
          `SELECT COUNT(*)::int AS total FROM inhouse_usage_events ${whereClause}`,
          params
        )

        const listResult = await db.query(
          `SELECT * FROM inhouse_usage_events
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        const adminRequest = request as AdminRequest
        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'quota_adjustments_list',
          projectId,
          resourceType: 'usage_adjustment',
          metadata: { metric, limit, offset, resultCount: listResult.rows.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            adjustments: listResult.rows,
            total: countResult.rows[0]?.total || 0,
            hasMore: offset + listResult.rows.length < (countResult.rows[0]?.total || 0),
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to list adjustments')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load adjustments',
        })
      }
    }
  )
}
