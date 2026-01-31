/**
 * Admin In-House Storage Routes
 *
 * Endpoints for monitoring and managing storage across In-House Mode projects.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseStorageService } from '../services/inhouse/InhouseStorageService'

// =============================================================================
// TYPES
// =============================================================================

interface StorageUsageQuery {
  projectId?: string
  limit?: string
  offset?: string
}

interface StorageFilesQuery {
  prefix?: string
  limit?: string
  cursor?: string
}

interface DeleteFilesBody {
  paths: string[]
  reason?: string
}

// =============================================================================
// HELPERS
// =============================================================================

// =============================================================================
// HELPERS
// =============================================================================

async function ensureProject(db: ReturnType<typeof requirePool>, projectId: string) {
  const projectCheck = await db.query(
    `SELECT id FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
    [projectId]
  )
  return projectCheck.rows.length > 0
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseStorageRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/storage/usage
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: StorageUsageQuery
  }>('/v1/admin/inhouse/storage/usage', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`q.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_quotas q ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT
             q.project_id,
             p.name as project_name,
             q.storage_size_used_bytes,
             q.storage_size_limit_bytes,
             q.updated_at
           FROM inhouse_quotas q
           LEFT JOIN projects p ON p.id = q.project_id
           ${whereClause}
           ORDER BY q.updated_at DESC
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
        action: 'storage_usage_list',
        projectId: projectId || null,
        resourceType: 'storage',
        metadata: { projectId, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          usage: rows,
          total,
          hasMore: offset + rows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get storage usage')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get storage usage',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/projects/:projectId/storage/files
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { projectId: string }
    Querystring: StorageFilesQuery
  }>('/v1/admin/inhouse/projects/:projectId/storage/files', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { prefix, limit, cursor } = request.query

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const service = getInhouseStorageService(projectId)
      const result = await service.list({
        prefix,
        limit: limit ? Math.min(parseInt(limit, 10), 1000) : undefined,
        cursor,
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'storage_files_list',
        projectId,
        resourceType: 'storage_file',
        metadata: { prefix, limit, cursor, resultCount: result.files.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to list storage files')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list storage files',
      })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /v1/admin/inhouse/projects/:projectId/storage/files
  // -------------------------------------------------------------------------
  fastify.delete<{
    Params: { projectId: string }
    Body: DeleteFilesBody
  }>('/v1/admin/inhouse/projects/:projectId/storage/files', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { paths, reason } = request.body

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      return reply.status(400).send({ success: false, error: 'paths is required' })
    }
    if (!reason || reason.trim().length < 5) {
      return reply.status(400).send({ success: false, error: 'reason is required (min 5 characters)' })
    }

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const service = getInhouseStorageService(projectId)
      const result = await service.delete(paths)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'storage_files_delete',
        projectId,
        resourceType: 'storage_file',
        reason: reason || null,
        metadata: { deleted: result.deleted.length, failed: result.failed.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to delete storage files')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete storage files',
      })
    }
  })
}
