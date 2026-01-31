/**
 * Admin In-House Registered Domains Routes
 *
 * Endpoints for managing registered domains (purchased via OpenSRS)
 * across In-House Mode projects.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { parseLimitOffset, requirePool } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { withStatementTimeout } from '../utils/dbTimeout'

// =============================================================================
// TYPES
// =============================================================================

interface RegisteredDomainsQuery {
  projectId?: string
  status?: string
  limit?: string
  offset?: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseRegisteredDomainsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/registered-domains
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: RegisteredDomainsQuery
  }>('/v1/admin/inhouse/registered-domains', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const { projectId, status, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      if (!projectId) {
        return reply.status(400).send({ success: false, error: 'projectId is required' })
      }

      const db = requirePool()

      const conditions: string[] = ['rd.project_id = $1']
      const params: (string | number)[] = [projectId]
      let paramIndex = 2

      if (status) {
        conditions.push(`rd.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_registered_domains rd ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT rd.*, p.name as project_name
           FROM inhouse_registered_domains rd
           LEFT JOIN projects p ON p.id = rd.project_id
           ${whereClause}
           ORDER BY rd.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          rows: listResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'registered_domains_list',
        projectId,
        resourceType: 'registered_domain',
        metadata: { status, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { domains: rows, total, hasMore: offset + rows.length < total },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list registered domains')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list registered domains',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/registered-domains/:domainId
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
  }>('/v1/admin/inhouse/registered-domains/:domainId', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { domainId } = request.params

      const result = await db.query(
        `SELECT rd.*, p.name as project_name
         FROM inhouse_registered_domains rd
         LEFT JOIN projects p ON p.id = rd.project_id
         WHERE rd.id = $1`,
        [domainId]
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Registered domain not found' })
      }

      return reply.send({ success: true, data: result.rows[0] })
    } catch (error) {
      request.log.error({ error }, 'Failed to get registered domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get registered domain',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/registered-domains/:domainId/events
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
    Querystring: { limit?: string; offset?: string }
  }>('/v1/admin/inhouse/registered-domains/:domainId/events', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { domainId } = request.params
      const { limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_domain_events WHERE domain_id = $1`,
          [domainId]
        )

        const listResult = await client.query(
          `SELECT * FROM inhouse_domain_events
           WHERE domain_id = $1
           ORDER BY created_at DESC
           LIMIT $2 OFFSET $3`,
          [domainId, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          rows: listResult.rows,
        }
      })

      return reply.send({
        success: true,
        data: { events: rows, total, hasMore: offset + rows.length < total },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list domain events')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list domain events',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/registered-domains/search
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: { projectId: string; query: string; tlds?: string[] }
  }>('/v1/admin/inhouse/registered-domains/search', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { projectId, query, tlds } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!query) {
      return reply.status(400).send({ success: false, error: 'query is required' })
    }

    try {
      // Import dynamically to avoid loading OpenSRS if not needed
      const { getInhouseDomainRegistrationService } = await import('../services/inhouse/InhouseDomainRegistrationService')
      const service = getInhouseDomainRegistrationService(projectId)
      const result = await service.searchDomains({ query, tlds })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to search domains')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search domains',
      })
    }
  })

  // -------------------------------------------------------------------------
  // PATCH /v1/admin/inhouse/registered-domains/:domainId/settings
  // -------------------------------------------------------------------------
  fastify.patch<{
    Params: { domainId: string }
    Body: {
      projectId: string
      autoRenew?: boolean
      whoisPrivacy?: boolean
      locked?: boolean
      reason?: string
    }
  }>('/v1/admin/inhouse/registered-domains/:domainId/settings', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId, autoRenew, whoisPrivacy, locked, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    if (autoRenew === undefined && whoisPrivacy === undefined && locked === undefined) {
      return reply.status(400).send({ success: false, error: 'At least one setting is required' })
    }

    try {
      const { getInhouseDomainRegistrationService } = await import('../services/inhouse/InhouseDomainRegistrationService')
      const service = getInhouseDomainRegistrationService(projectId)
      const result = await service.updateSettings(domainId, { autoRenew, whoisPrivacy, locked })

      if (!result) {
        return reply.status(404).send({ success: false, error: 'Registered domain not found' })
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'registered_domain_update_settings',
        projectId,
        resourceType: 'registered_domain',
        resourceId: domainId,
        reason: reason || null,
        metadata: { autoRenew, whoisPrivacy, locked },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to update domain settings')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update domain settings',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/registered-domains/:domainId/renew
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string; period?: number; reason?: string }
  }>('/v1/admin/inhouse/registered-domains/:domainId/renew', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId, period, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const { getInhouseDomainRegistrationService } = await import('../services/inhouse/InhouseDomainRegistrationService')
      const service = getInhouseDomainRegistrationService(projectId)
      const result = await service.renewDomain({
        domainId,
        period: period || 1,
        userId: adminRequest.adminClaims.sub,
        userEmail: adminRequest.adminClaims.email,
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'registered_domain_renew',
        projectId,
        resourceType: 'registered_domain',
        resourceId: domainId,
        reason: reason || null,
        metadata: { period: period || 1 },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to renew domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to renew domain',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/registered-domains/:domainId/auth-code
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/registered-domains/:domainId/auth-code', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const { getInhouseDomainRegistrationService } = await import('../services/inhouse/InhouseDomainRegistrationService')
      const service = getInhouseDomainRegistrationService(projectId)
      const result = await service.getAuthCode(domainId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'registered_domain_get_auth_code',
        projectId,
        resourceType: 'registered_domain',
        resourceId: domainId,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to get auth code')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get auth code',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/domain-pricing
  // -------------------------------------------------------------------------
  fastify.get('/v1/admin/inhouse/domain-pricing', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const { getInhouseDomainRegistrationService } = await import('../services/inhouse/InhouseDomainRegistrationService')
      // Use a dummy projectId for pricing lookup (not project-scoped)
      const service = getInhouseDomainRegistrationService('system')
      const pricing = await service.getTldPricing()

      return reply.send({ success: true, data: { pricing } })
    } catch (error) {
      request.log.error({ error }, 'Failed to get TLD pricing')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get TLD pricing',
      })
    }
  })
}
