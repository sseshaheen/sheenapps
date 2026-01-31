/**
 * In-House Email Domains Routes
 *
 * HTTP endpoints for Easy Mode custom email domain management.
 *
 * Routes:
 * - POST   /v1/inhouse/projects/:projectId/email-domains - Add email domain
 * - GET    /v1/inhouse/projects/:projectId/email-domains - List email domains
 * - GET    /v1/inhouse/projects/:projectId/email-domains/:domainId - Get email domain
 * - POST   /v1/inhouse/projects/:projectId/email-domains/:domainId/verify - Trigger verification
 * - DELETE /v1/inhouse/projects/:projectId/email-domains/:domainId - Delete email domain
 * - POST   /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token - Connect CF token
 * - POST   /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token/provision - Provision via CF token
 * - DELETE /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token - Disconnect CF token
 *
 * Part of easy-mode-email-plan.md (Phase 2A-2C: Custom Domain)
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getInhouseDomainsService } from '../services/inhouse/InhouseDomainsService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'

// =============================================================================
// VALIDATION
// =============================================================================

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z]{2,})+$/i
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

  // Prevent certain TLDs or domains (private/internal/test)
  const blockedPatterns = [
    /\.sheenapps\.com$/,  // Can't add our own domain
    /^localhost$/,
    /\.local$/,           // mDNS/Bonjour local domains
    /\.internal$/,        // Internal/private domains
    /\.lan$/,             // Common LAN suffix
    /^127\./,             // Loopback
    /^192\.168\./,        // Private IPv4
    /^10\./,              // Private IPv4
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // Private IPv4
  ]

  if (blockedPatterns.some(pattern => pattern.test(normalized))) {
    return { valid: false, error: 'this domain cannot be added' }
  }

  return { valid: true, normalized }
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface AddDomainBody {
  domain: string
  isSubdomain?: boolean
  authorityLevel?: 'manual' | 'subdomain' | 'nameservers' | 'cf_token'
  userId?: string
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseEmailDomainsRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  // ===========================================================================
  // POST /v1/inhouse/projects/:projectId/email-domains - Add email domain
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string }
    Body: AddDomainBody
  }>('/v1/inhouse/projects/:projectId/email-domains', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { domain, isSubdomain, authorityLevel, userId } = request.body

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

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const result = await domainsService.addDomain({
        domain: domainValidation.normalized!,
        isSubdomain,
        authorityLevel: authorityLevel || 'manual',
      })

      return reply.code(201).send({
        ok: true,
        data: {
          domain: result.domain,
          dnsInstructions: result.dnsInstructions,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Handle specific errors
      if (errorMessage.includes('INVALID_DOMAIN')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_DOMAIN',
            message: errorMessage.replace('INVALID_DOMAIN: ', ''),
          },
        })
      }

      if (errorMessage.includes('QUOTA_EXCEEDED')) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: errorMessage.replace('QUOTA_EXCEEDED: ', ''),
          },
        })
      }

      // Duplicate domain constraint
      if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
        return reply.code(409).send({
          ok: false,
          error: {
            code: 'DOMAIN_EXISTS',
            message: 'This domain is already added to your project',
          },
        })
      }

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
  // GET /v1/inhouse/projects/:projectId/email-domains - List email domains
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const domains = await domainsService.listDomains()

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
  // GET /v1/inhouse/projects/:projectId/email-domains/:domainId/registrar
  // Detect registrar and return tailored DNS setup instructions
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/registrar', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const domain = await domainsService.getDomain(domainId)

      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      // Import the DNS verification service directly
      const { getDnsVerificationService } = await import('../services/inhouse/DnsVerificationService')
      const dnsService = getDnsVerificationService()
      const registrarInfo = await dnsService.detectRegistrar(domain.domain)

      return reply.send({
        ok: true,
        data: {
          domain: domain.domain,
          ...registrarInfo,
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
  // GET /v1/inhouse/projects/:projectId/email-domains/:domainId/status
  // DNS verification status progress indicator for wizard UI
  // Returns: { spf: {verified, status}, dkim: {...}, dmarc: {...}, mx: {...}, ... }
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/status', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const domain = await domainsService.getDomain(domainId)

      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      // Build progress indicator response
      const dnsStatus = domain.dnsStatus
      // readyForSending requires all three: ownership + spf + dkim (matches DnsVerificationService.isReadyForSending)
      // Note: ownership is tracked separately from dns_status JSONB
      const overall = {
        status: domain.status,
        readyForSending: domain.ownershipVerified && dnsStatus.spf.verified && dnsStatus.dkim.verified,
        lastCheckedAt: domain.lastCheckedAt,
      }

      const progress = {
        ownership: {
          verified: domain.ownershipVerified,
          status: domain.ownershipVerified ? 'verified' : 'pending',
          message: domain.ownershipVerified
            ? 'Domain ownership verified'
            : 'Add TXT record to verify ownership',
        },
        spf: {
          verified: dnsStatus.spf.verified,
          status: dnsStatus.spf.verified ? 'verified' : (dnsStatus.spf.error ? 'error' : 'pending'),
          message: dnsStatus.spf.verified
            ? 'SPF record configured correctly'
            : dnsStatus.spf.error || 'Add SPF record',
          actual: dnsStatus.spf.actual,
        },
        dkim: {
          verified: dnsStatus.dkim.verified,
          status: dnsStatus.dkim.verified ? 'verified' : (dnsStatus.dkim.error ? 'error' : 'pending'),
          message: dnsStatus.dkim.verified
            ? 'DKIM record configured correctly'
            : dnsStatus.dkim.error || 'Add DKIM record',
          actual: dnsStatus.dkim.actual,
        },
        dmarc: {
          verified: dnsStatus.dmarc.verified,
          status: dnsStatus.dmarc.verified ? 'verified' : 'optional',
          message: dnsStatus.dmarc.verified
            ? 'DMARC policy configured'
            : 'DMARC is recommended but optional',
          actual: dnsStatus.dmarc.actual,
        },
        mx: {
          verified: dnsStatus.mx.verified,
          status: dnsStatus.mx.verified ? 'verified' : 'optional',
          message: dnsStatus.mx.verified
            ? 'MX record configured for inbound email'
            : 'MX record optional (for receiving email)',
          actual: dnsStatus.mx.actual,
        },
        returnPath: {
          verified: dnsStatus.returnPath.verified,
          status: dnsStatus.returnPath.verified ? 'verified' : 'optional',
          message: dnsStatus.returnPath.verified
            ? 'Return-Path configured for bounce handling'
            : 'Return-Path is recommended but optional',
          actual: dnsStatus.returnPath.actual,
        },
      }

      // Count verified vs total required
      const requiredCount = 2 // SPF + DKIM required
      const verifiedRequiredCount = (dnsStatus.spf.verified ? 1 : 0) + (dnsStatus.dkim.verified ? 1 : 0)
      const totalCount = 5 // All DNS records
      const verifiedTotalCount =
        (dnsStatus.spf.verified ? 1 : 0) +
        (dnsStatus.dkim.verified ? 1 : 0) +
        (dnsStatus.dmarc.verified ? 1 : 0) +
        (dnsStatus.mx.verified ? 1 : 0) +
        (dnsStatus.returnPath.verified ? 1 : 0)

      // Include DNS instructions so the wizard can display required records
      const dnsInstructions = await domainsService.getDnsInstructions(domainId)

      return reply.send({
        ok: true,
        data: {
          domain: domain.domain,
          authorityLevel: domain.authorityLevel,
          overall,
          progress,
          summary: {
            requiredVerified: verifiedRequiredCount,
            requiredTotal: requiredCount,
            optionalVerified: verifiedTotalCount - verifiedRequiredCount,
            optionalTotal: totalCount - requiredCount,
            percentComplete: Math.round((verifiedRequiredCount / requiredCount) * 100),
          },
          dnsInstructions,
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
  // GET /v1/inhouse/projects/:projectId/email-domains/:domainId - Get email domain
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const domain = await domainsService.getDomain(domainId)

      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      // Get DNS instructions
      const dnsInstructions = await domainsService.getDnsInstructions(domainId)

      return reply.send({
        ok: true,
        data: {
          domain,
          dnsInstructions,
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
  // POST /v1/inhouse/projects/:projectId/email-domains/:domainId/verify
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/verify', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)

      // Check domain exists
      const existingDomain = await domainsService.getDomain(domainId)
      if (!existingDomain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      // Run verification
      const result = await domainsService.verifyDomain(domainId)

      return reply.send({
        ok: true,
        data: {
          domain: result.domain,
          verification: result.verification,
          readyForSending: result.readyForSending,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

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
  // DELETE /v1/inhouse/projects/:projectId/email-domains/:domainId
  // ===========================================================================
  fastify.delete<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const deleted = await domainsService.deleteDomain(domainId)

      if (!deleted) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      return reply.code(204).send()
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
  // POST /v1/inhouse/projects/:projectId/email-domains/:domainId/subdomain-delegation
  // Initiate subdomain delegation (Path 1a) - returns NS records for user to add
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/subdomain-delegation', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const result = await domainsService.initiateSubdomainDelegation(domainId)

      return reply.send({
        ok: true,
        data: {
          domain: result.domain,
          nameServers: result.nameServers,
          instructions: result.instructions,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

      if (errorMessage.includes('CLOUDFLARE_NOT_CONFIGURED')) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'Cloudflare DNS integration is not configured',
          },
        })
      }

      if (errorMessage.includes('INVALID_AUTHORITY')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_AUTHORITY',
            message: 'Domain must have subdomain authority level for this operation',
          },
        })
      }

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
  // GET /v1/inhouse/projects/:projectId/email-domains/:domainId/subdomain-delegation/status
  // Check subdomain delegation status
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/subdomain-delegation/status', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const status = await domainsService.checkSubdomainDelegation(domainId)

      return reply.send({
        ok: true,
        data: status,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

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
  // POST /v1/inhouse/projects/:projectId/email-domains/:domainId/subdomain-delegation/provision
  // Provision email DNS records after delegation is complete
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/subdomain-delegation/provision', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      await domainsService.provisionSubdomainEmailRecords(domainId)

      return reply.send({
        ok: true,
        data: { message: 'Email DNS records provisioned successfully' },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

      if (errorMessage.includes('ZONE_NOT_ACTIVE')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'ZONE_NOT_ACTIVE',
            message: 'Cloudflare zone is not active. Please complete NS delegation first.',
          },
        })
      }

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
  // GET /v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch/preview
  // Preview nameserver switch - scan existing records before committing
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch/preview', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const preview = await domainsService.previewNameserverSwitch(domainId)

      return reply.send({
        ok: true,
        data: preview,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

      if (errorMessage.includes('CLOUDFLARE_NOT_CONFIGURED')) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'Cloudflare DNS integration is not configured',
          },
        })
      }

      if (errorMessage.includes('INVALID_AUTHORITY')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_AUTHORITY',
            message: 'Domain must have nameservers authority level for this operation',
          },
        })
      }

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
  // POST /v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch
  // Initiate nameserver switch (Path 1b) - returns NS records for full domain
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const result = await domainsService.initiateNameserverSwitch(domainId)

      return reply.send({
        ok: true,
        data: {
          domain: result.domain,
          nameServers: result.nameServers,
          existingRecords: result.existingRecords,
          instructions: result.instructions,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

      if (errorMessage.includes('CLOUDFLARE_NOT_CONFIGURED')) {
        return reply.code(501).send({
          ok: false,
          error: {
            code: 'NOT_IMPLEMENTED',
            message: 'Cloudflare DNS integration is not configured',
          },
        })
      }

      if (errorMessage.includes('INVALID_AUTHORITY')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_AUTHORITY',
            message: 'Domain must have nameservers authority level for this operation',
          },
        })
      }

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
  // GET /v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch/status
  // Check nameserver switch status
  // ===========================================================================
  fastify.get<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch/status', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const status = await domainsService.checkNameserverSwitch(domainId)

      return reply.send({
        ok: true,
        data: status,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

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
  // POST /v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch/provision
  // Provision email DNS records after nameserver switch is complete
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/nameserver-switch/provision', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      await domainsService.provisionNameserverEmailRecords(domainId)

      return reply.send({
        ok: true,
        data: { message: 'Email DNS records provisioned successfully' },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

      if (errorMessage.includes('ZONE_NOT_ACTIVE')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'ZONE_NOT_ACTIVE',
            message: 'Cloudflare zone is not active. Please complete nameserver switch first.',
          },
        })
      }

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
  // POST /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token
  // Connect a user-provided Cloudflare API token to a domain
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { apiToken: string; userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { apiToken, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    if (!apiToken || typeof apiToken !== 'string') {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'apiToken is required',
        },
      })
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)

      const domain = await domainsService.getDomain(domainId)
      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      const result = await domainsService.connectCloudflareToken(domainId, apiToken)

      return reply.send({
        ok: true,
        data: {
          zoneId: result.zoneId,
          zoneName: result.zoneName,
          message: 'Cloudflare token connected successfully',
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

      if (errorMessage.includes('INVALID_TOKEN')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Cloudflare API token is invalid or inactive',
          },
        })
      }

      if (errorMessage.includes('ZONE_NOT_FOUND')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'ZONE_NOT_FOUND',
            message: 'No Cloudflare zone found for this domain. Ensure the token has Zone:Read permission.',
          },
        })
      }

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
  // POST /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token/provision
  // Provision email DNS records using the stored Cloudflare token
  // ===========================================================================
  fastify.post<{
    Params: { projectId: string; domainId: string }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token/provision', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)

      const domain = await domainsService.getDomain(domainId)
      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      await domainsService.provisionCfTokenEmailRecords(domainId)

      return reply.send({
        ok: true,
        data: { message: 'Email DNS records provisioned and verified successfully' },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

      if (errorMessage.includes('NO_CF_TOKEN')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'NO_CF_TOKEN',
            message: 'No Cloudflare token configured for this domain. Connect a token first.',
          },
        })
      }

      if (errorMessage.includes('INVALID_AUTHORITY')) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'INVALID_AUTHORITY',
            message: 'Domain must have cf_token authority level to provision via token',
          },
        })
      }

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
  // DELETE /v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token
  // Disconnect a Cloudflare token from a domain
  // ===========================================================================
  fastify.delete<{
    Params: { projectId: string; domainId: string }
    Querystring: { userId?: string; removeRecords?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/cloudflare-token', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { userId, removeRecords } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)

      const domain = await domainsService.getDomain(domainId)
      if (!domain) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: `Email domain not found: ${domainId}`,
          },
        })
      }

      await domainsService.disconnectCloudflareToken(domainId, removeRecords === 'true')

      return reply.code(204).send()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

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
  // PUT /v1/inhouse/projects/:projectId/email-domains/:domainId/authority-level
  // ===========================================================================
  fastify.put<{
    Params: { projectId: string; domainId: string }
    Body: { newAuthorityLevel: string; userId?: string }
  }>('/v1/inhouse/projects/:projectId/email-domains/:domainId/authority-level', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { projectId, domainId } = request.params
    const { newAuthorityLevel, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    // Validate authority level
    const validLevels = ['manual', 'subdomain', 'nameservers', 'cf_token']
    if (!newAuthorityLevel || !validLevels.includes(newAuthorityLevel)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_AUTHORITY_LEVEL',
          message: `newAuthorityLevel must be one of: ${validLevels.join(', ')}`,
        },
      })
    }

    try {
      const domainsService = getInhouseDomainsService(projectId)
      const result = await domainsService.changeAuthorityLevel(
        domainId,
        newAuthorityLevel as 'manual' | 'subdomain' | 'nameservers' | 'cf_token'
      )

      return reply.code(200).send({
        ok: true,
        data: {
          domain: result.domain,
          previousAuthorityLevel: result.previousAuthorityLevel,
          dnsInstructions: result.dnsInstructions,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      if (errorMessage.includes('NOT_FOUND')) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: errorMessage.replace('NOT_FOUND: ', ''),
          },
        })
      }

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
