/**
 * Inhouse Run Alerts Routes
 *
 * GET /v1/inhouse/projects/:projectId/run/alerts?days=7
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getRunAlertsService } from '../services/runAlertsService'

interface ProjectParams {
  projectId: string
}

interface AlertsQuery {
  days?: string
  userId?: string
}

export async function inhouseRunAlertsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  fastify.get<{
    Params: ProjectParams
    Querystring: AlertsQuery
  }>(
    '/v1/inhouse/projects/:projectId/run/alerts',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { userId } = request.query
      const days = request.query.days ? Math.max(1, Math.min(30, Number(request.query.days))) : 7

      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      try {
        const service = getRunAlertsService()
        const alerts = await service.listAlerts(projectId, days)
        return reply.code(200).send({ ok: true, data: alerts })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId }, 'Failed to fetch run alerts')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )
}
