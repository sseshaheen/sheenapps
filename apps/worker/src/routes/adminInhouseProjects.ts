/**
 * Admin In-House Projects Routes
 *
 * Endpoints for managing In-House Mode projects from the admin panel.
 * Provides visibility into all projects, usage, status, and actions.
 *
 * Routes:
 * - GET    /v1/admin/inhouse/projects             - List all projects with filtering
 * - GET    /v1/admin/inhouse/projects/:projectId  - Get project details
 * - POST   /v1/admin/inhouse/projects/:projectId/suspend   - Suspend project
 * - POST   /v1/admin/inhouse/projects/:projectId/unsuspend - Unsuspend project
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { auditAdminAction } from './admin/_audit'
import { withStatementTimeout } from '../utils/dbTimeout'
import { randomUUID } from 'crypto'
import { requirePool, parseLimitOffset } from './admin/_utils'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ListProjectsQuery {
  search?: string
  plan?: string
  status?: string
  sortBy?: 'created_at' | 'last_activity' | 'storage_bytes'
  sortDir?: 'asc' | 'desc'
  limit?: string
  offset?: string
}

interface ProjectListItem {
  id: string
  name: string
  created_at: string
  status: string
  owner_email: string
  owner_name: string | null
  plan_name: string | null
  storage_bytes: number
  job_runs: number
  email_sends: number
}

interface ProjectDetails {
  id: string
  name: string
  subdomain: string | null
  framework: string | null
  created_at: string
  updated_at: string
  status: string
  owner: {
    id: string
    email: string
    full_name: string | null
  }
  plan: {
    id: string | null
    name: string | null
  }
  usage: {
    storage_bytes: number
    storage_limit_bytes: number
    job_runs: number
    job_runs_limit: number
    email_sends: number
    email_sends_limit: number
    secrets_count: number
    secrets_limit: number
    backup_storage_bytes: number
    backup_storage_limit_bytes: number
  }
  schema: {
    name: string | null
    table_count: number
    row_count_estimate: number
    size_bytes: number
  }
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const STATEMENT_TIMEOUT = '5s'


// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseProjectsRoutes(fastify: FastifyInstance) {
  // All routes require admin authentication with inhouse.read permission
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects - List all In-House Mode projects
  // ===========================================================================
  fastify.get<{
    Querystring: ListProjectsQuery
    Reply: { success: boolean; data?: { projects: ProjectListItem[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects', { preHandler: readMiddleware as any }, async (request, reply) => {
    const adminRequest = request as AdminRequest

    try {
      const {
        search,
        plan,
        status,
        sortBy = 'created_at',
        sortDir = 'desc',
        limit: limitStr,
        offset: offsetStr,
      } = request.query

      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      // Validate sortBy to prevent SQL injection
      const validSortColumns = ['created_at', 'last_activity', 'storage_bytes']
      const safeSort = validSortColumns.includes(sortBy) ? sortBy : 'created_at'
      const safeSortDir = sortDir === 'asc' ? 'ASC' : 'DESC'

      // Build the query with filters
      const conditions: string[] = [`p.infra_mode = 'easy'`]
      const params: any[] = []
      let paramIndex = 1

      if (search) {
        conditions.push(`(
          p.name ILIKE $${paramIndex} OR
          u.email ILIKE $${paramIndex} OR
          p.id::text = $${paramIndex + 1}
        )`)
        params.push(`%${search}%`, search)
        paramIndex += 2
      }

      if (plan && plan !== 'all') {
        conditions.push(`bp.name = $${paramIndex}`)
        params.push(plan)
        paramIndex++
      }

      if (status && status !== 'all') {
        conditions.push(`p.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      // Get projects with pagination
      // Note: For sorting by last_activity, we'd need to join with inhouse_activity_log
      // For now, we'll use created_at as fallback for last_activity
      const sortColumn = safeSort === 'last_activity' ? 'p.updated_at' :
                         safeSort === 'storage_bytes' ? 'COALESCE(iq.storage_bytes, 0)' :
                         'p.created_at'

      const db = requirePool()

      // Use withStatementTimeout to prevent leaky settings on pooled connections
      const { total, projectRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        // Get total count
        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM projects p
           LEFT JOIN auth.users u ON u.id = p.owner_id
           LEFT JOIN billing_customers bc ON bc.user_id = p.owner_id
           LEFT JOIN billing_plans bp ON bp.id = bc.plan_id
           WHERE ${whereClause}`,
          params
        )

        // Get projects with pagination
        const projectsResult = await client.query(
          `SELECT
            p.id,
            p.name,
            p.created_at,
            COALESCE(p.status, 'active') as status,
            u.email as owner_email,
            u.raw_user_meta_data->>'full_name' as owner_name,
            bp.name as plan_name,
            COALESCE(iq.storage_bytes, 0) as storage_bytes,
            COALESCE(iq.job_runs, 0) as job_runs,
            COALESCE(iq.email_sends, 0) as email_sends
          FROM projects p
          LEFT JOIN auth.users u ON u.id = p.owner_id
          LEFT JOIN billing_customers bc ON bc.user_id = p.owner_id
          LEFT JOIN billing_plans bp ON bp.id = bc.plan_id
          LEFT JOIN inhouse_quotas iq ON iq.project_id = p.id
          WHERE ${whereClause}
          ORDER BY ${sortColumn} ${safeSortDir}
          LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          projectRows: projectsResult.rows,
        }
      })

      const projects: ProjectListItem[] = projectRows.map(row => ({
        id: row.id,
        name: row.name,
        created_at: row.created_at,
        status: row.status,
        owner_email: row.owner_email || 'unknown',
        owner_name: row.owner_name,
        plan_name: row.plan_name,
        storage_bytes: parseInt(row.storage_bytes, 10),
        job_runs: parseInt(row.job_runs, 10),
        email_sends: parseInt(row.email_sends, 10),
      }))

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'projects_list',
        resourceType: 'project',
        metadata: { search, plan, status, limit, offset, resultCount: projects.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          projects,
          total,
          hasMore: offset + projects.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list In-House Mode projects')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list projects',
      })
    }
  })

  // ===========================================================================
  // GET /v1/admin/inhouse/projects/:projectId - Get project details
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Reply: { success: boolean; data?: ProjectDetails; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId', { preHandler: readMiddleware as any }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params

    try {
      const db = requirePool()

      // Get project details with owner, plan, and usage
      const result = await db.query(
        `SELECT
          p.id,
          p.name,
          p.subdomain,
          p.framework,
          p.created_at,
          p.updated_at,
          COALESCE(p.status, 'active') as status,
          p.owner_id,
          u.email as owner_email,
          u.raw_user_meta_data->>'full_name' as owner_name,
          bc.plan_id,
          bp.name as plan_name,
          COALESCE(iq.storage_bytes, 0) as storage_bytes,
          COALESCE(iq.storage_limit_bytes, 104857600) as storage_limit_bytes,
          COALESCE(iq.job_runs, 0) as job_runs,
          COALESCE(iq.job_runs_limit, 1000) as job_runs_limit,
          COALESCE(iq.email_sends, 0) as email_sends,
          COALESCE(iq.email_sends_limit, 1000) as email_sends_limit,
          COALESCE(iq.secrets_count, 0) as secrets_count,
          COALESCE(iq.secrets_limit, 50) as secrets_limit,
          COALESCE(iq.backup_storage_bytes, 0) as backup_storage_bytes,
          COALESCE(iq.backup_storage_limit_bytes, 104857600) as backup_storage_limit_bytes,
          isc.schema_name,
          COALESCE(isc.table_count, 0) as table_count,
          COALESCE(isc.row_count_estimate, 0) as row_count_estimate,
          COALESCE(isc.size_bytes, 0) as schema_size_bytes
        FROM projects p
        LEFT JOIN auth.users u ON u.id = p.owner_id
        LEFT JOIN billing_customers bc ON bc.user_id = p.owner_id
        LEFT JOIN billing_plans bp ON bp.id = bc.plan_id
        LEFT JOIN inhouse_quotas iq ON iq.project_id = p.id
        LEFT JOIN inhouse_schemas isc ON isc.project_id = p.id
        WHERE p.id = $1 AND p.infra_mode = 'easy'`,
        [projectId]
      )

      if (!result.rows.length) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        })
      }

      const row = result.rows[0]
      const projectDetails: ProjectDetails = {
        id: row.id,
        name: row.name,
        subdomain: row.subdomain,
        framework: row.framework,
        created_at: row.created_at,
        updated_at: row.updated_at,
        status: row.status,
        owner: {
          id: row.owner_id,
          email: row.owner_email || 'unknown',
          full_name: row.owner_name,
        },
        plan: {
          id: row.plan_id,
          name: row.plan_name,
        },
        usage: {
          storage_bytes: parseInt(row.storage_bytes, 10),
          storage_limit_bytes: parseInt(row.storage_limit_bytes, 10),
          job_runs: parseInt(row.job_runs, 10),
          job_runs_limit: parseInt(row.job_runs_limit, 10),
          email_sends: parseInt(row.email_sends, 10),
          email_sends_limit: parseInt(row.email_sends_limit, 10),
          secrets_count: parseInt(row.secrets_count, 10),
          secrets_limit: parseInt(row.secrets_limit, 10),
          backup_storage_bytes: parseInt(row.backup_storage_bytes, 10),
          backup_storage_limit_bytes: parseInt(row.backup_storage_limit_bytes, 10),
        },
        schema: {
          name: row.schema_name,
          table_count: parseInt(row.table_count, 10),
          row_count_estimate: parseInt(row.row_count_estimate, 10),
          size_bytes: parseInt(row.schema_size_bytes, 10),
        },
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'project_view',
        projectId,
        resourceType: 'project',
        resourceId: projectId,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: projectDetails,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get project details')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get project details',
      })
    }
  })

  // ===========================================================================
  // POST /v1/admin/inhouse/projects/:projectId/suspend - Suspend project
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string }
    Body: { reason: string }
    Reply: { success: boolean; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/suspend', { preHandler: writeMiddleware as any }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { reason } = request.body

    if (!reason) {
      return reply.status(400).send({
        success: false,
        error: 'Reason is required for suspension',
      })
    }

    try {
      const db = requirePool()

      // Check project exists and is Easy Mode
      const checkResult = await db.query(
        `SELECT id, status FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
        [projectId]
      )

      if (!checkResult.rows.length) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        })
      }

      if (checkResult.rows[0].status === 'suspended') {
        return reply.status(400).send({
          success: false,
          error: 'Project is already suspended',
        })
      }

      // Suspend the project
      await db.query(
        `UPDATE projects SET status = 'suspended', updated_at = NOW() WHERE id = $1`,
        [projectId]
      )

      // Log the admin action
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'project_suspend',
        projectId,
        resourceType: 'project',
        resourceId: projectId,
        reason,
        metadata: { previousStatus: checkResult.rows[0].status },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to suspend project')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to suspend project',
      })
    }
  })

  // ===========================================================================
  // POST /v1/admin/inhouse/projects/:projectId/unsuspend - Unsuspend project
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string }
    Body: { reason: string }
    Reply: { success: boolean; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/unsuspend', { preHandler: writeMiddleware as any }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { reason } = request.body

    if (!reason) {
      return reply.status(400).send({
        success: false,
        error: 'Reason is required for unsuspension',
      })
    }

    try {
      const db = requirePool()

      // Check project exists and is Easy Mode
      const checkResult = await db.query(
        `SELECT id, status FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
        [projectId]
      )

      if (!checkResult.rows.length) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        })
      }

      if (checkResult.rows[0].status !== 'suspended') {
        return reply.status(400).send({
          success: false,
          error: 'Project is not suspended',
        })
      }

      // Unsuspend the project
      await db.query(
        `UPDATE projects SET status = 'active', updated_at = NOW() WHERE id = $1`,
        [projectId]
      )

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'project_unsuspend',
        projectId,
        resourceType: 'project',
        resourceId: projectId,
        reason,
        metadata: { previousStatus: 'suspended' },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to unsuspend project')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unsuspend project',
      })
    }
  })
}
