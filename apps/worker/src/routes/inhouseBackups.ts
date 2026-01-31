/**
 * In-House Backup and Restore Routes
 *
 * HTTP endpoints for managing Easy Mode project backups and restores.
 *
 * Backup Routes (HMAC + project auth):
 * - GET    /v1/inhouse/projects/:projectId/backups              - List backups
 * - POST   /v1/inhouse/projects/:projectId/backups              - Create manual backup
 * - GET    /v1/inhouse/projects/:projectId/backups/:backupId    - Get backup metadata
 * - GET    /v1/inhouse/projects/:projectId/backups/:backupId/download - Get download URL
 * - DELETE /v1/inhouse/projects/:projectId/backups/:backupId    - Delete backup
 *
 * Restore Routes (Admin-only):
 * - POST   /v1/inhouse/projects/:projectId/restores             - Initiate restore
 * - GET    /v1/inhouse/projects/:projectId/restores/:restoreId  - Get restore status
 * - POST   /v1/inhouse/projects/:projectId/restores/:restoreId/rollback - Rollback restore
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { timingSafeEqual } from 'crypto'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getInhouseBackupService, ListBackupsOptions } from '../services/inhouse/InhouseBackupService'
import { getInhouseRestoreService, InitiatedByType } from '../services/inhouse/InhouseRestoreService'
import { getPool } from '../services/database'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ListBackupsQuery {
  userId: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'deleted'
  limit?: string
  offset?: string
}

interface CreateBackupBody {
  userId: string
  reason?: 'manual' | 'pre_destructive'
}

interface InitiateRestoreBody {
  userId: string
  backupId: string
  adminKey?: string
}

interface RollbackRestoreBody {
  userId: string
  adminKey?: string
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Verify that the user has access to the project
 */
async function verifyProjectAccess(projectId: string, userId: string): Promise<boolean> {
  const pool = getPool()

  const result = await pool.query(
    `SELECT 1 FROM projects p
     WHERE p.id = $1
       AND p.infra_mode = 'easy'
       AND (
         p.owner_id = $2
         OR EXISTS (
           SELECT 1 FROM project_collaborators pc
           WHERE pc.project_id = p.id AND pc.user_id = $2
         )
       )`,
    [projectId, userId]
  )

  return result.rows.length > 0
}

/**
 * Verify that the user has admin access
 * SECURITY: Fail closed - requires EITHER valid admin key OR admin role
 * If admin key is provided, it MUST match (don't fall through to role check)
 */
async function verifyAdminAccess(userId: string, adminKey?: string): Promise<boolean> {
  const expectedAdminKey = process.env.INHOUSE_ADMIN_KEY

  // If admin key is provided in request, validate it strictly
  if (adminKey) {
    // SECURITY: Fail closed - if INHOUSE_ADMIN_KEY is not configured, reject
    if (!expectedAdminKey) {
      console.error('[InhouseBackups] Admin key provided but INHOUSE_ADMIN_KEY not configured')
      return false
    }
    // Use crypto.timingSafeEqual for timing-attack resistant comparison
    if (adminKey.length !== expectedAdminKey.length) {
      return false
    }
    try {
      return timingSafeEqual(
        Buffer.from(adminKey),
        Buffer.from(expectedAdminKey)
      )
    } catch {
      return false
    }
  }

  // No admin key provided - check user has admin role
  const pool = getPool()

  try {
    const result = await pool.query(
      `SELECT raw_app_meta_data->>'role' as role,
              raw_app_meta_data->>'is_admin' as is_admin
       FROM auth.users
       WHERE id = $1`,
      [userId]
    )

    if (result.rows.length > 0) {
      const { role, is_admin } = result.rows[0]
      if (role === 'admin' || role === 'super_admin' || is_admin === 'true') {
        return true
      }
    }
  } catch (error) {
    // SECURITY: Fail closed on DB errors
    console.error('[InhouseBackups] Error checking admin status - denying access:', error)
    return false
  }

  return false
}

/**
 * Verify project belongs to backup
 */
async function verifyBackupBelongsToProject(backupId: string, projectId: string): Promise<boolean> {
  const pool = getPool()

  const result = await pool.query(
    `SELECT 1 FROM inhouse_backups WHERE id = $1 AND project_id = $2`,
    [backupId, projectId]
  )

  return result.rows.length > 0
}

/**
 * Verify restore belongs to project
 */
