/**
 * Admin In-House Email Domains Routes
 *
 * Endpoints for managing email domains across In-House Mode projects.
 * Wraps InhouseDomainsService with admin JWT auth instead of HMAC.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { parseLimitOffset, requirePool } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseDomainsService } from '../services/inhouse/InhouseDomainsService'
import { withStatementTimeout } from '../utils/dbTimeout'

// =============================================================================
// TYPES
// =============================================================================

interface EmailDomainsQuery {
  projectId?: string
  status?: string
  authorityLevel?: string
  limit?: string
  offset?: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseEmailDomainsRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/email-domains
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: EmailDomainsQuery
    Reply: { success: boolean; data?: any; error?: string }
  }>('/v1/admin/inhouse/email-domains', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const { projectId, status, authorityLevel, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      if (!projectId) {
        return reply.status(400).send({ success: false, error: 'projectId is required' })
      }

      const db = requirePool()

      const conditions: string[] = ['d.project_id = $1']
      const params: (string | number)[] = [projectId]
      let paramIndex = 2

      if (status) {
        conditions.push(`d.status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      if (authorityLevel) {
        conditions.push(`d.authority_level = $${paramIndex}`)
        params.push(authorityLevel)
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_email_domains d ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT d.*, p.name as project_name
           FROM inhouse_email_domains d
           LEFT JOIN projects p ON p.id = d.project_id
           ${whereClause}
           ORDER BY d.created_at DESC
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
        action: 'email_domains_list',
        projectId,
        resourceType: 'email_domain',
        metadata: { status, authorityLevel, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { domains: rows, total, hasMore: offset + rows.length < total },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list email domains')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list email domains',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/email-domains/:domainId
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
  }>('/v1/admin/inhouse/email-domains/:domainId', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { domainId } = request.params

      const result = await db.query(
        `SELECT d.*, p.name as project_name
         FROM inhouse_email_domains d
         LEFT JOIN projects p ON p.id = d.project_id
         WHERE d.id = $1`,
        [domainId]
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Email domain not found' })
      }

      return reply.send({ success: true, data: result.rows[0] })
    } catch (error) {
      request.log.error({ error }, 'Failed to get email domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get email domain',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: {
      projectId: string
      domain: string
      authorityLevel?: 'manual' | 'subdomain' | 'nameservers' | 'cf_token'
      reason?: string
    }
  }>('/v1/admin/inhouse/email-domains', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId, domain, authorityLevel, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!domain) {
      return reply.status(400).send({ success: false, error: 'domain is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const result = await service.addDomain({
        domain,
        authorityLevel: authorityLevel || 'manual',
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_domain_add',
        projectId,
        resourceType: 'email_domain',
        resourceId: result.domain.id,
        reason: reason || null,
        metadata: { domain, authorityLevel },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.status(201).send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to add email domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add email domain',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains/:domainId/verify
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/verify', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const result = await service.verifyDomain(domainId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_domain_verify',
        projectId,
        resourceType: 'email_domain',
        resourceId: domainId,
        metadata: { readyForSending: result.readyForSending },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to verify email domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify email domain',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/email-domains/:domainId/status
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/status', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { domainId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const domain = await service.getDomain(domainId)

      if (!domain) {
        return reply.status(404).send({ success: false, error: 'Email domain not found' })
      }

      const dnsInstructions = await service.getDnsInstructions(domainId)

      return reply.send({
        success: true,
        data: {
          domain,
          dnsInstructions,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to get domain status')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get domain status',
      })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /v1/admin/inhouse/email-domains/:domainId
  // -------------------------------------------------------------------------
  fastify.delete<{
    Params: { domainId: string }
    Body: { projectId: string; reason?: string }
  }>('/v1/admin/inhouse/email-domains/:domainId', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId, reason } = request.body || {}

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const deleted = await service.deleteDomain(domainId)

      if (!deleted) {
        return reply.status(404).send({ success: false, error: 'Email domain not found' })
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_domain_delete',
        projectId,
        resourceType: 'email_domain',
        resourceId: domainId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to delete email domain')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete email domain',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains/:domainId/subdomain-delegation
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/subdomain-delegation', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const result = await service.initiateSubdomainDelegation(domainId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_domain_subdomain_delegation',
        projectId,
        resourceType: 'email_domain',
        resourceId: domainId,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to initiate subdomain delegation')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate subdomain delegation',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/email-domains/:domainId/subdomain-delegation/status
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/subdomain-delegation/status', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { domainId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const result = await service.checkSubdomainDelegation(domainId)
      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to check subdomain delegation')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check subdomain delegation',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains/:domainId/nameserver-switch/preview
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/nameserver-switch/preview', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { domainId } = request.params
    const { projectId } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const result = await service.previewNameserverSwitch(domainId)
      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to preview nameserver switch')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to preview nameserver switch',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains/:domainId/nameserver-switch
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/nameserver-switch', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const result = await service.initiateNameserverSwitch(domainId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_domain_nameserver_switch',
        projectId,
        resourceType: 'email_domain',
        resourceId: domainId,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to initiate nameserver switch')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate nameserver switch',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/email-domains/:domainId/nameserver-switch/status
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/nameserver-switch/status', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { domainId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)
      const result = await service.checkNameserverSwitch(domainId)
      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to check nameserver switch')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check nameserver switch',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains/:domainId/provision-email-records
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string; method: 'subdomain' | 'nameservers' | 'cf_token' }
  }>('/v1/admin/inhouse/email-domains/:domainId/provision-email-records', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId, method } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseDomainsService(projectId)

      if (method === 'subdomain') {
        await service.provisionSubdomainEmailRecords(domainId)
      } else if (method === 'nameservers') {
        await service.provisionNameserverEmailRecords(domainId)
      } else if (method === 'cf_token') {
        await service.provisionCfTokenEmailRecords(domainId)
      } else {
        return reply.status(400).send({ success: false, error: 'method must be subdomain, nameservers, or cf_token' })
      }

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'email_domain_provision_records',
        projectId,
        resourceType: 'email_domain',
        resourceId: domainId,
        metadata: { method },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to provision email records')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to provision email records',
      })
    }
  })
}
