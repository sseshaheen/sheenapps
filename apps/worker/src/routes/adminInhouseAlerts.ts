/**
 * Admin In-House Alerts Routes
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'

interface RulesQuery {
  enabled_only?: string
}

interface HistoryQuery {
  status?: 'active' | 'resolved' | 'acknowledged'
  limit?: string
  offset?: string
}

interface RuleBody {
  name: string
  service: string
  metric: string
  condition: 'gt' | 'lt' | 'eq'
  threshold: number
  windowMinutes?: number
  channels?: string[] | string
  enabled?: boolean
}

interface RuleUpdateBody {
  name?: string
  service?: string
  metric?: string
  condition?: 'gt' | 'lt' | 'eq'
  threshold?: number
  windowMinutes?: number
  channels?: string[] | string
  enabled?: boolean
}

interface AcknowledgeBody {
  reason?: string
}

function normalizeChannels(channels?: string[] | string): string[] {
  if (!channels) return []
  if (Array.isArray(channels)) return channels
  return channels
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

export default async function adminInhouseAlertsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/alerts/rules
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: RulesQuery }>(
    '/v1/admin/inhouse/alerts/rules',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const enabledOnly = request.query.enabled_only === 'true'

        const rules = await withStatementTimeout(db, '5s', async (client) => {
          const whereClause = enabledOnly ? 'WHERE enabled = true' : ''
          const result = await client.query(
            `SELECT
              id,
              name,
              service,
              metric,
              condition,
              threshold,
              window_minutes,
              channels,
              enabled,
              created_by,
              created_at,
              updated_at
             FROM inhouse_alert_rules
             ${whereClause}
             ORDER BY created_at DESC`
          )
          return result.rows
        })

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_rules_list',
          resourceType: 'alert_rule',
          metadata: { enabledOnly, resultCount: rules.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { rules } })
      } catch (error) {
        request.log.error({ error }, 'Failed to list alert rules')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list alert rules',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/alerts/rules
  // -------------------------------------------------------------------------
  fastify.post<{ Body: RuleBody }>(
    '/v1/admin/inhouse/alerts/rules',
    { preHandler: writeMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const body = request.body
        const channels = normalizeChannels(body.channels)
        const windowMinutes = body.windowMinutes ?? 5
        const enabled = body.enabled ?? true

        if (!body?.name || !body?.service || !body?.metric || !body?.condition) {
          return reply.status(400).send({ success: false, error: 'Missing required fields' })
        }

        const result = await withStatementTimeout(db, '5s', async (client) => {
          return client.query(
            `INSERT INTO inhouse_alert_rules
              (name, service, metric, condition, threshold, window_minutes, channels, enabled, created_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
             RETURNING *`,
            [
              body.name,
              body.service,
              body.metric,
              body.condition,
              body.threshold,
              windowMinutes,
              JSON.stringify(channels),
              enabled,
              adminRequest.adminClaims.sub,
            ]
          )
        })

        const rule = result.rows[0]

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_rule_create',
          resourceType: 'alert_rule',
          resourceId: rule?.id || null,
          metadata: { name: body.name, service: body.service, metric: body.metric, channels, enabled },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { rule } })
      } catch (error) {
        request.log.error({ error }, 'Failed to create alert rule')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create alert rule',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // PATCH /v1/admin/inhouse/alerts/rules/:ruleId
  // -------------------------------------------------------------------------
  fastify.patch<{
    Params: { ruleId: string }
    Body: RuleUpdateBody
  }>(
    '/v1/admin/inhouse/alerts/rules/:ruleId',
    { preHandler: writeMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const { ruleId } = request.params
        const body = request.body || {}

        const updates: string[] = []
        const params: any[] = []
        let index = 1

        const setField = (field: string, value: any) => {
          updates.push(`${field} = $${index}`)
          params.push(value)
          index += 1
        }

        const setJsonb = (field: string, value: any) => {
          updates.push(`${field} = $${index}::jsonb`)
          params.push(JSON.stringify(value))
          index += 1
        }

        if (body.name !== undefined) setField('name', body.name)
        if (body.service !== undefined) setField('service', body.service)
        if (body.metric !== undefined) setField('metric', body.metric)
        if (body.condition !== undefined) setField('condition', body.condition)
        if (body.threshold !== undefined) setField('threshold', body.threshold)
        if (body.windowMinutes !== undefined) setField('window_minutes', body.windowMinutes)
        if (body.channels !== undefined) setJsonb('channels', normalizeChannels(body.channels))
        if (body.enabled !== undefined) setField('enabled', body.enabled)

        if (!updates.length) {
          return reply.status(400).send({ success: false, error: 'No fields to update' })
        }

        updates.push(`updated_at = NOW()`)

        const result = await withStatementTimeout(db, '5s', async (client) => {
          return client.query(
            `UPDATE inhouse_alert_rules
             SET ${updates.join(', ')}
             WHERE id = $${index}
             RETURNING *`,
            [...params, ruleId]
          )
        })

        const rule = result.rows[0]
        if (!rule) {
          return reply.status(404).send({ success: false, error: 'Rule not found' })
        }

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_rule_update',
          resourceType: 'alert_rule',
          resourceId: ruleId,
          metadata: { updatedFields: Object.keys(body) },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { rule } })
      } catch (error) {
        request.log.error({ error }, 'Failed to update alert rule')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update alert rule',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // DELETE /v1/admin/inhouse/alerts/rules/:ruleId
  // -------------------------------------------------------------------------
  fastify.delete<{ Params: { ruleId: string }; Body: { reason?: string } }>(
    '/v1/admin/inhouse/alerts/rules/:ruleId',
    { preHandler: writeMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { reason } = request.body || {}

      if (!reason || reason.trim().length < 5) {
        return reply.status(400).send({ success: false, error: 'reason is required (min 5 characters)' })
      }

      try {
        const db = requirePool()
        const { ruleId } = request.params

        const result = await withStatementTimeout(db, '5s', async (client) => {
          return client.query(
            `DELETE FROM inhouse_alert_rules WHERE id = $1 RETURNING id`,
            [ruleId]
          )
        })

        if (!result.rows[0]) {
          return reply.status(404).send({ success: false, error: 'Rule not found' })
        }

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_rule_delete',
          resourceType: 'alert_rule',
          resourceId: ruleId,
          reason,
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { id: ruleId } })
      } catch (error) {
        request.log.error({ error }, 'Failed to delete alert rule')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete alert rule',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/alerts/active
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/admin/inhouse/alerts/active',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const alerts = await withStatementTimeout(db, '5s', async (client) => {
          const result = await client.query(
            `SELECT
              a.id,
              a.rule_id,
              a.project_id,
              a.severity,
              a.message,
              a.metadata,
              a.triggered_at,
              a.acknowledged_at,
              a.acknowledged_by,
              a.resolved_at,
              r.name as rule_name,
              r.service,
              r.metric,
              r.condition,
              r.threshold
             FROM inhouse_alerts a
             LEFT JOIN inhouse_alert_rules r ON r.id = a.rule_id
             WHERE a.resolved_at IS NULL
             ORDER BY a.triggered_at DESC`
          )
          return result.rows
        })

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_active_list',
          resourceType: 'alert',
          metadata: { resultCount: alerts.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { alerts } })
      } catch (error) {
        request.log.error({ error }, 'Failed to list active alerts')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list active alerts',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/alerts/history
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: HistoryQuery }>(
    '/v1/admin/inhouse/alerts/history',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const { limit, offset } = parseLimitOffset(request.query.limit, request.query.offset)
        const status = request.query.status

        const conditions: string[] = []
        const params: any[] = []
        let index = 1

        if (status === 'active') {
          conditions.push('a.resolved_at IS NULL')
        } else if (status === 'resolved') {
          conditions.push('a.resolved_at IS NOT NULL')
        } else if (status === 'acknowledged') {
          conditions.push('a.acknowledged_at IS NOT NULL')
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

        const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
          const countResult = await client.query(
            `SELECT COUNT(*) as total FROM inhouse_alerts a ${whereClause}`,
            params
          )

          const listResult = await client.query(
            `SELECT
              a.id,
              a.rule_id,
              a.project_id,
              a.severity,
              a.message,
              a.metadata,
              a.triggered_at,
              a.acknowledged_at,
              a.acknowledged_by,
              a.resolved_at,
              r.name as rule_name,
              r.service,
              r.metric
             FROM inhouse_alerts a
             LEFT JOIN inhouse_alert_rules r ON r.id = a.rule_id
             ${whereClause}
             ORDER BY a.triggered_at DESC
             LIMIT $${index} OFFSET $${index + 1}`,
            [...params, limit, offset]
          )

          return {
            total: parseInt(countResult.rows[0]?.total || '0', 10),
            rows: listResult.rows,
          }
        })

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_history_list',
          resourceType: 'alert',
          metadata: { status, limit, offset, resultCount: rows.length },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({
          success: true,
          data: {
            alerts: rows,
            total,
            hasMore: offset + rows.length < total,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to list alert history')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list alert history',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/alerts/dashboard
  // Aggregated endpoint: rules + active + history in one call
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: HistoryQuery }>(
    '/v1/admin/inhouse/alerts/dashboard',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const { limit: histLimit, offset: histOffset } = parseLimitOffset(
          request.query.limit,
          request.query.offset
        )
        const histStatus = request.query.status

        const [rulesResult, activeResult, historyResult] = await Promise.allSettled([
          // Rules
          withStatementTimeout(db, '5s', async (client) => {
            const result = await client.query(
              `SELECT id, name, service, metric, condition, threshold, window_minutes,
                      channels, enabled, created_by, created_at, updated_at
               FROM inhouse_alert_rules
               ORDER BY created_at DESC`
            )
            return result.rows
          }),
          // Active alerts
          withStatementTimeout(db, '5s', async (client) => {
            const result = await client.query(
              `SELECT a.id, a.rule_id, a.project_id, a.severity, a.message, a.metadata,
                      a.triggered_at, a.acknowledged_at, a.acknowledged_by, a.resolved_at,
                      r.name as rule_name, r.service, r.metric, r.condition, r.threshold
               FROM inhouse_alerts a
               LEFT JOIN inhouse_alert_rules r ON r.id = a.rule_id
               WHERE a.resolved_at IS NULL
               ORDER BY a.triggered_at DESC`
            )
            return result.rows
          }),
          // History
          withStatementTimeout(db, '5s', async (client) => {
            const conditions: string[] = []
            const params: any[] = []

            if (histStatus === 'active') {
              conditions.push('a.resolved_at IS NULL')
            } else if (histStatus === 'resolved') {
              conditions.push('a.resolved_at IS NOT NULL')
            } else if (histStatus === 'acknowledged') {
              conditions.push('a.acknowledged_at IS NOT NULL')
            }

            const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
            const paramIdx = params.length + 1

            const countResult = await client.query(
              `SELECT COUNT(*) as total FROM inhouse_alerts a ${whereClause}`,
              params
            )

            const listResult = await client.query(
              `SELECT a.id, a.rule_id, a.project_id, a.severity, a.message, a.metadata,
                      a.triggered_at, a.acknowledged_at, a.acknowledged_by, a.resolved_at,
                      r.name as rule_name, r.service, r.metric
               FROM inhouse_alerts a
               LEFT JOIN inhouse_alert_rules r ON r.id = a.rule_id
               ${whereClause}
               ORDER BY a.triggered_at DESC
               LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
              [...params, histLimit, histOffset]
            )

            const total = parseInt(countResult.rows[0]?.total || '0', 10)
            return {
              alerts: listResult.rows,
              total,
              hasMore: histOffset + listResult.rows.length < total,
            }
          }),
        ])

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_dashboard_view',
          resourceType: 'alert',
          metadata: { historyStatus: histStatus },
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        const failures: string[] = []
        if (rulesResult.status === 'rejected') failures.push('rules')
        if (activeResult.status === 'rejected') failures.push('active')
        if (historyResult.status === 'rejected') failures.push('history')

        return reply.send({
          success: true,
          data: {
            rules: rulesResult.status === 'fulfilled' ? rulesResult.value : [],
            active: activeResult.status === 'fulfilled' ? activeResult.value : [],
            history: historyResult.status === 'fulfilled' ? historyResult.value : { alerts: [], total: 0, hasMore: false },
          },
          meta: failures.length > 0 ? { partial: true, failures } : undefined,
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to load alerts dashboard')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load alerts dashboard',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/alerts/:alertId/acknowledge
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { alertId: string }
    Body: AcknowledgeBody
  }>(
    '/v1/admin/inhouse/alerts/:alertId/acknowledge',
    { preHandler: writeMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      try {
        const db = requirePool()
        const { alertId } = request.params

        const result = await withStatementTimeout(db, '5s', async (client) => {
          return client.query(
            `UPDATE inhouse_alerts
             SET acknowledged_at = NOW(), acknowledged_by = $1
             WHERE id = $2 AND resolved_at IS NULL
             RETURNING id, acknowledged_at`,
            [adminRequest.adminClaims.sub, alertId]
          )
        })

        if (!result.rows[0]) {
          return reply.status(404).send({ success: false, error: 'Alert not found' })
        }

        auditAdminAction({
          adminId: adminRequest.adminClaims.sub,
          action: 'alerts_acknowledge',
          resourceType: 'alert',
          resourceId: alertId,
          reason: request.body?.reason || null,
          ipAddress: request.ip || null,
          userAgent: request.headers['user-agent'] || null,
        })

        return reply.send({ success: true, data: { id: alertId } })
      } catch (error) {
        request.log.error({ error }, 'Failed to acknowledge alert')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to acknowledge alert',
        })
      }
    }
  )
}
