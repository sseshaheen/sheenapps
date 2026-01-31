/**
 * Inhouse Business KPI Routes
 *
 * Routes:
 * GET /v1/inhouse/projects/:projectId/business-kpis/daily?date=YYYY-MM-DD
 * GET /v1/inhouse/projects/:projectId/business-kpis/range?start=YYYY-MM-DD&end=YYYY-MM-DD
 * GET /v1/inhouse/projects/:projectId/business-kpis/trend?days=7
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getBusinessKpiService } from '../services/businessKpiService'

interface ProjectParams {
  projectId: string
}

interface DailyQuery {
  date: string
  userId?: string
}

interface RangeQuery {
  start: string
  end: string
  userId?: string
}

interface TrendQuery {
  days?: string
  userId?: string
}

export async function inhouseBusinessKpisRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  fastify.get<{
    Params: ProjectParams
    Querystring: DailyQuery
  }>(
    '/v1/inhouse/projects/:projectId/business-kpis/daily',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { date, userId } = request.query

      if (!date) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'date is required (YYYY-MM-DD)' }
        })
      }

      // Validate date format (same validation as /range endpoint)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(date)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'date must be in YYYY-MM-DD format' }
        })
      }

      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      try {
        const service = getBusinessKpiService()
        const daily = await service.getDaily(projectId, date)

        return reply.code(200).send({
          ok: true,
          data: daily
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, date }, 'Failed to fetch business KPI daily')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  /**
   * GET /v1/inhouse/projects/:projectId/business-kpis/range
   * Get aggregated KPIs for a date range (Run Hub Phase 2 - Extended Date Ranges)
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: RangeQuery
  }>(
    '/v1/inhouse/projects/:projectId/business-kpis/range',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { start, end, userId } = request.query

      if (!start || !end) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'start and end dates are required (YYYY-MM-DD)' }
        })
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(start) || !dateRegex.test(end)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Dates must be in YYYY-MM-DD format' }
        })
      }

      // Validate range (max 90 days)
      const startDate = new Date(start)
      const endDate = new Date(end)
      const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      if (daysDiff < 0 || daysDiff > 90) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'Date range must be 0-90 days' }
        })
      }

      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      try {
        const service = getBusinessKpiService()
        const rangeData = await service.getRange(projectId, start, end)

        return reply.code(200).send({
          ok: true,
          data: rangeData
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, start, end }, 'Failed to fetch business KPI range')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )

  /**
   * GET /v1/inhouse/projects/:projectId/business-kpis/trend
   * Get daily KPIs for sparkline charts (Run Hub Phase 3 - Chart Visualizations)
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: TrendQuery
  }>(
    '/v1/inhouse/projects/:projectId/business-kpis/trend',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { days: daysStr, userId } = request.query

      // Default to 7 days, max 30
      const days = Math.min(Math.max(parseInt(daysStr || '7', 10) || 7, 1), 30)

      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      try {
        const service = getBusinessKpiService()
        const trendData = await service.getTrend(projectId, days)

        // Transform to arrays for sparkline consumption
        const trends = {
          dates: trendData.map(d => d.date),
          revenue: trendData.map(d => d.revenueCents),
          leads: trendData.map(d => d.leads),
          signups: trendData.map(d => d.signups),
          payments: trendData.map(d => d.payments),
          sessions: trendData.map(d => d.sessions),
        }

        return reply.code(200).send({
          ok: true,
          data: trends
        })
      } catch (error: unknown) {
        const err = error as Error
        fastify.log.error({ err, projectId, days }, 'Failed to fetch business KPI trend')
        return reply.code(500).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: err.message }
        })
      }
    }
  )
}
