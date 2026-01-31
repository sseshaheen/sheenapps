/**
 * Admin In-House Emails Routes
 *
 * Endpoints for monitoring emails across In-House Mode projects.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseEmailService } from '../services/inhouse/InhouseEmailService'

// =============================================================================
// TYPES
// =============================================================================

interface EmailsQuery {
  projectId?: string
  status?: string
  limit?: string
  offset?: string
}

interface SuppressionsQuery {
  projectId?: string
  reason?: string
  limit?: string
  offset?: string
}

interface EmailRow {
  id: string
  project_id: string
  project_name?: string
  to_addresses: string[]
  subject: string
  template_name: string | null
  status: string
  resend_id: string | null
  created_at: string
  sent_at: string | null
  delivered_at: string | null
  failed_at: string | null
  error_message: string | null
}

// =============================================================================
// HELPERS
// =============================================================================

function normalizeJsonArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : []
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseEmailsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/emails/stats
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: { projectId?: string; startDate?: string; endDate?: string; period?: string }
  }>('/v1/admin/inhouse/emails/stats', { preHandler: readMiddleware as never }, async (request, reply) => {
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

      const { statusRows, suppressionCount } = await withStatementTimeout(db, '5s', async (client) => {
        const statusResult = await client.query(
          `SELECT status, COUNT(*)::int AS count
           FROM inhouse_emails
           WHERE created_at >= $1::date
             AND created_at < ($2::date + interval '1 day')
             ${projectFilter}
           GROUP BY status`,
          params
        )

        const suppressionResult = await client.query(
          `SELECT COUNT(*)::int AS count
           FROM inhouse_email_suppressions
           WHERE status = 'active'
             ${projectId ? 'AND project_id = $1' : ''}`,
          projectId ? [projectId] : []
        )

        return {
          statusRows: statusResult.rows,
          suppressionCount: parseInt(suppressionResult.rows[0]?.count || '0', 10),
        }
      })

      return reply.send({
        success: true,
        data: {
          byStatus: [...statusRows, { status: 'suppressed', count: suppressionCount }],
          startDate: effectiveStart,
          endDate: effectiveEnd,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get email stats')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get email stats',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/emails
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: EmailsQuery
    Reply: { success: boolean; data?: { emails: EmailRow[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/emails', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const db = requirePool()
      const { projectId, status, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = []
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`e.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (status) {
        conditions.push(`e.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, emailRows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_emails e ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT
             e.*,
             e.to_addresses AS to_addresses_json,
             e.tags AS tags_json,
             p.name as project_name
           FROM inhouse_emails e
           LEFT JOIN projects p ON p.id = e.project_id
           ${whereClause}
           ORDER BY e.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          emailRows: listResult.rows,
        }
      })

      const emails = emailRows.map((row) => ({
        ...row,
        to_addresses: normalizeJsonArray(row.to_addresses_json ?? row.to_addresses),
        tags: row.tags_json ?? row.tags ?? null,
      }))

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'emails_list',
        projectId: projectId || null,
        resourceType: 'email',
        metadata: { projectId, status, limit, offset, resultCount: emailRows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          emails,
          total,
          hasMore: offset + emails.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list emails')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list emails',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/emails/:emailId
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { emailId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/emails/:emailId', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { emailId } = request.params
      const { projectId } = request.query

      const params: any[] = [emailId]
      let whereClause = 'WHERE e.id = $1'

      if (projectId) {
        params.push(projectId)
        whereClause += ` AND e.project_id = $2`
      }

      const result = await db.query(
        `SELECT
           e.*,
           e.to_addresses AS to_addresses_json,
           e.tags AS tags_json,
           p.name as project_name
         FROM inhouse_emails e
         LEFT JOIN projects p ON p.id = e.project_id
         ${whereClause}`,
        params
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Email not found' })
      }

      const row = result.rows[0]
      const email = {
        ...row,
        to_addresses: normalizeJsonArray(row.to_addresses_json ?? row.to_addresses),
        tags: row.tags_json ?? row.tags ?? null,
      }

      return reply.send({ success: true, data: email })
    } catch (error) {
      request.log.error({ error }, 'Failed to get email')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get email',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/emails/:emailId/resend
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { emailId: string }
    Body: { reason?: string }
  }>('/v1/admin/inhouse/emails/:emailId/resend', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { emailId } = request.params
    const { reason } = request.body

    if (!reason) {
      return reply.status(400).send({ success: false, error: 'reason is required' })
    }

    try {
      const db = requirePool()
      const result = await db.query(
        `SELECT
           id,
           project_id,
           to_addresses AS to_addresses_json,
           subject,
           html,
           text,
           from_address,
           reply_to,
           tags AS tags_json,
           locale
         FROM inhouse_emails
         WHERE id = $1`,
        [emailId]
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Email not found' })
      }

      const row = result.rows[0]
      const toAddresses = normalizeJsonArray(row.to_addresses_json)
      const html = row.html as string | null
      const text = row.text as string | null

      if (!html && !text) {
        return reply.status(422).send({
          success: false,
          error: 'Email content not available for resend',
        })
      }

      const service = getInhouseEmailService(row.project_id)
      const resendResult = await service.send({
        to: toAddresses,
        subject: row.subject,
        html: html || undefined,
        text: text || undefined,
        from: row.from_address || undefined,
        replyTo: row.reply_to || undefined,
        tags: Array.isArray(row.tags_json) ? row.tags_json : undefined,
        locale: row.locale || undefined,
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_resend',
        projectId: row.project_id || null,
        resourceType: 'email',
        resourceId: emailId,
        reason: reason || null,
        metadata: { resendEmailId: resendResult.id },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: { newEmailId: resendResult.id } })
    } catch (error) {
      request.log.error({ error }, 'Failed to resend email')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resend email',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/emails/bounces
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: SuppressionsQuery
  }>('/v1/admin/inhouse/emails/bounces', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = [`s.reason = 'bounce'`, `s.status = 'active'`]
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`s.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_email_suppressions s ${whereClause}`,
          params
        )
        const listResult = await client.query(
          `SELECT s.*, p.name as project_name
           FROM inhouse_email_suppressions s
           LEFT JOIN projects p ON p.id = s.project_id
           ${whereClause}
           ORDER BY s.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )
        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          rows: listResult.rows,
        }
      })

      return reply.send({
        success: true,
        data: {
          bounces: rows,
          total,
          hasMore: offset + rows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list bounces')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list bounces',
      })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /v1/admin/inhouse/emails/bounces/:email
  // -------------------------------------------------------------------------
  fastify.delete<{
    Params: { email: string }
    Body: { projectId?: string; reason?: string }
  }>('/v1/admin/inhouse/emails/bounces/:email', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { email } = request.params
    const { projectId, reason } = request.body || {}

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!reason) {
      return reply.status(400).send({ success: false, error: 'reason is required' })
    }

    try {
      const db = requirePool()
      await db.query(
        `UPDATE inhouse_email_suppressions
         SET status = 'cleared', updated_at = NOW()
         WHERE project_id = $1 AND email = $2 AND reason = 'bounce' AND status = 'active'`,
        [projectId, email.toLowerCase()]
      )

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_bounce_clear',
        projectId,
        resourceType: 'email_suppression',
        resourceId: email,
        reason,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to clear bounce')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear bounce',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/emails/suppressions
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: SuppressionsQuery
  }>('/v1/admin/inhouse/emails/suppressions', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { projectId, reason, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = [`s.status = 'active'`]
      const params: any[] = []
      let paramIndex = 1

      if (projectId) {
        conditions.push(`s.project_id = $${paramIndex}`)
        params.push(projectId)
        paramIndex++
      }

      if (reason) {
        conditions.push(`s.reason = $${paramIndex}`)
        params.push(reason)
        paramIndex++
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_email_suppressions s ${whereClause}`,
          params
        )
        const listResult = await client.query(
          `SELECT s.*, p.name as project_name
           FROM inhouse_email_suppressions s
           LEFT JOIN projects p ON p.id = s.project_id
           ${whereClause}
           ORDER BY s.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )
        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          rows: listResult.rows,
        }
      })

      return reply.send({
        success: true,
        data: {
          suppressions: rows,
          total,
          hasMore: offset + rows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list suppressions')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list suppressions',
      })
    }
  })
}
