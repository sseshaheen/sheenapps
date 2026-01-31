/**
 * In-House Domain Registration Routes
 *
 * HTTP endpoints for Easy Mode domain registration and management.
 *
 * Routes:
 * - POST   /v1/inhouse/projects/:projectId/domain-search - Search available domains
 * - POST   /v1/inhouse/projects/:projectId/domain-register - Purchase a domain
 * - GET    /v1/inhouse/projects/:projectId/registered-domains - List registered domains
 * - GET    /v1/inhouse/projects/:projectId/registered-domains/:domainId - Get domain details
 * - POST   /v1/inhouse/projects/:projectId/registered-domains/:domainId/renew - Renew domain
 * - GET    /v1/inhouse/projects/:projectId/registered-domains/:domainId/auth-code - Get transfer code
 * - PATCH  /v1/inhouse/projects/:projectId/registered-domains/:domainId/settings - Update settings
 * - GET    /v1/inhouse/projects/:projectId/registered-domains/:domainId/events - Get domain events
 * - GET    /v1/inhouse/domain-pricing - Get TLD pricing (not project-scoped)
 *
 * Part of easy-mode-email-plan.md (Phase 3: Domain Registration)
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import {
  getInhouseDomainRegistrationService,
  DomainPurchaseInput,
} from '../services/inhouse/InhouseDomainRegistrationService'
import { DomainContact } from '../services/inhouse/OpenSrsService'
import { checkDomainSearchRateLimit, parseClientIp } from '../services/inhouse/DomainSearchRateLimiter'
import { getPool } from '../services/databaseWrapper'

// =============================================================================
// VALIDATION
// =============================================================================

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})+$/i
const MAX_DOMAIN_LENGTH = 253

function validateDomain(domain: string): { valid: boolean; error?: string; normalized?: string } {
  if (!domain || typeof domain !== 'string') {
    return { valid: false, error: 'domain is required' }
  }

  const normalized = domain.trim().toLowerCase()

  if (normalized.length > MAX_DOMAIN_LENGTH) {
    return { valid: false, error: `domain exceeds maximum length (${MAX_DOMAIN_LENGTH} chars)` }
  }

  if (!DOMAIN_REGEX.test(normalized)) {
    return { valid: false, error: 'domain format is invalid' }
  }

  return { valid: true, normalized }
}

function validateContact(contact: unknown, name: string): { valid: boolean; error?: string; contact?: DomainContact } {
  if (!contact || typeof contact !== 'object') {
    return { valid: false, error: `${name} contact is required` }
  }

  const c = contact as Record<string, unknown>

  const required = ['firstName', 'lastName', 'email', 'phone', 'address1', 'city', 'state', 'postalCode', 'country']
  for (const field of required) {
    if (!c[field] || typeof c[field] !== 'string' || (c[field] as string).trim() === '') {
      return { valid: false, error: `${name}.${field} is required` }
    }
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email as string)) {
    return { valid: false, error: `${name}.email is not a valid email address` }
  }

  // Validate country code (2 letters)
  if (!/^[A-Z]{2}$/i.test(c.country as string)) {
    return { valid: false, error: `${name}.country must be a 2-letter ISO country code` }
  }

  return {
    valid: true,
    contact: {
      firstName: (c.firstName as string).trim(),
      lastName: (c.lastName as string).trim(),
      orgName: c.orgName ? (c.orgName as string).trim() : undefined,
      email: (c.email as string).trim().toLowerCase(),
      phone: (c.phone as string).trim(),
      address1: (c.address1 as string).trim(),
      address2: c.address2 ? (c.address2 as string).trim() : undefined,
      city: (c.city as string).trim(),
      state: (c.state as string).trim(),
      postalCode: (c.postalCode as string).trim(),
      country: (c.country as string).trim().toUpperCase(),
    },
  }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface DomainSearchBody {
  query: string
  tlds?: string[]
  userId?: string
}

interface DomainRegisterBody {
  domain: string
  contacts: {
    owner: DomainContact
    admin?: DomainContact
    billing?: DomainContact
    tech?: DomainContact
  }
  period?: number
  autoRenew?: boolean
  whoisPrivacy?: boolean
  paymentMethodId?: string
  userId?: string
}

interface DomainRenewBody {
  period?: number
  paymentMethodId?: string
  userId?: string
}

interface DomainSettingsBody {
  autoRenew?: boolean
  whoisPrivacy?: boolean
  locked?: boolean
  userId?: string
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseDomainRegistrationRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // GET /v1/inhouse/domain-pricing - Get TLD pricing (not project-scoped)
  // ===========================================================================
  fastify.get('/v1/inhouse/domain-pricing', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    try {
      // Use a temporary service instance for pricing
      const service = getInhouseDomainRegistrationService('system')
      const pricing = await service.getTldPricing()

      return reply.send({
        ok: true,
        data: { pricing },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/domain-search - Search available domains
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string }
    Body: DomainSearchBody
  }>('/v1/inhouse/projects/:projectId/domain-search', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { query, tlds, userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    // Rate limiting - check before any expensive operations
    const clientIp = parseClientIp(request)
    const rateLimit = await checkDomainSearchRateLimit(projectId, clientIp)

    if (!rateLimit.allowed) {
      // Standard Retry-After header (RFC 6585)
      reply.header('Retry-After', rateLimit.resetInSeconds)
      reply.header('X-RateLimit-Remaining', 0)
      reply.header('X-RateLimit-Reset', rateLimit.resetInSeconds)

      return reply.code(429).send({
        ok: false,
        error: {
          code: 'RATE_LIMITED',
          message: rateLimit.reason || 'Rate limit exceeded',
          retryAfter: rateLimit.resetInSeconds,
        },
      })
    }

    // Add rate limit headers to successful responses
    reply.header('X-RateLimit-Remaining', rateLimit.remaining)
    reply.header('X-RateLimit-Reset', rateLimit.resetInSeconds)

    // Validate query
    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'query must be at least 2 characters',
        },
      })
    }

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const results = await service.searchDomains({ query: query.trim(), tlds })

      return reply.send({
        ok: true,
        data: results,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/domain-register - Purchase a domain
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string }
    Body: DomainRegisterBody
  }>('/v1/inhouse/projects/:projectId/domain-register', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { domain, contacts, period, autoRenew, whoisPrivacy, paymentMethodId, userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    // Validate domain
    const domainValidation = validateDomain(domain)
    if (!domainValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: domainValidation.error,
        },
      })
    }

    // Validate owner contact (required)
    if (!contacts || !contacts.owner) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'contacts.owner is required',
        },
      })
    }

    const ownerValidation = validateContact(contacts.owner, 'owner')
    if (!ownerValidation.valid) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: ownerValidation.error,
        },
      })
    }

    // Validate optional contacts
    const validatedContacts: DomainPurchaseInput['contacts'] = {
      owner: ownerValidation.contact!,
    }

    if (contacts.admin) {
      const v = validateContact(contacts.admin, 'admin')
      if (!v.valid) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: v.error },
        })
      }
      validatedContacts.admin = v.contact
    }

    if (contacts.billing) {
      const v = validateContact(contacts.billing, 'billing')
      if (!v.valid) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: v.error },
        })
      }
      validatedContacts.billing = v.contact
    }

    if (contacts.tech) {
      const v = validateContact(contacts.tech, 'tech')
      if (!v.valid) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: v.error },
        })
      }
      validatedContacts.tech = v.contact
    }

    // Validate period
    const validPeriod = period && period >= 1 && period <= 10 ? period : 1

    // Require userId for domain purchase
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for domain purchase',
        },
      })
    }

    // Look up user email for billing
    const pool = getPool()
    const { rows: userRows } = await pool.query(
      'SELECT email FROM auth.users WHERE id = $1',
      [userId]
    )
    if (userRows.length === 0 || !userRows[0].email) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found or missing email',
        },
      })
    }
    const userEmail = userRows[0].email as string

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const result = await service.purchaseDomain({
        domain: domainValidation.normalized!,
        contacts: validatedContacts,
        period: validPeriod,
        autoRenew: autoRenew ?? true,
        whoisPrivacy: whoisPrivacy ?? true,
        paymentMethodId,
        userId,
        userEmail,
      })

      if (!result.success) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'REGISTRATION_FAILED',
            message: result.error,
          },
        })
      }

      return reply.code(201).send({
        ok: true,
        data: {
          domain: result.domain,
          orderId: result.orderId,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/registered-domains - List registered domains
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/registered-domains', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const domains = await service.listDomains()

      return reply.send({
        ok: true,
        data: { domains },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/registered-domains/:domainId
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/registered-domains/:domainId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const domain = await service.getDomain(domainId)

      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Registered domain not found: ${domainId}`,
          },
        })
      }

      return reply.send({
        ok: true,
        data: { domain },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/registered-domains/:domainId/renew
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: DomainRenewBody
  }>('/v1/inhouse/projects/:projectId/registered-domains/:domainId/renew', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { period, paymentMethodId, userId } = request.body

    // Require userId for domain renewal
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId is required for domain renewal',
        },
      })
    }

    await assertProjectAccess(projectId, userId)

    // Look up user email for billing
    const pool = getPool()
    const { rows: userRows } = await pool.query(
      'SELECT email FROM auth.users WHERE id = $1',
      [userId]
    )
    if (userRows.length === 0 || !userRows[0].email) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found or missing email',
        },
      })
    }
    const userEmail = userRows[0].email as string

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const result = await service.renewDomain({
        domainId,
        period: period || 1,
        paymentMethodId,
        userId,
        userEmail,
      })

      if (!result.success) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'RENEWAL_FAILED',
            message: result.error,
          },
        })
      }

      return reply.send({
        ok: true,
        data: {
          domain: result.domain,
          newExpiresAt: result.newExpiresAt,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/registered-domains/:domainId/auth-code
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/registered-domains/:domainId/auth-code', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const result = await service.getAuthCode(domainId)

      if (!result.success) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'AUTH_CODE_FAILED',
            message: result.error,
          },
        })
      }

      return reply.send({
        ok: true,
        data: {
          authCode: result.authCode,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // PATCH /v1/inhouse/projects/:projectId/registered-domains/:domainId/settings
  // ===========================================================================
  fastify.patch<{
    Params: { projectId: string; domainId: string }
    Body: DomainSettingsBody
  }>('/v1/inhouse/projects/:projectId/registered-domains/:domainId/settings', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { autoRenew, whoisPrivacy, locked, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const domain = await service.updateSettings(domainId, {
        autoRenew,
        whoisPrivacy,
        locked,
      })

      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Registered domain not found: ${domainId}`,
          },
        })
      }

      return reply.send({
        ok: true,
        data: { domain },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:projectId/registered-domains/:domainId/events
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string; limit?: string }
  }>('/v1/inhouse/projects/:projectId/registered-domains/:domainId/events', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId, limit } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const parsedLimit = limit ? Math.min(parseInt(limit, 10), 100) : 50

    try {
      const service = getInhouseDomainRegistrationService(projectId)
      const events = await service.getDomainEvents(domainId, parsedLimit)

      return reply.send({
        ok: true,
        data: { events },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
        },
      })
    }
  })
}
