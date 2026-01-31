/**
 * Admin In-House Analytics Routes
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'

interface AnalyticsSummaryQuery {
  period?: 'day' | 'week' | 'month'
  projectId?: string
}

interface AnalyticsEventsQuery {
  projectId?: string
  eventType?: 'track' | 'page' | 'identify'
  eventName?: string
  userId?: string
  startDate?: string
  endDate?: string
  limit?: string
  offset?: string
}

function resolvePeriodBounds(period: 'day' | 'week' | 'month') {
  const now = new Date()
  if (period === 'day') {
    return { start: new Date(now.getTime() - 24 * 60 * 60 * 1000), end: now }
  }
  if (period === 'week') {
    return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now }
  }
  return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now }
}

export default async function adminInhouseAnalyticsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/analytics/summary
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: AnalyticsSummaryQuery }>(
    '/v1/admin/inhouse/analytics/summary',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const period = request.query.period || 'month'
        const { start, end } = resolvePeriodBounds(period)
        const { projectId } = request.query

        const params: any[] = [start.toISOString(), end.toISOString()]
        let whereClause = 'WHERE timestamp >= $1 AND timestamp < $2'

        if (projectId) {
          params.push(projectId)
          whereClause += ` AND project_id = $${params.length}`
        }

        const { totals, topEvents, uniqueUsers } = await withStatementTimeout(db, '5s', async (client) => {
          const totalsResult = await client.query(
            `SELECT event_type, COUNT(*)::int AS count
             FROM inhouse_analytics_events
             ${whereClause}
             GROUP BY event_type`,
            params
          )

          const eventResult = await client.query(
            `SELECT event_name, COUNT(*)::int AS count
             FROM inhouse_analytics_events
             ${whereClause}
             GROUP BY event_name
             ORDER BY count DESC
             LIMIT 10`,
            params
          )

          const usersResult = await client.query(
            `SELECT COUNT(DISTINCT COALESCE(user_id::text, anonymous_id))::int AS count
             FROM inhouse_analytics_events
             ${whereClause}`,
            params
          )

          return {
            totals: totalsResult.rows,
            topEvents: eventResult.rows,
            uniqueUsers: usersResult.rows[0]?.count || 0,
          }
        })

        return reply.send({
          success: true,
          data: {
            period,
            totals,
            topEvents,
            uniqueUsers,
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to load analytics summary')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to load analytics summary',
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/analytics/events
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: AnalyticsEventsQuery }>(
    '/v1/admin/inhouse/analytics/events',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const db = requirePool()
        const { limit, offset } = parseLimitOffset(request.query.limit, request.query.offset)
        const { projectId, eventType, eventName, userId, startDate, endDate } = request.query

        const conditions: string[] = []
        const params: any[] = []
        let paramIndex = 1

        if (projectId) {
          conditions.push(`e.project_id = $${paramIndex}`)
          params.push(projectId)
          paramIndex++
        }
        if (eventType) {
          conditions.push(`e.event_type = $${paramIndex}`)
          params.push(eventType)
          paramIndex++
        }
        if (eventName) {
          conditions.push(`e.event_name = $${paramIndex}`)
          params.push(eventName)
          paramIndex++
        }
        if (userId) {
          conditions.push(`(e.user_id::text = $${paramIndex} OR e.anonymous_id = $${paramIndex})`)
          params.push(userId)
          paramIndex++
        }
        if (startDate) {
          conditions.push(`e.timestamp >= $${paramIndex}`)
          params.push(startDate)
          paramIndex++
        }
        if (endDate) {
          conditions.push(`e.timestamp < $${paramIndex}`)
          params.push(endDate)
          paramIndex++
        }

        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

        const countResult = await db.query(
          `SELECT COUNT(*)::int AS total
           FROM inhouse_analytics_events e
           ${whereClause}`,
          params
        )

        const listResult = await db.query(
          `SELECT e.*, p.name as project_name
           FROM inhouse_analytics_events e
           LEFT JOIN projects p ON p.id = e.project_id
           ${whereClause}
           ORDER BY e.timestamp DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return reply.send({
          success: true,
          data: {
            events: listResult.rows,
            total: countResult.rows[0]?.total || 0,
            hasMore: offset + listResult.rows.length < (countResult.rows[0]?.total || 0),
          },
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to list analytics events')
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list analytics events',
        })
      }
    }
  )
}
