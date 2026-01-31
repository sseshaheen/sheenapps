/**
 * In-House Backup Routes (DEPRECATED)
 *
 * @deprecated Use inhouseBackups.ts instead, which has:
 * - Consistent `ok: true` response format (matching rest of codebase)
 * - Proper admin access verification
 * - Restore endpoints
 *
 * This file is kept for backwards compatibility with admin routes only.
 * The regular backup CRUD routes should use inhouseBackups.ts.
 *
 * Admin Routes:
 * - POST   /v1/admin/inhouse/backups/run-daily - Trigger daily backups manually
 * - POST   /v1/admin/inhouse/backups/run-cleanup - Trigger cleanup manually
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { assertProjectAccess } from '../utils/projectAuth';
import { getInhouseBackupService, BackupMetadata, ListBackupsResult } from '../services/inhouse/InhouseBackupService';

/**
 * Verify admin access via admin key (timing-safe comparison)
 * SECURITY: Fail closed - requires valid admin key
 */
function verifyAdminKey(providedKey?: string): boolean {
  const expectedKey = process.env.INHOUSE_ADMIN_KEY
  if (!expectedKey || !providedKey) {
    return false
  }
  if (providedKey.length !== expectedKey.length) {
    return false
  }
  try {
    return timingSafeEqual(
      Buffer.from(providedKey),
      Buffer.from(expectedKey)
    )
  } catch {
    return false
  }
}

// =============================================================================
// LIMITS (DoS Protection)
// =============================================================================

/**
 * Maximum backups per list request
 */
const MAX_LIST_LIMIT = 100;

/**
 * Valid backup reasons
 */
const VALID_REASONS = ['daily', 'manual', 'pre_destructive', 'pre_restore'] as const;

/**
 * Valid backup formats
 */
const VALID_FORMATS = ['custom', 'plain'] as const;

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface CreateBackupBody {
  reason?: typeof VALID_REASONS[number];
  format?: typeof VALID_FORMATS[number];
  userId?: string;
}

interface ListBackupsQuery {
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | 'deleted';
  limit?: string;
  offset?: string;
  userId?: string;
}

interface BackupParams {
  projectId: string;
  backupId?: string;
}

interface DownloadQuery {
  userId?: string;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function inhouseBackupRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature();