async function verifyRestoreBelongsToProject(restoreId: string, projectId: string): Promise<boolean> {
  const pool = getPool()

  const result = await pool.query(
    `SELECT 1 FROM inhouse_restores WHERE id = $1 AND project_id = $2`,
    [restoreId, projectId]
  )

  return result.rows.length > 0
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseBackupRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()
  const backupService = getInhouseBackupService()
  const restoreService = getInhouseRestoreService()

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/backups - List backups
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ListBackupsQuery
  }>('/v1/inhouse/projects/:projectId/backups', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, status, limit, offset } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    try {
      const options: ListBackupsOptions = {
        limit: limit ? Math.min(Math.max(Number(limit) || 50, 1), 100) : 50,
        offset: offset ? Math.max(Number(offset) || 0, 0) : 0
      }
      if (status) options.status = status

      const result = await backupService.listBackups(projectId, options)

      return reply.send({
        ok: true,
        data: {
          backups: result.backups,
          total: result.total,
          limit: options.limit || 50,
          offset: options.offset || 0,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'LIST_BACKUPS_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/backups - Create manual backup
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string }
    Body: CreateBackupBody
  }>('/v1/inhouse/projects/:projectId/backups', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, reason = 'manual' } = request.body

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Validate reason
    if (!['manual', 'pre_destructive'].includes(reason)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REASON',
          message: 'reason must be "manual" or "pre_destructive"',
        },
      })
    }

    try {
      const backup = await backupService.createBackup(projectId, {
        reason,
        createdBy: 'user',
      })

      // Log backup creation
      logActivity({
        projectId,
        service: 'backups',
        action: 'backup_created',
        actorType: 'user',
        actorId: userId,
        resourceType: 'backup',
        resourceId: backup.id,
        metadata: { reason },
      })

      return reply.code(201).send({
        ok: true,
        data: backup,
      })
    } catch (error: any) {
      // Handle concurrent backup error
      if (error.code === 'BACKUP_ALREADY_RUNNING') {
        return reply.code(409).send({
          ok: false,
          error: {
            code: 'BACKUP_ALREADY_RUNNING',
            message: error.message,
          },
        })
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'CREATE_BACKUP_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/backups/:backupId - Get backup metadata
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; backupId: string }
    Querystring: { userId: string }
  }>('/v1/inhouse/projects/:projectId/backups/:backupId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, backupId } = request.params
    const { userId } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Verify backup belongs to project
    const belongs = await verifyBackupBelongsToProject(backupId, projectId)
    if (!belongs) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Backup not found',
        },
      })
    }

    try {
      const backup = await backupService.getBackup(backupId)

      if (!backup) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Backup not found',
          },
        })
      }

      return reply.send({
        ok: true,
        data: backup,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'GET_BACKUP_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/backups/:backupId/download - Stream backup
  // ===========================================================================
  // SECURITY: Streams decrypted backup directly to client.
  // Never stores plaintext in R2 or other persistent storage.
  fastify.get<{
    Params: { projectId: string; backupId: string }
    Querystring: { userId: string }
  }>('/v1/inhouse/projects/:projectId/backups/:backupId/download', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, backupId } = request.params
    const { userId } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Verify backup belongs to project
    const belongs = await verifyBackupBelongsToProject(backupId, projectId)
    if (!belongs) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Backup not found',
        },
      })
    }

    try {
      const result = await backupService.getDecryptedBackup(backupId, userId)

      if (!result) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Backup not found or not ready for download',
          },
        })
      }

      // Stream the decrypted backup directly to client
      return reply
        .header('Content-Type', 'application/octet-stream')
        .header('Content-Disposition', `attachment; filename="${result.filename}"`)
        .header('Content-Length', result.data.length)
        .header('X-Backup-Checksum', result.checksum)
        .send(result.data)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'DOWNLOAD_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // DELETE /v1/inhouse/projects/:projectId/backups/:backupId - Delete backup
  // ===========================================================================
  fastify.delete<{
    Params: { projectId: string; backupId: string }
    Body: { userId: string }
  }>('/v1/inhouse/projects/:projectId/backups/:backupId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, backupId } = request.params
    const { userId } = request.body

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Verify backup belongs to project
    const belongs = await verifyBackupBelongsToProject(backupId, projectId)
    if (!belongs) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Backup not found',
        },
      })
    }

    try {
      const deleted = await backupService.deleteBackup(backupId, userId)

      if (!deleted) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Backup not found or already deleted',
          },
        })
      }

      // Log backup deletion
      logActivity({
        projectId,
        service: 'backups',
        action: 'backup_deleted',
        actorType: 'user',
        actorId: userId,
        resourceType: 'backup',
        resourceId: backupId,
      })

      return reply.send({
        ok: true,
        data: {
          deleted: true,
          backupId,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'DELETE_BACKUP_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/restores - Initiate restore (Admin-only)
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string }
    Body: InitiateRestoreBody
  }>('/v1/inhouse/projects/:projectId/restores', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, backupId, adminKey } = request.body

    if (!userId || !backupId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId and backupId are required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Verify admin access
    const isAdmin = await verifyAdminAccess(userId, adminKey)
    if (!isAdmin) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'ADMIN_ACCESS_REQUIRED',
          message: 'Admin access is required to initiate a restore',
        },
      })
    }

    // Verify backup belongs to project
    const belongs = await verifyBackupBelongsToProject(backupId, projectId)
    if (!belongs) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Backup not found',
        },
      })
    }

    try {
      const initiatedByType: InitiatedByType = adminKey ? 'admin' : 'user'

      // Initiate the restore
      const restoreId = await restoreService.initiateRestore(backupId, userId, initiatedByType)

      // Log restore initiation
      logActivity({
        projectId,
        service: 'backups',
        action: 'restore_initiated',
        actorType: initiatedByType,
        actorId: userId,
        resourceType: 'restore',
        resourceId: restoreId,
        metadata: { backupId },
      })

      // Execute the restore asynchronously
      // In production, this should be queued as a job
      restoreService.executeRestore(restoreId).catch((error) => {
        console.error(`[InhouseBackups] Async restore execution failed for ${restoreId}:`, error)
      })

      return reply.code(202).send({
        ok: true,
        data: {
          restoreId,
          status: 'pending',
          message: 'Restore initiated. Use the status endpoint to track progress.',
        },
      })
    } catch (error: any) {
      // Handle concurrent restore error
      if (error.code === 'RESTORE_ALREADY_RUNNING') {
        return reply.code(409).send({
          ok: false,
          error: {
            code: 'RESTORE_ALREADY_RUNNING',
            message: error.message,
          },
        })
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INITIATE_RESTORE_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/restores/:restoreId - Get restore status
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; restoreId: string }
    Querystring: { userId: string; adminKey?: string }
  }>('/v1/inhouse/projects/:projectId/restores/:restoreId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, restoreId } = request.params
    const { userId, adminKey } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Verify admin access (for restore operations)
    const isAdmin = await verifyAdminAccess(userId, adminKey)
    if (!isAdmin) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'ADMIN_ACCESS_REQUIRED',
          message: 'Admin access is required to view restore status',
        },
      })
    }

    // Verify restore belongs to project
    const belongs = await verifyRestoreBelongsToProject(restoreId, projectId)
    if (!belongs) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Restore not found',
        },
      })
    }

    try {
      const result = await restoreService.getRestoreStatus(restoreId)

      if (!result) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Restore not found',
          },
        })
      }

      return reply.send({
        ok: true,
        data: {
          restore: result.restore,
          backup: result.backup,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'GET_RESTORE_STATUS_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/restores/:restoreId/rollback - Rollback restore
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; restoreId: string }
    Body: RollbackRestoreBody
  }>('/v1/inhouse/projects/:projectId/restores/:restoreId/rollback', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, restoreId } = request.params
    const { userId, adminKey } = request.body

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Verify admin access
    const isAdmin = await verifyAdminAccess(userId, adminKey)
    if (!isAdmin) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'ADMIN_ACCESS_REQUIRED',
          message: 'Admin access is required to rollback a restore',
        },
      })
    }

    // Verify restore belongs to project
    const belongs = await verifyRestoreBelongsToProject(restoreId, projectId)
    if (!belongs) {
      return reply.code(404).send({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Restore not found',
        },
      })
    }

    try {
      await restoreService.rollbackRestore(restoreId)

      // Log restore rollback
      logActivity({
        projectId,
        service: 'backups',
        action: 'restore_rolled_back',
        actorType: adminKey ? 'admin' : 'user',
        actorId: userId,
        resourceType: 'restore',
        resourceId: restoreId,
      })

      return reply.send({
        ok: true,
        data: {
          restoreId,
          status: 'rolled_back',
          message: 'Restore has been rolled back successfully',
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'ROLLBACK_RESTORE_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/restores - List restores (Admin-only)
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId: string; adminKey?: string; limit?: string; offset?: string }
  }>('/v1/inhouse/projects/:projectId/restores', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, adminKey, limit, offset } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'userId is required',
        },
      })
    }

    // Verify project access
    const hasAccess = await verifyProjectAccess(projectId, userId)
    if (!hasAccess) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'UNAUTHORIZED_PROJECT_ACCESS',
          message: 'You do not have access to this project',
        },
      })
    }

    // Verify admin access
    const isAdmin = await verifyAdminAccess(userId, adminKey)
    if (!isAdmin) {
      return reply.code(403).send({
        ok: false,
        error: {
          code: 'ADMIN_ACCESS_REQUIRED',
          message: 'Admin access is required to list restores',
        },
      })
    }

    try {
      const options = {
        limit: limit ? Math.min(Math.max(Number(limit) || 20, 1), 100) : 20,
        offset: offset ? Math.max(Number(offset) || 0, 0) : 0
      }

      const result = await restoreService.listRestores(projectId, options)

      return reply.send({
        ok: true,
        data: {
          restores: result.restores,
          total: result.total,
          limit: options.limit ?? 20,
          offset: options.offset ?? 0,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'LIST_RESTORES_FAILED',
          message: errorMessage,
        },
      })
    }
  })
}
