/**
 * Inhouse Forms Routes
 *
 * API routes for @sheenapps/forms SDK
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getInhouseFormsService } from '../services/inhouse/InhouseFormsService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import { assertProjectAccess } from '../utils/projectAuth'

import type {
  CreateFormInput,
  UpdateFormInput,
  SubmissionStatus,
} from '../services/inhouse/InhouseFormsService'

// ============================================================================
// Route Types
// ============================================================================

interface ProjectParams {
  projectId: string
}

interface FormParams extends ProjectParams {
  formName: string
}

interface SubmissionParams extends ProjectParams {
  submissionId: string
}

interface CreateFormBody extends CreateFormInput {
  userId?: string
}

interface UpdateFormBody extends UpdateFormInput {
  userId?: string
}

interface SubmitFormBody {
  data: Record<string, unknown>
  captcha_token?: string
  metadata?: Record<string, unknown>
  userId?: string
}

interface UpdateSubmissionBody {
  status: SubmissionStatus
  userId?: string
}

interface BulkUpdateBody {
  submission_ids: string[]
  status: SubmissionStatus
  userId?: string
}

interface ExportBody {
  form_name: string
  format: 'csv' | 'json'
  status?: SubmissionStatus[]
  startDate?: string
  endDate?: string
  fields?: string[]
  userId?: string
}

interface ListFormsQuery {
  search?: string
  limit?: string
  offset?: string
  userId?: string
}

interface ListSubmissionsQuery {
  formName?: string
  status?: SubmissionStatus
  startDate?: string
  endDate?: string
  search?: string
  limit?: string
  offset?: string
  userId?: string
}

interface StatsQuery {
  startDate?: string
  endDate?: string
  userId?: string
}

// ============================================================================
// Routes
// ============================================================================

export async function inhouseFormsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  // --------------------------------------------------------------------------
  // Form Submission (Public key allowed)
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/forms/:formName/submit
   *
   * Submit a form (can be called with public key)
   *
   * NOTE: Requires Fastify trustProxy to be configured properly in production.
   * Without trustProxy, x-forwarded-for can be spoofed to bypass rate limits.
   * Set trustProxy: true (or specific proxy IPs) in server.ts Fastify config.
   */
  fastify.post<{
    Params: { formName: string }
    Body: SubmitFormBody
    Headers: { 'x-forwarded-for'?: string; 'user-agent'?: string; 'referer'?: string; 'x-project-id': string }
  }>('/v1/inhouse/forms/:formName/submit', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { formName } = request.params
    const projectId = request.headers['x-project-id']
    const { data, captcha_token, metadata } = request.body

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Project ID required' } })
    }

    const service = getInhouseFormsService()

    try {
      const result = await service.submitForm(projectId, formName, {
        data,
        captchaToken: captcha_token,
        metadata,
        sourceIp: request.headers['x-forwarded-for']?.split(',')[0]?.trim() || request.ip,
        userAgent: request.headers['user-agent'],
        referrer: request.headers['referer'],
      })

      // Log activity (fire and forget)
      logActivity({
        projectId,
        service: 'forms',
        action: 'submit',
        resourceType: 'submission',
        resourceId: result.id,
        metadata: { formName },
      })

      return reply.status(201).send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string; field?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: {
          code: err.code || 'INTERNAL_ERROR',
          message: err.message || 'Internal server error',
          field: err.field,
        },
      })
    }
  })

  // --------------------------------------------------------------------------
  // Form Schema Management (Server key required)
  // --------------------------------------------------------------------------

  /**
   * PUT /v1/inhouse/forms/:formName
   *
   * Create or update a form schema
   */
  fastify.put<{
    Params: FormParams
    Body: CreateFormBody
  }>('/v1/inhouse/projects/:projectId/forms/:formName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, formName } = request.params
    const { userId, ...input } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()

    try {
      const result = await service.createOrUpdateForm(projectId, formName, input)

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'forms',
        action: 'define_schema',
        resourceType: 'form',
        resourceId: result.id,
        metadata: { formName },
      })

      return reply.status(200).send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * GET /v1/inhouse/projects/:projectId/forms/:formName
   *
   * Get a form schema
   */
  fastify.get<{
    Params: FormParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/forms/:formName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, formName } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const result = await service.getForm(projectId, formName)

    if (!result) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'FORM_NOT_FOUND', message: `Form '${formName}' not found` },
      })
    }

    return reply.send({ ok: true, data: result })
  })

  /**
   * PATCH /v1/inhouse/projects/:projectId/forms/:formName
   *
   * Update a form schema
   */
  fastify.patch<{
    Params: FormParams
    Body: UpdateFormBody
  }>('/v1/inhouse/projects/:projectId/forms/:formName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, formName } = request.params
    const { userId, ...input } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()

    try {
      const result = await service.updateForm(projectId, formName, input)

      if (!result) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'FORM_NOT_FOUND', message: `Form '${formName}' not found` },
        })
      }

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'forms',
        action: 'update_schema',
        resourceType: 'form',
        resourceId: result.id,
        metadata: { formName },
      })

      return reply.send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * DELETE /v1/inhouse/projects/:projectId/forms/:formName
   *
   * Delete a form schema
   */
  fastify.delete<{
    Params: FormParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/forms/:formName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, formName } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const deleted = await service.deleteForm(projectId, formName)

    if (!deleted) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'FORM_NOT_FOUND', message: `Form '${formName}' not found` },
      })
    }

    logActivity({
      projectId,
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      service: 'forms',
      action: 'delete_schema',
      resourceType: 'form',
      metadata: { formName },
    })

    return reply.send({ ok: true, data: { deleted: true } })
  })

  /**
   * GET /v1/inhouse/projects/:projectId/forms
   *
   * List all form schemas
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: ListFormsQuery
  }>('/v1/inhouse/projects/:projectId/forms', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, ...options } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const result = await service.listForms(projectId, {
      search: options.search,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      offset: options.offset ? parseInt(options.offset, 10) : undefined,
    })

    return reply.send({
      ok: true,
      data: {
        forms: result.items,
        total: result.total,
        hasMore: result.hasMore,
      },
    })
  })

  // --------------------------------------------------------------------------
  // Submission Management (Server key required)
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/forms/submissions/:submissionId
   *
   * Get a submission by ID
   */
  fastify.get<{
    Params: SubmissionParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/forms/submissions/:submissionId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, submissionId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const result = await service.getSubmission(projectId, submissionId)

    if (!result) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' },
      })
    }

    return reply.send({ ok: true, data: result })
  })

  /**
   * GET /v1/inhouse/projects/:projectId/forms/submissions
   *
   * List submissions
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: ListSubmissionsQuery
  }>('/v1/inhouse/projects/:projectId/forms/submissions', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, ...options } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const result = await service.listSubmissions(projectId, {
      formName: options.formName,
      status: options.status,
      startDate: options.startDate,
      endDate: options.endDate,
      search: options.search,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      offset: options.offset ? parseInt(options.offset, 10) : undefined,
    })

    return reply.send({
      ok: true,
      data: {
        submissions: result.items,
        total: result.total,
        hasMore: result.hasMore,
      },
    })
  })

  /**
   * PATCH /v1/inhouse/projects/:projectId/forms/submissions/:submissionId
   *
   * Update submission status
   */
  fastify.patch<{
    Params: SubmissionParams
    Body: UpdateSubmissionBody
  }>('/v1/inhouse/projects/:projectId/forms/submissions/:submissionId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, submissionId } = request.params
    const { status, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const result = await service.updateSubmission(projectId, submissionId, status)

    if (!result) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' },
      })
    }

    logActivity({
      projectId,
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      service: 'forms',
      action: 'update_submission',
      resourceType: 'submission',
      resourceId: submissionId,
      metadata: { status },
    })

    return reply.send({ ok: true, data: result })
  })

  /**
   * DELETE /v1/inhouse/projects/:projectId/forms/submissions/:submissionId
   *
   * Delete a submission
   */
  fastify.delete<{
    Params: SubmissionParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/forms/submissions/:submissionId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, submissionId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const deleted = await service.deleteSubmission(projectId, submissionId)

    if (!deleted) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'SUBMISSION_NOT_FOUND', message: 'Submission not found' },
      })
    }

    logActivity({
      projectId,
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      service: 'forms',
      action: 'delete_submission',
      resourceType: 'submission',
      resourceId: submissionId,
    })

    return reply.send({ ok: true, data: { deleted: true } })
  })

  /**
   * POST /v1/inhouse/projects/:projectId/forms/submissions/bulk
   *
   * Bulk update submission statuses
   */
  fastify.post<{
    Params: ProjectParams
    Body: BulkUpdateBody
  }>('/v1/inhouse/projects/:projectId/forms/submissions/bulk', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { submission_ids, status, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()
    const result = await service.bulkUpdateSubmissions(projectId, {
      submissionIds: submission_ids,
      status,
    })

    logActivity({
      projectId,
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      service: 'forms',
      action: 'bulk_update',
      resourceType: 'submission',
      metadata: { count: result.updated, status },
    })

    return reply.send({ ok: true, data: result })
  })

  // --------------------------------------------------------------------------
  // Statistics & Export
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/forms/:formName/stats
   *
   * Get form statistics
   */
  fastify.get<{
    Params: FormParams
    Querystring: StatsQuery
  }>('/v1/inhouse/projects/:projectId/forms/:formName/stats', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, formName } = request.params
    const { userId, startDate, endDate } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()

    try {
      const result = await service.getStats(projectId, formName, { startDate, endDate })
      return reply.send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * POST /v1/inhouse/projects/:projectId/forms/export
   *
   * Export form submissions
   */
  fastify.post<{
    Params: ProjectParams
    Body: ExportBody
  }>('/v1/inhouse/projects/:projectId/forms/export', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { form_name, format, status, startDate, endDate, fields, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseFormsService()

    try {
      const result = await service.exportSubmissions(projectId, {
        formName: form_name,
        format,
        status,
        startDate,
        endDate,
        fields,
      })

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'forms',
        action: 'export',
        resourceType: 'submission',
        metadata: { formName: form_name, format },
      })

      // Return the data directly with appropriate headers
      reply.header('Content-Type', result.contentType)
      reply.header('Content-Disposition', `attachment; filename="${result.filename}"`)
      return reply.send(result.data)
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })
}
