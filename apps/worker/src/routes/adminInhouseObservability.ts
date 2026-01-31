/**
 * Admin In-House Observability Routes
 *
 * Generates deep links to external observability tools with pre-filled context.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { getObservabilityLinksService } from '../services/admin/ObservabilityLinksService'

// =============================================================================
// TYPES
// =============================================================================

interface LinksQuery {
  projectId?: string
  correlationId?: string
  service?: string
  timeRange?: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseObservabilityRoutes(fastify: FastifyInstance) {
  const linksService = getObservabilityLinksService()

  // Middleware for read-only operations
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/observability/links
  // Get all observability links for a given context
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: LinksQuery }>(
    '/v1/admin/inhouse/observability/links',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const { projectId, correlationId, service, timeRange } = request.query

      try {
        const links = await linksService.getAllLinks({
          projectId,
          correlationId,
          service,
          timeRange,
        })

        const hasTools = await linksService.hasAnyToolsConfigured()

        return reply.send({
          success: true,
          links,
          configured: hasTools,
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
  // GET /v1/admin/inhouse/observability/status
  // Check which observability tools are configured
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/admin/inhouse/observability/status',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      try {
        const hasTools = await linksService.hasAnyToolsConfigured()

        return reply.send({
          success: true,
          configured: hasTools,
          tools: {
            posthog: !!process.env.POSTHOG_HOST,
            grafana: !!process.env.GRAFANA_HOST,
            logs: !!process.env.LOG_VIEWER_HOST,
          },
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
}
