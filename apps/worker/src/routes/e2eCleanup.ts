import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../services/database';
import { ServerLoggingService } from '../services/serverLoggingService';
import { isE2EModeEnabled } from '../middleware/e2eMode';
import { correlationIdMiddleware, withCorrelationId } from '../middleware/correlationIdMiddleware';

const loggingService = ServerLoggingService.getInstance();

/**
 * E2E Cleanup Routes
 *
 * Provides endpoints for cleaning up E2E test data.
 * These routes are ONLY enabled when E2E_MODE=true.
 *
 * Guardrails:
 * 1. Route only enabled when E2E_MODE=true on server
 * 2. Requires X-E2E-Admin-Key header
 * 3. Only deletes rows where metadata.e2e_run_id EXISTS and matches :runId
 * 4. Hard limit: max 5000 deletions per request
 * 5. Logs every deletion for audit trail
 */

const E2E_ADMIN_KEY = process.env.E2E_ADMIN_KEY;
const MAX_DELETIONS_PER_REQUEST = 5000;

interface CleanupParams {
  runId: string;
}

interface CleanupProjectParams {
  projectId: string;
}

/**
 * Verify E2E admin key
 */
function verifyE2EAdminKey(request: FastifyRequest, reply: FastifyReply): boolean {
  const providedKey = request.headers['x-e2e-admin-key'] as string;

  if (!E2E_ADMIN_KEY) {
    reply.code(500).send({
      success: false,
      error: 'E2E_ADMIN_KEY not configured on server',
      correlation_id: request.correlationId,
    });
    return false;
  }

  if (providedKey !== E2E_ADMIN_KEY) {
    reply.code(401).send({
      success: false,
      error: 'Invalid E2E admin key',
      correlation_id: request.correlationId,
    });
    return false;
  }

  return true;
}

