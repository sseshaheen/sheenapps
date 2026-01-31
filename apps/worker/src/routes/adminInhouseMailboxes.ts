/**
 * Admin In-House Mailboxes Routes
 *
 * Endpoints for managing real email mailboxes (OpenSRS Hosted Email)
 * across In-House Mode projects.
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { parseLimitOffset, requirePool } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'
import { getInhouseMailboxService } from '../services/inhouse/InhouseMailboxService'
import { withStatementTimeout } from '../utils/dbTimeout'

// =============================================================================
// TYPES
// =============================================================================

interface MailboxesQuery {
  projectId?: string
  domainId?: string
  status?: string
  limit?: string
  offset?: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseMailboxesRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })
  const writeMiddleware = requireAdminAuth({ permissions: ['inhouse.write'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/mailboxes
  // -------------------------------------------------------------------------
  fastify.get<{
    Querystring: MailboxesQuery
  }>('/v1/admin/inhouse/mailboxes', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    try {
      const { projectId, domainId, status, limit: limitStr, offset: offsetStr } = request.query
      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      if (!projectId) {
        return reply.status(400).send({ success: false, error: 'projectId is required' })
      }

      const db = requirePool()

      const conditions: string[] = ['m.project_id = $1', 'm.deleted_at IS NULL']
      const params: (string | number)[] = [projectId]
      let paramIndex = 2

      if (domainId) {
        conditions.push(`m.domain_id = $${paramIndex}`)
        params.push(domainId)
        paramIndex++
      }

      if (status) {
        conditions.push(`m.provisioning_status = $${paramIndex}`)
        params.push(status)
        paramIndex++
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`

      const { total, rows } = await withStatementTimeout(db, '5s', async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_mailboxes m ${whereClause}`,
          params
        )

        const listResult = await client.query(
          `SELECT m.*, d.domain as domain_name, d.mailbox_mode, p.name as project_name
           FROM inhouse_mailboxes m
           LEFT JOIN inhouse_email_domains d ON d.id = m.domain_id
           LEFT JOIN projects p ON p.id = m.project_id
           ${whereClause}
           ORDER BY m.created_at ASC
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
        action: 'mailboxes_list',
        projectId,
        resourceType: 'mailbox',
        metadata: { domainId, status, limit, offset, resultCount: rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: { mailboxes: rows, total, hasMore: offset + rows.length < total },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list mailboxes')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list mailboxes',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/mailboxes/:mailboxId
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { mailboxId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId', { preHandler: readMiddleware as never }, async (request, reply) => {
    try {
      const db = requirePool()
      const { mailboxId } = request.params

      const result = await db.query(
        `SELECT m.*, d.domain as domain_name, d.mailbox_mode, p.name as project_name
         FROM inhouse_mailboxes m
         LEFT JOIN inhouse_email_domains d ON d.id = m.domain_id
         LEFT JOIN projects p ON p.id = m.project_id
         WHERE m.id = $1 AND m.deleted_at IS NULL`,
        [mailboxId]
      )

      if (!result.rows.length) {
        return reply.status(404).send({ success: false, error: 'Mailbox not found' })
      }

      return reply.send({ success: true, data: result.rows[0] })
    } catch (error) {
      request.log.error({ error }, 'Failed to get mailbox')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get mailbox',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/mailboxes
  // -------------------------------------------------------------------------
  fastify.post<{
    Body: {
      projectId: string
      domainId: string
      localPart: string
      password: string
      displayName?: string
      quotaMb?: number
      reason?: string
    }
  }>('/v1/admin/inhouse/mailboxes', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId, domainId, localPart, password, displayName, quotaMb, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!domainId) {
      return reply.status(400).send({ success: false, error: 'domainId is required' })
    }
    if (!localPart) {
      return reply.status(400).send({ success: false, error: 'localPart is required' })
    }
    if (!password) {
      return reply.status(400).send({ success: false, error: 'password is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      const mailbox = await service.createMailbox(domainId, {
        localPart,
        password,
        displayName,
        quotaMb,
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_create',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailbox.id,
        reason: reason || null,
        metadata: { domainId, localPart, emailAddress: mailbox.emailAddress },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.status(201).send({ success: true, data: mailbox })
    } catch (error) {
      request.log.error({ error }, 'Failed to create mailbox')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create mailbox',
      })
    }
  })

  // -------------------------------------------------------------------------
  // PATCH /v1/admin/inhouse/mailboxes/:mailboxId
  // -------------------------------------------------------------------------
  fastify.patch<{
    Params: { mailboxId: string }
    Body: {
      projectId: string
      displayName?: string
      quotaMb?: number
      forwardTo?: string | null
      forwardKeepCopy?: boolean
      reason?: string
    }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { mailboxId } = request.params
    const { projectId, reason, ...updates } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      const mailbox = await service.updateMailbox(mailboxId, updates)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_update',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailboxId,
        reason: reason || null,
        metadata: updates,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: mailbox })
    } catch (error) {
      request.log.error({ error }, 'Failed to update mailbox')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update mailbox',
      })
    }
  })

  // -------------------------------------------------------------------------
  // DELETE /v1/admin/inhouse/mailboxes/:mailboxId
  // -------------------------------------------------------------------------
  fastify.delete<{
    Params: { mailboxId: string }
    Body: { projectId: string; reason?: string }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { mailboxId } = request.params
    const { projectId, reason } = request.body || {}

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      await service.deleteMailbox(mailboxId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_delete',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailboxId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.status(204).send()
    } catch (error) {
      request.log.error({ error }, 'Failed to delete mailbox')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete mailbox',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/mailboxes/:mailboxId/suspend
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { mailboxId: string }
    Body: { projectId: string; reason?: string }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId/suspend', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { mailboxId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      await service.suspendMailbox(mailboxId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_suspend',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailboxId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to suspend mailbox')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to suspend mailbox',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/mailboxes/:mailboxId/unsuspend
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { mailboxId: string }
    Body: { projectId: string; reason?: string }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId/unsuspend', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { mailboxId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      await service.unsuspendMailbox(mailboxId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_unsuspend',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailboxId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to unsuspend mailbox')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to unsuspend mailbox',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/mailboxes/:mailboxId/reset-password
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { mailboxId: string }
    Body: { projectId: string; newPassword: string; reason?: string }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId/reset-password', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { mailboxId } = request.params
    const { projectId, newPassword, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }
    if (!newPassword) {
      return reply.status(400).send({ success: false, error: 'newPassword is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      await service.resetPassword(mailboxId, newPassword)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_reset_password',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailboxId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true })
    } catch (error) {
      request.log.error({ error }, 'Failed to reset mailbox password')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reset mailbox password',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/mailboxes/:mailboxId/webmail-sso
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { mailboxId: string }
    Body: { projectId: string }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId/webmail-sso', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { mailboxId } = request.params
    const { projectId } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      const result = await service.getWebmailSsoUrl(mailboxId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_webmail_sso',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailboxId,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to get webmail SSO URL')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get webmail SSO URL',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/mailboxes/:mailboxId/client-config
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { mailboxId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/mailboxes/:mailboxId/client-config', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { mailboxId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      const config = await service.getClientConfig(mailboxId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailbox_client_config_view',
        projectId,
        resourceType: 'mailbox',
        resourceId: mailboxId,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: config })
    } catch (error) {
      request.log.error({ error }, 'Failed to get client config')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get client config',
      })
    }
  })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/email-domains/:domainId/mailbox-dns-readiness
  // -------------------------------------------------------------------------
  fastify.get<{
    Params: { domainId: string }
    Querystring: { projectId?: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/mailbox-dns-readiness', { preHandler: readMiddleware as never }, async (request, reply) => {
    const { domainId } = request.params
    const { projectId } = request.query

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      const result = await service.checkDnsReadiness(domainId)
      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to check DNS readiness')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check DNS readiness',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains/:domainId/mailboxes/enable
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string; reason?: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/mailboxes/enable', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      const result = await service.enableMailboxes(domainId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailboxes_enable',
        projectId,
        resourceType: 'email_domain',
        resourceId: domainId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to enable mailboxes')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enable mailboxes',
      })
    }
  })

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/email-domains/:domainId/mailboxes/disable
  // -------------------------------------------------------------------------
  fastify.post<{
    Params: { domainId: string }
    Body: { projectId: string; reason?: string }
  }>('/v1/admin/inhouse/email-domains/:domainId/mailboxes/disable', { preHandler: writeMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { domainId } = request.params
    const { projectId, reason } = request.body

    if (!projectId) {
      return reply.status(400).send({ success: false, error: 'projectId is required' })
    }

    try {
      const service = getInhouseMailboxService(projectId)
      const result = await service.disableMailboxes(domainId)

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'mailboxes_disable',
        projectId,
        resourceType: 'email_domain',
        resourceId: domainId,
        reason: reason || null,
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({ success: true, data: result })
    } catch (error) {
      request.log.error({ error }, 'Failed to disable mailboxes')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disable mailboxes',
      })
    }
  })
}
