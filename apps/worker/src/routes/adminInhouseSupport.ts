/**
 * Admin In-House Support Routes
 *
 * Impersonation and Request Replay features for admin support.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { getImpersonationService, IMPERSONATION_ALLOWED_ROUTES } from '../services/admin/ImpersonationService'
import { getRequestReplayService, ROUTE_REPLAY_CONFIG } from '../services/admin/RequestReplayService'
import { auditAdminAction } from './admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

interface StartImpersonationBody {
  projectId: string
  reason: string
}

interface ConfirmImpersonationBody {
  confirmationToken: string
  typedConfirmation: string
}

interface ProxyParams {
  '*': string
}

// Request Replay Types
interface SearchRequestsQuery {
  projectId?: string
  correlationId?: string
  service?: string
  status?: 'success' | 'error'
  replayableOnly?: string
  startTime?: string
  endTime?: string
  limit?: string
  offset?: string
}

interface ReplayPreviewBody {
  modifications?: Record<string, unknown>
}

interface ReplayExecuteBody {
  modifications?: Record<string, unknown>
  reason: string
  previewToken?: string
  confirmSideEffects?: boolean
}

interface CorrelationIdParams {
  correlationId: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseSupportRoutes(fastify: FastifyInstance) {
  const impersonationService = getImpersonationService()

  // Middleware for support operations (elevated permission)
  const supportMiddleware = requireAdminAuth({
    permissions: ['inhouse.support'],
    requireReason: true,
  })

  // Middleware for read operations
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // =========================================================================
  // IMPERSONATION ENDPOINTS
  // =========================================================================

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/support/impersonate/start
  // Step 1: Initiate impersonation (creates pending session)
  // -------------------------------------------------------------------------
  fastify.post<{ Body: StartImpersonationBody }>(
    '/v1/admin/inhouse/support/impersonate/start',
    { preHandler: supportMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const adminId = adminRequest.adminClaims.sub
      const { projectId, reason } = request.body

      if (!projectId || !reason) {
        return reply.code(400).send({
          success: false,
          error: 'projectId and reason are required',
        })
      }

      if (reason.length < 10) {
        return reply.code(400).send({
          success: false,
          error: 'Reason must be at least 10 characters',
        })
      }

      try {
        const result = await impersonationService.startImpersonation(
          adminId,
          projectId,
          reason,
          request.ip || '',
          request.headers['user-agent'] || ''
        )

        return reply.send({
          success: true,
          ...result,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/support/impersonate/confirm
  // Step 2: Confirm with typed confirmation
  // -------------------------------------------------------------------------
  fastify.post<{ Body: ConfirmImpersonationBody }>(
    '/v1/admin/inhouse/support/impersonate/confirm',
    { preHandler: supportMiddleware as never },
    async (request, reply) => {
      const { confirmationToken, typedConfirmation } = request.body

      if (!confirmationToken || !typedConfirmation) {
        return reply.code(400).send({
          success: false,
          error: 'confirmationToken and typedConfirmation are required',
        })
      }

      try {
        const result = await impersonationService.confirmImpersonation(
          confirmationToken,
          typedConfirmation,
          request.ip || '',
          request.headers['user-agent'] || ''
        )

        return reply.send({
          success: true,
          ...result,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/support/impersonate/session
  // Check active session status
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/admin/inhouse/support/impersonate/session',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const adminId = adminRequest.adminClaims.sub

      try {
        const session = await impersonationService.getActiveSession(adminId)
        return reply.send({
          success: true,
          ...session,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(500).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/support/impersonate/end
  // End impersonation session early
  // -------------------------------------------------------------------------
  fastify.post(
    '/v1/admin/inhouse/support/impersonate/end',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const adminId = adminRequest.adminClaims.sub

      try {
        await impersonationService.endSession(
          adminId,
          request.ip || '',
          request.headers['user-agent'] || ''
        )

        return reply.send({
          success: true,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(500).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // ALL /v1/admin/inhouse/support/impersonate/proxy/*
  // Proxy endpoint for impersonated requests
  // Uses readMiddleware (not supportMiddleware) since reason was already
  // provided at impersonation start - no need to require it on every GET.
  // Defense in depth: requires both admin auth AND valid impersonation token.
  // -------------------------------------------------------------------------
  fastify.all<{ Params: ProxyParams }>(
    '/v1/admin/inhouse/support/impersonate/proxy/*',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      // Get session token from header
      const sessionToken = request.headers['x-impersonation-token'] as string

      if (!sessionToken) {
        return reply.code(401).send({
          success: false,
          error: 'X-Impersonation-Token header required',
        })
      }

      // Validate session
      const session = await impersonationService.validateSession(
        sessionToken,
        request.ip || '',
        request.headers['user-agent'] || ''
      )

      if (!session) {
        return reply.code(401).send({
          success: false,
          error: 'Invalid or expired impersonation session',
        })
      }

      // Get the proxied path with security normalization
      const rawPath = request.params['*']

      // Path traversal protection
      // Reject ANY percent-encoding - internal APIs don't need it, and it's a common attack vector
      if (/%[0-9a-fA-F]{2}/.test(rawPath)) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid path: encoded characters not allowed',
        })
      }

      // 2. Normalize and validate path segments
      const normalizedPath = ('/' + rawPath)
        .replace(/\/+/g, '/') // Collapse duplicate slashes
        .replace(/\/$/, '')   // Remove trailing slash

      // 3. Check for traversal in path segments
      const segments = normalizedPath.split('/')
      for (const segment of segments) {
        if (segment === '..' || segment === '.') {
          return reply.code(400).send({
            success: false,
            error: 'Invalid path: directory traversal not allowed',
          })
        }
      }

      const proxyPath = normalizedPath || '/'
      const method = request.method

      // Check if route is allowed - use server-side constant, not DB value
      // DB allowedRoutes is informational only (for UI display), not authoritative
      if (!impersonationService.isRouteAllowed(method, proxyPath, IMPERSONATION_ALLOWED_ROUTES)) {
        return reply.code(403).send({
          success: false,
          error: 'This route is not accessible during impersonation',
        })
      }

      // Only GET is truly allowed (defense in depth)
      if (method !== 'GET') {
        return reply.code(403).send({
          success: false,
          error: 'Only GET requests are allowed during impersonation',
        })
      }

      try {
        // Build the internal URL to forward to
        // Replace :projectId placeholder with actual project ID
        const internalPath = proxyPath.replace(/:projectId/g, session.projectId)

        // Forward the request internally
        // Note: In production, this would call the internal service
        // For now, we'll return a placeholder response
        // The actual implementation would depend on your internal routing

        // Log the proxied request
        await impersonationService.logProxiedRequest(
          session.id,
          session.adminId,
          session.projectId,
          method,
          proxyPath,
          200,
          request.ip || ''
        )

        // TODO: Implement actual request forwarding
        // For now, return indication that this needs to be implemented
        return reply.send({
          success: true,
          message: 'Proxy route validated. Actual forwarding needs service-specific implementation.',
          session: {
            projectId: session.projectId,
            projectName: session.projectName,
            remainingSeconds: Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000),
          },
          request: {
            method,
            path: proxyPath,
            internalPath,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Proxy error'
        return reply.code(500).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // =========================================================================
  // IMPERSONATION ALLOWED ROUTES (for reference)
  // =========================================================================

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/support/impersonate/allowed-routes
  // Get list of routes allowed during impersonation
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/admin/inhouse/support/impersonate/allowed-routes',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const { IMPERSONATION_ALLOWED_ROUTES } = await import('../services/admin/ImpersonationService')

      return reply.send({
        success: true,
        routes: IMPERSONATION_ALLOWED_ROUTES,
      })
    }
  )

  // =========================================================================
  // REQUEST REPLAY ENDPOINTS
  // =========================================================================

  const replayService = getRequestReplayService()

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/support/replay/requests
  // Search for replayable requests
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: SearchRequestsQuery }>(
    '/v1/admin/inhouse/support/replay/requests',
    { preHandler: supportMiddleware as never },
    async (request, reply) => {
      const {
        projectId,
        correlationId,
        service,
        status,
        replayableOnly,
        startTime,
        endTime,
        limit,
        offset
      } = request.query

      // Validate and clamp pagination params
      const parsedLimit = limit ? Math.min(Math.max(1, parseInt(limit, 10) || 50), 200) : 50
      const parsedOffset = offset ? Math.max(0, parseInt(offset, 10) || 0) : 0

      // Validate date params
      const parsedStartTime = startTime ? new Date(startTime) : undefined
      const parsedEndTime = endTime ? new Date(endTime) : undefined

      if (parsedStartTime && isNaN(parsedStartTime.getTime())) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid startTime format',
        })
      }
      if (parsedEndTime && isNaN(parsedEndTime.getTime())) {
        return reply.code(400).send({
          success: false,
          error: 'Invalid endTime format',
        })
      }

      try {
        const result = await replayService.searchRequests({
          projectId,
          correlationId,
          service,
          status: status as 'success' | 'error' | undefined,
          replayableOnly: replayableOnly !== 'false',
          startTime: parsedStartTime,
          endTime: parsedEndTime,
          limit: parsedLimit,
          offset: parsedOffset,
        })

        return reply.send({
          success: true,
          ...result,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(500).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/support/replay/requests/:correlationId
  // Get request details by correlation ID
  // -------------------------------------------------------------------------
  fastify.get<{ Params: CorrelationIdParams }>(
    '/v1/admin/inhouse/support/replay/requests/:correlationId',
    { preHandler: supportMiddleware as never },
    async (request, reply) => {
      const { correlationId } = request.params

      try {
        const requestRecord = await replayService.getRequest(correlationId)

        if (!requestRecord) {
          return reply.code(404).send({
            success: false,
            error: 'Request not found',
          })
        }

        // Build warnings based on request properties
        const warnings: string[] = []
        if (requestRecord.sideEffects === 'high') {
          warnings.push('This request has HIGH side effects and may create or modify data')
        } else if (requestRecord.sideEffects === 'low') {
          warnings.push('This request has side effects and may create background jobs')
        }
        if (!requestRecord.replayable) {
          warnings.push('This request is not replayable (auth-sensitive or payment-sensitive)')
        }

        return reply.send({
          success: true,
          request: requestRecord,
          replayable: requestRecord.replayable,
          sideEffects: requestRecord.sideEffects,
          warnings,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(500).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/support/replay/requests/:correlationId/preview
  // Preview a replay (required for side-effect replays)
  // -------------------------------------------------------------------------
  fastify.post<{ Params: CorrelationIdParams; Body: ReplayPreviewBody }>(
    '/v1/admin/inhouse/support/replay/requests/:correlationId/preview',
    { preHandler: supportMiddleware as never },
    async (request, reply) => {
      const { correlationId } = request.params
      const { modifications } = request.body || {}

      try {
        const preview = await replayService.previewReplay(correlationId, modifications)

        return reply.send({
          success: true,
          ...preview,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/support/replay/requests/:correlationId/replay
  // Execute a replay
  // -------------------------------------------------------------------------
  fastify.post<{ Params: CorrelationIdParams; Body: ReplayExecuteBody }>(
    '/v1/admin/inhouse/support/replay/requests/:correlationId/replay',
    { preHandler: supportMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const adminId = adminRequest.adminClaims.sub
      const { correlationId } = request.params
      const { modifications, reason, previewToken, confirmSideEffects } = request.body

      if (!reason || reason.length < 10) {
        return reply.code(400).send({
          success: false,
          error: 'Reason must be at least 10 characters',
        })
      }

      try {
        const result = await replayService.executeReplay(
          correlationId,
          adminId,
          {
            modifications,
            reason,
            previewToken,
            confirmSideEffects,
            clientIp: request.ip || '',
            userAgent: request.headers['user-agent'] || '',
          }
        )

        return reply.send(result)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/support/replay/routes
  // Get route replayability configuration
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/admin/inhouse/support/replay/routes',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      return reply.send({
        success: true,
        routes: ROUTE_REPLAY_CONFIG,
      })
    }
  )
}
