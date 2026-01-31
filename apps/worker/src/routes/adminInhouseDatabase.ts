/**
 * Admin In-House Database Inspector Routes
 *
 * Provides secure read-only database access for admin support:
 * - Schema introspection (metadata-only by default)
 * - Sample data with opt-in and PII redaction
 * - Read-only query tool with AST validation
 * - Prebuilt diagnostic templates
 *
 * All endpoints require inhouse.read or inhouse.support permissions.
 */

import { FastifyInstance, FastifyRequest } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { getInhouseInspectorService } from '../services/admin/InhouseInspectorService'
import { auditAdminAction } from './admin/_audit'

// =============================================================================
// TYPES
// =============================================================================

interface ProjectParams {
  projectId: string
}

interface TableParams extends ProjectParams {
  tableName: string
}

interface SampleQuery {
  limit?: string
  enableSampling?: string
}

interface QueryBody {
  sql: string
  explain?: boolean
}

interface TemplateBody {
  templateId: string
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminInhouseDatabaseRoutes(fastify: FastifyInstance) {
  const inspectorService = getInhouseInspectorService()

  // Middleware for read-only operations
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // Middleware for query operations (elevated)
  const supportMiddleware = requireAdminAuth({ permissions: ['inhouse.support'] })

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/database/templates
  // Get available query templates
  // -------------------------------------------------------------------------
  fastify.get(
    '/v1/admin/inhouse/database/templates',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const templates = inspectorService.getTemplates()
      return reply.send({
        success: true,
        templates,
      })
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/database/projects/:projectId/schema
  // Get schema information (tables list with metadata)
  // -------------------------------------------------------------------------
  fastify.get<{ Params: ProjectParams }>(
    '/v1/admin/inhouse/database/projects/:projectId/schema',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { projectId } = request.params
      const adminId = adminRequest.adminClaims.sub

      try {
        const schema = await inspectorService.getSchema(projectId)

        // Audit log
        auditAdminAction({
          adminId,
          action: 'database_schema_view',
          projectId,
          resourceType: 'schema',
          ipAddress: request.ip || null,
        })

        return reply.send({
          success: true,
          ...schema,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/database/projects/:projectId/tables/:tableName
  // Get detailed table information (columns, indexes)
  // -------------------------------------------------------------------------
  fastify.get<{ Params: TableParams }>(
    '/v1/admin/inhouse/database/projects/:projectId/tables/:tableName',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { projectId, tableName } = request.params
      const adminId = adminRequest.adminClaims.sub

      try {
        const details = await inspectorService.getTableDetails(projectId, tableName)

        // Audit log
        auditAdminAction({
          adminId,
          action: 'database_table_view',
          projectId,
          resourceType: 'table',
          resourceId: tableName,
          ipAddress: request.ip || null,
        })

        return reply.send({
          success: true,
          ...details,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // GET /v1/admin/inhouse/database/projects/:projectId/tables/:tableName/sample
  // Get sample data (opt-in, requires explicit flag + elevated permission)
  // -------------------------------------------------------------------------
  fastify.get<{ Params: TableParams; Querystring: SampleQuery }>(
    '/v1/admin/inhouse/database/projects/:projectId/tables/:tableName/sample',
    { preHandler: supportMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { projectId, tableName } = request.params
      const { limit, enableSampling } = request.query
      const adminId = adminRequest.adminClaims.sub

      // Require explicit opt-in
      if (enableSampling !== 'true') {
        return reply.code(400).send({
          success: false,
          error: 'Sample data requires explicit opt-in. Set enableSampling=true query parameter.',
        })
      }

      try {
        const parsedLimit = limit ? parseInt(limit, 10) : 10
        const result = await inspectorService.getSampleData(projectId, tableName, parsedLimit)

        // Audit log
        auditAdminAction({
          adminId,
          action: 'database_sample_view',
          projectId,
          resourceType: 'table',
          resourceId: tableName,
          metadata: {
            limit: parsedLimit,
            redactedColumns: result.redactedColumns,
            rowsReturned: result.rows.length,
          },
          ipAddress: request.ip || null,
        })

        return reply.send({
          success: true,
          ...result,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/database/projects/:projectId/query
  // Execute a read-only query (elevated permission)
  // -------------------------------------------------------------------------
  fastify.post<{ Params: ProjectParams; Body: QueryBody }>(
    '/v1/admin/inhouse/database/projects/:projectId/query',
    {
      preHandler: supportMiddleware as never,
      bodyLimit: 262144, // 256KB max query size
    },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { projectId } = request.params
      const { sql, explain } = request.body
      const adminId = adminRequest.adminClaims.sub

      if (!sql || typeof sql !== 'string') {
        return reply.code(400).send({
          success: false,
          error: 'sql is required',
        })
      }

      if (sql.length > 100000) {
        return reply.code(400).send({
          success: false,
          error: 'Query too large (max 100KB)',
        })
      }

      try {
        const result = await inspectorService.executeQuery(projectId, sql, adminId, {
          explain: explain === true,
          ipAddress: request.ip,
        })

        return reply.send({
          success: true,
          ...result,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        const code = (error as any).code || 'QUERY_ERROR'

        return reply.code(400).send({
          success: false,
          error: message,
          code,
        })
      }
    }
  )

  // -------------------------------------------------------------------------
  // POST /v1/admin/inhouse/database/projects/:projectId/query/template
  // Execute a prebuilt template query
  // -------------------------------------------------------------------------
  fastify.post<{ Params: ProjectParams; Body: TemplateBody }>(
    '/v1/admin/inhouse/database/projects/:projectId/query/template',
    { preHandler: readMiddleware as never },
    async (request, reply) => {
      const adminRequest = request as AdminRequest
      const { projectId } = request.params
      const { templateId } = request.body
      const adminId = adminRequest.adminClaims.sub

      if (!templateId || typeof templateId !== 'string') {
        return reply.code(400).send({
          success: false,
          error: 'templateId is required',
        })
      }

      try {
        const result = await inspectorService.executeTemplate(projectId, templateId, adminId, {
          ipAddress: request.ip,
        })

        return reply.send({
          success: true,
          ...result,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        return reply.code(400).send({
          success: false,
          error: message,
        })
      }
    }
  )
}
