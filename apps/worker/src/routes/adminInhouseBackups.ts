/**
 * Admin In-House Backups Routes
 *
 * Endpoints for managing and monitoring backups/restores across In-House Mode projects.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseBackupService } from '../services/inhouse/InhouseBackupService'
import { getInhouseRestoreService } from '../services/inhouse/InhouseRestoreService'
import { enqueueRestore } from '../queue/adminRestoreQueue'

// =============================================================================
// TYPES
// =============================================================================

interface BackupsQuery {
  projectId?: string
  status?: string
  limit?: string
  offset?: string
}

interface BackupRow {
  id: string
  project_id: string
  project_name?: string
  owner_email?: string
  schema_name: string
  format: string
  size_bytes: number
  checksum_sha256: string
  r2_bucket: string
  r2_key: string
  created_at: string
  created_by: string
  reason: string
  retention_expires_at: string
  status: string
  error: string | null
  completed_at: string | null
}

interface RestoreRow {
  id: string
  project_id: string
  backup_id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  initiated_by: string | null
  initiated_by_type: string
  error: string | null
}

interface TriggerBackupBody {
  projectId: string
  reason?: 'manual' | 'pre_destructive'
}

interface RestoreBody {
  reason?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STATEMENT_TIMEOUT = '5s'

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

export default async function adminInhouseBackupsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/backups/status
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: { projectId?: string; startDate?: string; endDate?: string; period?: string }
  }>('/v1/admin/inhouse/backups/status', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, startDate, endDate, period } = request.query

      const now = new Date()
      let defaultStart: string
      let defaultEnd: string

      if (period === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        defaultStart = weekAgo.toISOString().split('T')[0]!
        defaultEnd = now.toISOString().split('T')[0]!
      } else if (period === 'day') {
        defaultStart = now.toISOString().split('T')[0]!
        defaultEnd = now.toISOString().split('T')[0]!
      } else {
        defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!
        defaultEnd = now.toISOString().split('T')[0]!
      }

      const effectiveStart = startDate || defaultStart
      const effectiveEnd = endDate || defaultEnd

      const projectFilter = projectId ? 'AND project_id = $3' : ''
      const params = projectId
        ? [effectiveStart, effectiveEnd, projectId]
        : [effectiveStart, effectiveEnd]

      const { backupStatus, restoreStatus } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const backupsResult = await client.query(
          `SELECT status, COUNT(*)::int AS count
           FROM inhouse_backups
           WHERE created_at >= $1::date
             AND created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY status`,
          params
        )

        const restoresResult = await client.query(
          `SELECT status, COUNT(*)::int AS count
           FROM inhouse_restores
           WHERE created_at >= $1::date
             AND created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY status`,
          params
        )

        return {
          backupStatus: backupsResult.rows,
          restoreStatus: restoresResult.rows,
        }
      })

      return reply.send({
        success: true,
        data: {
          backups: backupStatus,
          restores: restoreStatus,
          startDate: effectiveStart,
          endDate: effectiveEnd,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get backup status')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get backup status',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/backups
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: BackupsQuery
    Reply: { success: boolean; data?: { backups: BackupRow[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/backups', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, status, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`b.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (status) {
        conditions.push(`b.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, backupRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM inhouse_backups b
           ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT
             b.*,
             p.name as project_name,
             u.email as owner_email
           FROM inhouse_backups b
           LEFT JOIN projects p ON p.id = b.project_id
           LEFT JOIN auth.users u ON u.id = p.owner_id
           ${whereClause}
           ORDER BY b.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          backupRows: listResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'backups_list',
        projectId: projectId || null,
        resourceType: 'backup',
        metadata: { projectId, status, limit, offset, resultCount: backupRows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          backups: backupRows,
          total,
          hasMore: offset + backupRows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list backups')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list backups',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/backups/trigger
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: TriggerBackupBody
  }>('/v1/admin/inhouse/backups/trigger', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const backupService = getInhouseBackupService()
      const backup = await backupService.createBackup(projectId, {
        reason: reason || 'manual',
        createdBy: 'admin',
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'backup_triggered',
        projectId,
        resourceType: 'backup',
        resourceId: backup.id,
        metadata: { reason: reason || 'manual' },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: backup })
    } catch (error) {
      request.log.error({ error }, 'Failed to trigger backup')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to trigger backup',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/backups/:backupId/preview
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { backupId: string }
  }>('/v1/admin/inhouse/backups/:backupId/preview', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { backupId } = request.params

      const result = await db.query(
        `SELECT b.*, p.name as project_name
         FROM inhouse_backups b
         LEFT JOIN projects p ON p.id = b.project_id
         WHERE b.id = $1`,
        [backupId]
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Backup not found' })
      }

      return reply.send({ success: true, data: result.rows[0] })
    } catch (error) {
      request.log.error({ error }, 'Failed to get backup preview')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get backup preview',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/backups/:backupId/restore
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { backupId: string }
    Body: RestoreBody
  }>('/v1/admin/inhouse/backups/:backupId/restore', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { backupId } = request.params
    const { reason } = request.body

    if (!reason || reason.trim().length < 5) {
      return reply.status(400).send({ success: false, error: 'reason is required (min 5 characters)' })
    }

    try {
      const restoreService = getInhouseRestoreService()
      const restoreId = await restoreService.initiateRestore(backupId, adminRequest.adminClaims.sub, 'admin')

      // Queue the restore execution instead of fire-and-forget
      // This ensures restores complete even if the server restarts
      await enqueueRestore({
        restoreId,
        backupId,
        adminId: adminRequest.adminClaims.sub,
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'restore_initiated',
        resourceType: 'restore',
        resourceId: restoreId,
        reason,
        metadata: { backupId, queued: true },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: { restoreId } })
    } catch (error) {
      request.log.error({ error }, 'Failed to initiate restore')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate restore',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/restores
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: { projectId?: string; status?: string; limit?: string; offset?: string }
  }>('/v1/admin/inhouse/restores', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, status, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`r.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }
      if (status) {
        conditions.push(`r.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, restoreRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_restores r ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT r.*
           FROM inhouse_restores r
           ${whereClause}
           ORDER BY r.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          restoreRows: listResult.rows,
        }
      })

      const adminRequest = request as AdminRequest
      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'restores_list',
        projectId: projectId || null,
        resourceType: 'restore',
        metadata: { projectId, status, limit, offset, resultCount: restoreRows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          restores: restoreRows as RestoreRow[],
          total,
          hasMore: offset + restoreRows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list restores')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list restores',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/restores/:restoreId
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { restoreId: string }
  }>('/v1/admin/inhouse/restores/:restoreId', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const restoreService = getInhouseRestoreService()
      const result = await restoreService.getRestoreStatus(request.params.restoreId)
      if (!result) {
        return reply.status(404).send({ success: false, error: 'Restore not found' })
      }
      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to get restore status')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get restore status',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/restores/:restoreId/rollback
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { restoreId: string }
    Body: { reason?: string }
  }>('/v1/admin/inhouse/restores/:restoreId/rollback', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { restoreId } = request.params
    const { reason } = request.body

    if (!reason || reason.trim().length < 5) {
      return reply.status(400).send({ success: false, error: 'reason is required (min 5 characters)' })
    }

    try {
      const restoreService = getInhouseRestoreService()
      await restoreService.rollbackRestore(restoreId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'restore_rolled_back',
        resourceType: 'restore',
        resourceId: restoreId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to rollback restore')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to rollback restore',
      })
    }
  })
}
