/**
 * In-House Email Overview Routes
 *
 * Aggregated email statistics endpoint for the project email dashboard.
 * Consolidates inbox, domains, mailboxes, and outbound counts into a single call.
 *
 * Routes:
 * - GET /v1/inhouse/projects/:projectId/email/overview - Overview stats
 *
 * Part of easy-mode-email-user-frontend-plan.md
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getPool } from '../services/database'

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseEmailOverviewRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/email/overview
  //
  // Returns aggregated email stats for the project dashboard:
  // - Inbox: total messages, unread count, inbox address
  // - Domains: total connected, verified count
  // - Mailboxes: total active
  // - Outbound: sent this month
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email/overview', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId } = request.query

    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'MISSING_USER_ID', message: 'userId is required' },
      })
    }

    try {
      await assertProjectAccess(projectId, userId)
    } catch (err: any) {
      return reply.code(err.statusCode || 403).send({
        ok: false,
        error: { code: err.code || 'UNAUTHORIZED', message: err.message },
      })
    }

    try {
      const pool = getPool()

      const [messagesResult, domainsResult, mailboxesResult, outboundResult, inboxConfigResult] = await Promise.all([
        // 1. Messages: total + unread (single query with FILTER)
        pool.query<{ total: string; unread: string }>(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE is_read = FALSE AND is_archived = FALSE) AS unread
           FROM inhouse_inbox_messages
           WHERE project_id = $1`,
          [projectId]
        ),

        // 2. Domains: total + verified (single query with FILTER)
        pool.query<{ total: string; verified: string }>(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'verified') AS verified
           FROM inhouse_email_domains
           WHERE project_id = $1`,
          [projectId]
        ),

        // 3. Mailboxes: total active
        pool.query<{ total: string }>(
          `SELECT COUNT(*) AS total
           FROM inhouse_mailboxes
           WHERE project_id = $1
             AND deleted_at IS NULL
             AND provisioning_status NOT IN ('error', 'deleted')`,
          [projectId]
        ),

        // 4. Outbound: sent this month
        pool.query<{ sent_this_month: string }>(
          `SELECT COUNT(*) AS sent_this_month
           FROM inhouse_email_history
           WHERE project_id = $1
             AND created_at >= date_trunc('month', now())`,
          [projectId]
        ),

        // 5. Inbox config: inbox_id for address construction
        pool.query<{ inbox_id: string }>(
          `SELECT inbox_id
           FROM inhouse_inbox_config
           WHERE project_id = $1`,
          [projectId]
        ),
      ])

      const messages = messagesResult.rows[0]
      const domains = domainsResult.rows[0]
      const mailboxes = mailboxesResult.rows[0]
      const outbound = outboundResult.rows[0]
      const inboxConfig = inboxConfigResult.rows[0]

      const inboxId = inboxConfig?.inbox_id
      const inboxAddress = inboxId
        ? `${inboxId}@${process.env.INHOUSE_INBOX_DOMAIN || 'inbox.sheenapps.com'}`
        : null

      return reply.code(200).send({
        ok: true,
        data: {
          inbox: {
            address: inboxAddress,
            total: parseInt(messages?.total || '0', 10),
            unread: parseInt(messages?.unread || '0', 10),
          },
          domains: {
            total: parseInt(domains?.total || '0', 10),
            verified: parseInt(domains?.verified || '0', 10),
          },
          mailboxes: {
            total: parseInt(mailboxes?.total || '0', 10),
          },
          outbound: {
            sentThisMonth: parseInt(outbound?.sent_this_month || '0', 10),
          },
        },
      })
    } catch (error) {
      request.log.error({ error, projectId, userId }, 'Failed to fetch email overview')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch email overview' },
      })
    }
  })
}
