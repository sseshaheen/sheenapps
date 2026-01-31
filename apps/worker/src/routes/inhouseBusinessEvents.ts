/**
 * Inhouse Business Events Routes
 *
 * Routes:
 * POST /v1/inhouse/projects/:projectId/business-events - ingest business event
 * GET  /v1/inhouse/projects/:projectId/business-events - list business events
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getBusinessEventsService } from '../services/businessEventsService'
import { allow } from '../utils/throttle'

// Rate limiting configuration for event ingestion
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const EVENT_INGESTION_LIMIT = 100 // Max 100 events per project per minute

interface ProjectParams {
  projectId: string
}

interface BusinessEventBody {
  eventType: string
  occurredAt: string
  source: 'sdk' | 'webhook' | 'server' | 'manual'
  payload?: Record<string, unknown>
  idempotencyKey: string
  schemaVersion?: number
  actorType?: string
  actorId?: string
  entityType?: string
  entityId?: string
  sessionId?: string
  anonymousId?: string
  correlationId?: string
  userId?: string
}

export async function inhouseBusinessEventsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  fastify.post<{
    Params: ProjectParams
    Body: BusinessEventBody
  }>(
    '/v1/inhouse/projects/:projectId/business-events',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const body = request.body

      // Rate limiting: prevent event flooding per project + source
      const source = body.source || 'sdk'
      const rateLimitKey = `business-events:${projectId}:${source}`
      if (!allow(rateLimitKey, EVENT_INGESTION_LIMIT, RATE_LIMIT_WINDOW_MS)) {
        return reply.code(429).send({
          ok: false,
          error: { code: 'RATE_LIMITED', message: 'Too many events. Please slow down.' }
        })
      }

      if (body.userId) {
        await assertProjectAccess(projectId, body.userId)
      }

      if (!body.eventType || typeof body.eventType !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'eventType is required' }
        })
      }

      if (!body.occurredAt || typeof body.occurredAt !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'occurredAt is required' }
        })
      }

      // Validate occurredAt is a valid ISO datetime
      const occurredAtTime = Date.parse(body.occurredAt)
      if (Number.isNaN(occurredAtTime)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'occurredAt must be a valid ISO datetime' }
        })
      }

      if (!body.source) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'source is required' }
        })
      }

      if (!body.idempotencyKey || typeof body.idempotencyKey !== 'string') {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'idempotencyKey is required' }
        })
      }

      // Validate idempotencyKey length (abuse prevention)
      const idempotencyKey = body.idempotencyKey.trim()
      if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'idempotencyKey must be 8-128 characters' }
        })
      }

      // Validate eventType length
      const eventType = body.eventType.trim()
      if (eventType.length > 80) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'eventType must be at most 80 characters' }
        })
      }

      // Validate payload size (32KB max to prevent abuse)
      const payload = body.payload ?? {}
      const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
      if (payloadBytes > 32_000) {
        return reply.code(413).send({
          ok: false,
          error: { code: 'PAYLOAD_TOO_LARGE', message: 'payload exceeds 32KB limit' }
        })
      }

      try {
        const service = getBusinessEventsService()
        const result = await service.insertEvent({
          projectId,
          eventType, // Use trimmed value
          occurredAt: body.occurredAt,
          source: body.source,
          payload, // Use validated payload
          idempotencyKey, // Use trimmed value
          schemaVersion: body.schemaVersion,
          actorType: body.actorType,
          actorId: body.actorId,
          entityType: body.entityType,
          entityId: body.entityId,
          sessionId: body.sessionId,
          anonymousId: body.anonymousId,
          correlationId: body.correlationId
        })

        return reply.code(201).send({
          ok: true,
          data: result
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to insert business event')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  // ---------------------------------------------------------------------------
  // GET /business-events - List business events (for Leads/Customers dashboard)
  // Supports both offset-based (legacy) and cursor-based (preferred) pagination
  // ---------------------------------------------------------------------------
  fastify.get<{
    Params: ProjectParams
    Querystring: {
      eventTypes?: string
      limit?: string
      offset?: string
      cursor?: string
      startDate?: string
      endDate?: string
      userId?: string
    }
  }>(
    '/v1/inhouse/projects/:projectId/business-events',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { eventTypes, limit, offset, cursor, startDate, endDate, userId } = request.query

      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      try {
        const service = getBusinessEventsService()

        // Parse eventTypes from comma-separated string
        const eventTypesList = eventTypes
          ? eventTypes.split(',').map(t => t.trim()).filter(Boolean)
          : undefined

        // Parse cursor using Number() - safer than parseInt which tolerates garbage like "12abc"
        const parsedCursor = cursor ? Number(cursor) : undefined
        const validCursor = Number.isFinite(parsedCursor) && parsedCursor! > 0
          ? parsedCursor
          : undefined

        // Normalize date filters to ISO ranges for precise filtering
        // YYYY-MM-DD → start of day / end of day UTC
        const isYYYYMMDD = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
        const normalizedStartDate = startDate
          ? (isYYYYMMDD(startDate) ? `${startDate}T00:00:00.000Z` : startDate)
          : undefined
        const normalizedEndDate = endDate
          ? (isYYYYMMDD(endDate) ? `${endDate}T23:59:59.999Z` : endDate)
          : undefined

        // Validate normalized dates are parseable
        if (normalizedStartDate && Number.isNaN(Date.parse(normalizedStartDate))) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid startDate format' }
          })
        }
        if (normalizedEndDate && Number.isNaN(Date.parse(normalizedEndDate))) {
          return reply.code(400).send({
            ok: false,
            error: { code: 'VALIDATION_ERROR', message: 'Invalid endDate format' }
          })
        }

        const result = await service.listEvents(projectId, {
          eventTypes: eventTypesList,
          limit: limit ? Math.min(Math.max(Number(limit) || 50, 1), 100) : 50,
          offset: offset ? Math.max(Number(offset) || 0, 0) : 0,
          cursor: validCursor,
          startDate: normalizedStartDate,
          endDate: normalizedEndDate,
          // Only compute total on first page (no cursor) - avoids expensive COUNT(*) on every request
          includeTotal: validCursor === undefined
        })

        return reply.code(200).send({
          ok: true,
          data: result
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to list business events')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )
}
