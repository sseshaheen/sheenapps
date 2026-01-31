/**
 * Admin In-House Monitoring Routes
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool } from './admin/_utils'
import { jobMonitoringService } from '../services/jobMonitoringService'
import { auditAdminAction } from './admin/_audit'

interface MonitoringSummaryQuery {
  period?: 'hour' | 'day'
}

export default async function adminInhouseMonitoringRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/monitoring/health
  // -------------------------------------------------------------------------
  fastify.get('/v1/admin/inhouse/monitoring/health', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const { rows: serviceRows } = await withStatementTimeout(db, '5s', async (client) => {
        const result = await client.query(
          `SELECT service,
                  COUNT(*)::int AS total,
                  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::int AS errors
           FROM inhouse_activity_log
           WHERE created_at >= $1
           GROUP BY service`,
          [since]
        )
        return result
      })

      const services = [
        'auth',
        'db',
        'storage',
        'jobs',
        'email',
        'payments',
        'analytics',
        'backups',
        'secrets',
        'forms',
        'search',
        'ai',
        'realtime',
        'notifications',
      ]
      const statsByService = new Map<string, { total: number; errors: number }>()
      for (const row of serviceRows) {
        statsByService.set(row.service, { total: row.total, errors: row.errors })
      }

      const serviceHealth = services.map((service) => {
        const stats = statsByService.get(service) || { total: 0, errors: 0 }
        const errorRate = stats.total === 0 ? 0 : stats.errors / stats.total
        let status: 'healthy' | 'warning' | 'critical' = 'healthy'
        if (errorRate > 0.1) status = 'critical'
        else if (errorRate > 0.03) status = 'warning'

        const actionUrlMap: Record<string, string> = {
          jobs: '/admin/inhouse/jobs',
          email: '/admin/inhouse/emails',
          backups: '/admin/inhouse/backups',
          storage: '/admin/inhouse/storage',
          analytics: '/admin/inhouse/analytics',
          payments: '/admin/inhouse/payments',
          auth: '/admin/inhouse/auth',
          db: '/admin/inhouse/projects',
        }

        return {
          name: service,
          status,
          errorRate: Number(errorRate.toFixed(4)),
          actionUrl: actionUrlMap[service] || '/admin/inhouse/projects',
        }
      })

      const { rows: backupFailures } = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM inhouse_backups
         WHERE status = 'failed'
           AND created_at >= $1`,
        [since]
      )

      const { rows: emailBounces } = await db.query(
        `SELECT COUNT(*)::int AS count
         FROM inhouse_emails
         WHERE status = 'bounced'
           AND created_at >= $1`,
        [since]
      )

      const { rows: quotaRows } = await db.query(
        `SELECT p.id as project_id, p.name as project_name,
                q.storage_size_used_bytes, q.storage_size_limit_bytes,
                q.requests_used_today, q.requests_limit_daily
         FROM inhouse_quotas q
         JOIN projects p ON p.id = q.project_id`
      )

      const nearQuota = quotaRows
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
            percentUsed: maxPercent,
          }
        })
        .filter((row) => row.percentUsed >= 0.9)
        .slice(0, 10)

      const dlqStats = await jobMonitoringService.getDLQStats()
      const totalDLQ = Object.values(dlqStats).reduce((sum, count) => sum + count, 0)

      const needsAttention = [] as Array<{ type: string; message: string; actionUrl: string; severity: string }>
      if (nearQuota.length > 0) {
        needsAttention.push({
          type: 'quota',
          message: `${nearQuota.length} projects approaching quota`,
          actionUrl: '/admin/inhouse/quotas',
          severity: 'warning',
        })
      }
      if ((backupFailures[0]?.count || 0) > 0) {
        needsAttention.push({
          type: 'backups',
          message: `${backupFailures[0].count} backup failures in last 24h`,
          actionUrl: '/admin/inhouse/backups',
          severity: 'critical',
        })
      }
      if ((emailBounces[0]?.count || 0) > 5) {
        needsAttention.push({
          type: 'email',
          message: `${emailBounces[0].count} email bounces in last 24h`,
          actionUrl: '/admin/inhouse/emails',
          severity: 'warning',
        })
      }
      if (totalDLQ > 10) {
        needsAttention.push({
          type: 'jobs',
          message: `DLQ backlog ${totalDLQ} jobs`,
          actionUrl: '/admin/inhouse/jobs',
          severity: totalDLQ > 50 ? 'critical' : 'warning',
        })
      }

      const adminRequest = request as any
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'monitoring_health',
        resourceType: 'monitoring',
        metadata: { services: services.length, needsAttention: needsAttention.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          services: serviceHealth,
          queues: {
            dlqTotal: totalDLQ,
          },
          needsAttention,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to fetch monitoring health')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load monitoring health',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/monitoring/summary
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: MonitoringSummaryQuery }>(
    '/v1/admin/inhouse/monitoring/summary',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const period = request.query.period === 'hour' ? 'hour' : 'day'
        const since = period === 'hour'
          ? new Date(Date.now() - 60 * 60 * 1000).toISOString()
          : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

        const { rows: jobRows } = await db.query(
          `SELECT COUNT(*)::int AS total,
                  SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END)::int AS errors
           FROM inhouse_activity_log
           WHERE created_at >= $1 AND service = 'jobs'`,
          [since]
        )

        const { rows: emailRows } = await db.query(
          `SELECT COUNT(*)::int AS total,
                  SUM(CASE WHEN status = 'bounced' THEN 1 ELSE 0 END)::int AS bounces
           FROM inhouse_emails
           WHERE created_at >= $1`,
          [since]
        )

        const { rows: backupRows } = await db.query(
          `SELECT COUNT(*)::int AS failed
           FROM inhouse_backups
           WHERE created_at >= $1 AND status = 'failed'`,
          [since]
        )

        const { rows: quotaRows } = await db.query(
          `SELECT COUNT(*)::int AS count
           FROM inhouse_quotas
           WHERE storage_size_limit_bytes > 0
             AND storage_size_used_bytes >= storage_size_limit_bytes * 0.9`
        )

        const { rows: alertRows } = await db.query(
          `SELECT COUNT(*)::int AS count
           FROM inhouse_alerts
           WHERE resolved_at IS NULL`
        )

        const jobTotal = jobRows[0]?.total || 0
        const jobErrors = jobRows[0]?.errors || 0
        const emailTotal = emailRows[0]?.total || 0
        const emailBounces = emailRows[0]?.bounces || 0

        const adminRequest = request as any
        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'monitoring_summary',
          resourceType: 'monitoring',
          metadata: { period },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            jobFailureRate: jobTotal ? jobErrors / jobTotal : 0,
            emailBounceRate: emailTotal ? emailBounces / emailTotal : 0,
            backupFailures: backupRows[0]?.failed || 0,
            projectsNearQuota: quotaRows[0]?.count || 0,
            activeAlerts: alertRows[0]?.count || 0,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to fetch monitoring summary')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load monitoring summary',
        })
      }
    }
  )
}
