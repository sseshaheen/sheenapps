/**
 * Build Accept Route
 *
 * Endpoint for accepting generated code changes into a project.
 * Handles partial acceptance and conflict detection.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireHmacSignature } from '../middleware/hmacValidation';
import { pool } from '../services/database';
import { SecurePathValidator } from '../utils/securePathValidator';
import { workspaceFileAccessService } from '../services/workspaceFileAccessService';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { ulid } from 'ulid';

// ============================================================================
// Types
// ============================================================================

interface AcceptChangesParams {
  buildId: string;
}

interface AcceptChangesBody {
  userId: string;
  files?: string[];                      // Paths to accept, empty/undefined = all
  baseHashes?: Record<string, string>;   // Expected base hashes for conflict detection
}

interface AcceptChangesResponse {
  success: boolean;
  accepted: string[];
  conflicts: string[];
  projectId: string;
  buildId: string;
  newVersionId?: string;
  message: string;
}

// ============================================================================
// Helpers
// ============================================================================

function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Get build/version info from database
 */
async function getBuildInfo(buildId: string): Promise<{
  versionId: string;
  projectId: string;
  userId: string;
  status: string;
} | null> {
  if (!pool) {
    throw new Error('Database not configured');
  }

  // Try to find by version_id first (buildId often IS the versionId)
  let result = await pool.query(`
    SELECT version_id, project_id, user_id, status
    FROM project_versions
    WHERE version_id = $1
  `, [buildId]);

  if (result.rows.length > 0) {
    return {
      versionId: result.rows[0].version_id,
      projectId: result.rows[0].project_id,
      userId: result.rows[0].user_id,
      status: result.rows[0].status
    };
  }

  // Also check project_build_metrics in case buildId is different
  result = await pool.query(`
    SELECT pbm.build_id, pbm.project_id, pbm.user_id, pv.status
    FROM project_build_metrics pbm
    LEFT JOIN project_versions pv ON pv.version_id = pbm.build_id
    WHERE pbm.build_id = $1
  `, [buildId]);

  if (result.rows.length > 0) {
    return {
      versionId: result.rows[0].build_id,
      projectId: result.rows[0].project_id,
      userId: result.rows[0].user_id,
      status: result.rows[0].status || 'pending'
    };
  }

  return null;
}

/**
 * Get list of generated files for a build
 */
async function getGeneratedFiles(projectRoot: string): Promise<string[]> {
  const files: string[] = [];

  async function walkDir(dir: string, relativePath: string = ''): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        // Skip hidden files, node_modules, etc.
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          await walkDir(path.join(dir, entry.name), entryRelPath);
        } else if (entry.isFile()) {
          files.push(entryRelPath);
        }
      }
    } catch (error) {
      // Directory might not exist
    }
  }

  await walkDir(projectRoot);
  return files;
}

/**
 * Check for conflicts between expected and actual file hashes
 */
