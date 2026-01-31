/**
 * Admin In-House Activity Routes
 *
 * Endpoints for querying the unified activity log for In-House Mode projects.
 * Provides visibility into all operations across services.
 *
 * Routes:
 * - GET /v1/admin/inhouse/projects/:projectId/activity - Get project activity
 * - GET /v1/admin/inhouse/activity                     - Get all activity (cross-project)
 * - GET /v1/admin/inhouse/activity/errors              - Get recent errors
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ActivityLogEntry {
  id: string
  project_id: string
  project_name?: string
  service: string
  action: string
  status: string
  correlation_id: string | null
  actor_type: string | null
  actor_id: string | null
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, any> | null
  duration_ms: number | null
  error_code: string | null
  created_at: string
}

interface ActivityQuery {
  service?: string
  status?: string
  limit?: string
  offset?: string
}

interface ProjectActivityQuery extends ActivityQuery {
  // Additional filters could go here
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const STATEMENT_TIMEOUT = '5s'

const VALID_SERVICES = ['auth', 'db', 'storage', 'jobs', 'email', 'payments', 'analytics', 'secrets', 'backups', 'flags', 'connectors', 'edge-functions', 'ai', 'realtime', 'notifications']
const VALID_STATUSES = ['success', 'error', 'pending']

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseActivityRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/activity - Get project activity
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ProjectActivityQuery
    Reply: { success: boolean; data?: { activities: ActivityLogEntry[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/activity', { preHandler: readMiddleware as any }, async (request, reply) => {
    const { projectId } = request.params

    try {
      const db = requirePool()

      const {
        service,
        status,
        limit: limitStr,
        offset: offsetStr,
      } = request.query

      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      // Validate filters
      const safeService = service && VALID_SERVICES.includes(service) ? service : null
      const safeStatus = status && VALID_STATUSES.includes(status) ? status : null

      // Verify project exists and is Easy Mode
      const projectCheck = await db.query(
        `SELECT id FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
        [projectId]
      )

      if (!projectCheck.rows.length) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        })
      }

      // Build query conditions
      const conditions: string[] = ['al.project_id = $1']
      const params: any[] = [projectId]
      let paramIndex = 2

      if (safeService) {
        conditions.push(`al.service = $${paramIndex}`)
        params.push(safeService)
        paramIndex++
      }

      if (safeStatus) {
        conditions.push(`al.status = $${paramIndex}`)
        params.push(safeStatus)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      // Use withStatementTimeout for safe timeout handling
      const { total, activityRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_activity_log al WHERE ${whereClause}`,
          params
        )

        const activitiesResult = await client.query(
          `SELECT
            al.id,
            al.project_id,
            p.name as project_name,
            al.service,
            al.action,
            al.status,
            al.correlation_id,
            al.actor_type,
            al.actor_id,
            al.resource_type,
            al.resource_id,
            al.metadata,
            al.duration_ms,
            al.error_code,
            al.created_at
          FROM inhouse_activity_log al
          LEFT JOIN projects p ON p.id = al.project_id
          WHERE ${whereClause}
          ORDER BY al.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          activityRows: activitiesResult.rows,
        }
      })

      const activities: ActivityLogEntry[] = activityRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        service: row.service,
        action: row.action,
        status: row.status,
        correlation_id: row.correlation_id,
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        metadata: row.metadata,
        duration_ms: row.duration_ms,
        error_code: row.error_code,
        created_at: row.created_at,
      }))

      return reply.send({
        success: true,
        data: {
          activities,
          total,
          hasMore: offset + activities.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get project activity')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project activity',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/activity - Get all activity (cross-project)
  // ===========================================================================
  fastify.get<{
    Querystring: ActivityQuery & { projectId?: string }
    Reply: { success: boolean; data?: { activities: ActivityLogEntry[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/activity', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()

      const {
        projectId,
        service,
        status,
        limit: limitStr,
        offset: offsetStr,
      } = request.query

      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      // Validate filters
      const safeService = service && VALID_SERVICES.includes(service) ? service : null
      const safeStatus = status && VALID_STATUSES.includes(status) ? status : null

      // Build query conditions
      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`al.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (safeService) {
        conditions.push(`al.service = $${paramIndex}`)
        params.push(safeService)
        paramIndex++
      }

      if (safeStatus) {
        conditions.push(`al.status = $${paramIndex}`)
        params.push(safeStatus)
        paramIndex++
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      // Use withStatementTimeout for safe timeout handling
      const { total, activityRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_activity_log al ${whereClause}`,
          params
        )

        const activitiesResult = await client.query(
          `SELECT
            al.id,
            al.project_id,
            p.name as project_name,
            al.service,
            al.action,
            al.status,
            al.correlation_id,
            al.actor_type,
            al.actor_id,
            al.resource_type,
            al.resource_id,
            al.metadata,
            al.duration_ms,
            al.error_code,
            al.created_at
          FROM inhouse_activity_log al
          LEFT JOIN projects p ON p.id = al.project_id
          ${whereClause}
          ORDER BY al.created_at DESC
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          activityRows: activitiesResult.rows,
        }
      })

      const activities: ActivityLogEntry[] = activityRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        service: row.service,
        action: row.action,
        status: row.status,
        correlation_id: row.correlation_id,
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        metadata: row.metadata,
        duration_ms: row.duration_ms,
        error_code: row.error_code,
        created_at: row.created_at,
      }))

      return reply.send({
        success: true,
        data: {
          activities,
          total,
          hasMore: offset + activities.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get activity log')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get activity log',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/activity/errors - Get recent errors
  // ===========================================================================
  fastify.get<{
    Querystring: { projectId?: string; limit?: string }
    Reply: { success: boolean; data?: { errors: ActivityLogEntry[]; total: number }; error?: string }
  }>('/v1/admin/inhouse/activity/errors', { preHandler: readMiddleware as any }, async (request, reply) => {
    try {
      const db = requirePool()

      const { projectId, limit: limitStr } = request.query
      const limitRaw = parseInt(limitStr || '50', 10)
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT) : 50

      // Build query conditions
      const conditions: string[] = [`al.status = 'error'`]
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`al.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      // Use withStatementTimeout for safe timeout handling
      const { total, errorRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_activity_log al WHERE ${whereClause}`,
          params
        )

        const errorsResult = await client.query(
          `SELECT
            al.id,
            al.project_id,
            p.name as project_name,
            al.service,
            al.action,
            al.status,
            al.correlation_id,
            al.actor_type,
            al.actor_id,
            al.resource_type,
            al.resource_id,
            al.metadata,
            al.duration_ms,
            al.error_code,
            al.created_at
          FROM inhouse_activity_log al
          LEFT JOIN projects p ON p.id = al.project_id
          WHERE ${whereClause}
          ORDER BY al.created_at DESC
          LIMIT $${paramIndex}`,
          [...params, limit]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          errorRows: errorsResult.rows,
        }
      })

      const errors: ActivityLogEntry[] = errorRows.map(row => ({
        id: row.id,
        project_id: row.project_id,
        project_name: row.project_name,
        service: row.service,
        action: row.action,
        status: row.status,
        correlation_id: row.correlation_id,
        actor_type: row.actor_type,
        actor_id: row.actor_id,
        resource_type: row.resource_type,
        resource_id: row.resource_id,
        metadata: row.metadata,
        duration_ms: row.duration_ms,
        error_code: row.error_code,
        created_at: row.created_at,
      }))

      return reply.send({
        success: true,
        data: {
          errors,
          total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get error log')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get error log',
      })
    }
  })
}
