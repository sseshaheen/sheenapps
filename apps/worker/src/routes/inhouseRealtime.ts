/**
 * In-House Realtime Routes
 *
 * HTTP endpoints for Easy Mode project realtime operations.
 *
 * Routes:
 * - POST /v1/inhouse/realtime/auth - Get authentication token
 * - POST /v1/inhouse/realtime/publish - Publish to a channel
 * - GET  /v1/inhouse/realtime/channels - List channels
 * - GET  /v1/inhouse/realtime/channels/:channel - Get channel info
 * - GET  /v1/inhouse/realtime/channels/:channel/history - Get channel history
 * - GET  /v1/inhouse/realtime/channels/:channel/presence - Get presence members
 * - GET  /v1/inhouse/realtime/stats - Get usage statistics
 *
 * Part of EASY_MODE_SDK_PLAN.md - Phase 3C
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getInhouseRealtimeService } from '../services/inhouse/InhouseRealtimeService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

// =============================================================================
// LIMITS
// =============================================================================

const MAX_CHANNEL_NAME_LENGTH = 200
const MAX_DATA_SIZE = 64 * 1024 // 64KB
const MAX_LIST_LIMIT = 100
const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9:_-]+$/

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface AuthBody {
  projectId: string
  clientId?: string
  channels?: string[]
  capabilities?: Record<string, string[]>
  ttlSeconds?: number
  userId?: string
}

interface PublishBody {
  projectId: string
  channel: string
  event: string
  data: unknown
  userId?: string
}

interface ChannelParams {
  channel: string
}

interface ProjectQuery {
  projectId: string
  userId?: string
}

interface ListChannelsQuery {
  projectId: string
  prefix?: string
  limit?: string
  userId?: string
}

interface HistoryQuery {
  projectId: string
  limit?: string
  start?: string
  end?: string
  direction?: string
  userId?: string
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

function validateChannelName(channel: string): { valid: boolean; error?: string } {
  if (!channel) {
    return { valid: false, error: 'channel is required' }
  }

  if (typeof channel !== 'string') {
    return { valid: false, error: 'channel must be a string' }
  }

  if (channel.length > MAX_CHANNEL_NAME_LENGTH) {
    return { valid: false, error: `channel name exceeds maximum length (${MAX_CHANNEL_NAME_LENGTH} chars)` }
  }

  if (!CHANNEL_NAME_REGEX.test(channel)) {
    return { valid: false, error: 'channel name can only contain letters, numbers, colons, underscores, and hyphens' }
  }

  return { valid: true }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseRealtimeRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // POST /v1/inhouse/realtime/auth - Get authentication token
  // ===========================================================================
  fastify.post<{
    Body: AuthBody
  }>('/v1/inhouse/realtime/auth', {
    preHandler: hmacMiddleware as any,
    bodyLimit: MAX_DATA_SIZE,
  }, async (request, reply) => {
    const {
      projectId,
      clientId,
      channels,
      capabilities,
      ttlSeconds,
      userId,
    } = request.body

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    // userId is required for realtime token creation
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for realtime operations',
        },
      })
    }

    await assertProjectAccess(projectId, userId)

    // Validate channels if provided
    if (channels && Array.isArray(channels)) {
      for (const channel of channels) {
        const validation = validateChannelName(channel)
        if (!validation.valid) {
          return reply.code(400).send({
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: validation.error,
            },
          })
        }
      }
    }

    try {
      const realtimeService = getInhouseRealtimeService(projectId)
      const result = await realtimeService.createToken({
        clientId,
        channels,
        capabilities,
        ttlSeconds,
      })

      if (!result.ok) {
        return reply.code(getStatusCode(result.error?.code)).send({
          ok: false,
          error: result.error,
        })
      }

      logActivity({
        projectId,
        service: 'realtime',
        action: 'create_token',
        actorType: 'user',
        actorId: userId,
        resourceType: 'token',
        metadata: {
          clientId,
          channelCount: channels?.length || 0,
        },
      })

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/realtime/publish - Publish to a channel
  // ===========================================================================
  fastify.post<{
    Body: PublishBody
  }>('/v1/inhouse/realtime/publish', {
    preHandler: hmacMiddleware as any,
    bodyLimit: MAX_DATA_SIZE,
  }, async (request, reply) => {
    const {
      projectId,
      channel,
      event,
      data,
      userId,
    } = request.body

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    // userId is required for publishing messages
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for realtime operations',
        },
      })
    }

    await assertProjectAccess(projectId, userId)

    // Validate channel
    const channelValidation = validateChannelName(channel)
    if (!channelValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: channelValidation.error,
        },
      })
    }

    // Validate event
    if (!event || typeof event !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'event is required and must be a string',
        },
      })
    }

    try {
      const realtimeService = getInhouseRealtimeService(projectId)
      const result = await realtimeService.publish({
        channel,
        event,
        data,
        userId,
      })

      if (!result.ok) {
        return reply.code(getStatusCode(result.error?.code)).send({
          ok: false,
          error: result.error,
        })
      }

      logActivity({
        projectId,
        service: 'realtime',
        action: 'publish',
        actorType: 'user',
        actorId: userId,
        resourceType: 'message',
        resourceId: result.data?.id,
        metadata: {
          channel,
          event,
        },
      })

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/realtime/channels - List channels
  // ===========================================================================
  fastify.get<{
    Querystring: ListChannelsQuery
  }>('/v1/inhouse/realtime/channels', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, prefix, limit: limitStr, userId } = request.query

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    let limit = 20
    if (limitStr) {
      const parsed = parseInt(limitStr, 10)
      if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `limit must be between 1 and ${MAX_LIST_LIMIT}`,
          },
        })
      }
      limit = parsed
    }

    try {
      const realtimeService = getInhouseRealtimeService(projectId)
      const result = await realtimeService.listChannels({ prefix, limit })

      if (!result.ok) {
        return reply.code(getStatusCode(result.error?.code)).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: { channels: result.data },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/realtime/channels/:channel - Get channel info
  // ===========================================================================
  fastify.get<{
    Params: ChannelParams
    Querystring: ProjectQuery
  }>('/v1/inhouse/realtime/channels/:channel', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { channel } = request.params
    const { projectId, userId } = request.query

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const channelValidation = validateChannelName(channel)
    if (!channelValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: channelValidation.error,
        },
      })
    }

    try {
      const realtimeService = getInhouseRealtimeService(projectId)
      const result = await realtimeService.getChannelInfo(channel)

      if (!result.ok) {
        return reply.code(getStatusCode(result.error?.code)).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: { channel: result.data },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/realtime/channels/:channel/history - Get channel history
  // ===========================================================================
  fastify.get<{
    Params: ChannelParams
    Querystring: HistoryQuery
  }>('/v1/inhouse/realtime/channels/:channel/history', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { channel } = request.params
    const { projectId, limit: limitStr, start, end, direction, userId } = request.query

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const channelValidation = validateChannelName(channel)
    if (!channelValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: channelValidation.error,
        },
      })
    }

    let limit: number | undefined
    if (limitStr) {
      const parsed = parseInt(limitStr, 10)
      if (isNaN(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `limit must be between 1 and ${MAX_LIST_LIMIT}`,
          },
        })
      }
      limit = parsed
    }

    if (direction && direction !== 'forwards' && direction !== 'backwards') {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'direction must be "forwards" or "backwards"',
        },
      })
    }

    try {
      const realtimeService = getInhouseRealtimeService(projectId)
      const result = await realtimeService.getHistory(channel, {
        limit,
        start,
        end,
        direction: direction as 'forwards' | 'backwards' | undefined,
      })

      if (!result.ok) {
        return reply.code(getStatusCode(result.error?.code)).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/realtime/channels/:channel/presence - Get presence
  // ===========================================================================
  fastify.get<{
    Params: ChannelParams
    Querystring: ProjectQuery
  }>('/v1/inhouse/realtime/channels/:channel/presence', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { channel } = request.params
    const { projectId, userId } = request.query

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const channelValidation = validateChannelName(channel)
    if (!channelValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: channelValidation.error,
        },
      })
    }

    try {
      const realtimeService = getInhouseRealtimeService(projectId)
      const result = await realtimeService.getPresence(channel)

      if (!result.ok) {
        return reply.code(getStatusCode(result.error?.code)).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: { members: result.data },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/realtime/stats - Get usage statistics
  // ===========================================================================
  fastify.get<{
    Querystring: StatsQuery
  }>('/v1/inhouse/realtime/stats', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, startDate, endDate, userId } = request.query

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'projectId is required',
        },
      })
    }

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const realtimeService = getInhouseRealtimeService(projectId)
      const result = await realtimeService.getStats({ startDate, endDate })

      if (!result.ok) {
        return reply.code(getStatusCode(result.error?.code)).send({
          ok: false,
          error: result.error,
        })
      }

      return reply.send({
        ok: true,
        data: result.data,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })
}

// =============================================================================
// HELPERS
// =============================================================================

function getStatusCode(errorCode?: string): number {
  switch (errorCode) {
    case 'VALIDATION_ERROR':
      return 400
    case 'UNAUTHORIZED':
    case 'ABLY_KEY_MISSING':
      return 401
    case 'FORBIDDEN':
      return 403
    case 'NOT_FOUND':
      return 404
    case 'QUOTA_EXCEEDED':
    case 'RATE_LIMITED':
      return 429
    case 'TIMEOUT':
      return 504
    default:
      return 500
  }
}
