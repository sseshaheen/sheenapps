/**
 * In-House Phase 3 Routes (Domains, Exports, Eject)
 *
 * HTTP endpoints for Phase 3 placeholders with real wiring.
 *
 * Security: userId is extracted from HMAC-verified request payload via requireSignedActor middleware.
 * The Next.js proxy authenticates users and includes authenticated userId in signed requests.
 */

import { randomUUID } from 'crypto'
import type { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { requireSignedActor } from '../middleware/requireSignedActor'
import { getDatabase } from '../services/database'
import { deleteHostnameMapping, getDispatchKvConfig, updateHostnameMapping } from '../services/dispatchKvService'
import { ExportJobsService } from '../services/exportJobsService'
import { ExportError, RateLimitExceededError } from '../types/projectExport'

interface DomainBody {
  domain: string
}

interface UserBody {
  reason?: string
}

const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z]{2,})+$/i
const MAX_DOMAIN_LENGTH = 253
let exportService: ExportJobsService | null = null

function isEnabled(value?: string): boolean {
  return value === 'true'
}

function getExportService(): ExportJobsService {
  if (!exportService) {
    exportService = new ExportJobsService(process.env.REDIS_URL)
  }
  return exportService
}

async function assertProjectOwnership(projectId: string, userId: string) {
  const db = getDatabase()
  const result = await db.query(
    `
      SELECT id, inhouse_subdomain, inhouse_custom_domain
      FROM projects
      WHERE id = $1 AND owner_id = $2 AND infra_mode = 'easy'
    `,
    [projectId, userId]
  )

  if (result.rows.length === 0) {
    const error = new Error('Project not found or access denied')
    ;(error as any).statusCode = 404
    throw error
  }

  return result.rows[0]
}

async function listCustomDomains(projectId: string) {
  try {
    const db = getDatabase()
    const result = await db.query(
      `
        SELECT domain, status, verification_status, ssl_status, updated_at
        FROM inhouse_custom_domains
        WHERE project_id = $1
        ORDER BY created_at DESC
      `,
      [projectId]
    )
    return result.rows
  } catch (error) {
    console.warn('[InhousePhase3] Unable to list custom domains:', error)
    return []
  }
}

