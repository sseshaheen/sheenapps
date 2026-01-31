/**
 * Admin In-House Connectors Routes
 *
 * Endpoints for managing third-party connections across all In-House Mode projects.
 * Provides visibility into OAuth connections, health checks, and troubleshooting.
 *
 * Routes:
 * - GET  /v1/admin/inhouse/connectors/connections              - List all connections
 * - GET  /v1/admin/inhouse/connectors/connections/:id          - Get connection details
 * - POST /v1/admin/inhouse/connectors/connections/:id/health   - Check connection health
 * - POST /v1/admin/inhouse/connectors/connections/:id/revoke   - Revoke connection
 * - GET  /v1/admin/inhouse/connectors/calls/failed             - List failed API calls
 * - GET  /v1/admin/inhouse/connectors/oauth/pending            - List pending OAuth states
 * - POST /v1/admin/inhouse/connectors/oauth/:stateId/cleanup   - Clean up OAuth state
 * - POST /v1/admin/inhouse/connectors/oauth/cleanup            - Bulk cleanup expired states
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ConnectionsQuery {
  projectId?: string
  connectorType?: string
  status?: string
  search?: string
  limit?: string
  offset?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const STATEMENT_TIMEOUT = '5s'

const VALID_STATUSES = ['pending', 'connected', 'error', 'expired', 'revoked']
const VALID_CONNECTOR_TYPES = ['stripe', 'figma', 'slack', 'github', 'google-sheets', 'notion']

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseConnectorsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/connectors/connections - List all connections
  // ===========================================================================
  fastify.get<{
    Querystring: ConnectionsQuery
  }>(
    '/v1/admin/inhouse/connectors/connections',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Querystring: ConnectionsQuery }>, reply: FastifyReply) => {
      const db = requirePool()
      const { limit, offset } = parseLimitOffset(request.query.limit, request.query.offset)
      const { projectId, connectorType, status, search } = request.query

      const conditions: string[] = []
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`c.project_id = $${paramIndex++}`)
        params.push(projectId)
      }

      if (connectorType && VALID_CONNECTOR_TYPES.includes(connectorType)) {
        conditions.push(`c.connector_type = $${paramIndex++}`)
        params.push(connectorType)
      }

      if (status && VALID_STATUSES.includes(status)) {
        conditions.push(`c.status = $${paramIndex++}`)
        params.push(status)
      }

      if (search) {
        conditions.push(`(c.display_name ILIKE $${paramIndex} OR c.external_account_id ILIKE $${paramIndex})`)
        params.push(`%${search}%`)
        paramIndex++
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const connectionsResult = await client.query(
          `SELECT
            c.id,
            c.project_id,
            p.name as project_name,
            c.connector_type,
            c.display_name,
            c.external_account_id,
            c.status,
            c.scopes,
            c.connected_at,
            c.expires_at,
            c.created_at,
            c.updated_at
          FROM inhouse_connections c
          JOIN projects p ON p.id = c.project_id
          ${whereClause}
          ORDER BY c.updated_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM inhouse_connections c
           JOIN projects p ON p.id = c.project_id
           ${whereClause}`,
          params
        )

        // Stats should respect the same filters as the connection list
        const statsResult = await client.query(
          `SELECT
            COUNT(*) FILTER (WHERE c.status = 'connected') as connected_count,
            COUNT(*) FILTER (WHERE c.status = 'error') as error_count,
            COUNT(*) FILTER (WHERE c.status = 'expired') as expired_count,
            COUNT(*) FILTER (WHERE c.status = 'revoked') as revoked_count
          FROM inhouse_connections c
          JOIN projects p ON p.id = c.project_id
          ${whereClause}`,
          params
        )

        return {
          connections: connectionsResult.rows,
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          stats: statsResult.rows[0] || {}
        }
      })

      return reply.send({
        success: true,
        data: {
          connections: result.connections,
          total: result.total,
          stats: result.stats,
          limit,
          offset
        }
      })
    }
  )

  // ===========================================================================
  // GET /v1/admin/inhouse/connectors/connections/:id - Get connection details
  // ===========================================================================
  fastify.get<{
    Params: { id: string }
  }>(
    '/v1/admin/inhouse/connectors/connections/:id',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { id } = request.params

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const connectionResult = await client.query(
          `SELECT
            c.id,
            c.project_id,
            p.name as project_name,
            c.connector_type,
            c.display_name,
            c.external_account_id,
            c.status,
            c.scopes,
            c.metadata,
            c.connected_at,
            c.expires_at,
            c.created_at,
            c.updated_at
          FROM inhouse_connections c
          JOIN projects p ON p.id = c.project_id
          WHERE c.id = $1`,
          [id]
        )

        if (connectionResult.rows.length === 0) {
          return null
        }

        const callsResult = await client.query(
          `SELECT
            COUNT(*) FILTER (WHERE status = 'success') as success_count,
            COUNT(*) FILTER (WHERE status = 'error') as error_count
          FROM inhouse_activity_log
          WHERE service = 'connectors'
            AND action = 'call'
            AND resource_id = $1
            AND created_at > NOW() - INTERVAL '24 hours'`,
          [id]
        )

        return {
          connection: connectionResult.rows[0],
          calls: callsResult.rows[0] || {}
        }
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Connection not found' }
        })
      }

      return reply.send({
        success: true,
        data: {
          ...result.connection,
          recent_calls: parseInt(result.calls.success_count || '0', 10) + parseInt(result.calls.error_count || '0', 10),
          failed_calls: parseInt(result.calls.error_count || '0', 10)
        }
      })
    }
  )

  // ===========================================================================
  // POST /v1/admin/inhouse/connectors/connections/:id/health - Check connection health
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
  }>(
    '/v1/admin/inhouse/connectors/connections/:id/health',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { id } = request.params

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const connectionResult = await client.query(
          `SELECT id, connector_type, status, expires_at
           FROM inhouse_connections
           WHERE id = $1`,
          [id]
        )

        if (connectionResult.rows.length === 0) {
          return null
        }

        const connection = connectionResult.rows[0]

        const failuresResult = await client.query(
          `SELECT COUNT(*) as count
           FROM inhouse_activity_log
           WHERE service = 'connectors'
             AND action = 'call'
             AND status = 'error'
             AND resource_id = $1
             AND created_at > NOW() - INTERVAL '1 hour'`,
          [id]
        )

        return {
          connection,
          recentFailures: parseInt(failuresResult.rows[0]?.count || '0', 10)
        }
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Connection not found' }
        })
      }

      const { connection, recentFailures } = result
      const issues: string[] = []
      let healthy = true

      if (connection.status === 'revoked') {
        healthy = false
        issues.push('Connection has been revoked')
      }

      if (connection.status === 'error') {
        healthy = false
        issues.push('Connection is in error state')
      }

      if (connection.expires_at && new Date(connection.expires_at) < new Date()) {
        healthy = false
        issues.push('Connection credentials have expired')
      }

      if (recentFailures > 5) {
        healthy = false
        issues.push(`${recentFailures} failed calls in the last hour`)
      } else if (recentFailures > 0) {
        issues.push(`${recentFailures} failed calls in the last hour (warning)`)
      }

      return reply.send({
        success: true,
        data: {
          connection_id: id,
          connector_type: connection.connector_type,
          healthy,
          status: connection.status,
          issues,
          checked_at: new Date().toISOString()
        }
      })
    }
  )

  // ===========================================================================
  // POST /v1/admin/inhouse/connectors/connections/:id/revoke - Revoke connection
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: { reason: string }
  }>(
    '/v1/admin/inhouse/connectors/connections/:id/revoke',
    { preHandler: writeMiddleware },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { reason: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { id } = request.params
      const reason = (request.body?.reason || '').trim()
      const adminRequest = request as AdminRequest

      if (!reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'reason is required' }
        })
      }

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const getResult = await client.query(
          `SELECT id, project_id, connector_type, display_name, status
           FROM inhouse_connections
           WHERE id = $1`,
          [id]
        )

        if (getResult.rows.length === 0) {
          return null
        }

        const connection = getResult.rows[0]

        const updateResult = await client.query(
          `UPDATE inhouse_connections
           SET status = 'revoked', updated_at = NOW()
           WHERE id = $1
           RETURNING id, status, updated_at`,
          [id]
        )

        // Log admin action
        await client.query(
          `INSERT INTO inhouse_admin_audit (admin_id, action, project_id, resource_type, resource_id, reason, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            adminRequest.adminClaims?.sub,
            'connection_revoked',
            connection.project_id,
            'connection',
            id,
            reason,
            JSON.stringify({
              connectorType: connection.connector_type,
              displayName: connection.display_name,
              previousStatus: connection.status
            })
          ]
        )

        return updateResult.rows[0]
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Connection not found' }
        })
      }

      return reply.send({
        success: true,
        data: result
      })
    }
  )

  // ===========================================================================
  // GET /v1/admin/inhouse/connectors/calls/failed - List failed API calls
  // ===========================================================================
  fastify.get<{
    Querystring: { projectId?: string; connectorType?: string; limit?: string; offset?: string }
  }>(
    '/v1/admin/inhouse/connectors/calls/failed',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Querystring: { projectId?: string; connectorType?: string; limit?: string; offset?: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { limit, offset } = parseLimitOffset(request.query.limit, request.query.offset)
      const { projectId, connectorType } = request.query

      const conditions: string[] = [
        `a.service = 'connectors'`,
        `a.action = 'call'`,
        `a.status = 'error'`
      ]
      const params: unknown[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`a.project_id = $${paramIndex++}`)
        params.push(projectId)
      }

      if (connectorType) {
        conditions.push(`a.metadata->>'connector_type' = $${paramIndex++}`)
        params.push(connectorType)
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const callsResult = await client.query(
          `SELECT
            a.id,
            a.project_id,
            p.name as project_name,
            a.resource_id as connection_id,
            a.metadata->>'connector_type' as connector_type,
            a.action,
            a.error_code,
            a.metadata,
            a.created_at
          FROM inhouse_activity_log a
          JOIN projects p ON p.id = a.project_id
          ${whereClause}
          ORDER BY a.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM inhouse_activity_log a
           ${whereClause}`,
          params
        )

        return {
          calls: callsResult.rows,
          total: parseInt(countResult.rows[0]?.total || '0', 10)
        }
      })

      return reply.send({
        success: true,
        data: {
          failed_calls: result.calls,
          total: result.total,
          limit,
          offset
        }
      })
    }
  )

  // ===========================================================================
  // GET /v1/admin/inhouse/connectors/oauth/pending - List pending OAuth states
  // ===========================================================================
  fastify.get<{
    Querystring: { limit?: string; offset?: string }
  }>(
    '/v1/admin/inhouse/connectors/oauth/pending',
    { preHandler: readMiddleware },
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { limit, offset } = parseLimitOffset(request.query.limit, request.query.offset)

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const statesResult = await client.query(
          `SELECT
            s.id,
            s.project_id,
            p.name as project_name,
            s.connector_type,
            s.redirect_uri,
            s.scopes,
            s.expires_at,
            s.created_at,
            (s.expires_at < NOW()) as is_expired
          FROM inhouse_oauth_states s
          JOIN projects p ON p.id = s.project_id
          ORDER BY s.created_at DESC
          LIMIT $1 OFFSET $2`,
          [limit, offset]
        )

        const countResult = await client.query(`SELECT COUNT(*) as total FROM inhouse_oauth_states`)
        const expiredResult = await client.query(`SELECT COUNT(*) as expired FROM inhouse_oauth_states WHERE expires_at < NOW()`)

        return {
          states: statesResult.rows,
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          expired: parseInt(expiredResult.rows[0]?.expired || '0', 10)
        }
      })

      return reply.send({
        success: true,
        data: {
          oauth_states: result.states,
          total: result.total,
          expired_count: result.expired,
          limit,
          offset
        }
      })
    }
  )

  // ===========================================================================
  // POST /v1/admin/inhouse/connectors/oauth/:stateId/cleanup - Clean up OAuth state
  // ===========================================================================
  fastify.post<{
    Params: { stateId: string }
    Body: { reason: string }
  }>(
    '/v1/admin/inhouse/connectors/oauth/:stateId/cleanup',
    { preHandler: writeMiddleware },
    async (request: FastifyRequest<{ Params: { stateId: string }; Body: { reason: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const { stateId } = request.params
      const reason = (request.body?.reason || '').trim()
      const adminRequest = request as AdminRequest

      if (!reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'reason is required' }
        })
      }

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const getResult = await client.query(
          `SELECT id, project_id, connector_type
           FROM inhouse_oauth_states
           WHERE id = $1`,
          [stateId]
        )

        if (getResult.rows.length === 0) {
          return null
        }

        const state = getResult.rows[0]

        await client.query(`DELETE FROM inhouse_oauth_states WHERE id = $1`, [stateId])

        // Log admin action
        await client.query(
          `INSERT INTO inhouse_admin_audit (admin_id, action, project_id, resource_type, resource_id, reason, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            adminRequest.adminClaims?.sub,
            'oauth_state_deleted',
            state.project_id,
            'oauth_state',
            stateId,
            reason,
            JSON.stringify({ connectorType: state.connector_type })
          ]
        )

        return { deleted: true }
      })

      if (!result) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'OAuth state not found' }
        })
      }

      return reply.send({
        success: true,
        data: result
      })
    }
  )

  // ===========================================================================
  // POST /v1/admin/inhouse/connectors/oauth/cleanup - Bulk cleanup expired states
  // ===========================================================================
  fastify.post<{
    Body: { reason: string }
  }>(
    '/v1/admin/inhouse/connectors/oauth/cleanup',
    { preHandler: writeMiddleware },
    async (request: FastifyRequest<{ Body: { reason: string } }>, reply: FastifyReply) => {
      const db = requirePool()
      const reason = (request.body?.reason || '').trim()
      const adminRequest = request as AdminRequest

      if (!reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'reason is required' }
        })
      }

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const deleteResult = await client.query(
          `DELETE FROM inhouse_oauth_states
           WHERE expires_at < NOW()
           RETURNING id`
        )
        const deletedCount = deleteResult.rows.length

        if (deletedCount > 0) {
          await client.query(
            `INSERT INTO inhouse_admin_audit (admin_id, action, resource_type, reason, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              adminRequest.adminClaims?.sub,
              'oauth_states_bulk_cleanup',
              'oauth_state',
              reason,
              JSON.stringify({ deletedCount })
            ]
          )
        }

        return { deletedCount }
      })

      return reply.send({
        success: true,
        data: { deleted_count: result.deletedCount }
      })
    }
  )
}
