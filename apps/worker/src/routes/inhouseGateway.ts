/**
 * In-House API Gateway Routes
 *
 * HTTP endpoints for the In-House database gateway.
 * All Easy Mode user app database access goes through these routes.
 *
 * Routes:
 * - POST /v1/inhouse/db/query - Execute database queries
 * - GET  /v1/inhouse/db/schema - Get schema metadata
 * - GET  /v1/inhouse/db/health - Gateway health check
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import {
  InhouseGatewayService,
  validateApiKey,
  checkRateLimit,
  checkQuotas,
  executeQuery,
  getTableMetadata,
  canReadColumn,
} from '../services/inhouse/InhouseGatewayService'
import type {
  QueryContract,
  GatewayContext,
  QueryResponse,
} from '../types/inhouseGateway'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface QueryRequestBody {
  query: QueryContract
}

interface QueryParams {
  projectId?: string
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract API key from request headers
 * Supports both Authorization header and x-api-key header
 */
function extractApiKey(request: FastifyRequest): string | null {
  // Try Authorization header first (Bearer token)
  const authHeader = request.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Try x-api-key header
  const apiKeyHeader = request.headers['x-api-key']
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader
  }

  return null
}

/**
 * Build gateway context from validated API key
 */
function buildContext(
  validation: Awaited<ReturnType<typeof validateApiKey>>,
  request: FastifyRequest
): GatewayContext | null {
  if (!validation.valid || !validation.projectId || !validation.schemaName) {
    return null
  }

  const userAgent = request.headers['user-agent']
  return {
    projectId: validation.projectId,
    schemaName: validation.schemaName,
    apiKeyId: validation.keyId!,
    apiKeyType: validation.keyType!,
    scopes: validation.scopes!,
    clientIp: request.ip,
    ...(userAgent ? { userAgent } : {}),
  }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

// Query body size limit (256KB - query contracts should be small)
const QUERY_BODY_LIMIT_BYTES = 256 * 1024

export async function inhouseGatewayRoutes(fastify: FastifyInstance) {
  // ===========================================================================
  // POST /v1/inhouse/db/query - Execute database query
  // ===========================================================================
  fastify.post<{
    Body: QueryRequestBody
    Querystring: QueryParams
  }>('/v1/inhouse/db/query', {
    bodyLimit: QUERY_BODY_LIMIT_BYTES,
  }, async (request, reply) => {
    const startTime = Date.now()

    // 1. Extract and validate API key
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return reply.code(401).send({
        data: null,
        error: {
          code: 'INVALID_API_KEY',
          message: 'Missing API key',
          hint: 'Include your API key in the Authorization header (Bearer token) or x-api-key header',
        },
        status: 401,
      })
    }

    const validation = await validateApiKey(apiKey)
    if (!validation.valid) {
      return reply.code(401).send({
        data: null,
        error: {
          code: 'INVALID_API_KEY',
          message: validation.error || 'Invalid API key',
        },
        status: 401,
      })
    }

    const ctx = buildContext(validation, request)
    if (!ctx) {
      return reply.code(500).send({
        data: null,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to build gateway context',
        },
        status: 500,
      })
    }

    // 2. Check rate limits
    const rateLimit = await checkRateLimit(ctx.projectId)
    reply.header('X-RateLimit-Remaining', rateLimit.remaining)
    reply.header('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000))

    if (!rateLimit.allowed) {
      reply.header('Retry-After', rateLimit.retryAfter)
      return reply.code(429).send({
        data: null,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          hint: `Retry after ${rateLimit.retryAfter} seconds`,
        },
        status: 429,
      })
    }

    // 3. Check quotas
    const quotaCheck = await checkQuotas(ctx.projectId)
    if (!quotaCheck.withinLimits && quotaCheck.violations.length > 0) {
      // Return all violations for better debugging (not just the first)
      const violations = quotaCheck.violations.map(v => ({
        type: v.type,
        used: v.used,
        limit: v.limit,
        percentUsed: v.percentUsed,
      }))

      // Use first violation for primary error code
      const primary = quotaCheck.violations[0]!
      const quotaErrorCodes: Record<string, string> = {
        requests: 'REQUEST_QUOTA_EXCEEDED',
        database: 'DATABASE_QUOTA_EXCEEDED',
        storage: 'STORAGE_QUOTA_EXCEEDED',
        bandwidth: 'BANDWIDTH_QUOTA_EXCEEDED',
        builds: 'BUILD_QUOTA_EXCEEDED',
      }
      const errorCode = violations.length > 1
        ? 'MULTIPLE_QUOTAS_EXCEEDED'
        : quotaErrorCodes[primary.type] || `${primary.type.toUpperCase()}_QUOTA_EXCEEDED`

      return reply.code(429).send({
        data: null,
        error: {
          code: errorCode,
          message: violations.length > 1
            ? `${violations.length} quotas exceeded`
            : `${primary.type} quota exceeded`,
          violations,
          hint: 'Upgrade your plan or wait for quota reset',
        },
        status: 429,
      })
    }

    // 4. Validate request body
    const { query } = request.body || {}
    if (!query || !query.operation || !query.table) {
      return reply.code(400).send({
        data: null,
        error: {
          code: 'INVALID_QUERY',
          message: 'Invalid query format',
          hint: 'Query must include operation and table',
        },
        status: 400,
      })
    }

    // 5. Execute query
    const result = await executeQuery(query, ctx)

    // 6. Add response headers
    reply.header('X-Gateway-Duration-Ms', Date.now() - startTime)
    reply.header('X-Project-Id', ctx.projectId)

    return reply.code(result.status).send(result)
  })

  // ===========================================================================
  // GET /v1/inhouse/db/schema - Get schema metadata
  // ===========================================================================
  fastify.get<{
    Querystring: QueryParams
  }>('/v1/inhouse/db/schema', async (request, reply) => {
    // 1. Validate API key
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return reply.code(401).send({
        error: {
          code: 'INVALID_API_KEY',
          message: 'Missing API key',
        },
      })
    }

    const validation = await validateApiKey(apiKey)
    if (!validation.valid) {
      return reply.code(401).send({
        error: {
          code: 'INVALID_API_KEY',
          message: validation.error || 'Invalid API key',
        },
      })
    }

    const ctx = buildContext(validation, request)
    if (!ctx) {
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to build gateway context',
        },
      })
    }

    // 2. Check rate limits (prevent metadata fetch abuse)
    const rateLimit = await checkRateLimit(ctx.projectId)
    reply.header('X-RateLimit-Remaining', rateLimit.remaining)
    reply.header('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000))

    if (!rateLimit.allowed) {
      reply.header('Retry-After', rateLimit.retryAfter)
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          hint: `Retry after ${rateLimit.retryAfter} seconds`,
        },
      })
    }

    // 3. Get table metadata
    const metadata = await getTableMetadata(ctx.projectId, ctx.schemaName)

    // 3. Convert to response format
    // SECURITY: Filter out columns that this API key type cannot read.
    // This prevents information leakage about sensitive column names/types.
    const tables = Array.from(metadata.values()).map(table => ({
      name: table.name,
      columns: table.columns
        .filter(col => canReadColumn(col, ctx.apiKeyType))
        .map(col => ({
          name: col.name,
          type: col.dataType,
          nullable: col.isNullable,
          primaryKey: col.isPrimaryKey,
          // Only show sensitive flag to server keys (public keys can't see these columns at all)
          ...(ctx.apiKeyType === 'server' && col.isSensitive ? { sensitive: true } : {}),
        })),
      readable: table.allowClientRead,
      writable: table.allowClientWrite,
      system: table.isSystemTable,
    }))

    return reply.send({
      project_id: ctx.projectId,
      schema_name: ctx.schemaName,
      tables,
      table_count: tables.length,
    })
  })

  // ===========================================================================
  // GET /v1/inhouse/db/health - Gateway health check
  // ===========================================================================
  fastify.get('/v1/inhouse/db/health', async (request, reply) => {
    return reply.send({
      status: 'healthy',
      service: 'inhouse-gateway',
      timestamp: new Date().toISOString(),
      features: {
        query: true,
        schema: true,
        rateLimit: true,
        quotas: true,
      },
    })
  })

  // ===========================================================================
  // POST /v1/inhouse/db/batch - Batch query execution (future)
  // ===========================================================================
  fastify.post('/v1/inhouse/db/batch', async (request, reply) => {
    return reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Batch queries are not yet implemented',
        hint: 'This feature is coming soon',
      },
    })
  })

  // ===========================================================================
  // POST /v1/inhouse/db/rpc - RPC/stored procedure execution (future)
  // ===========================================================================
  fastify.post('/v1/inhouse/db/rpc', async (request, reply) => {
    return reply.code(501).send({
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'RPC calls are not yet implemented',
        hint: 'This feature is coming soon',
      },
    })
  })
}
