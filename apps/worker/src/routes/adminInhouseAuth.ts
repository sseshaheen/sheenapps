/**
 * Admin In-House Auth Routes
 *
 * Endpoints for listing auth users/sessions and forcing logout/reset.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

interface UsersQuery {
  projectId?: string
  search?: string
  limit?: string
  offset?: string
}

interface SessionsQuery {
  projectId?: string
  userId?: string
  limit?: string
  offset?: string
}

interface ForceLogoutBody {
  userId: string
  projectId: string
  reason?: string
}

interface ForceResetBody {
  userId: string
  projectId: string
  reason?: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseAuthRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/auth/users
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: UsersQuery
  }>('/v1/admin/inhouse/auth/users', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, search, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`u.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (search) {
        conditions.push(`(u.email ILIKE $${paramIndex} OR u.id::text = $${paramIndex})`)
        params.push(`%${search}%`)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_auth_users u ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT
             u.id,
             u.project_id,
             u.email,
             u.email_verified,
             u.provider,
             u.last_sign_in,
             u.created_at
           FROM inhouse_auth_users u
           ${whereClause}
           ORDER BY u.created_at DESC
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
        action: 'auth_users_list',
        projectId: projectId || null,
        resourceType: 'auth_user',
        metadata: { projectId, search, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          users: rows,
          total,
          hasMore: offset + rows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list auth users')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list users',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/auth/sessions
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: SessionsQuery
  }>('/v1/admin/inhouse/auth/sessions', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, userId, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`s.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (userId) {
        conditions.push(`s.user_id = $${paramIndex}`)
        params.push(userId)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_auth_sessions s ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT
             s.id,
             s.project_id,
             s.user_id,
             s.expires_at,
             s.revoked_at,
             s.last_used_at,
             s.created_at,
             s.ip_address,
             s.user_agent
           FROM inhouse_auth_sessions s
           ${whereClause}
           ORDER BY s.created_at DESC
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
        action: 'auth_sessions_list',
        projectId: projectId || null,
        resourceType: 'auth_session',
        metadata: { projectId, userId, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          sessions: rows,
          total,
          hasMore: offset + rows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list auth sessions')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list sessions',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/auth/users/:userId/logout
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { userId: string }
    Body: ForceLogoutBody
  }>('/v1/admin/inhouse/auth/users/:userId/logout', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { userId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!reason || reason.trim().length < 5) {
      return reply.status(400).send({ success: false, error: 'reason is required (min 5 characters)' })
    }

    try {
      const db = requirePool()
      const result = await db.query(
        `UPDATE inhouse_auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND project_id = $2`,
        [userId, projectId]
      )

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'auth_force_logout',
        projectId,
        resourceType: 'auth_user',
        resourceId: userId,
        reason: reason || null,
        metadata: { revokedSessions: result.rowCount },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: { revokedSessions: result.rowCount } })
    } catch (error) {
      request.log.error({ error }, 'Failed to force logout')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to force logout',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/auth/users/:userId/force-reset
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { userId: string }
    Body: ForceResetBody
  }>('/v1/admin/inhouse/auth/users/:userId/force-reset', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { userId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!reason || reason.trim().length < 5) {
      return reply.status(400).send({ success: false, error: 'reason is required (min 5 characters)' })
    }

    try {
      const db = requirePool()
      await db.query(
        `UPDATE inhouse_auth_users SET password_hash = NULL WHERE id = $1 AND project_id = $2`,
        [userId, projectId]
      )
      await db.query(
        `UPDATE inhouse_auth_sessions SET revoked_at = NOW() WHERE user_id = $1 AND project_id = $2`,
        [userId, projectId]
      )

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'auth_force_reset',
        projectId,
        resourceType: 'auth_user',
        resourceId: userId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to force reset')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to force reset',
      })
    }
  })
}
