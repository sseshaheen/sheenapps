/**
 * Admin In-House Jobs Routes
 *
 * Endpoints for inspecting and operating on In-House jobs (per project).
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { getInhouseJobsService } from '../services/inhouse/InhouseJobsService'
import { parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

interface ListJobsQuery {
  projectId?: string
  name?: string
  status?: 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | 'all'
  limit?: string
  offset?: string
  orderBy?: 'createdAt' | 'processedAt'
  orderDir?: 'asc' | 'desc'
}

interface JobActionBody {
  reason?: string
  projectId?: string
}

interface DLQActionBody {
  projectId?: string
  reason?: string
  confirmCount?: number
}

// =============================================================================
// HELPERS
// =============================================================================

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseJobsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/jobs?projectId=...
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: ListJobsQuery
  }>('/v1/admin/inhouse/jobs', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId, name, status, limit: limitStr, offset: offsetStr, orderBy, orderDir } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)
      const service = getInhouseJobsService(projectId)
      const result = await service.list({
        name,
        status: status || 'all',
        limit,
        offset,
        orderBy,
        orderDir,
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'jobs_list',
        projectId,
        resourceType: 'job',
        metadata: { name, status, limit, offset },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to list jobs')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list jobs',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/jobs/:jobId?projectId=...
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { jobId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/jobs/:jobId', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { jobId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseJobsService(projectId)
      const job = await service.get(jobId)
      if (!job) {
        return reply.status(404).send({ success: false, error: 'Job not found' })
      }

      return reply.send({ success: true, data: job })
    } catch (error) {
      request.log.error({ error }, 'Failed to get job')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get job',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/jobs/:jobId/cancel
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { jobId: string }
    Body: JobActionBody
  }>('/v1/admin/inhouse/jobs/:jobId/cancel', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { jobId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseJobsService(projectId)
      const result = await service.cancel(jobId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'job_cancel',
        projectId,
        resourceType: 'job',
        resourceId: jobId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to cancel job')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel job',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/jobs/:jobId/retry
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { jobId: string }
    Body: JobActionBody
  }>('/v1/admin/inhouse/jobs/:jobId/retry', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { jobId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseJobsService(projectId)
      const result = await service.retry(jobId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'job_retry',
        projectId,
        resourceType: 'job',
        resourceId: jobId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to retry job')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry job',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/jobs/schedules?projectId=...
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/jobs/schedules', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseJobsService(projectId)
      const result = await service.listSchedules()
      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to list schedules')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list schedules',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/jobs/dlq?projectId=...
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: { projectId?: string; limit?: string; offset?: string }
  }>('/v1/admin/inhouse/jobs/dlq', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId, limit: limitStr, offset: offsetStr } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)
      const service = getInhouseJobsService(projectId)
      const result = await service.listDLQ(limit, offset)
      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to list DLQ jobs')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list DLQ jobs',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/jobs/dlq/retry-preview
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: { projectId?: string }
  }>('/v1/admin/inhouse/jobs/dlq/retry-preview', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseJobsService(projectId)
      const count = await service.getDLQCount()
      return reply.send({ success: true, data: { wouldRetry: count } })
    } catch (error) {
      request.log.error({ error }, 'Failed to preview DLQ retry')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to preview DLQ retry',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/jobs/dlq/retry-all
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: DLQActionBody
  }>('/v1/admin/inhouse/jobs/dlq/retry-all', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId, reason, confirmCount } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!reason) {
      return reply.status(400).send({ success: false, error: 'reason is required' })
    }
    if (typeof confirmCount !== 'number') {
      return reply.status(400).send({ success: false, error: 'confirmCount is required' })
    }

    try {
      const service = getInhouseJobsService(projectId)
      const count = await service.getDLQCount()
      if (count !== confirmCount) {
        return reply.status(409).send({
          success: false,
          error: `DLQ count changed (expected ${confirmCount}, actual ${count})`,
        })
      }

      const rateLimit = await service.checkAdminRetryRateLimit(20)
      if (!rateLimit.allowed) {
        return reply.status(429).send({
          success: false,
          error: 'Rate limit exceeded for DLQ retries',
        })
      }

      const result = await service.retryFailed(confirmCount)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'dlq_retry_all',
        projectId,
        resourceType: 'job',
        reason,
        metadata: { requested: confirmCount, ...result },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to retry DLQ jobs')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retry DLQ jobs',
      })
    }
  })
}