export default async function e2eCleanupRoutes(fastify: FastifyInstance) {
  // Only register routes if E2E mode is enabled
  if (!isE2EModeEnabled()) {
    loggingService.info('E2E cleanup routes DISABLED - E2E_MODE not set to true');
    return;
  }

  // Verify pool is available
  if (!pool) {
    loggingService.error('E2E cleanup routes cannot be registered - database pool not initialized');
    return;
  }

  // Capture pool in local const for TypeScript narrowing
  const db = pool;

  loggingService.info('E2E cleanup routes ENABLED - E2E_MODE is true');

  // Add correlation ID middleware
  fastify.addHook('preHandler', correlationIdMiddleware);

  /**
   * DELETE /api/admin/e2e/cleanup/run/:runId
   *
   * Delete all resources tagged with a specific E2E run ID.
   * This is the global cleanup endpoint called in CI teardown.
   */
  fastify.delete<{ Params: CleanupParams }>(
    '/api/admin/e2e/cleanup/run/:runId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['runId'],
          properties: {
            runId: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params;

      // Verify admin key
      if (!verifyE2EAdminKey(request, reply)) {
        return;
      }

      const startTime = Date.now();

      try {
        loggingService.info('E2E cleanup initiated', { runId, correlation_id: request.correlationId });

        // Count affected rows first
        // Note: Different tables use different JSONB columns:
        // - projects: config
        // - unified_chat_sessions: metadata
        // - project_chat_log_minimal: response_data
        const countResult = await db.query(
          `SELECT
            (SELECT COUNT(*) FROM projects WHERE config->>'e2e_run_id' = $1) as projects,
            (SELECT COUNT(*) FROM unified_chat_sessions WHERE metadata->>'e2e_run_id' = $1) as sessions,
            (SELECT COUNT(*) FROM project_chat_log_minimal WHERE response_data->>'e2e_run_id' = $1) as messages
          `,
          [runId]
        );

        const counts = countResult.rows[0];
        const totalCount =
          parseInt(counts.projects || '0') +
          parseInt(counts.sessions || '0') +
          parseInt(counts.messages || '0');

        if (totalCount > MAX_DELETIONS_PER_REQUEST) {
          loggingService.warn('E2E cleanup aborted - too many rows', {
            runId,
            totalCount,
            maxAllowed: MAX_DELETIONS_PER_REQUEST,
          });

          return reply.code(400).send({
            success: false,
            error: `Too many rows (${totalCount}) - manual cleanup required`,
            counts: {
              projects: parseInt(counts.projects || '0'),
              sessions: parseInt(counts.sessions || '0'),
              messages: parseInt(counts.messages || '0'),
            },
            max_allowed: MAX_DELETIONS_PER_REQUEST,
            correlation_id: request.correlationId,
          });
        }

        // Begin transaction for atomic cleanup
        const client = await db.connect();

        try {
          await client.query('BEGIN');

          // Delete in correct order (messages -> sessions -> projects)
          // Note: Using JSONB ? 'e2e_run_id' for index usage, no RETURNING (saves memory)
          // Different tables use different JSONB columns for e2e_run_id tagging
          const deleteMessages = await client.query(
            `DELETE FROM project_chat_log_minimal
             WHERE response_data->>'e2e_run_id' = $1
             AND response_data ? 'e2e_run_id'`,
            [runId]
          );

          const deleteSessions = await client.query(
            `DELETE FROM unified_chat_sessions
             WHERE metadata->>'e2e_run_id' = $1
             AND metadata ? 'e2e_run_id'`,
            [runId]
          );

          const deleteProjects = await client.query(
            `DELETE FROM projects
             WHERE config->>'e2e_run_id' = $1
             AND config ? 'e2e_run_id'`,
            [runId]
          );

          await client.query('COMMIT');

          const duration = Date.now() - startTime;

          const result = {
            deleted: {
              projects: deleteProjects.rowCount || 0,
              sessions: deleteSessions.rowCount || 0,
              messages: deleteMessages.rowCount || 0,
            },
            total_deleted:
              (deleteProjects.rowCount || 0) +
              (deleteSessions.rowCount || 0) +
              (deleteMessages.rowCount || 0),
            duration_ms: duration,
          };

          loggingService.info('E2E cleanup completed', {
            runId,
            ...result,
            correlation_id: request.correlationId,
          });

          return reply.code(200).send(
            withCorrelationId(
              {
                success: true,
                run_id: runId,
                ...result,
              },
              request
            )
          );
        } catch (txError) {
          await client.query('ROLLBACK');
          throw txError;
        } finally {
          client.release();
        }
      } catch (error) {
        loggingService.error('E2E cleanup failed', {
          runId,
          error: error instanceof Error ? error.message : 'Unknown error',
          correlation_id: request.correlationId,
        });

        return reply.code(500).send({
          success: false,
          error: 'Cleanup failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          correlation_id: request.correlationId,
        });
      }
    }
  );

  /**
   * DELETE /api/admin/e2e/cleanup/project/:projectId
   *
   * Delete a single project and its related data.
   * This is the per-test cleanup endpoint.
   */
  fastify.delete<{ Params: CleanupProjectParams }>(
    '/api/admin/e2e/cleanup/project/:projectId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { projectId } = request.params;

      // Verify admin key
      if (!verifyE2EAdminKey(request, reply)) {
        return;
      }

      try {
        // Verify this is actually an E2E project (has e2e_run_id in config)
        const checkResult = await db.query(
          `SELECT config->>'e2e_run_id' as run_id
           FROM projects
           WHERE id = $1`,
          [projectId]
        );

        if (checkResult.rows.length === 0) {
          return reply.code(404).send({
            success: false,
            error: 'Project not found',
            correlation_id: request.correlationId,
          });
        }

        if (!checkResult.rows[0].run_id) {
          return reply.code(403).send({
            success: false,
            error: 'Cannot delete non-E2E project via cleanup endpoint',
            correlation_id: request.correlationId,
          });
        }

        const client = await db.connect();

        try {
          await client.query('BEGIN');

          // Delete related messages first
          await client.query(
            `DELETE FROM project_chat_log_minimal
             WHERE session_id IN (
               SELECT id FROM unified_chat_sessions WHERE project_id = $1
             )`,
            [projectId]
          );

          // Delete sessions
          await client.query(
            `DELETE FROM unified_chat_sessions WHERE project_id = $1`,
            [projectId]
          );

          // Delete project
          await client.query(`DELETE FROM projects WHERE id = $1`, [projectId]);

          await client.query('COMMIT');

          loggingService.info('E2E project cleanup completed', {
            projectId,
            correlation_id: request.correlationId,
          });

          return reply.code(200).send(
            withCorrelationId(
              {
                success: true,
                project_id: projectId,
              },
              request
            )
          );
        } catch (txError) {
          await client.query('ROLLBACK');
          throw txError;
        } finally {
          client.release();
        }
      } catch (error) {
        loggingService.error('E2E project cleanup failed', {
          projectId,
          error: error instanceof Error ? error.message : 'Unknown error',
          correlation_id: request.correlationId,
        });

        return reply.code(500).send({
          success: false,
          error: 'Cleanup failed',
          details: error instanceof Error ? error.message : 'Unknown error',
          correlation_id: request.correlationId,
        });
      }
    }
  );

  /**
   * GET /api/admin/e2e/cleanup/stats/:runId
   *
   * Get counts of E2E resources for a run ID (dry run).
   */
  fastify.get<{ Params: CleanupParams }>(
    '/api/admin/e2e/cleanup/stats/:runId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['runId'],
          properties: {
            runId: { type: 'string', minLength: 1, maxLength: 100 },
          },
        },
      },
    },
    async (request, reply) => {
      const { runId } = request.params;

      // Verify admin key
      if (!verifyE2EAdminKey(request, reply)) {
        return;
      }

      try {
        // Note: Different tables use different JSONB columns for e2e_run_id
        const result = await db.query(
          `SELECT
            (SELECT COUNT(*) FROM projects WHERE config->>'e2e_run_id' = $1) as projects,
            (SELECT COUNT(*) FROM unified_chat_sessions WHERE metadata->>'e2e_run_id' = $1) as sessions,
            (SELECT COUNT(*) FROM project_chat_log_minimal WHERE response_data->>'e2e_run_id' = $1) as messages
          `,
          [runId]
        );

        const counts = result.rows[0];

        return reply.code(200).send(
          withCorrelationId(
            {
              success: true,
              run_id: runId,
              counts: {
                projects: parseInt(counts.projects || '0'),
                sessions: parseInt(counts.sessions || '0'),
                messages: parseInt(counts.messages || '0'),
              },
              total: parseInt(counts.projects || '0') +
                parseInt(counts.sessions || '0') +
                parseInt(counts.messages || '0'),
              would_exceed_limit:
                parseInt(counts.projects || '0') +
                  parseInt(counts.sessions || '0') +
                  parseInt(counts.messages || '0') >
                MAX_DELETIONS_PER_REQUEST,
            },
            request
          )
        );
      } catch (error) {
        return reply.code(500).send({
          success: false,
          error: 'Failed to get stats',
          details: error instanceof Error ? error.message : 'Unknown error',
          correlation_id: request.correlationId,
        });
      }
    }
  );
}
