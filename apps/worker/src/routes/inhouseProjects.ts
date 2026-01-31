/**
 * In-House Project Routes
 *
 * HTTP endpoints for managing Easy Mode projects.
 *
 * Routes:
 * - POST   /v1/inhouse/projects          - Create a new Easy Mode project
 * - GET    /v1/inhouse/projects          - List user's Easy Mode projects
 * - GET    /v1/inhouse/projects/:id      - Get project details
 * - GET    /v1/inhouse/projects/:id/status - Canonical infrastructure status
 * - POST   /v1/inhouse/projects/:id/tables - Create a table in project
 * - POST   /v1/inhouse/projects/:id/keys - Generate new API key
 * - POST   /v1/inhouse/projects/:id/keys/:type/regenerate - Regenerate API key with rotation
 * - DELETE /v1/inhouse/projects/:id/keys/:prefix - Revoke API key
 * - GET    /v1/inhouse/projects/:id/quota - Get quota status
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getInhouseProjectService } from '../services/inhouse/InhouseProjectService'
import { getInhouseDeploymentService } from '../services/inhouse'
import { assertProjectAccess } from '../utils/projectAuth'
import { pool } from '../services/database'
import { getBusinessEventsService } from '../services/businessEventsService'
import {
  CreateProjectRequestSchema,
  CreateTableRequestSchema,
  ListProjectsQuerySchema,
  type CreateProjectRequest,
  type CreateTableRequest,
  type ListProjectsQuery,
} from '@sheenapps/api-contracts'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface GenerateKeyBody {
  type?: 'public' | 'server'
  name?: string
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export async function inhouseProjectRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()
  const projectService = getInhouseProjectService()

  // ===========================================================================
  // POST /v1/inhouse/projects - Create a new Easy Mode project
  // ===========================================================================
  fastify.post<{
    Body: CreateProjectRequest
  }>('/v1/inhouse/projects', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const parsed = CreateProjectRequestSchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map(i => i.message).join('; '),
        },
      })
    }

    const { userId, name, framework, subdomain, template, currencyCode } = parsed.data

    try {
      const project = await projectService.createProject({
        name,
        ownerId: userId,
        ...(framework ? { framework } : {}),
        ...(subdomain ? { subdomain } : {}),
        ...(template ? { template } : {}),
        ...(currencyCode ? { currencyCode } : {}),
      })

      // Funnel: project_created
      try {
        await getBusinessEventsService().insertEvent({
          projectId: project.id,
          eventType: 'project_created',
          occurredAt: new Date().toISOString(),
          source: 'server',
          payload: {
            infraMode: 'easy',
            framework: framework || 'nextjs',
            hasTemplate: !!template,
            templateId: template?.id,
          },
          idempotencyKey: `project-created:${project.id}`,
          actorId: userId,
          actorType: 'user',
        })
      } catch (_) { /* non-critical */ }

      return reply.code(201).send({
        ok: true,
        data: {
          projectId: project.id,
          name: project.name,
          subdomain: project.subdomain,
          schemaName: project.schemaName,
          previewUrl: project.previewUrl,
          apiKey: {
            // Return full key only on creation
            publicKey: project.apiKey.publicKey,
            keyPrefix: project.apiKey.keyPrefix,
          },
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'CREATE_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects - List user's Easy Mode projects
  // ===========================================================================
  fastify.get<{
    Querystring: ListProjectsQuery
  }>('/v1/inhouse/projects', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const parsed = ListProjectsQuerySchema.safeParse(request.query)

    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map(i => i.message).join('; '),
        },
      })
    }

    const { userId } = parsed.data

    try {
      const projects = await projectService.listProjects(userId)

      return reply.send({
        ok: true,
        data: projects,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'LIST_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:id - Get project details
  // ===========================================================================
  fastify.get<{
    Params: { id: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:id', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(id, userId)
    }

    try {
      const project = await projectService.getProject(id)

      if (!project) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found or is not an Easy Mode project',
          },
        })
      }

      return reply.send({
        ok: true,
        data: project,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'FETCH_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:id/status - Canonical infrastructure status
  // Single endpoint the UI polls for all project state.
  // ===========================================================================
  fastify.get<{
    Params: { id: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:id/status', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id: projectId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const deploymentService = getInhouseDeploymentService()

      if (!pool) {
        return reply.code(503).send({
          ok: false,
          error: { code: 'INTERNAL_ERROR', message: 'Database not configured' },
        })
      }

      // Run all queries in parallel for performance
      const [project, quota, deploymentHistory, schemaRow, serverKeyRow, projectRow] = await Promise.all([
        projectService.getProject(projectId),
        projectService.getQuotaStatus(projectId),
        deploymentService.getDeploymentHistory(projectId, { limit: 1 }),
        pool.query(
          `SELECT table_count FROM inhouse_project_schemas WHERE project_id = $1`,
          [projectId]
        ),
        pool.query(
          `SELECT COUNT(*) > 0 AS has_server_key
           FROM inhouse_api_keys
           WHERE project_id = $1
             AND key_type = 'server'
             AND status = 'active'
             AND (expires_at IS NULL OR expires_at > NOW())`,
          [projectId]
        ),
        pool.query(
          `SELECT inhouse_build_id, inhouse_deployed_at FROM projects WHERE id = $1`,
          [projectId]
        ),
      ])

      if (!project) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found or is not an Easy Mode project',
          },
        })
      }

      const tableCount = schemaRow.rows[0]?.table_count ?? 0
      const hasServerKey = serverKeyRow.rows[0]?.has_server_key ?? false
      const inhouseBuildId = projectRow.rows[0]?.inhouse_build_id ?? null
      const inhouseDeployedAt = projectRow.rows[0]?.inhouse_deployed_at ?? null

      // Determine database status
      const dbStorageUsedBytes = quota?.database?.used ?? 0
      const dbStorageLimitBytes = quota?.database?.limit ?? 0
      const dbStatus: 'provisioning' | 'active' | 'error' =
        project.schemaName ? 'active' : 'provisioning'

      // Determine hosting status from latest deployment
      const latestDeployment = deploymentHistory.deployments[0] ?? null
      let hostingStatus: 'none' | 'deploying' | 'live' | 'error' = 'none'
      let hostingError: string | undefined

      if (latestDeployment) {
        switch (latestDeployment.status) {
          case 'deployed':
            hostingStatus = 'live'
            break
          case 'uploading':
          case 'deploying':
            hostingStatus = 'deploying'
            break
          case 'failed':
            hostingStatus = 'error'
            hostingError = latestDeployment.errorMessage ?? undefined
            break
        }
      }

      // Quota: convert bytes to MB for frontend
      const bytesToMb = (bytes: number) => Math.round((bytes / (1024 * 1024)) * 100) / 100

      // Calculate requests reset time (midnight UTC)
      const now = new Date()
      const resetDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

      const status = {
        database: {
          status: dbStatus,
          schemaName: project.schemaName,
          tableCount,
          storageUsedMb: bytesToMb(dbStorageUsedBytes),
          storageQuotaMb: bytesToMb(dbStorageLimitBytes),
        },
        hosting: {
          status: hostingStatus,
          url: project.previewUrl || null,
          subdomain: project.subdomain,
          lastDeployedAt: inhouseDeployedAt ? new Date(inhouseDeployedAt).toISOString() : null,
          currentBuildId: inhouseBuildId,
          ...(hostingError ? { errorMessage: hostingError } : {}),
        },
        quotas: {
          requestsUsedToday: quota?.requests?.used ?? 0,
          requestsLimit: quota?.requests?.limit ?? 0,
          bandwidthUsedMb: bytesToMb(quota?.storage?.used ?? 0),
          bandwidthQuotaMb: bytesToMb(quota?.storage?.limit ?? 0),
          resetsAt: resetDate.toISOString(),
        },
        apiKeys: {
          publicKey: project.apiKey?.keyPrefix ?? '',
          hasServerKey,
        },
        tier: quota?.tier ?? 'free',
        updatedAt: new Date().toISOString(),
        hasDeployedOnce: !!inhouseDeployedAt,
      }

      return reply.send({
        ok: true,
        data: status,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'FETCH_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:id/tables - Create a table
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: CreateTableRequest
  }>('/v1/inhouse/projects/:id/tables', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id } = request.params

    const parsed = CreateTableRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.issues.map(i => i.message).join('; '),
        },
      })
    }

    const { tableName, columns, userId } = parsed.data

    // Authorize project access
    if (userId) {
      await assertProjectAccess(id, userId)
    }

    try {
      const result = await projectService.createTable({
        projectId: id,
        tableName,
        columns,
      })

      if (!result.success) {
        return reply.code(400).send({
          ok: false,
          error: {
            code: 'CREATE_TABLE_FAILED',
            message: result.error || 'Failed to create table',
          },
        })
      }

      return reply.code(201).send({
        ok: true,
        data: {
          tableName,
          columnsCreated: columns.length,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'CREATE_TABLE_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:id/keys - Generate new API key
  // ===========================================================================
  fastify.post<{
    Params: { id: string }
    Body: GenerateKeyBody & { userId?: string }
  }>('/v1/inhouse/projects/:id/keys', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id } = request.params
    const { type = 'public', name, userId } = request.body

    // Authorize project access
    if (userId) {
      await assertProjectAccess(id, userId)
    }

    try {
      const result = await projectService.generateNewApiKey(id, type, name)

      if (!result) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project not found or is not an Easy Mode project',
          },
        })
      }

      return reply.code(201).send({
        ok: true,
        data: {
          key: result.key, // Full key, only shown once
          prefix: result.prefix,
          type,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'KEY_GENERATION_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // DELETE /v1/inhouse/projects/:id/keys/:prefix - Revoke API key
  // ===========================================================================
  fastify.delete<{
    Params: { id: string; prefix: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:id/keys/:prefix', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id, prefix } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(id, userId)
    }

    try {
      const revoked = await projectService.revokeApiKey(id, prefix)

      if (!revoked) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'API key not found or already revoked',
          },
        })
      }

      return reply.send({
        ok: true,
        data: {
          revoked: true,
          prefix,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'REVOKE_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // POST /v1/inhouse/projects/:id/keys/:type/regenerate - Regenerate API key with rotation
  // INHOUSE_MODE_REMAINING.md Task 4: 15-minute grace period for old key
  // ===========================================================================
  fastify.post<{
    Params: { id: string; type: 'public' | 'server' }
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:id/keys/:type/regenerate', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id, type } = request.params
    const { userId } = request.body || {}

    // Validate key type
    if (type !== 'public' && type !== 'server') {
      return reply.code(400).send({
        ok: false,
        error: {
          code: 'INVALID_KEY_TYPE',
          message: 'Key type must be "public" or "server"',
        },
      })
    }

    // Authorize project access
    if (userId) {
      await assertProjectAccess(id, userId)
    }

    try {
      const result = await projectService.regenerateApiKey(id, type)

      return reply.code(201).send({
        ok: true,
        data: {
          newKey: result.newKey, // Full key, only shown once
          newKeyPrefix: result.newKeyPrefix,
          oldKeyExpiresAt: result.oldKeyExpiresAt.toISOString(),
          gracePeriodMinutes: 15,
          message: `New ${type} key created. Old key will continue working until ${result.oldKeyExpiresAt.toISOString()}.`,
        },
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      const isRateLimit = errorMessage.includes('Rate limit')

      return reply.code(isRateLimit ? 429 : 500).send({
        ok: false,
        error: {
          code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : 'REGENERATE_FAILED',
          message: errorMessage,
        },
      })
    }
  })

  // ===========================================================================
  // GET /v1/inhouse/projects/:id/quota - Get quota status
  // ===========================================================================
  fastify.get<{
    Params: { id: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:id/quota', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    const { id } = request.params
    const { userId } = request.query

    // Authorize project access
    if (userId) {
      await assertProjectAccess(id, userId)
    }

    try {
      const quota = await projectService.getQuotaStatus(id)

      if (!quota) {
        return reply.code(404).send({
          ok: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Project quota not found',
          },
        })
      }

      return reply.send({
        ok: true,
        data: quota,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return reply.code(500).send({
        ok: false,
        error: {
          code: 'FETCH_FAILED',
          message: errorMessage,
        },
      })
    }
  })
}
