/**
 * Inhouse Flags Routes
 *
 * API routes for @sheenapps/flags SDK
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getInhouseFlagsService } from '../services/inhouse/InhouseFlagsService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import { assertProjectAccess } from '../utils/projectAuth'

import type {
  CreateFlagInput,
  UpdateFlagInput,
  CreateOverrideInput,
  EvaluationContext,
} from '../services/inhouse/InhouseFlagsService'

// ============================================================================
// Route Types
// ============================================================================

interface ProjectParams {
  projectId: string
}

interface FlagParams extends ProjectParams {
  key: string
}

interface OverrideParams extends FlagParams {
  userId: string
}

interface CreateFlagBody extends CreateFlagInput {
  userId?: string // Actor for audit
}

interface UpdateFlagBody extends UpdateFlagInput {
  userId?: string
}

interface EvaluateBody {
  context?: EvaluationContext
  userId?: string
}

interface CreateOverrideBody extends CreateOverrideInput {
  actorId?: string // Actor for audit (different from userId which is the override target)
}

interface ListFlagsQuery {
  limit?: string
  offset?: string
  enabled?: 'true' | 'false'
  userId?: string
}

// ============================================================================
// Routes
// ============================================================================

export async function inhouseFlagsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  // --------------------------------------------------------------------------
  // Evaluation Endpoints (requires HMAC signature)
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/projects/:projectId/flags/:key/evaluate
   *
   * Evaluate a single flag
   */
  fastify.post<{
    Params: FlagParams
    Body: EvaluateBody
  }>('/v1/inhouse/projects/:projectId/flags/:key/evaluate', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, key } = request.params
    const { context, userId } = request.body ?? {}

    try {
      const service = getInhouseFlagsService(projectId)
      const evaluation = await service.evaluate(key, context)

      return reply.code(200).send({
        ok: true,
        data: evaluation,
      })
    } catch (error: unknown) {
      const err = error as Error
      fastify.log.error({ err, projectId, key }, 'Failed to evaluate flag')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  /**
   * POST /v1/inhouse/projects/:projectId/flags/evaluate-all
   *
   * Evaluate all flags for a user
   */
  fastify.post<{
    Params: ProjectParams
    Body: EvaluateBody
  }>('/v1/inhouse/projects/:projectId/flags/evaluate-all', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { context } = request.body ?? {}

    try {
      const service = getInhouseFlagsService(projectId)
      const result = await service.evaluateAll(context)

      return reply.code(200).send({
        ok: true,
        data: result,
      })
    } catch (error: unknown) {
      const err = error as Error
      fastify.log.error({ err, projectId }, 'Failed to evaluate all flags')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  // --------------------------------------------------------------------------
  // Management Endpoints (requires HMAC signature)
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/flags
   *
   * List all flags
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: ListFlagsQuery
  }>('/v1/inhouse/projects/:projectId/flags', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { limit, offset, enabled, userId } = request.query

    // Authorize if userId provided
    if (userId) {
      try {
        await assertProjectAccess(projectId, userId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    // Parse query params
    let parsedLimit = 50
    if (limit) {
      const parsed = parseInt(limit, 10)
      if (isNaN(parsed) || parsed < 1 || parsed > 100) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'limit must be 1-100' },
        })
      }
      parsedLimit = parsed
    }

    let parsedOffset = 0
    if (offset) {
      const parsed = parseInt(offset, 10)
      if (isNaN(parsed) || parsed < 0) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'offset must be >= 0' },
        })
      }
      parsedOffset = parsed
    }

    let parsedEnabled: boolean | undefined
    if (enabled === 'true') parsedEnabled = true
    else if (enabled === 'false') parsedEnabled = false

    try {
      const service = getInhouseFlagsService(projectId)
      const result = await service.list({
        limit: parsedLimit,
        offset: parsedOffset,
        enabled: parsedEnabled,
      })

      return reply.code(200).send({
        ok: true,
        data: {
          items: result.items,
          nextCursor: result.offset + result.limit < result.total
            ? String(result.offset + result.limit)
            : null,
          totalCount: result.total,
        },
      })
    } catch (error: unknown) {
      const err = error as Error
      fastify.log.error({ err, projectId }, 'Failed to list flags')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  /**
   * GET /v1/inhouse/projects/:projectId/flags/:key
   *
   * Get a single flag
   */
  fastify.get<{
    Params: FlagParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/flags/:key', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, key } = request.params
    const { userId } = request.query

    if (userId) {
      try {
        await assertProjectAccess(projectId, userId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    try {
      const service = getInhouseFlagsService(projectId)
      const flag = await service.get(key)

      if (!flag) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Flag not found: ${key}` },
        })
      }

      return reply.code(200).send({
        ok: true,
        data: flag,
      })
    } catch (error: unknown) {
      const err = error as Error
      fastify.log.error({ err, projectId, key }, 'Failed to get flag')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  /**
   * POST /v1/inhouse/projects/:projectId/flags
   *
   * Create a new flag
   */
  fastify.post<{
    Params: ProjectParams
    Body: CreateFlagBody
  }>('/v1/inhouse/projects/:projectId/flags', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId, ...input } = request.body ?? {}

    // Validate required fields
    if (!input.key || typeof input.key !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'key is required' },
      })
    }

    if (userId) {
      try {
        await assertProjectAccess(projectId, userId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    try {
      const service = getInhouseFlagsService(projectId)
      const flag = await service.create(input)

      // Log activity
      logActivity({
        projectId,
        service: 'flags',
        action: 'create',
        status: 'success',
        actorType: 'user',
        actorId: userId,
        resourceType: 'flag',
        resourceId: flag.id,
        metadata: { key: flag.key, enabled: flag.enabled },
      })

      return reply.code(201).send({
        ok: true,
        data: flag,
      })
    } catch (error: unknown) {
      const err = error as Error

      // Handle duplicate key
      if (err.message.includes('duplicate key') || err.message.includes('unique constraint')) {
        return reply.code(409).send({
          ok: false,
          error: { code: 'CONFLICT', message: `Flag already exists: ${input.key}` },
        })
      }

      // Handle validation errors
      if (err.message.includes('must contain only') || err.message.includes('must be')) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: err.message },
        })
      }

      fastify.log.error({ err, projectId }, 'Failed to create flag')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  /**
   * PUT /v1/inhouse/projects/:projectId/flags/:key
   *
   * Update a flag
   */
  fastify.put<{
    Params: FlagParams
    Body: UpdateFlagBody
  }>('/v1/inhouse/projects/:projectId/flags/:key', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, key } = request.params
    const { userId, ...input } = request.body ?? {}

    if (userId) {
      try {
        await assertProjectAccess(projectId, userId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    try {
      const service = getInhouseFlagsService(projectId)
      const flag = await service.update(key, input)

      if (!flag) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Flag not found: ${key}` },
        })
      }

      // Log activity
      logActivity({
        projectId,
        service: 'flags',
        action: 'update',
        status: 'success',
        actorType: 'user',
        actorId: userId,
        resourceType: 'flag',
        resourceId: flag.id,
        metadata: { key: flag.key, changes: Object.keys(input) },
      })

      return reply.code(200).send({
        ok: true,
        data: flag,
      })
    } catch (error: unknown) {
      const err = error as Error
      fastify.log.error({ err, projectId, key }, 'Failed to update flag')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  /**
   * DELETE /v1/inhouse/projects/:projectId/flags/:key
   *
   * Delete a flag
   */
  fastify.delete<{
    Params: FlagParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/flags/:key', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, key } = request.params
    const { userId } = request.query

    if (userId) {
      try {
        await assertProjectAccess(projectId, userId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    try {
      const service = getInhouseFlagsService(projectId)

      // Get flag first for logging
      const flag = await service.get(key)
      if (!flag) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Flag not found: ${key}` },
        })
      }

      const deleted = await service.delete(key)

      if (!deleted) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Flag not found: ${key}` },
        })
      }

      // Log activity
      logActivity({
        projectId,
        service: 'flags',
        action: 'delete',
        status: 'success',
        actorType: 'user',
        actorId: userId,
        resourceType: 'flag',
        resourceId: flag.id,
        metadata: { key },
      })

      return reply.code(204).send()
    } catch (error: unknown) {
      const err = error as Error
      fastify.log.error({ err, projectId, key }, 'Failed to delete flag')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  // --------------------------------------------------------------------------
  // Override Endpoints
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/projects/:projectId/flags/:key/overrides
   *
   * Create a per-user override
   */
  fastify.post<{
    Params: FlagParams
    Body: CreateOverrideBody
  }>('/v1/inhouse/projects/:projectId/flags/:key/overrides', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, key } = request.params
    const { actorId, ...input } = request.body ?? {}

    // Validate required fields
    if (!input.userId || typeof input.userId !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId is required' },
      })
    }

    if (typeof input.value !== 'boolean') {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'value (boolean) is required' },
      })
    }

    if (actorId) {
      try {
        await assertProjectAccess(projectId, actorId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    try {
      const service = getInhouseFlagsService(projectId)
      const override = await service.createOverride(key, input)

      // Log activity
      logActivity({
        projectId,
        service: 'flags',
        action: 'create_override',
        status: 'success',
        actorType: 'user',
        actorId,
        resourceType: 'flag_override',
        resourceId: override.id,
        metadata: { flagKey: key, targetUserId: input.userId, value: input.value },
      })

      return reply.code(201).send({
        ok: true,
        data: override,
      })
    } catch (error: unknown) {
      const err = error as Error

      if (err.message.includes('not found')) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: err.message },
        })
      }

      fastify.log.error({ err, projectId, key }, 'Failed to create override')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  /**
   * GET /v1/inhouse/projects/:projectId/flags/:key/overrides
   *
   * List overrides for a flag
   */
  fastify.get<{
    Params: FlagParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/flags/:key/overrides', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, key } = request.params
    const { userId } = request.query

    if (userId) {
      try {
        await assertProjectAccess(projectId, userId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    try {
      const service = getInhouseFlagsService(projectId)
      const overrides = await service.listOverrides(key)

      return reply.code(200).send({
        ok: true,
        data: overrides,
      })
    } catch (error: unknown) {
      const err = error as Error

      if (err.message.includes('not found')) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: err.message },
        })
      }

      fastify.log.error({ err, projectId, key }, 'Failed to list overrides')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })

  /**
   * DELETE /v1/inhouse/projects/:projectId/flags/:key/overrides/:userId
   *
   * Delete an override
   */
  fastify.delete<{
    Params: OverrideParams
    Querystring: { actorId?: string }
  }>('/v1/inhouse/projects/:projectId/flags/:key/overrides/:userId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, key, userId: targetUserId } = request.params
    const { actorId } = request.query

    if (actorId) {
      try {
        await assertProjectAccess(projectId, actorId)
      } catch {
        return reply.code(403).send({
          ok: false,
          error: { code: 'FORBIDDEN', message: 'Not authorized for this project' },
        })
      }
    }

    try {
      const service = getInhouseFlagsService(projectId)
      const deleted = await service.deleteOverride(key, targetUserId)

      if (!deleted) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: `Override not found for user: ${targetUserId}` },
        })
      }

      // Log activity
      logActivity({
        projectId,
        service: 'flags',
        action: 'delete_override',
        status: 'success',
        actorType: 'user',
        actorId,
        resourceType: 'flag_override',
        resourceId: `${key}:${targetUserId}`,
        metadata: { flagKey: key, targetUserId },
      })

      return reply.code(204).send()
    } catch (error: unknown) {
      const err = error as Error

      if (err.message.includes('not found')) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: err.message },
        })
      }

      fastify.log.error({ err, projectId, key }, 'Failed to delete override')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message },
      })
    }
  })
}
