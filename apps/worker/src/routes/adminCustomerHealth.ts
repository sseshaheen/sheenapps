/**
 * Admin Customer Health Routes
 *
 * Endpoints for customer health score management and monitoring.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { CustomerHealthService, HealthScoreBreakdown, AtRiskCustomer } from '../services/admin/CustomerHealthService'
import {
  getHealthScoreWorkerStatus,
  forceHealthScoreRun,
  resetHealthScoreWorkerErrors,
  calculateUserHealthScore,
} from '../workers/healthScoreWorker'
import { requireAdminAuth, requireReadOnlyAccess, AdminRequest } from '../middleware/adminAuthentication'
import { makeAdminCtx } from '../lib/supabase'

// Structured error format for admin routes
type AdminError = { code: string; message: string }

/**
 * Sanitize a value for CSV export to prevent formula injection.
 * Cells starting with =, +, -, @ can be interpreted as formulas by Excel.
 * Also strips newlines/carriage returns to prevent CSV row breaking.
 */
function sanitizeCsvValue(value: unknown): string {
  let str = String(value ?? '')
  // Strip newlines and carriage returns to prevent CSV row breaking
  str = str.replace(/[\r\n]+/g, ' ')
  // Prefix potentially dangerous characters with a single quote
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`
  }
  return str
}

/**
 * Safely parse an integer with fallback to default, capped to max value.
 */
function safeParseInt(value: string | undefined, defaultVal: number, max: number = 100): number {
  const parsed = parseInt(value || '', 10)
  if (Number.isNaN(parsed) || parsed < 0) return defaultVal
  return Math.min(parsed, max)
}

export default async function adminCustomerHealthRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireAdminAuth()
  const readOnlyMiddleware = requireReadOnlyAccess()

  // GET /v1/admin/customer-health/summary - Get health score summary
  fastify.get<{
    Reply: { success: boolean; data?: any; error?: AdminError }
  }>('/v1/admin/customer-health/summary', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      const summary = await healthService.getHealthSummary()

      return reply.send({
        success: true,
        data: summary,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get health summary')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get health summary' },
      })
    }
  })

  // GET /v1/admin/customer-health/at-risk - Get at-risk customers list
  fastify.get<{
    Querystring: {
      limit?: string
      offset?: string
      plan?: string
      renewalDays?: string
      tag?: string
    }
    Reply: { success: boolean; data?: { customers: AtRiskCustomer[]; total: number }; error?: AdminError }
  }>('/v1/admin/customer-health/at-risk', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { limit, offset, plan, renewalDays, tag } = request.query

      // Safely parse pagination parameters with bounds
      const safeLimit = safeParseInt(limit, 50, 100)
      const safeOffset = safeParseInt(offset, 0, 10000)
      const safeRenewalDays = renewalDays ? safeParseInt(renewalDays, 30, 365) : undefined

      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      const result = await healthService.getAtRiskCustomers(safeLimit, safeOffset, {
        plan,
        renewalDays: safeRenewalDays,
        tag,
      })

      return reply.send({
        success: true,
        data: result,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get at-risk customers')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get at-risk customers' },
      })
    }
  })

  // GET /v1/admin/customer-health/changes - Get score changes
  fastify.get<{
    Querystring: {
      direction?: 'dropped' | 'recovered'
      threshold?: string
      limit?: string
    }
    Reply: { success: boolean; data?: any[]; error?: AdminError }
  }>('/v1/admin/customer-health/changes', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { direction, threshold, limit } = request.query

      // Validate direction enum at runtime
      const safeDirection = direction === 'recovered' ? 'recovered' : 'dropped'
      const safeThreshold = safeParseInt(threshold, 20, 100)
      const safeLimit = safeParseInt(limit, 20, 100)

      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      const changes = await healthService.getScoreChanges(safeDirection, safeThreshold, safeLimit)

      return reply.send({
        success: true,
        data: changes,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get score changes')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get score changes' },
      })
    }
  })

  // GET /v1/admin/customer-health/user/:userId - Get health score for specific user
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: HealthScoreBreakdown; error?: AdminError }
  }>('/v1/admin/customer-health/user/:userId', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { userId } = request.params

      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      const breakdown = await healthService.calculateHealthScore(userId)

      if (!breakdown) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'User not found' },
        })
      }

      return reply.send({
        success: true,
        data: breakdown,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get user health score')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get user health score' },
      })
    }
  })

  // POST /v1/admin/customer-health/user/:userId/recalculate - Recalculate health score for user
  fastify.post<{
    Params: { userId: string }
    Reply: { success: boolean; data?: HealthScoreBreakdown; error?: AdminError }
  }>(
    '/v1/admin/customer-health/user/:userId/recalculate',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      try {
        const { userId } = request.params

        await calculateUserHealthScore(userId)

        const supabase = makeAdminCtx()
        const healthService = new CustomerHealthService(supabase)
        const breakdown = await healthService.calculateHealthScore(userId)

        return reply.send({
          success: true,
          ...(breakdown && { data: breakdown }),
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to recalculate user health score')
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to recalculate health score' },
        })
      }
    }
  )

  // GET /v1/admin/customer-health/user/:userId/notes - Get admin notes
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: any[]; error?: AdminError }
  }>('/v1/admin/customer-health/user/:userId/notes', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { userId } = request.params

      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      const notes = await healthService.getAdminNotes(userId)

      return reply.send({
        success: true,
        data: notes,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get admin notes')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get admin notes' },
      })
    }
  })

  // POST /v1/admin/customer-health/user/:userId/notes - Add admin note
  fastify.post<{
    Params: { userId: string }
    Body: { note: string }
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/customer-health/user/:userId/notes', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { userId } = request.params
      const { note } = request.body

      if (!note?.trim()) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Note is required' },
        })
      }

      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      await healthService.addAdminNote(userId, note, adminRequest.adminClaims.sub)

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to add admin note')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to add admin note' },
      })
    }
  })

  // GET /v1/admin/customer-health/user/:userId/tags - Get user tags
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: string[]; error?: AdminError }
  }>('/v1/admin/customer-health/user/:userId/tags', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { userId } = request.params

      const supabase = makeAdminCtx()
      const { data, error } = await supabase.from('user_admin_tags').select('tag').eq('user_id', userId)

      if (error) throw error

      return reply.send({
        success: true,
        data: data?.map((t: { tag: string }) => t.tag) || [],
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get user tags')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get user tags' },
      })
    }
  })

  // POST /v1/admin/customer-health/user/:userId/tags - Add tag
  fastify.post<{
    Params: { userId: string }
    Body: { tag: string }
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/customer-health/user/:userId/tags', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { userId } = request.params
      const { tag } = request.body

      if (!tag?.trim()) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Tag is required' },
        })
      }

      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      await healthService.addTag(userId, tag.trim(), adminRequest.adminClaims.sub)

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to add tag')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to add tag' },
      })
    }
  })

  // DELETE /v1/admin/customer-health/user/:userId/tags/:tag - Remove tag
  fastify.delete<{
    Params: { userId: string; tag: string }
    Reply: { success: boolean; error?: AdminError }
  }>(
    '/v1/admin/customer-health/user/:userId/tags/:tag',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      try {
        const { userId, tag } = request.params

        const supabase = makeAdminCtx()
        const healthService = new CustomerHealthService(supabase)

        await healthService.removeTag(userId, tag)

        return reply.send({ success: true })
      } catch (error) {
        request.log.error({ error }, 'Failed to remove tag')
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to remove tag' },
        })
      }
    }
  )

  // GET /v1/admin/customer-health/user/:userId/contacts - Get contact log
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: any[]; error?: AdminError }
  }>(
    '/v1/admin/customer-health/user/:userId/contacts',
    { preHandler: readOnlyMiddleware as any },
    async (request, reply) => {
      try {
        const { userId } = request.params

        const supabase = makeAdminCtx()
        const healthService = new CustomerHealthService(supabase)

        const contacts = await healthService.getContactLog(userId)

        return reply.send({
          success: true,
          data: contacts,
        })
      } catch (error) {
        request.log.error({ error }, 'Failed to get contact log')
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get contact log' },
        })
      }
    }
  )

  // POST /v1/admin/customer-health/user/:userId/contacts - Log contact
  fastify.post<{
    Params: { userId: string }
    Body: {
      contactType: 'email' | 'call' | 'meeting' | 'chat' | 'other'
      summary: string
    }
    Reply: { success: boolean; error?: AdminError }
  }>(
    '/v1/admin/customer-health/user/:userId/contacts',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      try {
        const adminRequest = request as AdminRequest
        const { userId } = request.params
        const { contactType, summary } = request.body

        if (!contactType || !summary?.trim()) {
          return reply.status(400).send({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Contact type and summary are required' },
          })
        }

        const supabase = makeAdminCtx()
        const healthService = new CustomerHealthService(supabase)

        await healthService.logContact(userId, contactType, summary, adminRequest.adminClaims.sub)

        return reply.send({ success: true })
      } catch (error) {
        request.log.error({ error }, 'Failed to log contact')
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to log contact' },
        })
      }
    }
  )

  // GET /v1/admin/customer-health/worker/status - Get worker status
  fastify.get<{
    Reply: { success: boolean; data?: any; error?: AdminError }
  }>(
    '/v1/admin/customer-health/worker/status',
    { preHandler: readOnlyMiddleware as any },
    async (request, reply) => {
      try {
        const status = getHealthScoreWorkerStatus()
        return reply.send({
          success: true,
          data: status,
        })
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get worker status' },
        })
      }
    }
  )

  // POST /v1/admin/customer-health/worker/force-run - Force worker run
  fastify.post<{
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/customer-health/worker/force-run', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      // Don't await - let it run in background
      forceHealthScoreRun().catch((error) => {
        request.log.error({ error }, 'Force health score run failed')
      })

      return reply.send({
        success: true,
      })
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to trigger worker run' },
      })
    }
  })

  // POST /v1/admin/customer-health/worker/reset-errors - Reset error counter
  fastify.post<{
    Reply: { success: boolean; error?: AdminError }
  }>(
    '/v1/admin/customer-health/worker/reset-errors',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      try {
        resetHealthScoreWorkerErrors()
        return reply.send({ success: true })
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to reset errors' },
        })
      }
    }
  )

  // GET /v1/admin/customer-health/dashboard - Aggregated dashboard data
  // Consolidates summary + at-risk + dropped + recovered + worker status into one call
  fastify.get<{
    Reply: { success: boolean; data?: any; error?: AdminError; meta?: { partial: boolean; failures: string[] } }
  }>('/v1/admin/customer-health/dashboard', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      const [summary, atRisk, dropped, recovered, workerStatus] = await Promise.allSettled([
        healthService.getHealthSummary(),
        healthService.getAtRiskCustomers(50, 0, {}),
        healthService.getScoreChanges('dropped', 20, 20),
        healthService.getScoreChanges('recovered', 20, 20),
        Promise.resolve(getHealthScoreWorkerStatus()),
      ])

      const failures: string[] = []
      if (summary.status === 'rejected') failures.push('summary')
      if (atRisk.status === 'rejected') failures.push('atRisk')
      if (dropped.status === 'rejected') failures.push('dropped')
      if (recovered.status === 'rejected') failures.push('recovered')
      if (workerStatus.status === 'rejected') failures.push('workerStatus')

      return reply.send({
        success: true,
        data: {
          summary: summary.status === 'fulfilled' ? summary.value : null,
          atRisk: atRisk.status === 'fulfilled' ? atRisk.value.customers : [],
          changes: {
            dropped: dropped.status === 'fulfilled' ? dropped.value : [],
            recovered: recovered.status === 'fulfilled' ? recovered.value : [],
          },
          workerStatus: workerStatus.status === 'fulfilled' ? workerStatus.value : null,
        },
        meta: failures.length > 0 ? { partial: true, failures } : undefined,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get customer health dashboard')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get dashboard data' },
      })
    }
  })

  // GET /v1/admin/customer-health/export - Export health data as CSV
  fastify.get<{
    Querystring: {
      status?: string
      format?: 'csv' | 'json'
    }
    Reply: any
  }>('/v1/admin/customer-health/export', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { status, format = 'json' } = request.query

      const supabase = makeAdminCtx()

      let query = supabase
        .from('user_health_scores')
        .select('user_id, score, status, trend, score_reasons, calculated_at')

      if (status) {
        query = query.eq('status', status)
      }

      const { data, error } = await query.order('score', { ascending: true })

      if (error) throw error

      // Batch fetch emails to avoid N+1 queries
      const userIds = (data || []).map((row: { user_id: string }) => row.user_id)
      const { data: customers } = userIds.length > 0
        ? await supabase
            .from('billing_customers')
            .select('user_id, email')
            .in('user_id', userIds)
        : { data: [] }

      // Create lookup map
      const emailMap = new Map<string, string>()
      for (const customer of customers || []) {
        emailMap.set(customer.user_id, customer.email)
      }

      // Enrich with email from map
      const enriched = (data || []).map((row: { user_id: string; score: number; status: string; trend: string; score_reasons: string[]; calculated_at: string }) => ({
        user_id: row.user_id,
        email: emailMap.get(row.user_id) || 'unknown',
        score: row.score,
        status: row.status,
        trend: row.trend,
        top_reason: row.score_reasons?.[0] || '',
        calculated_at: row.calculated_at,
      }))

      if (format === 'csv') {
        const headers = ['user_id', 'email', 'score', 'status', 'trend', 'top_reason', 'calculated_at'] as const
        const rows = enriched.map((row: Record<string, string | number>) =>
          headers.map((h: string) => {
            const value = sanitizeCsvValue(row[h as keyof typeof row])
            return `"${value.replace(/"/g, '""')}"`
          }).join(',')
        )
        const csv = [headers.join(','), ...rows].join('\n')

        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename="customer-health-${new Date().toISOString().split('T')[0]}.csv"`)
          .send(csv)
      }

      return reply.send({
        success: true,
        data: enriched,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to export health data')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to export health data' },
      })
    }
  })
}
