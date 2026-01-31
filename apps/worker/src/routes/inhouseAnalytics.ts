/**
 * Inhouse Analytics Routes
 *
 * Analytics tracking endpoints for Easy Mode projects.
 *
 * Routes:
 * POST /v1/inhouse/projects/:projectId/analytics/track - Track custom event
 * POST /v1/inhouse/projects/:projectId/analytics/page - Track page view
 * POST /v1/inhouse/projects/:projectId/analytics/identify - Identify user
 * GET  /v1/inhouse/projects/:projectId/analytics/events - List events
 * GET  /v1/inhouse/projects/:projectId/analytics/counts - Get event counts
 * GET  /v1/inhouse/projects/:projectId/analytics/users/:userId - Get user profile
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getInhouseAnalyticsService } from '../services/inhouse/InhouseAnalyticsService'

// =============================================================================
// Types
// =============================================================================

interface ProjectParams {
  projectId: string
}

interface UserParams extends ProjectParams {
  userId: string
}

interface TrackBody {
  event: string
  properties?: Record<string, unknown>
  userId?: string
  anonymousId?: string
  timestamp?: string
  context?: {
    userAgent?: string
    ip?: string
    locale?: string
    timezone?: string
    screen?: { width?: number; height?: number }
    page?: { url?: string; path?: string; referrer?: string }
  }
}

interface PageBody {
  path: string
  title?: string
  referrer?: string
  userId?: string
  anonymousId?: string
  timestamp?: string
  context?: TrackBody['context']
}

interface IdentifyBody {
  userId: string
  traits?: Record<string, unknown>
  anonymousId?: string
  timestamp?: string
}

interface ListEventsQuery {
  eventType?: 'track' | 'page' | 'identify'
  eventName?: string
  userId?: string
  anonymousId?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}

interface CountsQuery {
  eventType?: 'track' | 'page' | 'identify'
  startDate?: string
  endDate?: string
  groupBy?: 'event' | 'day' | 'hour'
}

// =============================================================================
// Route Registration
// =============================================================================

export async function inhouseAnalyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  // ---------------------------------------------------------------------------
  // POST /analytics/track - Track custom event
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: ProjectParams
    Body: TrackBody
  }>(
    '/v1/inhouse/projects/:projectId/analytics/track',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body
      const userId = body.userId

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      // Validate required fields
      if (!body.event || typeof body.event !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'event is required' }
        })
      }

      if (!body.userId && !body.anonymousId) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Either userId or anonymousId is required' }
        })
      }

      // Validate event name length
      if (body.event.length > 255) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Event name must be 255 characters or less' }
        })
      }

      try {
        const service = getInhouseAnalyticsService(projectId)
        // Merge server-derived context (don't trust client-provided IP/UA)
        const mergedContext = {
          ...body.context,
          userAgent: request.headers['user-agent'] as string | undefined,
          ip: request.ip,
        }
        const result = await service.track({
          event: body.event,
          properties: body.properties,
          userId: body.userId,
          anonymousId: body.anonymousId,
          timestamp: body.timestamp,
          context: mergedContext
        })

        return reply.code(201).send({
          ok: true,
          data: result
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to track event')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // POST /analytics/page - Track page view
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: ProjectParams
    Body: PageBody
  }>(
    '/v1/inhouse/projects/:projectId/analytics/page',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body
      const userId = body.userId

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      // Validate required fields
      if (!body.path || typeof body.path !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'path is required' }
        })
      }

      if (!body.userId && !body.anonymousId) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Either userId or anonymousId is required' }
        })
      }

      try {
        const service = getInhouseAnalyticsService(projectId)
        // Merge server-derived context (don't trust client-provided IP/UA)
        const mergedContext = {
          ...body.context,
          userAgent: request.headers['user-agent'] as string | undefined,
          ip: request.ip,
        }
        const result = await service.page({
          path: body.path,
          title: body.title,
          referrer: body.referrer,
          userId: body.userId,
          anonymousId: body.anonymousId,
          timestamp: body.timestamp,
          context: mergedContext
        })

        return reply.code(201).send({
          ok: true,
          data: result
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to track page view')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // POST /analytics/identify - Identify user
  // ---------------------------------------------------------------------------
  fastify.post<{
    Params: ProjectParams
    Body: IdentifyBody
  }>(
    '/v1/inhouse/projects/:projectId/analytics/identify',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body
      const userId = body.userId

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      // Validate required fields
      if (!body.userId || typeof body.userId !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'userId is required' }
        })
      }

      try {
        const service = getInhouseAnalyticsService(projectId)
        const result = await service.identify({
          userId: body.userId,
          traits: body.traits,
          anonymousId: body.anonymousId,
          timestamp: body.timestamp
        })

        return reply.code(201).send({
          ok: true,
          data: result
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to identify user')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /analytics/events - List events
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: ProjectParams
    Querystring: ListEventsQuery
  }>(
    '/v1/inhouse/projects/:projectId/analytics/events',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const query = request.query
      const { userId } = query as { userId?: string }

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      try {
        const service = getInhouseAnalyticsService(projectId)
        const result = await service.listEvents({
          eventType: query.eventType,
          eventName: query.eventName,
          userId: query.userId,
          anonymousId: query.anonymousId,
          startDate: query.startDate,
          endDate: query.endDate,
          limit: query.limit ? Math.min(Math.max(parseInt(String(query.limit), 10) || 50, 1), 100) : 50,
          offset: query.offset ? Math.max(parseInt(String(query.offset), 10) || 0, 0) : 0
        })

        return reply.code(200).send({
          ok: true,
          data: result
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to list events')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /analytics/counts - Get event counts
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: ProjectParams
    Querystring: CountsQuery & { userId?: string }
  }>(
    '/v1/inhouse/projects/:projectId/analytics/counts',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const query = request.query
      const { userId } = query as { userId?: string }

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      try {
        const service = getInhouseAnalyticsService(projectId)
        const result = await service.getCounts({
          eventType: query.eventType,
          startDate: query.startDate,
          endDate: query.endDate,
          groupBy: query.groupBy
        })

        return reply.code(200).send({
          ok: true,
          data: { counts: result }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to get counts')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /analytics/users/:userId - Get user profile
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: UserParams
    Querystring: { requestingUserId?: string }
  }>(
    '/v1/inhouse/projects/:projectId/analytics/users/:userId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, userId } = request.params
      const { requestingUserId } = request.query as { requestingUserId?: string }

      // Authorize project access
      if (requestingUserId) {
        await assertProjectAccess(projectId, requestingUserId)
      }

      try {
        const service = getInhouseAnalyticsService(projectId)
        const user = await service.getUser(userId)

        if (!user) {
          return reply.code(404).send({
            ok: false,
            error: { code: 'NOT_FOUND', message: 'User not found' }
          })
        }

        return reply.code(200).send({
          ok: true,
          data: { user }
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, userId }, 'Failed to get user')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )
}
