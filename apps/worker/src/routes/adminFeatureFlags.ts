/**
 * Admin Feature Flags Routes
 *
 * Endpoints for managing feature flags - kill switches and targeted releases.
 * All changes require a reason and are audited.
 */

import { FastifyInstance } from 'fastify'
import {
  FeatureFlagService,
  FeatureFlag,
  FeatureFlagAudit,
  CreateFlagInput,
  UpdateFlagInput,
} from '../services/admin/FeatureFlagService'
import { requireAdminAuth, requireReadOnlyAccess, AdminRequest } from '../middleware/adminAuthentication'
import { makeAdminCtx } from '../lib/supabase'

// Structured error format for admin routes
type AdminError = { code: string; message: string }

export default async function adminFeatureFlagsRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireAdminAuth()
  const readOnlyMiddleware = requireReadOnlyAccess()

  // GET /v1/admin/feature-flags - List all flags
  fastify.get<{
    Reply: { success: boolean; data?: FeatureFlag[]; error?: AdminError }
  }>('/v1/admin/feature-flags', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      const flags = await service.listFlags()

      return reply.send({
        success: true,
        data: flags,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list feature flags')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to list feature flags' },
      })
    }
  })

  // GET /v1/admin/feature-flags/:id - Get single flag
  fastify.get<{
    Params: { id: string }
    Reply: { success: boolean; data?: FeatureFlag | null; error?: AdminError }
  }>('/v1/admin/feature-flags/:id', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { id } = request.params

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      const flag = await service.getFlagById(id)

      if (!flag) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
        })
      }

      return reply.send({
        success: true,
        data: flag,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get feature flag')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get feature flag' },
      })
    }
  })

  // POST /v1/admin/feature-flags - Create flag
  fastify.post<{
    Body: CreateFlagInput & { reason: string }
    Reply: { success: boolean; data?: FeatureFlag; error?: AdminError }
  }>('/v1/admin/feature-flags', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { name, description, status, targetUserIds, targetPlans, isKillSwitch, reason } = request.body

      if (!name || !reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Name and reason are required' },
        })
      }

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      const flag = await service.createFlag(
        {
          name,
          description,
          status,
          targetUserIds,
          targetPlans,
          isKillSwitch,
        },
        adminRequest.adminClaims.sub,
        adminRequest.adminClaims.email,
        reason
      )

      return reply.status(201).send({
        success: true,
        data: flag,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to create feature flag')

      // Handle unique constraint violation
      if (error instanceof Error && error.message.includes('duplicate')) {
        return reply.status(409).send({
          success: false,
          error: { code: 'CONFLICT', message: 'A flag with this name already exists' },
        })
      }

      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to create feature flag' },
      })
    }
  })

  // PUT /v1/admin/feature-flags/:id - Update flag
  fastify.put<{
    Params: { id: string }
    Body: UpdateFlagInput & { reason: string }
    Reply: { success: boolean; data?: FeatureFlag; error?: AdminError }
  }>('/v1/admin/feature-flags/:id', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { id } = request.params
      const { description, status, targetUserIds, targetPlans, isKillSwitch, reason } = request.body

      if (!reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Reason is required' },
        })
      }

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      const flag = await service.updateFlag(
        id,
        {
          description,
          status,
          targetUserIds,
          targetPlans,
          isKillSwitch,
        },
        adminRequest.adminClaims.sub,
        adminRequest.adminClaims.email,
        reason
      )

      return reply.send({
        success: true,
        data: flag,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to update feature flag')

      if (error instanceof Error && error.message.includes('PGRST116')) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
        })
      }

      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to update feature flag' },
      })
    }
  })

  // POST /v1/admin/feature-flags/:id/toggle - Quick toggle (on/off)
  fastify.post<{
    Params: { id: string }
    Body: { reason: string }
    Reply: { success: boolean; data?: FeatureFlag; error?: AdminError }
  }>('/v1/admin/feature-flags/:id/toggle', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { id } = request.params
      const { reason } = request.body

      if (!reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Reason is required' },
        })
      }

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      const flag = await service.toggleFlag(id, adminRequest.adminClaims.sub, adminRequest.adminClaims.email, reason)

      return reply.send({
        success: true,
        data: flag,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to toggle feature flag')

      if (error instanceof Error && error.message.includes('PGRST116')) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
        })
      }

      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to toggle feature flag' },
      })
    }
  })

  // DELETE /v1/admin/feature-flags/:id - Delete flag
  fastify.delete<{
    Params: { id: string }
    Body: { reason: string }
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/feature-flags/:id', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { id } = request.params
      const { reason } = request.body

      if (!reason) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Reason is required' },
        })
      }

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      await service.deleteFlag(id, adminRequest.adminClaims.sub, adminRequest.adminClaims.email, reason)

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to delete feature flag')

      if (error instanceof Error && error.message.includes('PGRST116')) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
        })
      }

      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to delete feature flag' },
      })
    }
  })

  // GET /v1/admin/feature-flags/:id/audit - Get audit log for a flag
  fastify.get<{
    Params: { id: string }
    Querystring: { limit?: string }
    Reply: { success: boolean; data?: FeatureFlagAudit[]; error?: AdminError }
  }>('/v1/admin/feature-flags/:id/audit', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { id } = request.params
      const { limit = '50' } = request.query

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      const auditLog = await service.getAuditLog(id, parseInt(limit))

      return reply.send({
        success: true,
        data: auditLog,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get feature flag audit log')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get audit log' },
      })
    }
  })

  // GET /v1/admin/feature-flags/audit/recent - Get recent audit logs (all flags)
  fastify.get<{
    Querystring: { limit?: string }
    Reply: { success: boolean; data?: FeatureFlagAudit[]; error?: AdminError }
  }>('/v1/admin/feature-flags/audit/recent', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { limit = '100' } = request.query

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      const auditLog = await service.getRecentAuditLogs(parseInt(limit))

      return reply.send({
        success: true,
        data: auditLog,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get recent audit logs')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get recent audit logs' },
      })
    }
  })

  // POST /v1/admin/feature-flags/cache/clear - Clear cache (for debugging/emergencies)
  fastify.post<{
    Body: { flagName?: string }
    Reply: { success: boolean; message?: string; error?: AdminError }
  }>('/v1/admin/feature-flags/cache/clear', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const { flagName } = request.body

      const supabase = makeAdminCtx()
      const service = new FeatureFlagService(supabase)

      if (flagName) {
        service.invalidateCache(flagName)
        request.log.info({ flagName }, 'Feature flag cache invalidated')
        return reply.send({
          success: true,
          message: `Cache cleared for flag: ${flagName}`,
        })
      } else {
        service.clearCache()
        request.log.info('All feature flag cache cleared')
        return reply.send({
          success: true,
          message: 'All feature flag cache cleared',
        })
      }
    } catch (error) {
      request.log.error({ error }, 'Failed to clear cache')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to clear cache' },
      })
    }
  })
}
