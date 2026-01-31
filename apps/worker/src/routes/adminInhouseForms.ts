/**
 * Admin In-House Forms Routes
 *
 * Endpoints for managing and monitoring forms across In-House Mode projects.
 *
 * Routes:
 * - GET   /v1/admin/inhouse/projects/:projectId/forms
 * - GET   /v1/admin/inhouse/projects/:projectId/forms/submissions
 * - PATCH /v1/admin/inhouse/projects/:projectId/forms/submissions/:submissionId
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseFormsService } from '../services/inhouse/InhouseFormsService'
import type { SubmissionStatus } from '../services/inhouse/InhouseFormsService'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ListFormsQuery {
  search?: string
  limit?: string
  offset?: string
}

interface ListSubmissionsQuery {
  formName?: string
  status?: SubmissionStatus
  startDate?: string
  endDate?: string
  search?: string
  limit?: string
  offset?: string
}

interface UpdateSubmissionBody {
  status: SubmissionStatus
  reason?: string
}

interface ExportSubmissionsQuery {
  formName?: string
  format?: 'csv' | 'json'
  status?: SubmissionStatus | SubmissionStatus[]
  startDate?: string
  endDate?: string
}

interface FormSummary {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
  submissions_total: number
  submissions_unread: number
  submissions_read: number
  submissions_archived: number
  submissions_spam: number
  submissions_deleted: number
}

interface FormSubmissionRow {
  id: string
  form_id: string
  form_name: string
  data: Record<string, unknown>
  status: SubmissionStatus
  source_ip: string | null
  user_agent: string | null
  referrer: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  read_at: string | null
  archived_at: string | null
  deleted_at: string | null
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STATEMENT_TIMEOUT = '5s'
const VALID_STATUSES: SubmissionStatus[] = ['unread', 'read', 'archived', 'spam', 'deleted']

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
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseFormsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // =========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/forms - List forms with counts
  // =========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ListFormsQuery
    Reply: { success: boolean; data?: { forms: FormSummary[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/forms', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { search, limit: limitStr, offset: offsetStr } = request.query

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = ['f.project_id = $1']
      const params: any[] = [projectId]
      let paramIndex = 2

      if (search) {
        conditions.push(`f.name ILIKE $${paramIndex}`)
        params.push(`%${search}%`)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const { total, formRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_form_schemas f WHERE ${whereClause}`,
          params
        )

        const formsResult = await client.query(
          `SELECT
             f.id,
             f.name,
             f.description,
             f.created_at,
             f.updated_at,
             COUNT(s.id) as submissions_total,
             COUNT(*) FILTER (WHERE s.status = 'unread') as submissions_unread,
             COUNT(*) FILTER (WHERE s.status = 'read') as submissions_read,
             COUNT(*) FILTER (WHERE s.status = 'archived') as submissions_archived,
             COUNT(*) FILTER (WHERE s.status = 'spam') as submissions_spam,
             COUNT(*) FILTER (WHERE s.status = 'deleted') as submissions_deleted
           FROM inhouse_form_schemas f
           LEFT JOIN inhouse_form_submissions s ON s.form_id = f.id
           WHERE ${whereClause}
           GROUP BY f.id
           ORDER BY f.updated_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          formRows: formsResult.rows,
        }
      })

      const forms: FormSummary[] = formRows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        created_at: row.created_at,
        updated_at: row.updated_at,
        submissions_total: parseInt(row.submissions_total ?? '0', 10),
        submissions_unread: parseInt(row.submissions_unread ?? '0', 10),
        submissions_read: parseInt(row.submissions_read ?? '0', 10),
        submissions_archived: parseInt(row.submissions_archived ?? '0', 10),
        submissions_spam: parseInt(row.submissions_spam ?? '0', 10),
        submissions_deleted: parseInt(row.submissions_deleted ?? '0', 10),
      }))

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'forms_list',
        projectId,
        resourceType: 'form',
        metadata: { search, limit, offset, resultCount: forms.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          forms,
          total,
          hasMore: offset + forms.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list forms')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list forms',
      })
    }
  })

  // =========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/forms/submissions
  // =========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ListSubmissionsQuery
    Reply: { success: boolean; data?: { submissions: FormSubmissionRow[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/forms/submissions', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const {
      formName,
      status,
      startDate,
      endDate,
      search,
      limit: limitStr,
      offset: offsetStr,
    } = request.query

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = ['s.project_id = $1']
      const params: any[] = [projectId]
      let paramIndex = 2

      if (formName) {
        conditions.push(`f.name = $${paramIndex}`)
        params.push(formName.toLowerCase().trim())
        paramIndex++
      }

      if (status && VALID_STATUSES.includes(status)) {
        conditions.push(`s.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      if (startDate) {
        conditions.push(`s.created_at >= $${paramIndex}::timestamptz`)
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        conditions.push(`s.created_at <= $${paramIndex}::timestamptz`)
        params.push(endDate)
        paramIndex++
      }

      if (search) {
        conditions.push(`s.data::text ILIKE $${paramIndex}`)
        params.push(`%${search}%`)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const { total, submissionRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM inhouse_form_submissions s
           JOIN inhouse_form_schemas f ON f.id = s.form_id
           WHERE ${whereClause}`,
          params
        )

        const submissionsResult = await client.query(
          `SELECT
             s.id,
             s.form_id,
             f.name as form_name,
             s.data,
             s.status,
             s.source_ip,
             s.user_agent,
             s.referrer,
             s.metadata,
             s.created_at,
             s.read_at,
             s.archived_at,
             s.deleted_at
           FROM inhouse_form_submissions s
           JOIN inhouse_form_schemas f ON f.id = s.form_id
           WHERE ${whereClause}
           ORDER BY s.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          submissionRows: submissionsResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'form_submissions_list',
        projectId,
        resourceType: 'form_submission',
        metadata: { formName, status, startDate, endDate, search, limit, offset, resultCount: submissionRows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          submissions: submissionRows,
          total,
          hasMore: offset + submissionRows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list form submissions')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list form submissions',
      })
    }
  })

  // =========================================================================
  // PATCH /v1/admin/inhouse/projects/:projectId/forms/submissions/:submissionId
  // =========================================================================
  fastify.patch<{
    Params: { projectId: string; submissionId: string }
    Body: UpdateSubmissionBody
    Reply: { success: boolean; data?: FormSubmissionRow; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/forms/submissions/:submissionId', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId, submissionId } = request.params
    const { status, reason } = request.body

    if (!status || !VALID_STATUSES.includes(status)) {
      return reply.status(400).send({ success: false, error: 'Invalid status' })
    }

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const updates: string[] = ['status = $3']
      if (status === 'read') {
        updates.push('read_at = NOW()')
      } else if (status === 'archived') {
        updates.push('archived_at = NOW()')
      } else if (status === 'deleted') {
        updates.push('deleted_at = NOW()')
      }

      const result = await db.query(
        `UPDATE inhouse_form_submissions s
         SET ${updates.join(', ')}
         FROM inhouse_form_schemas f
         WHERE s.id = $2 AND s.project_id = $1 AND f.id = s.form_id
         RETURNING
           s.id,
           s.form_id,
           f.name as form_name,
           s.data,
           s.status,
           s.source_ip,
           s.user_agent,
           s.referrer,
           s.metadata,
           s.created_at,
           s.read_at,
           s.archived_at,
           s.deleted_at`,
        [projectId, submissionId, status]
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Submission not found' })
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'form_submission_update',
        projectId,
        resourceType: 'form_submission',
        resourceId: submissionId,
        reason: reason || null,
        metadata: { status },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result.rows[0] })
    } catch (error) {
      request.log.error({ error }, 'Failed to update form submission')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update form submission',
      })
    }
  })

  // =========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/forms/submissions/export
  // =========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ExportSubmissionsQuery
  }>('/v1/admin/inhouse/projects/:projectId/forms/submissions/export', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { formName, format, status, startDate, endDate } = request.query

    if (!formName) {
      return reply.status(400).send({ success: false, error: 'formName is required' })
    }

    const normalizedFormat = format === 'json' ? 'json' : 'csv'
    const statusList = Array.isArray(status) ? status : status ? [status] : undefined

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const service = getInhouseFormsService()
      const exportResult = await service.exportSubmissions(projectId, {
        formName,
        format: normalizedFormat,
        status: statusList,
        startDate,
        endDate,
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'form_submissions_export',
        projectId,
        resourceType: 'form_submission',
        metadata: { formName, format: normalizedFormat, status: statusList, startDate, endDate },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      reply.header('Content-Type', exportResult.contentType)
      reply.header('Content-Disposition', `attachment; filename=\"${exportResult.filename}\"`)
      return reply.send(exportResult.data)
    } catch (error) {
      request.log.error({ error }, 'Failed to export form submissions')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export submissions',
      })
    }
  })
}
