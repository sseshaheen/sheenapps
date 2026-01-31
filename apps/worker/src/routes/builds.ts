/**
 * Build Routes
 *
 * Endpoints for build-related operations including fetching build events
 */

import { FastifyInstance } from 'fastify';
import { pool } from '../services/database';
import { requireHmacSignature } from '../middleware/hmacValidation';

export default async function buildsRoutes(fastify: FastifyInstance) {
  /**
   * GET /builds/:buildId/events
   * Fetch build events with EXACT buildId match
   *
   * NOTE: Route path is /builds/... (not /v1/builds/...)
   * Because we register with prefix: '/v1' below, final path is /v1/builds/:buildId/events
   *
   * CRITICAL: Uses exact match (= not LIKE) to prevent prefix matching bugs
   * ULIDs are 26 chars, suffixed builds are longer (e.g., "KDJ7PPEK...FULL-documentation")
   */
  fastify.get<{
    Params: { buildId: string };
    Headers: { 'x-user-id': string };
  }>(
    '/builds/:buildId/events',  // ✅ No /v1 prefix here
    {
      schema: {
        params: {
          type: 'object',
          required: ['buildId'],
          properties: {
            buildId: {
              type: 'string',
              minLength: 26, // ULIDs are 26 chars
              description: 'Full build ID (NOT a prefix)'
            }
          }
        },
        headers: {
          type: 'object',
          required: ['x-user-id'],
          properties: {
            'x-user-id': { type: 'string', format: 'uuid' }
          }
        }
      },
      preHandler: requireHmacSignature() as any
    },
    async (request, reply) => {
      const { buildId } = request.params;

      // ✅ CRITICAL: Validate buildId is full ID, not prefix
      // ULIDs are 26 chars, suffixed builds (e.g., -documentation) are longer
      // Reject short prefixes (8 chars)
      if (buildId.length < 26) {
        return reply.code(400).send({
          error: 'INVALID_BUILD_ID',
          message: 'buildId must be full ID (26+ characters), not a prefix',
          hint: 'Use the full buildId from projects.current_build_id'
        });
      }

      if (!pool) {
        return reply.code(500).send({ error: 'Database not available' });
      }

      // ✅ Use EXACT match (NOT LIKE)
      const { rows } = await pool.query(`
        SELECT *
        FROM project_build_events
        WHERE build_id = $1
        ORDER BY created_at ASC
      `, [buildId]);

      console.log(`[BuildsAPI] Retrieved ${rows.length} events for buildId: ${buildId}`);

      return reply.send({
        events: rows,
        buildId,
        count: rows.length
      });
    }
  );
}
