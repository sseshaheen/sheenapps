/**
 * Admin In-House Payments Routes
 *
 * Endpoints for monitoring payment events and customers across projects.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

interface EventsQuery {
  projectId?: string
  eventType?: string
  status?: 'pending' | 'processed' | 'failed'
  limit?: string
  offset?: string
}

interface CustomersQuery {
  projectId?: string
  search?: string
  limit?: string
  offset?: string
}

// =============================================================================
// HELPERS
// =============================================================================


// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhousePaymentsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/payments/events
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: EventsQuery
  }>('/v1/admin/inhouse/payments/events', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, eventType, status, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

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

      if (status) {
        conditions.push(`e.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_payment_events e ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT
             e.id,
             e.project_id,
             e.stripe_event_id,
             e.event_type,
             e.customer_id,
             e.subscription_id,
             e.status,
             e.processed_at,
             e.created_at
           FROM inhouse_payment_events e
           ${whereClause}
           ORDER BY e.created_at DESC
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
        action: 'payments_events_list',
        projectId: projectId || null,
        resourceType: 'payment_event',
        metadata: { projectId, eventType, status, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          events: rows,
          total,
          hasMore: offset + rows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list payment events')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list events',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/payments/customers
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: CustomersQuery
  }>('/v1/admin/inhouse/payments/customers', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, search, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`c.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (search) {
        conditions.push(`(c.email ILIKE $${paramIndex} OR c.stripe_customer_id ILIKE $${paramIndex})`)
        params.push(`%${search}%`)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_payment_customers c ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT c.*
           FROM inhouse_payment_customers c
           ${whereClause}
           ORDER BY c.created_at DESC
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
        action: 'payments_customers_list',
        projectId: projectId || null,
        resourceType: 'payment_customer',
        metadata: { projectId, search, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          customers: rows,
          total,
          hasMore: offset + rows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list payment customers')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list customers',
      })
    }
  })
}
