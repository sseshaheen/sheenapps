/**
 * Inhouse Edge Functions Routes
 *
 * API routes for @sheenapps/edge-functions SDK
 * Manages serverless function deployments to Cloudflare Workers for Platforms.
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { InhouseEdgeFunctionService, DeployInput, UpdateInput, InvokeInput, FunctionStatus } from '../services/inhouse/InhouseEdgeFunctionService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import { assertProjectAccess } from '../utils/projectAuth'

// ============================================================================
// Types
// ============================================================================

interface ProjectParams {
  projectId: string
}

interface FunctionParams extends ProjectParams {
  name: string
}

interface DeployBody {
  name: string
  code: string
  routes?: string[]
  schedule?: string | null
  env?: Record<string, string>
  userId?: string
}

interface UpdateBody {
  code?: string
  routes?: string[]
  schedule?: string | null
  env?: Record<string, string>
  userId?: string
}

interface RollbackBody {
  version: number
  userId?: string
}

interface InvokeBody {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  path?: string
  headers?: Record<string, string>
  body?: unknown
  userId?: string
}

interface ListFunctionsQuery {
  status?: string
  limit?: string
  offset?: string
  userId?: string
}

interface ListVersionsQuery {
  limit?: string
  offset?: string
  userId?: string
}

interface ListLogsQuery {
  version?: string
  requestId?: string
  status?: string
  limit?: string
  offset?: string
  orderDir?: 'asc' | 'desc'
  userId?: string
}

// ============================================================================
// Service Instance
// ============================================================================

let serviceInstance: InhouseEdgeFunctionService | null = null

function getService(): InhouseEdgeFunctionService {
  if (!serviceInstance) {
    serviceInstance = new InhouseEdgeFunctionService()
  }
  return serviceInstance
}

// ============================================================================
// Routes
// ============================================================================

export async function inhouseEdgeFunctionsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  // --------------------------------------------------------------------------
  // Deploy (Create or Update) Edge Function
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/edge-functions
   *
   * Deploy a new edge function or update an existing one.
   * Requires project_id in body since this creates the function.
   */
  fastify.post<{
    Body: DeployBody & { project_id: string }
  }>('/v1/inhouse/edge-functions', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { project_id: projectId, name, code, routes, schedule, env, userId } = request.body

    if (!projectId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'project_id is required' }
      })
    }

    // Require userId for mutating operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId is required for deploy operations' }
      })
    }

    // Verify user has access to this project
    await assertProjectAccess(projectId, userId)

    try {
      const service = getService()
      const result = await service.deploy({
        projectId,
        name,
        code,
        routes,
        schedule,
        env,
        deployedBy: userId
      })

      if (result.error) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'DEPLOYMENT_FAILED', message: result.error }
        })
      }

      // Log activity
      logActivity({
        projectId,
        service: 'edge-functions',
        action: 'deploy',
        status: 'success',
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        resourceType: 'edge_function',
        resourceId: result.result!.function.id,
        metadata: { name, version: result.result!.version.version }
      })

      return reply.code(201).send({
        ok: true,
        data: result.result
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name }, 'Failed to deploy edge function')

      logActivity({
        projectId,
        service: 'edge-functions',
        action: 'deploy',
        status: 'error',
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        resourceType: 'edge_function',
        metadata: { name, error: err.message }
      })

      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // List Edge Functions
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/edge-functions
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: ListFunctionsQuery
  }>('/v1/inhouse/projects/:projectId/edge-functions', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { status, limit, offset, userId } = request.query

    // Verify user has access to this project if userId provided
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getService()

      let statusFilter: FunctionStatus | FunctionStatus[] | undefined
      if (status) {
        statusFilter = status.split(',') as FunctionStatus[]
        if (statusFilter.length === 1) statusFilter = statusFilter[0]
      }

      const result = await service.list(projectId, {
        status: statusFilter,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined
      })

      return reply.code(200).send({
        ok: true,
        data: result
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId }, 'Failed to list edge functions')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // Get Edge Function Details
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/edge-functions/:name
   */
  fastify.get<{
    Params: FunctionParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/edge-functions/:name', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, name } = request.params
    const { userId } = request.query

    // Verify user has access to this project if userId provided
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getService()
      const fn = await service.get(projectId, name)

      if (!fn) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Function not found' }
        })
      }

      return reply.code(200).send({
        ok: true,
        data: fn
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name }, 'Failed to get edge function')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // Update Edge Function
  // --------------------------------------------------------------------------

  /**
   * PUT /v1/inhouse/projects/:projectId/edge-functions/:name
   */
  fastify.put<{
    Params: FunctionParams
    Body: UpdateBody
  }>('/v1/inhouse/projects/:projectId/edge-functions/:name', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, name } = request.params
    const { code, routes, schedule, env, userId } = request.body

    // Require userId for mutating operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId is required for update operations' }
      })
    }

    // Verify user has access to this project
    await assertProjectAccess(projectId, userId)

    try {
      const service = getService()
      const result = await service.update(projectId, name, {
        code,
        routes,
        schedule,
        env,
        deployedBy: userId
      })

      if (result.error) {
        const statusCode = result.error === 'Function not found' ? 404 : 400
        return reply.code(statusCode).send({
          ok: false,
          error: { code: result.error === 'Function not found' ? 'NOT_FOUND' : 'UPDATE_FAILED', message: result.error }
        })
      }

      logActivity({
        projectId,
        service: 'edge-functions',
        action: 'update',
        status: 'success',
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        resourceType: 'edge_function',
        resourceId: result.result!.function.id,
        metadata: { name, newVersion: result.result!.version?.version }
      })

      return reply.code(200).send({
        ok: true,
        data: result.result
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name }, 'Failed to update edge function')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // Delete Edge Function
  // --------------------------------------------------------------------------

  /**
   * DELETE /v1/inhouse/projects/:projectId/edge-functions/:name
   */
  fastify.delete<{
    Params: FunctionParams
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/edge-functions/:name', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, name } = request.params
    const userId = request.body?.userId

    // Require userId for mutating operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId is required for delete operations' }
      })
    }

    // Verify user has access to this project
    await assertProjectAccess(projectId, userId)

    try {
      const service = getService()
      const result = await service.delete(projectId, name)

      if (result.error) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: result.error }
        })
      }

      logActivity({
        projectId,
        service: 'edge-functions',
        action: 'delete',
        status: 'success',
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        resourceType: 'edge_function',
        metadata: { name }
      })

      return reply.code(200).send({
        ok: true,
        data: { deleted: true, name }
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name }, 'Failed to delete edge function')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // List Versions
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/edge-functions/:name/versions
   */
  fastify.get<{
    Params: FunctionParams
    Querystring: ListVersionsQuery
  }>('/v1/inhouse/projects/:projectId/edge-functions/:name/versions', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, name } = request.params
    const { limit, offset, userId } = request.query

    // Verify user has access to this project if userId provided
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getService()
      const result = await service.listVersions(projectId, name, {
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined
      })

      if (!result) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Function not found' }
        })
      }

      return reply.code(200).send({
        ok: true,
        data: result
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name }, 'Failed to list versions')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // Rollback
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/projects/:projectId/edge-functions/:name/rollback
   */
  fastify.post<{
    Params: FunctionParams
    Body: RollbackBody
  }>('/v1/inhouse/projects/:projectId/edge-functions/:name/rollback', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, name } = request.params
    const { version, userId } = request.body

    if (typeof version !== 'number' || version < 1) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'version must be a positive integer' }
      })
    }

    // Require userId for mutating operations
    if (!userId) {
      return reply.code(400).send({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId is required for rollback operations' }
      })
    }

    // Verify user has access to this project
    await assertProjectAccess(projectId, userId)

    try {
      const service = getService()
      const result = await service.rollback(projectId, name, version, userId)

      if (result.error) {
        const statusCode = result.error.includes('not found') ? 404 : 400
        return reply.code(statusCode).send({
          ok: false,
          error: { code: 'ROLLBACK_FAILED', message: result.error }
        })
      }

      logActivity({
        projectId,
        service: 'edge-functions',
        action: 'rollback',
        status: 'success',
        actorType: userId ? 'user' : 'system',
        actorId: userId,
        resourceType: 'edge_function',
        resourceId: result.result!.function.id,
        metadata: {
          name,
          targetVersion: version,
          previousVersion: result.result!.previousVersion,
          newVersion: result.result!.version.version
        }
      })

      return reply.code(200).send({
        ok: true,
        data: result.result
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name, version }, 'Failed to rollback edge function')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // Get Logs
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/edge-functions/:name/logs
   */
  fastify.get<{
    Params: FunctionParams
    Querystring: ListLogsQuery
  }>('/v1/inhouse/projects/:projectId/edge-functions/:name/logs', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, name } = request.params
    const { version, limit, offset, orderDir, userId } = request.query

    // Verify user has access to this project if userId provided
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getService()
      const result = await service.getLogs(projectId, name, {
        version: version ? parseInt(version, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
        orderDir
      })

      if (!result) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Function not found' }
        })
      }

      return reply.code(200).send({
        ok: true,
        data: result
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name }, 'Failed to get logs')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })

  // --------------------------------------------------------------------------
  // Invoke (Test)
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/projects/:projectId/edge-functions/:name/invoke
   */
  fastify.post<{
    Params: FunctionParams
    Body: InvokeBody
  }>('/v1/inhouse/projects/:projectId/edge-functions/:name/invoke', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, name } = request.params
    const { method, path, headers, body, userId } = request.body ?? {}

    // Verify user has access to this project if userId provided
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    try {
      const service = getService()
      const result = await service.invoke(projectId, name, {
        method,
        path,
        headers,
        body
      })

      if (result.error) {
        const statusCode = result.error === 'Function not found' ? 404 : 400
        return reply.code(statusCode).send({
          ok: false,
          error: { code: 'INVOKE_FAILED', message: result.error }
        })
      }

      return reply.code(200).send({
        ok: true,
        data: result.result
      })
    } catch (error) {
      const err = error as Error
      fastify.log.error({ err, projectId, name }, 'Failed to invoke edge function')
      return reply.code(500).send({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: err.message }
      })
    }
  })
}

export default inhouseEdgeFunctionsRoutes
