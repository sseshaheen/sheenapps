/**
 * In-House Inbox Summary Routes
 *
 * Cross-project endpoint for aggregated inbox statistics.
 * Used by the dashboard to show unread email counts on project cards
 * without N+1 API calls.
 *
 * Routes:
 * - GET /v1/inhouse/inbox/unread-summary - Unread counts per project for a user
 *
 * Part of easy-mode-email-user-frontend-plan.md
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getPool } from '../services/databaseWrapper'

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseInboxSummaryRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // GET /v1/inhouse/inbox/unread-summary
  //
  // Returns unread message counts grouped by project for the authenticated user.
  // Scoped by owner_id — no projectId param needed.
  // ===========================================================================
  fastify.get<{
    Querystring: { userId?: string }
  }>('/v1/inhouse/inbox/unread-summary', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { userId } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'MISSING_USER_ID',
          message: 'userId is required',
        },
      })
    }

    try {
      const { rows } = await getPool().query<{ project_id: string; unread_count: string }>(
        `SELECT m.project_id, COUNT(*) AS unread_count
         FROM inhouse_inbox_messages m
         JOIN projects p ON p.id = m.project_id
         WHERE p.owner_id = $1
           AND m.is_read = FALSE
           AND m.is_archived = FALSE
         GROUP BY m.project_id`,
        [userId]
      )

      // Build { projectId: count } map
      const summary: Record<string, number> = {}
      for (const row of rows) {
        summary[row.project_id] = parseInt(row.unread_count, 10)
      }

      return reply.code(200).send({
        ok: true,
        data: summary,
      })
    } catch (error) {
      request.log.error({ error, userId }, 'Failed to fetch inbox unread summary')
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch unread summary',
        },
      })
    }
  })
}