async function detectConflicts(
  projectRoot: string,
  files: string[],
  baseHashes: Record<string, string>,
  userId: string
): Promise<{ hasConflicts: boolean; conflicts: string[] }> {
  const conflicts: string[] = [];

  for (const filePath of files) {
    if (baseHashes[filePath]) {
      try {
        const fileResult = await workspaceFileAccessService.readFile(
          projectRoot,
          filePath,
          userId,
          {}
        );

        if (!('notModified' in fileResult)) {
          const currentHash = generateContentHash(fileResult.content);
          if (currentHash !== baseHashes[filePath]) {
            conflicts.push(filePath);
          }
        }
      } catch (error) {
        // File doesn't exist or can't be read - not a conflict
      }
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts
  };
}

// ============================================================================
// Routes
// ============================================================================

export async function buildAcceptRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature();

  /**
   * POST /api/v1/builds/:buildId/accept
   *
   * Accept generated code changes into the project.
   *
   * Request body:
   * - userId: string (required)
   * - files: string[] (optional, paths to accept; empty = all)
   * - baseHashes: Record<string, string> (optional, for conflict detection)
   *
   * Response:
   * - accepted: string[] - List of accepted file paths
   * - conflicts: string[] - List of conflicting file paths
   * - projectId: string
   * - buildId: string
   * - newVersionId: string (if new version was created)
   */
  fastify.post<{
    Params: AcceptChangesParams;
    Body: AcceptChangesBody;
  }>('/api/v1/builds/:buildId/accept', {
    preHandler: hmacMiddleware as any,
    schema: {
      params: {
        type: 'object',
        properties: {
          buildId: { type: 'string' }
        },
        required: ['buildId']
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          baseHashes: { type: 'object' }
        },
        required: ['userId']
      }
    }
  }, async (
    request: FastifyRequest<{
      Params: AcceptChangesParams;
      Body: AcceptChangesBody;
    }>,
    reply: FastifyReply
  ) => {
    const { buildId } = request.params;
    const { userId, files, baseHashes } = request.body;

    // Validate required parameters
    if (!userId) {
      return reply.code(400).send({
        success: false,
        error: 'Missing required parameter: userId',
        code: 'MISSING_USER_ID'
      });
    }

    console.log(`[BuildAccept] Accepting changes for build: ${buildId}, user: ${userId}`);

    try {
      // Get build info from database
      const buildInfo = await getBuildInfo(buildId);

      if (!buildInfo) {
        return reply.code(404).send({
          success: false,
          error: 'Build not found',
          code: 'BUILD_NOT_FOUND'
        });
      }

      // Verify ownership
      if (buildInfo.userId !== userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied - build belongs to different user',
          code: 'ACCESS_DENIED'
        });
      }

      // Check build status
      if (buildInfo.status === 'accepted') {
        return reply.code(409).send({
          success: false,
          error: 'Build already accepted',
          code: 'ALREADY_ACCEPTED',
          projectId: buildInfo.projectId,
          buildId
        });
      }

      // Get project root
      const projectRoot = SecurePathValidator.getProjectRoot(userId, buildInfo.projectId);

      // Get list of files to accept
      let filesToAccept: string[];
      if (files && files.length > 0) {
        // Accept specific files
        filesToAccept = files;
      } else {
        // Accept all generated files
        filesToAccept = await getGeneratedFiles(projectRoot);
      }

      // Check for conflicts if baseHashes provided
      let conflicts: string[] = [];
      if (baseHashes && Object.keys(baseHashes).length > 0) {
        const conflictResult = await detectConflicts(
          projectRoot,
          filesToAccept,
          baseHashes,
          userId
        );
        conflicts = conflictResult.conflicts;

        // If there are conflicts, return them without accepting
        if (conflicts.length > 0) {
          return reply.code(409).send({
            success: false,
            accepted: [],
            conflicts,
            projectId: buildInfo.projectId,
            buildId,
            message: 'Conflicts detected - some files changed since generation'
          } as AcceptChangesResponse);
        }
      }

      // Filter out conflicting files from acceptance
      const acceptedFiles = filesToAccept.filter(f => !conflicts.includes(f));

      // Update version status to accepted
      if (pool) {
        await pool.query(`
          UPDATE project_versions
          SET status = 'accepted',
              deployed_at = NOW()
          WHERE version_id = $1
        `, [buildInfo.versionId]);

        // Record acceptance in audit log if table exists
        try {
          await pool.query(`
            INSERT INTO build_acceptance_log (
              build_id, version_id, project_id, user_id,
              files_accepted, files_conflicted, accepted_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
          `, [
            buildId,
            buildInfo.versionId,
            buildInfo.projectId,
            userId,
            JSON.stringify(acceptedFiles),
            JSON.stringify(conflicts)
          ]);
        } catch (error) {
          // Table might not exist yet - that's ok
          console.log('[BuildAccept] Audit log table not available');
        }
      }

      const response: AcceptChangesResponse = {
        success: true,
        accepted: acceptedFiles,
        conflicts,
        projectId: buildInfo.projectId,
        buildId,
        newVersionId: buildInfo.versionId,
        message: `Accepted ${acceptedFiles.length} files`
      };

      console.log(`[BuildAccept] Successfully accepted ${acceptedFiles.length} files for build: ${buildId}`);

      return response;

    } catch (error: any) {
      console.error('[BuildAccept] Error accepting changes:', error);

      return reply.code(500).send({
        success: false,
        error: 'Failed to accept changes',
        code: 'ACCEPT_FAILED',
        message: error.message
      });
    }
  });

  /**
   * POST /api/v1/builds/:buildId/reject
   *
   * Reject generated code changes (optional endpoint for explicit rejection).
   */
  fastify.post<{
    Params: AcceptChangesParams;
    Body: { userId: string; reason?: string };
  }>('/api/v1/builds/:buildId/reject', {
    preHandler: hmacMiddleware as any,
    schema: {
      params: {
        type: 'object',
        properties: {
          buildId: { type: 'string' }
        },
        required: ['buildId']
      },
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['userId']
      }
    }
  }, async (
    request: FastifyRequest<{
      Params: AcceptChangesParams;
      Body: { userId: string; reason?: string };
    }>,
    reply: FastifyReply
  ) => {
    const { buildId } = request.params;
    const { userId, reason } = request.body;

    console.log(`[BuildAccept] Rejecting changes for build: ${buildId}, user: ${userId}`);

    try {
      const buildInfo = await getBuildInfo(buildId);

      if (!buildInfo) {
        return reply.code(404).send({
          success: false,
          error: 'Build not found',
          code: 'BUILD_NOT_FOUND'
        });
      }

      if (buildInfo.userId !== userId) {
        return reply.code(403).send({
          success: false,
          error: 'Access denied',
          code: 'ACCESS_DENIED'
        });
      }

      // Update version status to rejected
      if (pool) {
        await pool.query(`
          UPDATE project_versions
          SET status = 'rejected'
          WHERE version_id = $1
        `, [buildInfo.versionId]);
      }

      return {
        success: true,
        buildId,
        projectId: buildInfo.projectId,
        message: reason ? `Rejected: ${reason}` : 'Build rejected'
      };

    } catch (error: any) {
      console.error('[BuildAccept] Error rejecting changes:', error);

      return reply.code(500).send({
        success: false,
        error: 'Failed to reject changes',
        message: error.message
      });
    }
  });
}
