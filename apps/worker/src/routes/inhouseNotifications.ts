/**
 * In-House Notifications Routes
 *
 * HTTP endpoints for Easy Mode project notification operations.
 *
 * Routes:
 * - POST /v1/inhouse/notifications/send - Send notification
 * - GET  /v1/inhouse/notifications/:id - Get notification
 * - GET  /v1/inhouse/notifications - List notifications
 * - DELETE /v1/inhouse/notifications/:id - Cancel notification
 * - POST /v1/inhouse/notifications/templates - Create template
 * - GET  /v1/inhouse/notifications/templates - List templates
 * - GET  /v1/inhouse/notifications/templates/:type - Get template
 * - DELETE /v1/inhouse/notifications/templates/:type - Delete template
 * - GET  /v1/inhouse/notifications/preferences/:userId - Get preferences
 * - PUT  /v1/inhouse/notifications/preferences/:userId - Update preferences
 * - GET  /v1/inhouse/notifications/stats - Get statistics
 *
 * Part of EASY_MODE_SDK_PLAN.md - Phase 3C
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess, isProjectOwner } from '../utils/projectAuth'
import {
  getInhouseNotificationsService,
  NotificationChannel,
} from '../services/inhouse/InhouseNotificationsService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

// =============================================================================
// LIMITS (DoS Protection)
// =============================================================================

const MAX_RECIPIENTS = 100
const MAX_TITLE_LENGTH = 256
const MAX_BODY_LENGTH = 4096
const BODY_LIMIT = 64 * 1024

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface SendBody {
  projectId: string
  to: string | string[]
  type: string
  data?: Record<string, unknown>
  title?: string
  body?: string
  channels?: NotificationChannel[]
  channelConfig?: Record<string, Record<string, unknown>>
  idempotencyKey?: string
  scheduledFor?: string
  metadata?: Record<string, unknown>
  userId?: string
}

interface GetParams {
  id: string
}

interface ListQuery {
  projectId: string
  userId?: string
  type?: string
  channel?: NotificationChannel
  status?: string
  startDate?: string
  endDate?: string
  limit?: string
  offset?: string
}

interface CreateTemplateBody {
  projectId: string
  type: string
  name: string
  description?: string
  channels: NotificationChannel[]
  defaultTitle: string
  defaultBody: string
  variables?: string[]
  channelTemplates?: Record<string, unknown>
  userId?: string
}

interface TemplateParams {
  type: string
}

interface PreferencesParams {
  userId: string
}

interface UpdatePreferencesBody {
  projectId: string
  channels?: Partial<{ email: boolean; push: boolean; realtime: boolean; sms: boolean }>
  types?: Record<string, { enabled: boolean; channels?: NotificationChannel[] }>
  quietHours?: {
    enabled: boolean
    start: string
    end: string
    timezone: string
  }
  actorUserId?: string  // The user making the request (for authorization)
}

interface StatsQuery {
  projectId: string
  startDate?: string
  endDate?: string
  userId?: string
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateRecipients(to: unknown): { valid: boolean; error?: string; normalized?: string[] } {
  if (!to) {
    return { valid: false, error: 'recipients (to) required' }
  }

  const recipients = Array.isArray(to) ? to : [to]

  if (recipients.length === 0) {
    return { valid: false, error: 'at least one recipient required' }
  }

  if (recipients.length > MAX_RECIPIENTS) {
    return { valid: false, error: `maximum ${MAX_RECIPIENTS} recipients per request` }
  }

  for (let i = 0; i < recipients.length; i++) {
    if (typeof recipients[i] !== 'string' || recipients[i].length === 0) {
      return { valid: false, error: `recipients[${i}] must be a non-empty string` }
    }
  }

  return { valid: true, normalized: recipients as string[] }
}

function validateChannels(channels: unknown): { valid: boolean; error?: string } {
  if (!channels) return { valid: true }

  if (!Array.isArray(channels)) {
    return { valid: false, error: 'channels must be an array' }
  }

  const validChannels = ['email', 'push', 'realtime', 'sms']
  for (const ch of channels) {
    if (!validChannels.includes(ch)) {
      return { valid: false, error: `invalid channel: ${ch}` }
    }
  }

  return { valid: true }
}

// =============================================================================
// ROUTES
// =============================================================================

export async function inhouseNotificationsRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // SEND NOTIFICATION
  // ===========================================================================

  fastify.post<{
    Body: SendBody
  }>('/v1/inhouse/notifications/send', {
    preHandler: hmacMiddleware as never,
    config: { rawBody: true },
    bodyLimit: BODY_LIMIT,
  }, async (request: FastifyRequest<{ Body: SendBody }>, reply: FastifyReply) => {
    const { projectId, to, type, data, title, body, channels, channelConfig, idempotencyKey, scheduledFor, metadata, userId } = request.body

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    // Validate recipients
    const recipientsResult = validateRecipients(to)
    if (!recipientsResult.valid) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: recipientsResult.error } })
    }

    if (!type) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'type required' } })
    }

    // Validate title/body length
    if (title && title.length > MAX_TITLE_LENGTH) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: `title exceeds maximum length (${MAX_TITLE_LENGTH})` } })
    }
    if (body && body.length > MAX_BODY_LENGTH) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: `body exceeds maximum length (${MAX_BODY_LENGTH})` } })
    }

    // Validate channels
    const channelsResult = validateChannels(channels)
    if (!channelsResult.valid) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: channelsResult.error } })
    }

    // userId is required for sending notifications
    if (!userId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'userId is required for notification operations' } })
    }

    // Assert project access
    await assertProjectAccess(projectId, userId)

    const service = getInhouseNotificationsService(projectId)
    const result = await service.send({
      to: recipientsResult.normalized!,
      type,
      data,
      title,
      body,
      channels,
      channelConfig,
      idempotencyKey,
      scheduledFor,
      metadata,
    })

    // Log activity
    await logActivity({
      projectId,
      service: 'notifications' as never,
      action: 'notification.send',
      status: result.ok ? 'success' : 'error',
      actorType: 'system',
      metadata: {
        type,
        recipientCount: recipientsResult.normalized!.length,
        channels: channels || ['realtime'],
      },
    })

    if (!result.ok) {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 500
      return reply.status(status).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // GET NOTIFICATION
  // ===========================================================================

  fastify.get<{
    Params: GetParams
    Querystring: { projectId: string; userId?: string }
  }>('/v1/inhouse/notifications/:id', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { id } = request.params
    const { projectId, userId } = request.query

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseNotificationsService(projectId)
    const result = await service.get(id)

    if (!result.ok) {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 500
      return reply.status(status).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // LIST NOTIFICATIONS
  // ===========================================================================

  fastify.get<{
    Querystring: ListQuery
  }>('/v1/inhouse/notifications', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, userId, type, channel, status, startDate, endDate, limit, offset } = request.query

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    // Verify user has access to this project if userId provided
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseNotificationsService(projectId)
    const result = await service.list({
      userId,
      type,
      channel,
      status: status as 'pending' | 'partial' | 'sent' | 'delivered' | 'failed' | undefined,
      startDate,
      endDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    })

    if (!result.ok) {
      return reply.status(500).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // CANCEL NOTIFICATION
  // ===========================================================================

  fastify.delete<{
    Params: GetParams
    Querystring: { projectId: string; userId?: string }
  }>('/v1/inhouse/notifications/:id', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { id } = request.params
    const { projectId, userId } = request.query

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    // userId is required for canceling notifications
    if (!userId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'userId is required for notification operations' } })
    }

    await assertProjectAccess(projectId, userId)

    const service = getInhouseNotificationsService(projectId)
    const result = await service.cancel(id)

    await logActivity({
      projectId,
      service: 'notifications' as never,
      action: 'notification.cancel',
      status: result.ok ? 'success' : 'error',
      actorType: 'system',
      metadata: { notificationId: id },
    })

    if (!result.ok) {
      return reply.status(500).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // CREATE TEMPLATE
  // ===========================================================================

  fastify.post<{
    Body: CreateTemplateBody
  }>('/v1/inhouse/notifications/templates', {
    preHandler: hmacMiddleware as never,
    config: { rawBody: true },
    bodyLimit: BODY_LIMIT,
  }, async (request, reply) => {
    const { projectId, type, name, description, channels, defaultTitle, defaultBody, variables, channelTemplates, userId } = request.body

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }
    if (!type) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'type required' } })
    }
    if (!name) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } })
    }
    if (!channels || channels.length === 0) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'at least one channel required' } })
    }
    if (!defaultTitle) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'defaultTitle required' } })
    }
    if (!defaultBody) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'defaultBody required' } })
    }

    const channelsResult = validateChannels(channels)
    if (!channelsResult.valid) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: channelsResult.error } })
    }

    // userId is required for creating templates
    if (!userId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'userId is required for template operations' } })
    }

    await assertProjectAccess(projectId, userId)

    const service = getInhouseNotificationsService(projectId)
    const result = await service.createTemplate({
      type,
      name,
      description,
      channels,
      defaultTitle,
      defaultBody,
      variables,
      channelTemplates,
    })

    await logActivity({
      projectId,
      service: 'notifications' as never,
      action: 'template.create',
      status: result.ok ? 'success' : 'error',
      actorType: 'system',
      metadata: { type, name },
    })

    if (!result.ok) {
      const status = result.error?.code === 'ALREADY_EXISTS' ? 409 : 500
      return reply.status(status).send({ ok: false, error: result.error })
    }

    return reply.status(201).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // LIST TEMPLATES
  // ===========================================================================

  fastify.get<{
    Querystring: { projectId: string; userId?: string }
  }>('/v1/inhouse/notifications/templates', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, userId } = request.query

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseNotificationsService(projectId)
    const result = await service.listTemplates()

    if (!result.ok) {
      return reply.status(500).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // GET TEMPLATE
  // ===========================================================================

  fastify.get<{
    Params: TemplateParams
    Querystring: { projectId: string; userId?: string }
  }>('/v1/inhouse/notifications/templates/:type', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { type } = request.params
    const { projectId, userId } = request.query

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseNotificationsService(projectId)
    const result = await service.getTemplate(decodeURIComponent(type))

    if (!result.ok) {
      const status = result.error?.code === 'NOT_FOUND' ? 404 : 500
      return reply.status(status).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // DELETE TEMPLATE
  // ===========================================================================

  fastify.delete<{
    Params: TemplateParams
    Querystring: { projectId: string; userId?: string }
  }>('/v1/inhouse/notifications/templates/:type', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { type } = request.params
    const { projectId, userId } = request.query

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    // userId is required for deleting templates
    if (!userId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'userId is required for template operations' } })
    }

    await assertProjectAccess(projectId, userId)

    const service = getInhouseNotificationsService(projectId)
    const result = await service.deleteTemplate(decodeURIComponent(type))

    await logActivity({
      projectId,
      service: 'notifications' as never,
      action: 'template.delete',
      status: result.ok ? 'success' : 'error',
      actorType: 'system',
      metadata: { type },
    })

    if (!result.ok) {
      return reply.status(500).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // GET PREFERENCES
  // ===========================================================================

  fastify.get<{
    Params: PreferencesParams
    Querystring: { projectId: string; actorUserId?: string }
  }>('/v1/inhouse/notifications/preferences/:userId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { userId: pathUserId } = request.params
    const { projectId, actorUserId } = request.query
    const targetUserId = decodeURIComponent(pathUserId)

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    // actorUserId is required for preferences operations
    if (!actorUserId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'actorUserId is required' } })
    }

    // Verify actor has access to this project
    await assertProjectAccess(projectId, actorUserId)

    // Self-only access: actor can only read their own preferences, unless they're the project owner
    if (actorUserId !== targetUserId) {
      const ownerCheck = await isProjectOwner(projectId, actorUserId)
      if (!ownerCheck) {
        return reply.status(403).send({ ok: false, error: { code: 'FORBIDDEN', message: 'Cannot read other user preferences' } })
      }
    }

    const service = getInhouseNotificationsService(projectId)
    const result = await service.getPreferences(targetUserId)

    if (!result.ok) {
      return reply.status(500).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // UPDATE PREFERENCES
  // ===========================================================================

  fastify.put<{
    Params: PreferencesParams
    Body: UpdatePreferencesBody
  }>('/v1/inhouse/notifications/preferences/:userId', {
    preHandler: hmacMiddleware as never,
    config: { rawBody: true },
    bodyLimit: BODY_LIMIT,
  }, async (request, reply) => {
    const { userId: pathUserId } = request.params
    const { projectId, channels, types, quietHours, actorUserId } = request.body
    const targetUserId = decodeURIComponent(pathUserId)

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    // actorUserId is required for preferences operations
    if (!actorUserId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'actorUserId is required' } })
    }

    // Verify actor has access to this project
    await assertProjectAccess(projectId, actorUserId)

    // Self-only access: actor can only update their own preferences, unless they're the project owner
    if (actorUserId !== targetUserId) {
      const ownerCheck = await isProjectOwner(projectId, actorUserId)
      if (!ownerCheck) {
        return reply.status(403).send({ ok: false, error: { code: 'FORBIDDEN', message: 'Cannot modify other user preferences' } })
      }
    }

    const service = getInhouseNotificationsService(projectId)
    const result = await service.updatePreferences(targetUserId, {
      channels,
      types,
      quietHours,
    })

    await logActivity({
      projectId,
      service: 'notifications' as never,
      action: 'preferences.update',
      status: result.ok ? 'success' : 'error',
      actorType: 'system',
      actorId: actorUserId,
      metadata: { targetUserId: pathUserId },
    })

    if (!result.ok) {
      return reply.status(500).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })

  // ===========================================================================
  // GET STATISTICS
  // ===========================================================================

  fastify.get<{
    Querystring: StatsQuery
  }>('/v1/inhouse/notifications/stats', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, startDate, endDate, userId } = request.query

    if (!projectId) {
      return reply.status(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseNotificationsService(projectId)
    const result = await service.getStats({ startDate, endDate })

    if (!result.ok) {
      return reply.status(500).send({ ok: false, error: result.error })
    }

    return reply.status(200).send({ ok: true, data: result.data })
  })
}
