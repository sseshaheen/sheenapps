/**
 * In-House Mailbox Routes
 *
 * HTTP endpoints for real email mailbox management (OpenSRS Hosted Email).
 * Nested under email domains following existing pattern.
 *
 * Part of easy-mode-email-plan.md (Phase 4: Real Mailbox)
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getInhouseMailboxService } from '../services/inhouse/InhouseMailboxService'
import { getInhouseMeteringService } from '../services/inhouse/InhouseMeteringService'

// =============================================================================
// VALIDATION
// =============================================================================

const LOCAL_PART_REGEX = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i
const MAX_LOCAL_PART_LENGTH = 64
const MIN_PASSWORD_LENGTH = 8

function validateLocalPart(localPart: string): { valid: boolean; error?: string; normalized?: string } {
  if (!localPart || typeof localPart !== 'string') {
    return { valid: false, error: 'localPart is required' }
  }

  const normalized = localPart.trim().toLowerCase()

  if (normalized.length > MAX_LOCAL_PART_LENGTH) {
    return { valid: false, error: `localPart exceeds maximum length (${MAX_LOCAL_PART_LENGTH} chars)` }
  }

  if (!LOCAL_PART_REGEX.test(normalized)) {
    return { valid: false, error: 'localPart format is invalid (use letters, numbers, dots, hyphens, underscores)' }
  }

  return { valid: true, normalized }
}

function validateQuotaMb(q?: number): { valid: boolean; error?: string } {
  if (q === undefined) return { valid: true }
  if (!Number.isInteger(q) || q < 256 || q > 102_400) {
    return { valid: false, error: 'quotaMb must be an integer between 256 and 102400' }
  }
  return { valid: true }
}

function validateForwardTo(v?: string | null): { valid: boolean; error?: string } {
  if (v === undefined || v === null) return { valid: true }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return { valid: false, error: 'forwardTo must be a valid email address' }
  }
  return { valid: true }
}

function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'password is required' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` }
  }
  if (/\s/.test(password)) {
    return { valid: false, error: 'password cannot contain whitespace' }
  }
  return { valid: true }
}

// =============================================================================
// ROUTES
// =============================================================================

export async function inhouseMailboxRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // POST .../email-domains/:domainId/mailboxes/enable - Enable mailboxes
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/mailboxes/enable', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body || {}

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const result = await service.enableMailboxes(domainId)

    return reply.status(200).send(result)
  })

  // ===========================================================================
  // POST .../email-domains/:domainId/mailboxes/disable - Disable mailboxes
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/mailboxes/disable', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body || {}

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const result = await service.disableMailboxes(domainId)

    return reply.status(200).send(result)
  })

  // ===========================================================================
  // POST .../email-domains/:domainId/mailboxes - Create mailbox
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string; localPart: string; password: string; displayName?: string; quotaMb?: number }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/mailboxes', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId, localPart, password, displayName, quotaMb } = request.body

    if (userId) await assertProjectAccess(projectId, userId)

    // Validate local part
    const localPartVal = validateLocalPart(localPart)
    if (!localPartVal.valid) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: localPartVal.error })
    }

    // Validate password
    const passwordVal = validatePassword(password)
    if (!passwordVal.valid) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: passwordVal.error })
    }

    // Validate quotaMb
    const quotaVal = validateQuotaMb(quotaMb)
    if (!quotaVal.valid) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: quotaVal.error })
    }

    // Check mailbox quota (derived from DB count, not usage tracking)
    const metering = getInhouseMeteringService()
    const quota = await metering.checkMailboxQuota(projectId)
    if (!quota.allowed) {
      return reply.status(429).send({
        error: 'QUOTA_EXCEEDED',
        message: 'Maximum mailboxes reached for your plan',
        used: quota.used,
        limit: quota.limit,
      })
    }

    const service = getInhouseMailboxService(projectId)

    try {
      const mailbox = await service.createMailbox(domainId, {
        localPart: localPartVal.normalized!,
        password,
        displayName,
        quotaMb,
      })

      return reply.status(201).send(mailbox)
    } catch (error: any) {
      if (error?.code === '23505') {
        return reply.status(409).send({
          error: 'MAILBOX_EXISTS',
          message: 'A mailbox with this address already exists',
        })
      }
      throw error
    }
  })

  // ===========================================================================
  // GET .../email-domains/:domainId/mailboxes - List mailboxes
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/mailboxes', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const mailboxes = await service.listMailboxes(domainId)

    return reply.status(200).send({ mailboxes })
  })

  // ===========================================================================
  // GET .../mailboxes/:mailboxId - Get mailbox details
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; mailboxId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.query

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const mailbox = await service.getMailbox(mailboxId)

    return reply.status(200).send(mailbox)
  })

  // ===========================================================================
  // PATCH .../mailboxes/:mailboxId - Update mailbox
  // ===========================================================================
  fastify.patch<{
    Params: { projectId: string; mailboxId: string }
    Body: {
      userId?: string
      displayName?: string
      quotaMb?: number
      forwardTo?: string | null
      forwardKeepCopy?: boolean
      imapEnabled?: boolean
      popEnabled?: boolean
      webmailEnabled?: boolean
      smtpEnabled?: boolean
      autoresponderEnabled?: boolean
      autoresponderSubject?: string
      autoresponderBody?: string
    }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId, ...updateInput } = request.body

    if (userId) await assertProjectAccess(projectId, userId)

    // Validate inputs
    const quotaVal = validateQuotaMb(updateInput.quotaMb)
    if (!quotaVal.valid) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: quotaVal.error })
    }
    const fwdVal = validateForwardTo(updateInput.forwardTo)
    if (!fwdVal.valid) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: fwdVal.error })
    }

    const service = getInhouseMailboxService(projectId)
    const mailbox = await service.updateMailbox(mailboxId, updateInput)

    return reply.status(200).send(mailbox)
  })

  // ===========================================================================
  // DELETE .../mailboxes/:mailboxId - Delete mailbox
  // ===========================================================================
  fastify.delete<{
    Params: { projectId: string; mailboxId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.query

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    await service.deleteMailbox(mailboxId)

    return reply.status(200).send({ success: true })
  })

  // ===========================================================================
  // POST .../mailboxes/:mailboxId/restore - Restore deleted mailbox
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; mailboxId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId/restore', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.body || {}

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const mailbox = await service.restoreMailbox(mailboxId)

    return reply.status(200).send(mailbox)
  })

  // ===========================================================================
  // POST .../mailboxes/:mailboxId/reset-password - Reset password
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; mailboxId: string }
    Body: { userId?: string; newPassword: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId/reset-password', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId, newPassword } = request.body

    if (userId) await assertProjectAccess(projectId, userId)

    const passwordVal = validatePassword(newPassword)
    if (!passwordVal.valid) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', message: passwordVal.error })
    }

    const service = getInhouseMailboxService(projectId)
    await service.resetPassword(mailboxId, newPassword)

    return reply.status(200).send({ success: true })
  })

  // ===========================================================================
  // POST .../mailboxes/:mailboxId/webmail-sso - Get webmail SSO URL
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; mailboxId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId/webmail-sso', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.body || {}

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const result = await service.getWebmailSsoUrl(mailboxId)

    return reply.status(200).send(result)
  })

  // ===========================================================================
  // POST .../mailboxes/:mailboxId/suspend - Suspend mailbox
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; mailboxId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId/suspend', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.body || {}

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    await service.suspendMailbox(mailboxId)

    return reply.status(200).send({ success: true })
  })

  // ===========================================================================
  // POST .../mailboxes/:mailboxId/unsuspend - Unsuspend mailbox
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; mailboxId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId/unsuspend', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.body || {}

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    await service.unsuspendMailbox(mailboxId)

    return reply.status(200).send({ success: true })
  })

  // ===========================================================================
  // GET .../email-domains/:domainId/mailbox-dns-readiness - DNS readiness check
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/mailbox-dns-readiness', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const result = await service.checkDnsReadiness(domainId)

    return reply.status(200).send(result)
  })

  // ===========================================================================
  // GET .../mailboxes/:mailboxId/client-config - Get IMAP/SMTP settings
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; mailboxId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId/client-config', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.query

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const config = await service.getClientConfig(mailboxId)

    return reply.status(200).send(config)
  })

  // ===========================================================================
  // POST .../mailboxes/:mailboxId/sync-quota - Sync quota from provider
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; mailboxId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/mailboxes/:mailboxId/sync-quota', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, mailboxId } = request.params
    const { userId } = request.body || {}

    if (userId) await assertProjectAccess(projectId, userId)

    const service = getInhouseMailboxService(projectId)
    const quota = await service.syncQuota(mailboxId)

    return reply.status(200).send(quota)
  })
}
