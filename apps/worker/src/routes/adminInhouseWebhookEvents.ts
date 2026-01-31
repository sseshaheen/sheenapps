/**
 * Admin In-House Webhook Events Routes
 *
 * Endpoints for viewing and managing webhook events (OpenSRS, Stripe, Resend)
 * Part of easy-mode-email-enhancements-plan.md (Enhancement 3)
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { parseLimitOffset, requirePool } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { withStatementTimeout } from '../utils/dbTimeout'

// =============================================================================
// TYPES
// =============================================================================

interface WebhookEventsQuery {
  source?: string // 'opensrs', 'stripe', 'resend'
  status?: string // 'pending', 'processing', 'completed', 'failed', 'retrying'
  limit?: string
  offset?: string
}

interface ReprocessBody {
  reason?: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseWebhookEventsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/webhook-events
  // List webhook events with filtering
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: WebhookEventsQuery
  }>('/v1/admin/inhouse/webhook-events', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const { source, status, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const db = requirePool()

      const conditions: string[] = []
      const params: (string | number)[] = []
      let paramIndex = 1

      if (source) {
        conditions.push(`source = $${paramIndex}`)
        params.push(source)
        paramIndex++
      }

      if (status) {
        conditions.push(`status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_webhook_events ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT id, source, endpoint, status, received_at, processed_at,
                  last_error, retry_count, next_retry_at, parsed_event_type,
                  sender_ip, idempotency_key, updated_at
           FROM inhouse_webhook_events
           ${whereClause}
           ORDER BY received_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          rows: listResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'webhook_events_list',
        resourceType: 'webhook_event',
        metadata: { source, status, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { events: rows, total, hasMore: offset + rows.length < total },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list webhook events')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list webhook events',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/webhook-events/stats
  // Get webhook event statistics
  // -------------------------------------------------------------------------
  fastify.get('/v1/admin/inhouse/webhook-events/stats', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()

      const stats = await withStatementTimeout(db, '5s', async (client) => {
        // Status breakdown by source
        const statusResult = await client.query(`
          SELECT source, status, COUNT(*) as count
          FROM inhouse_webhook_events
          GROUP BY source, status
          ORDER BY source, status
        `)

        // Recent failures (last 24 hours)
        const recentFailuresResult = await client.query(`
          SELECT source, COUNT(*) as count
          FROM inhouse_webhook_events
          WHERE status = 'failed' AND updated_at > NOW() - INTERVAL '24 hours'
          GROUP BY source
        `)

        // Events needing retry
        const retryingResult = await client.query(`
          SELECT source, COUNT(*) as count
          FROM inhouse_webhook_events
          WHERE status = 'retrying' AND next_retry_at <= NOW()
          GROUP BY source
        `)

        return {
          bySourceAndStatus: statusResult.rows,
          recentFailures: recentFailuresResult.rows,
          readyForRetry: retryingResult.rows,
        }
      })

      return reply.send({ success: true, data: stats })
    } catch (error) {
      request.log.error({ error }, 'Failed to get webhook event stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get webhook event stats',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/webhook-events/:eventId
  // Get single webhook event with full details (including raw body)
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { eventId: string }
  }>('/v1/admin/inhouse/webhook-events/:eventId', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { eventId } = request.params

      const result = await db.query(
        `SELECT * FROM inhouse_webhook_events WHERE id = $1`,
        [eventId]
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Webhook event not found' })
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'webhook_event_view',
        resourceType: 'webhook_event',
        resourceId: eventId,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result.rows[0] })
    } catch (error) {
      request.log.error({ error }, 'Failed to get webhook event')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get webhook event',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/webhook-events/:eventId/reprocess
  // Reprocess a failed webhook event
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { eventId: string }
    Body: ReprocessBody
  }>('/v1/admin/inhouse/webhook-events/:eventId/reprocess', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { eventId } = request.params
    const { reason } = request.body || {}

    try {
      const db = requirePool()

      // Check event exists and is in reprocessable state
      const eventResult = await db.query(
        `SELECT id, status, source FROM inhouse_webhook_events WHERE id = $1`,
        [eventId]
      )

      if (!eventResult.rows.length) {
        return reply.status(404).send({ success: false, error: 'Webhook event not found' })
      }

      const event = eventResult.rows[0]

      if (!['failed', 'retrying'].includes(event.status)) {
        return reply.status(400).send({
          success: false,
          error: `Cannot reprocess event in '${event.status}' status. Only 'failed' or 'retrying' events can be reprocessed.`,
        })
      }

      // Reset to pending for reprocessing
      await db.query(`
        UPDATE inhouse_webhook_events
        SET status = 'pending', last_error = NULL, next_retry_at = NULL, updated_at = NOW()
        WHERE id = $1
      `, [eventId])

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'webhook_event_reprocess',
        resourceType: 'webhook_event',
        resourceId: eventId,
        reason: reason || null,
        metadata: { previousStatus: event.status, source: event.source },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { message: 'Event queued for reprocessing', eventId },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to reprocess webhook event')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reprocess webhook event',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/webhook-events/failed
  // List failed webhook events for alerting dashboard
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: { source?: string; hours?: string; limit?: string }
  }>('/v1/admin/inhouse/webhook-events/failed', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const { source, hours: hoursStr, limit: limitStr } = request.query
      const hours = Math.min(parseInt(hoursStr || '24', 10), 168) // Max 7 days
      const limit = Math.min(parseInt(limitStr || '50', 10), 100)

      const db = requirePool()

      // Use parameterized interval to avoid SQL interpolation
      const conditions: string[] = [
        `status = 'failed'`,
        `updated_at > NOW() - ($1::int * INTERVAL '1 hour')`,
      ]
      const params: (string | number)[] = [hours]
      let paramIndex = 2

      if (source) {
        conditions.push(`source = $${paramIndex}`)
        params.push(source)
        paramIndex++
      }

      const result = await db.query(
        `SELECT id, source, endpoint, last_error, retry_count,
                received_at, updated_at, parsed_event_type, idempotency_key
         FROM inhouse_webhook_events
         WHERE ${conditions.join(' AND ')}
         ORDER BY updated_at DESC
         LIMIT $${paramIndex}`,
        [...params, limit]
      )

      return reply.send({
        success: true,
        data: {
          events: result.rows,
          count: result.rows.length,
          timeWindow: `${hours} hours`,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list failed webhook events')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list failed webhook events',
      })
    }
  })
}
