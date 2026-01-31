/**
 * Inhouse Connectors Routes
 *
 * Routes for third-party service connections via @sheenapps/connectors SDK.
 * Provides OAuth flows, connection management, and connector API calls.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import {
  getInhouseConnectorService,
  ConnectorType,
  ConnectorCategory,
  ConnectorAuthType,
  ConnectionStatus,
} from '../services/inhouse/InhouseConnectorService'

// ============================================================================
// Types
// ============================================================================

interface ProjectParams {
  projectId: string
}

interface ConnectionParams extends ProjectParams {
  connectionId: string
}

// ============================================================================
// Route Registration
// ============================================================================

export default async function inhouseConnectorsRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  // --------------------------------------------------------------------------
  // Registry Routes
  // --------------------------------------------------------------------------

  /**
   * List available connectors
   * GET /v1/inhouse/projects/:projectId/connectors/available
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: {
      category?: ConnectorCategory
      authType?: ConnectorAuthType
    }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/available',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { category, authType } = request.query

      const service = getInhouseConnectorService(projectId)
      const connectors = service.listAvailableConnectors({ category, authType })

      return reply.send({
        data: connectors,
      })
    }
  )

  /**
   * Get connector definition
   * GET /v1/inhouse/projects/:projectId/connectors/available/:type
   */
  fastify.get<{
    Params: ProjectParams & { type: ConnectorType }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/available/:type',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, type } = request.params

      const service = getInhouseConnectorService(projectId)
      const definition = service.getConnectorDefinition(type)

      if (!definition) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: `Connector not found: ${type}` },
        })
      }

      return reply.send({ data: definition })
    }
  )

  // --------------------------------------------------------------------------
  // OAuth Routes
  // --------------------------------------------------------------------------

  /**
   * Initiate OAuth flow
   * POST /v1/inhouse/projects/:projectId/connectors/oauth/initiate
   */
  fastify.post<{
    Params: ProjectParams
    Body: {
      connector: ConnectorType
      redirectUri: string
      scopes?: string[]
      stateData?: Record<string, unknown>
    }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/oauth/initiate',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { connector, redirectUri, scopes, stateData } = request.body

      if (!connector || !redirectUri) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'connector and redirectUri are required' },
        })
      }

      try {
        const service = getInhouseConnectorService(projectId)
        const result = await service.createOAuthState({
          connector,
          redirectUri,
          scopes,
          stateData,
        })

        await logActivity({
          projectId,
          action: 'oauth_initiated',
          service: 'connectors',
          metadata: { connector },
        })

        return reply.send({ data: result })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to initiate OAuth'
        return reply.status(400).send({
          error: { code: 'OAUTH_FAILED', message },
        })
      }
    }
  )

  /**
   * Exchange OAuth code
   * POST /v1/inhouse/projects/:projectId/connectors/oauth/exchange
   */
  fastify.post<{
    Params: ProjectParams
    Body: {
      code: string
      state: string
      displayName?: string
    }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/oauth/exchange',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { code, state, displayName } = request.body

      if (!code || !state) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'code and state are required' },
        })
      }

      try {
        const service = getInhouseConnectorService(projectId)
        const connection = await service.exchangeOAuthCode({
          code,
          state,
          displayName,
        })

        await logActivity({
          projectId,
          action: 'connection_created',
          service: 'connectors',
          resourceType: 'connection',
          resourceId: connection.id,
          metadata: { connector: connection.type, method: 'oauth' },
        })

        return reply.status(201).send({ data: connection })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to exchange OAuth code'
        return reply.status(400).send({
          error: { code: 'OAUTH_FAILED', message },
        })
      }
    }
  )

  // --------------------------------------------------------------------------
  // Connection Routes
  // --------------------------------------------------------------------------

  /**
   * List connections
   * GET /v1/inhouse/projects/:projectId/connectors/connections
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: {
      type?: ConnectorType
      status?: ConnectionStatus
      limit?: string
      cursor?: string
    }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { type, status, limit, cursor } = request.query

      const service = getInhouseConnectorService(projectId)
      const result = await service.listConnections({
        type,
        status,
        limit: limit ? parseInt(limit, 10) : undefined,
        cursor,
      })

      return reply.send({ data: result })
    }
  )

  /**
   * Get connection details
   * GET /v1/inhouse/projects/:projectId/connectors/connections/:connectionId
   */
  fastify.get<{
    Params: ConnectionParams
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections/:connectionId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, connectionId } = request.params

      const service = getInhouseConnectorService(projectId)
      const connection = await service.getConnection(connectionId)

      if (!connection) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Connection not found' },
        })
      }

      return reply.send({ data: connection })
    }
  )

  /**
   * Create API key connection
   * POST /v1/inhouse/projects/:projectId/connectors/connections
   */
  fastify.post<{
    Params: ProjectParams
    Body: {
      connector: ConnectorType
      apiKey: string
      displayName?: string
      metadata?: Record<string, unknown>
    }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId } = request.params
      const { connector, apiKey, displayName, metadata } = request.body

      if (!connector || !apiKey) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'connector and apiKey are required' },
        })
      }

      try {
        const service = getInhouseConnectorService(projectId)
        const connection = await service.createApiKeyConnection({
          connector,
          apiKey,
          displayName,
          metadata,
        })

        await logActivity({
          projectId,
          action: 'connection_created',
          service: 'connectors',
          resourceType: 'connection',
          resourceId: connection.id,
          metadata: { connector, method: 'api_key' },
        })

        return reply.status(201).send({ data: connection })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create connection'
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message },
        })
      }
    }
  )

  /**
   * Update connection
   * PUT /v1/inhouse/projects/:projectId/connectors/connections/:connectionId
   */
  fastify.put<{
    Params: ConnectionParams
    Body: {
      displayName?: string
      metadata?: Record<string, unknown>
    }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections/:connectionId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, connectionId } = request.params
      const { displayName, metadata } = request.body

      const service = getInhouseConnectorService(projectId)
      const connection = await service.updateConnection(connectionId, { displayName, metadata })

      if (!connection) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Connection not found' },
        })
      }

      await logActivity({
        projectId,
        action: 'connection_updated',
        service: 'connectors',
        resourceType: 'connection',
        resourceId: connectionId,
      })

      return reply.send({ data: connection })
    }
  )

  /**
   * Delete connection
   * DELETE /v1/inhouse/projects/:projectId/connectors/connections/:connectionId
   */
  fastify.delete<{
    Params: ConnectionParams
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections/:connectionId',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, connectionId } = request.params

      const service = getInhouseConnectorService(projectId)
      const deleted = await service.deleteConnection(connectionId)

      if (!deleted) {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Connection not found' },
        })
      }

      await logActivity({
        projectId,
        action: 'connection_deleted',
        service: 'connectors',
        resourceType: 'connection',
        resourceId: connectionId,
      })

      return reply.status(204).send()
    }
  )

  /**
   * Test connection health
   * POST /v1/inhouse/projects/:projectId/connectors/connections/:connectionId/test
   */
  fastify.post<{
    Params: ConnectionParams
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections/:connectionId/test',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, connectionId } = request.params

      const service = getInhouseConnectorService(projectId)
      const result = await service.testConnection(connectionId)

      return reply.send({ data: result })
    }
  )

  /**
   * Refresh connection tokens
   * POST /v1/inhouse/projects/:projectId/connectors/connections/:connectionId/refresh
   */
  fastify.post<{
    Params: ConnectionParams
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections/:connectionId/refresh',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, connectionId } = request.params

      try {
        const service = getInhouseConnectorService(projectId)
        const connection = await service.refreshConnection(connectionId)

        if (!connection) {
          return reply.status(404).send({
            error: { code: 'NOT_FOUND', message: 'Connection not found' },
          })
        }

        await logActivity({
          projectId,
          action: 'connection_refreshed',
          service: 'connectors',
          resourceType: 'connection',
          resourceId: connectionId,
        })

        return reply.send({ data: connection })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to refresh connection'
        return reply.status(400).send({
          error: { code: 'TOKEN_REFRESH_FAILED', message },
        })
      }
    }
  )

  // --------------------------------------------------------------------------
  // API Call Routes
  // --------------------------------------------------------------------------

  /**
   * Call connector method
   * POST /v1/inhouse/projects/:projectId/connectors/connections/:connectionId/call
   */
  fastify.post<{
    Params: ConnectionParams
    Body: {
      method: string
      params?: Record<string, unknown>
      options?: {
        idempotencyKey?: string
        timeout?: number
      }
    }
  }>(
    '/v1/inhouse/projects/:projectId/connectors/connections/:connectionId/call',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, connectionId } = request.params
      const { method, params, options } = request.body

      if (!method) {
        return reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'method is required' },
        })
      }

      try {
        const service = getInhouseConnectorService(projectId)
        const result = await service.call(connectionId, { method, params, options })

        await logActivity({
          projectId,
          action: 'connector_call',
          service: 'connectors',
          resourceType: 'connection',
          resourceId: connectionId,
          metadata: { method },
        })

        return reply.send({ data: result })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connector call failed'
        return reply.status(400).send({
          error: { code: 'CONNECTOR_ERROR', message },
        })
      }
    }
  )
}