  // ---------------------------------------------------------------------------
  // POST /v1/inhouse/projects/:projectId/backups - Create a backup
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: { projectId: string };
    Body: CreateBackupBody;
  }>(
    '/v1/inhouse/projects/:projectId/backups',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params;
      const { reason = 'manual', format = 'custom', userId } = request.body;

      // Validate reason
      if (!VALID_REASONS.includes(reason)) {
        return reply.code(400).send({
          error: 'INVALID_REASON',
          message: `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}`
        });
      }

      // Validate format
      if (!VALID_FORMATS.includes(format)) {
        return reply.code(400).send({
          error: 'INVALID_FORMAT',
          message: `Invalid format. Must be one of: ${VALID_FORMATS.join(', ')}`
        });
      }

      // Validate project access
      if (userId) {
        try {
          await assertProjectAccess(projectId, userId);
        } catch (error: any) {
          return reply.code(403).send({
            error: 'UNAUTHORIZED_PROJECT_ACCESS',
            message: 'You do not have access to this project'
          });
        }
      }

      try {
        const backupService = getInhouseBackupService();
        const backup = await backupService.createBackup(projectId, {
          reason,
          format,
          createdBy: userId ? 'user' : 'system'
        });

        console.log(`[InhouseBackup] Created backup ${backup.id} for project ${projectId}`);

        return reply.code(201).send({
          success: true,
          backup
        });
      } catch (error: any) {
        console.error(`[InhouseBackup] Failed to create backup for ${projectId}:`, error);

        if (error.message.includes('not found')) {
          return reply.code(404).send({
            error: 'PROJECT_NOT_FOUND',
            message: error.message
          });
        }

        return reply.code(500).send({
          error: 'BACKUP_FAILED',
          message: error.message
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /v1/inhouse/projects/:projectId/backups - List backups
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: { projectId: string };
    Querystring: ListBackupsQuery;
  }>(
    '/v1/inhouse/projects/:projectId/backups',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params;
      const { status, limit: limitStr, offset: offsetStr, userId } = request.query;

      // Parse pagination
      const limit = Math.min(parseInt(limitStr || '50', 10), MAX_LIST_LIMIT);
      const offset = parseInt(offsetStr || '0', 10);

      if (isNaN(limit) || limit < 1) {
        return reply.code(400).send({
          error: 'INVALID_LIMIT',
          message: 'limit must be a positive integer'
        });
      }

      if (isNaN(offset) || offset < 0) {
        return reply.code(400).send({
          error: 'INVALID_OFFSET',
          message: 'offset must be a non-negative integer'
        });
      }

      // Validate project access
      if (userId) {
        try {
          await assertProjectAccess(projectId, userId);
        } catch (error: any) {
          return reply.code(403).send({
            error: 'UNAUTHORIZED_PROJECT_ACCESS',
            message: 'You do not have access to this project'
          });
        }
      }

      try {
        const backupService = getInhouseBackupService();
        const result: ListBackupsResult = await backupService.listBackups(projectId, {
          status,
          limit,
          offset
        });

        return reply.send({
          success: true,
          ...result
        });
      } catch (error: any) {
        console.error(`[InhouseBackup] Failed to list backups for ${projectId}:`, error);
        return reply.code(500).send({
          error: 'LIST_FAILED',
          message: error.message
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /v1/inhouse/projects/:projectId/backups/:backupId - Get backup details
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: BackupParams;
    Querystring: { userId?: string };
  }>(
    '/v1/inhouse/projects/:projectId/backups/:backupId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, backupId } = request.params;
      const { userId } = request.query;

      if (!backupId) {
        return reply.code(400).send({
          error: 'MISSING_BACKUP_ID',
          message: 'backupId is required'
        });
      }

      // Validate project access
      if (userId) {
        try {
          await assertProjectAccess(projectId, userId);
        } catch (error: any) {
          return reply.code(403).send({
            error: 'UNAUTHORIZED_PROJECT_ACCESS',
            message: 'You do not have access to this project'
          });
        }
      }

      try {
        const backupService = getInhouseBackupService();
        const backup: BackupMetadata | null = await backupService.getBackup(backupId);

        if (!backup) {
          return reply.code(404).send({
            error: 'BACKUP_NOT_FOUND',
            message: `Backup ${backupId} not found`
          });
        }

        // Verify backup belongs to this project
        if (backup.projectId !== projectId) {
          return reply.code(404).send({
            error: 'BACKUP_NOT_FOUND',
            message: `Backup ${backupId} not found for this project`
          });
        }

        return reply.send({
          success: true,
          backup
        });
      } catch (error: any) {
        console.error(`[InhouseBackup] Failed to get backup ${backupId}:`, error);
        return reply.code(500).send({
          error: 'GET_FAILED',
          message: error.message
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /v1/inhouse/projects/:projectId/backups/:backupId/download - Get download URL
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: BackupParams;
    Querystring: DownloadQuery;
  }>(
    '/v1/inhouse/projects/:projectId/backups/:backupId/download',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, backupId } = request.params;
      const { userId } = request.query;

      if (!backupId) {
        return reply.code(400).send({
          error: 'MISSING_BACKUP_ID',
          message: 'backupId is required'
        });
      }

      // Validate project access
      if (userId) {
        try {
          await assertProjectAccess(projectId, userId);
        } catch (error: any) {
          return reply.code(403).send({
            error: 'UNAUTHORIZED_PROJECT_ACCESS',
            message: 'You do not have access to this project'
          });
        }
      }

      try {
        const backupService = getInhouseBackupService();

        // First verify backup exists and belongs to this project
        const backup = await backupService.getBackup(backupId);
        if (!backup) {
          return reply.code(404).send({
            error: 'BACKUP_NOT_FOUND',
            message: `Backup ${backupId} not found`
          });
        }

        if (backup.projectId !== projectId) {
          return reply.code(404).send({
            error: 'BACKUP_NOT_FOUND',
            message: `Backup ${backupId} not found for this project`
          });
        }

        if (backup.status !== 'completed') {
          return reply.code(400).send({
            error: 'BACKUP_NOT_READY',
            message: `Backup is in ${backup.status} state and cannot be downloaded`
          });
        }

        const result = await backupService.getDownloadUrl(backupId, userId);

        if (!result) {
          return reply.code(500).send({
            error: 'DOWNLOAD_FAILED',
            message: 'Failed to generate download URL'
          });
        }

        console.log(`[InhouseBackup] Generated download URL for backup ${backupId}`);

        return reply.send({
          success: true,
          url: result.url,
          expiresAt: result.expiresAt
        });
      } catch (error: any) {
        console.error(`[InhouseBackup] Failed to get download URL for ${backupId}:`, error);
        return reply.code(500).send({
          error: 'DOWNLOAD_FAILED',
          message: error.message
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // DELETE /v1/inhouse/projects/:projectId/backups/:backupId - Delete a backup
  // ---------------------------------------------------------------------------
  fastify.delete<{
    Params: BackupParams;
    Body: { userId?: string };
  }>(
    '/v1/inhouse/projects/:projectId/backups/:backupId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, backupId } = request.params;
      const { userId } = request.body;

      if (!backupId) {
        return reply.code(400).send({
          error: 'MISSING_BACKUP_ID',
          message: 'backupId is required'
        });
      }

      // Validate project access
      if (userId) {
        try {
          await assertProjectAccess(projectId, userId);
        } catch (error: any) {
          return reply.code(403).send({
            error: 'UNAUTHORIZED_PROJECT_ACCESS',
            message: 'You do not have access to this project'
          });
        }
      }

      try {
        const backupService = getInhouseBackupService();

        // First verify backup exists and belongs to this project
        const backup = await backupService.getBackup(backupId);
        if (!backup) {
          return reply.code(404).send({
            error: 'BACKUP_NOT_FOUND',
            message: `Backup ${backupId} not found`
          });
        }

        if (backup.projectId !== projectId) {
          return reply.code(404).send({
            error: 'BACKUP_NOT_FOUND',
            message: `Backup ${backupId} not found for this project`
          });
        }

        const deleted = await backupService.deleteBackup(backupId, userId);

        if (!deleted) {
          return reply.code(500).send({
            error: 'DELETE_FAILED',
            message: 'Failed to delete backup'
          });
        }

        console.log(`[InhouseBackup] Deleted backup ${backupId} for project ${projectId}`);

        return reply.send({
          success: true,
          message: `Backup ${backupId} deleted`
        });
      } catch (error: any) {
        console.error(`[InhouseBackup] Failed to delete backup ${backupId}:`, error);
        return reply.code(500).send({
          error: 'DELETE_FAILED',
          message: error.message
        });
      }
    }
  );

  // ===========================================================================
  // ADMIN ROUTES - Manual triggers for scheduled jobs
  // ===========================================================================

  // ---------------------------------------------------------------------------
  // POST /v1/admin/inhouse/backups/run-daily - Trigger daily backups manually
  // ---------------------------------------------------------------------------
  fastify.post<{
    Body: { adminKey?: string };
  }>(
    '/v1/admin/inhouse/backups/run-daily',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { adminKey } = request.body;

      // SECURITY: Require valid admin key
      if (!verifyAdminKey(adminKey)) {
        return reply.code(403).send({
          error: 'ADMIN_ACCESS_REQUIRED',
          message: 'Valid adminKey is required for this operation'
        });
      }

      try {
        const backupService = getInhouseBackupService();
        const results = await backupService.runDailyBackups();

        console.log(`[InhouseBackup] Manual daily backups complete: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);

        return reply.send({
          success: true,
          results
        });
      } catch (error: any) {
        console.error('[InhouseBackup] Manual daily backup failed:', error);
        return reply.code(500).send({
          error: 'DAILY_BACKUP_FAILED',
          message: error.message
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /v1/admin/inhouse/backups/run-cleanup - Trigger cleanup manually
  // ---------------------------------------------------------------------------
  fastify.post<{
    Body: { adminKey?: string };
  }>(
    '/v1/admin/inhouse/backups/run-cleanup',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { adminKey } = request.body;

      // SECURITY: Require valid admin key
      if (!verifyAdminKey(adminKey)) {
        return reply.code(403).send({
          error: 'ADMIN_ACCESS_REQUIRED',
          message: 'Valid adminKey is required for this operation'
        });
      }

      try {
        const backupService = getInhouseBackupService();
        const results = await backupService.cleanupExpiredBackups();

        console.log(`[InhouseBackup] Manual cleanup complete: ${results.deleted} deleted, ${results.failed} failed`);

        return reply.send({
          success: true,
          results
        });
      } catch (error: any) {
        console.error('[InhouseBackup] Manual cleanup failed:', error);
        return reply.code(500).send({
          error: 'CLEANUP_FAILED',
          message: error.message
        });
      }
    }
  );
}