export async function inhouseDomainsRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()
  const signedActorMiddleware = requireSignedActor()

  // ===========================================================================
  // GET /v1/inhouse/projects/:id/domains - List domains
  // ===========================================================================
  fastify.get<{
    Params: { id: string }
    Querystring: { userId: string }
  }>('/v1/inhouse/projects/:id/domains', {
    preHandler: [hmacMiddleware, signedActorMiddleware] as any,
  }, async (request, reply) => {
    const { id: projectId } = request.params
    const userId = (request as any).actorUserId as string

    try {
      const project = await assertProjectOwnership(projectId, userId)
      const customDomains = await listCustomDomains(projectId)

      const fallbackCustom = project.inhouse_custom_domain && customDomains.length === 0
        ? [{
            domain: project.inhouse_custom_domain,
            type: 'custom',
            status: 'pending',
            verificationStatus: 'pending',
            sslStatus: 'pending',
          }]
        : []

      return reply.send({
        ok: true,
        data: {
          domains: [
            ...(project.inhouse_subdomain ? [{
              domain: `${project.inhouse_subdomain}.sheenapps.com`,
              type: 'subdomain',
              status: 'active',
            }] : []),
            ...customDomains.map((domain: any) => ({
              domain: domain.domain,
              type: 'custom',
              status: domain.status,
              verificationStatus: domain.verification_status,
              sslStatus: domain.ssl_status,
              updatedAt: domain.updated_at,
            })),
            ...fallbackCustom,
          ],
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const statusCode = (error as any).statusCode || 500
      return reply.code(statusCode).send({
        ok: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'FETCH_FAILED',
          message,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:id/domains - Request custom domain
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: DomainBody
  }>('/v1/inhouse/projects/:id/domains', {
    preHandler: [hmacMiddleware, signedActorMiddleware] as any,
  }, async (request, reply) => {
    const { id: projectId } = request.params
    const userId = (request as any).actorUserId as string
    const { domain } = request.body || {}

    if (!domain) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'domain is required',
        },
      })
    }

    if (!isEnabled(process.env.INHOUSE_CUSTOM_DOMAINS_ENABLED)) {
      return reply.code(501).send({
        ok: false,
        error: {
          code: 'CUSTOM_DOMAINS_DISABLED',
          message: 'Custom domains are not enabled yet.',
        },
      })
    }

    const normalizedDomain = domain.trim().toLowerCase()
    if (normalizedDomain.length > MAX_DOMAIN_LENGTH || !DOMAIN_REGEX.test(normalizedDomain)) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_DOMAIN',
          message: 'Domain format is invalid.',
        },
      })
    }

    try {
      const project = await assertProjectOwnership(projectId, userId)

      const db = getDatabase()

      // Check if domain exists for a different project
      const existingDomain = await db.query(
        `SELECT project_id FROM inhouse_custom_domains WHERE domain = $1`,
        [normalizedDomain]
      )

      if (existingDomain.rows.length > 0 && existingDomain.rows[0].project_id !== projectId) {
        return reply.code(409).send({
          ok: false,
          error: {
            code: 'DOMAIN_IN_USE',
            message: 'This domain is already registered to another project.',
          },
        })
      }

      await db.query(
        `
          INSERT INTO inhouse_custom_domains (
            project_id,
            domain,
            status,
            verification_status,
            ssl_status,
            verification_method
          ) VALUES ($1, $2, 'pending', 'pending', 'pending', 'cname')
          ON CONFLICT (domain)
          DO UPDATE SET
            status = 'pending',
            verification_status = 'pending',
            ssl_status = 'pending',
            verification_method = 'cname',
            updated_at = NOW()
          WHERE inhouse_custom_domains.project_id = $1
        `,
        [projectId, normalizedDomain]
      )

      await db.query(
        `
          UPDATE projects
          SET inhouse_custom_domain = $1
          WHERE id = $2 AND owner_id = $3
        `,
        [normalizedDomain, projectId, userId]
      )

      try {
        const kvConfig = getDispatchKvConfig()
        await updateHostnameMapping(kvConfig, normalizedDomain, projectId)

        const previousDomain = project.inhouse_custom_domain?.trim().toLowerCase()
        if (previousDomain && previousDomain !== normalizedDomain) {
          await deleteHostnameMapping(kvConfig, previousDomain)
        }
      } catch (kvError) {
        console.warn('[InhousePhase3] KV mapping update failed:', kvError)
      }

      const cnameTarget = process.env.INHOUSE_CUSTOM_DOMAINS_CNAME_TARGET || 'custom.sheenapps.com'

      return reply.send({
        ok: true,
        data: {
          domain: normalizedDomain,
          status: 'pending',
          cnameTarget,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const statusCode = (error as any).statusCode || 500
      return reply.code(statusCode).send({
        ok: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'DOMAIN_REQUEST_FAILED',
          message,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:id/exports - Request export
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: UserBody
  }>('/v1/inhouse/projects/:id/exports', {
    preHandler: [hmacMiddleware, signedActorMiddleware] as any,
  }, async (request, reply) => {
    const { id: projectId } = request.params
    const userId = (request as any).actorUserId as string

    if (!isEnabled(process.env.INHOUSE_EXPORTS_ENABLED)) {
      return reply.code(501).send({
        ok: false,
        error: {
          code: 'EXPORTS_DISABLED',
          message: 'Exports are not enabled yet.',
        },
      })
    }

    if (!process.env.REDIS_URL || !process.env.DATABASE_URL) {
      return reply.code(503).send({
        ok: false,
        error: {
          code: 'EXPORTS_NOT_CONFIGURED',
          message: 'Export service is not configured.',
        },
      })
    }

    try {
      await assertProjectOwnership(projectId, userId)
      const job = await getExportService().createExportJob({
        projectId,
        userId,
        exportType: 'zip',
        rateLimitBucket: 'inhouse',
      })

      return reply.code(202).send({
        ok: true,
        data: {
          jobId: job.id,
          status: job.status,
        },
      })
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        return reply.code(429).send({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryAfter: error.retryAfter,
          },
        })
      }

      if (error instanceof ExportError) {
        return reply.code(error.statusCode).send({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
          },
        })
      }

      const message = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'EXPORT_FAILED',
          message,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:id/eject - Request eject to Pro Mode
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: UserBody
  }>('/v1/inhouse/projects/:id/eject', {
    preHandler: [hmacMiddleware, signedActorMiddleware] as any,
  }, async (request, reply) => {
    const { id: projectId } = request.params
    const userId = (request as any).actorUserId as string
    const { reason } = request.body || {}

    if (!isEnabled(process.env.INHOUSE_EJECT_ENABLED)) {
      return reply.code(501).send({
        ok: false,
        error: {
          code: 'EJECT_DISABLED',
          message: 'Eject flow is not enabled yet.',
        },
      })
    }

    try {
      await assertProjectOwnership(projectId, userId)

      const db = getDatabase()
      const requestId = randomUUID()
      await db.query(
        `
          INSERT INTO inhouse_eject_requests (
            id,
            project_id,
            user_id,
            status,
            reason,
            details
          ) VALUES ($1, $2, $3, 'queued', $4, $5)
        `,
        [
          requestId,
          projectId,
          userId,
          reason || null,
          JSON.stringify({ source: 'inhouse-phase3' })
        ]
      )

      return reply.send({
        ok: true,
        data: {
          requestId,
          status: 'queued',
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const statusCode = (error as any).statusCode || 500
      return reply.code(statusCode).send({
        ok: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'EJECT_FAILED',
          message,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:id/domains/:domain/verify - Placeholder verify
  // ===========================================================================
  fastify.post<{
    Params: { id: string; domain: string }
    Body: Record<string, never>
  }>('/v1/inhouse/projects/:id/domains/:domain/verify', {
    preHandler: [hmacMiddleware, signedActorMiddleware] as any,
  }, async (request, reply) => {
    const { id: projectId, domain } = request.params
    const userId = (request as any).actorUserId as string

    if (!isEnabled(process.env.INHOUSE_CUSTOM_DOMAINS_ENABLED)) {
      return reply.code(501).send({
        ok: false,
        error: {
          code: 'CUSTOM_DOMAINS_DISABLED',
          message: 'Custom domains are not enabled yet.',
        },
      })
    }

    try {
      await assertProjectOwnership(projectId, userId)
      const db = getDatabase()
      const normalizedDomain = domain.trim().toLowerCase()
      const cnameTarget = process.env.INHOUSE_CUSTOM_DOMAINS_CNAME_TARGET || 'custom.sheenapps.com'

      const result = await db.query(
        `
          SELECT id FROM inhouse_custom_domains
          WHERE project_id = $1 AND domain = $2
        `,
        [projectId, normalizedDomain]
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Domain not found for project',
          },
        })
      }

      await db.query(
        `
          UPDATE inhouse_custom_domains
          SET last_checked_at = NOW()
          WHERE project_id = $1 AND domain = $2
        `,
        [projectId, normalizedDomain]
      )

      return reply.send({
        ok: true,
        data: {
          domain: normalizedDomain,
          verificationStatus: 'pending',
          sslStatus: 'pending',
          requiredRecords: [
            { type: 'CNAME', name: normalizedDomain, value: cnameTarget },
          ],
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const statusCode = (error as any).statusCode || 500
      return reply.code(statusCode).send({
        ok: false,
        error: {
          code: statusCode === 404 ? 'NOT_FOUND' : 'VERIFY_FAILED',
          message,
        },
      })
    }
  })
}
