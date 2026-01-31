/**
 * Admin Customer 360 Routes
 *
 * Endpoints for comprehensive customer view - single page with all customer context.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { Customer360Service, Customer360Data } from '../services/admin/Customer360Service'
import { CustomerHealthService } from '../services/admin/CustomerHealthService'
import { requireAdminAuth, requireReadOnlyAccess, AdminRequest } from '../middleware/adminAuthentication'
import { makeAdminCtx } from '../lib/supabase'

// Structured error format for admin routes
type AdminError = { code: string; message: string }

export default async function adminCustomer360Routes(fastify: FastifyInstance) {
  const hmacMiddleware = requireAdminAuth()
  const readOnlyMiddleware = requireReadOnlyAccess()

  // GET /v1/admin/customer-360/:userId - Get complete Customer 360 data
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: Customer360Data | null; error?: AdminError }
  }>('/v1/admin/customer-360/:userId', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { userId } = request.params

      if (!userId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'User ID is required' },
        })
      }

      const supabase = makeAdminCtx()
      const customer360Service = new Customer360Service(supabase)

      const data = await customer360Service.getCustomer360(userId)

      if (!data) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        })
      }

      return reply.send({
        success: true,
        data,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get Customer 360 data')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get Customer 360 data' },
      })
    }
  })

  // GET /v1/admin/customer-360/search - Search customers
  fastify.get<{
    Querystring: { q: string; limit?: string }
    Reply: { success: boolean; data?: Array<{ userId: string; email: string; name?: string }>; error?: AdminError }
  }>('/v1/admin/customer-360/search', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { q, limit = '20' } = request.query

      // Trim and validate search query
      const trimmedQuery = q?.trim() || ''
      if (trimmedQuery.length < 2) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Search query must be at least 2 characters' },
        })
      }

      // Parse limit with fallback to default on NaN
      const parsedLimit = parseInt(limit)
      const safeLimit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 100)

      const supabase = makeAdminCtx()
      const customer360Service = new Customer360Service(supabase)

      const results = await customer360Service.searchCustomers(trimmedQuery, safeLimit)

      return reply.send({
        success: true,
        data: results,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to search customers')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to search customers' },
      })
    }
  })

  // GET /v1/admin/customer-360/list - List customers with pagination
  fastify.get<{
    Querystring: {
      offset?: string
      limit?: string
      status?: string
      plan?: string
      hasOpenTickets?: string
    }
    Reply: { success: boolean; data?: any; error?: AdminError }
  }>('/v1/admin/customer-360/list', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { offset = '0', limit = '50', status, plan, hasOpenTickets } = request.query

      // Parse pagination with fallback to defaults on NaN
      const parsedOffset = parseInt(offset)
      const parsedLimit = parseInt(limit)
      const safeOffset = Number.isNaN(parsedOffset) ? 0 : Math.max(parsedOffset, 0)
      const safeLimit = Number.isNaN(parsedLimit) ? 50 : Math.min(Math.max(parsedLimit, 1), 100)

      const supabase = makeAdminCtx()
      const customer360Service = new Customer360Service(supabase)

      const result = await customer360Service.listCustomers(safeOffset, safeLimit, {
        status: status as any,
        plan,
        hasOpenTickets: hasOpenTickets === 'true',
      })

      return reply.send({
        success: true,
        data: result,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list customers')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to list customers' },
      })
    }
  })

  // POST /v1/admin/customer-360/:userId/notes - Add admin note
  fastify.post<{
    Params: { userId: string }
    Body: { note: string }
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/notes', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { userId } = request.params
      const { note } = request.body

      if (!note) {
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

  // GET /v1/admin/customer-360/:userId/notes - Get admin notes
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: any[]; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/notes', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
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

  // POST /v1/admin/customer-360/:userId/tags - Add tag
  fastify.post<{
    Params: { userId: string }
    Body: { tag: string }
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/tags', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { userId } = request.params
      const { tag } = request.body

      if (!tag) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Tag is required' },
        })
      }

      const supabase = makeAdminCtx()
      const healthService = new CustomerHealthService(supabase)

      await healthService.addTag(userId, tag, adminRequest.adminClaims.sub)

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to add tag')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to add tag' },
      })
    }
  })

  // DELETE /v1/admin/customer-360/:userId/tags/:tag - Remove tag
  fastify.delete<{
    Params: { userId: string; tag: string }
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/tags/:tag', { preHandler: hmacMiddleware as any }, async (request, reply) => {
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
  })

  // GET /v1/admin/customer-360/:userId/tags - Get tags
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: string[]; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/tags', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { userId } = request.params

      const supabase = makeAdminCtx()
      const customer360Service = new Customer360Service(supabase)

      const data = await customer360Service.getCustomer360(userId)
      const tags = data?.tags || []

      return reply.send({
        success: true,
        data: tags,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get tags')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get tags' },
      })
    }
  })

  // POST /v1/admin/customer-360/:userId/contacts - Log contact
  fastify.post<{
    Params: { userId: string }
    Body: { contactType: 'email' | 'call' | 'meeting' | 'chat' | 'other'; summary: string }
    Reply: { success: boolean; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/contacts', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    try {
      const adminRequest = request as AdminRequest
      const { userId } = request.params
      const { contactType, summary } = request.body

      if (!contactType || !summary) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'ContactType and summary are required' },
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
  })

  // GET /v1/admin/customer-360/:userId/contacts - Get contact log
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: any[]; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/contacts', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
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
  })

  // GET /v1/admin/customer-360/:userId/activity - Get activity timeline
  fastify.get<{
    Params: { userId: string }
    Querystring: { limit?: string }
    Reply: { success: boolean; data?: any[]; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/activity', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { userId } = request.params
      const { limit = '20' } = request.query

      // Parse limit with fallback to default on NaN
      const parsedLimit = parseInt(limit)
      const safeLimit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 100)

      const supabase = makeAdminCtx()
      const customer360Service = new Customer360Service(supabase)

      // Use the internal method by getting full data and extracting timeline
      const data = await customer360Service.getCustomer360(userId)

      if (!data) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        })
      }

      return reply.send({
        success: true,
        data: data.activityTimeline.slice(0, safeLimit),
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get activity timeline')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get activity timeline' },
      })
    }
  })

  // GET /v1/admin/customer-360/:userId/errors - Get recent errors
  fastify.get<{
    Params: { userId: string }
    Reply: { success: boolean; data?: any[]; error?: AdminError }
  }>('/v1/admin/customer-360/:userId/errors', { preHandler: readOnlyMiddleware as any }, async (request, reply) => {
    try {
      const { userId } = request.params

      const supabase = makeAdminCtx()
      const customer360Service = new Customer360Service(supabase)

      const data = await customer360Service.getCustomer360(userId)

      if (!data) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Customer not found' },
        })
      }

      return reply.send({
        success: true,
        data: data.recentErrors,
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get recent errors')
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message : 'Failed to get recent errors' },
      })
    }
  })
}
