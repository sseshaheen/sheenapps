/**
 * Admin In-House Search Routes
 *
 * Endpoints for monitoring search indexes and query analytics.
 *
 * Routes:
 * - GET /v1/admin/inhouse/projects/:projectId/search/indexes
 * - GET /v1/admin/inhouse/projects/:projectId/search/queries
 */

import { FastifyInstance } from 'fastify'
import { requireAdminAuth, AdminRequest } from '../middleware/adminAuthentication'
import { withStatementTimeout } from '../utils/dbTimeout'
import { requirePool, parseLimitOffset } from './admin/_utils'
import { auditAdminAction } from './admin/_audit'

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

interface ListIndexesQuery {
  search?: string
  limit?: string
  offset?: string
}

interface ListQueriesQuery {
  indexName?: string
  startDate?: string
  endDate?: string
  limit?: string
  offset?: string
}

interface ExportQueriesQuery {
  indexName?: string
  startDate?: string
  endDate?: string
  format?: 'csv' | 'json'
}

interface SearchIndexRow {
  id: string
  name: string
  searchable_fields: string[]
  field_weights: Record<string, string>
  language: string
  settings: Record<string, unknown>
  document_count: number
  created_at: string
  updated_at: string
}

interface SearchQueryRow {
  id: string
  index_id: string
  index_name: string
  query: string
  result_count: number
  latency_ms: number
  created_at: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

const STATEMENT_TIMEOUT = '5s'

// =============================================================================
// HELPERS
// =============================================================================

async function ensureProject(db: ReturnType<typeof requirePool>, projectId: string) {
  const projectCheck = await db.query(
    `SELECT id FROM projects WHERE id = $1 AND infra_mode = 'easy'`,
    [projectId]
  )
  return projectCheck.rows.length > 0
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

export default async function adminInhouseSearchRoutes(fastify: FastifyInstance) {
  const readMiddleware = requireAdminAuth({ permissions: ['inhouse.read'] })

  // =========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/search/indexes
  // =========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ListIndexesQuery
    Reply: { success: boolean; data?: { indexes: SearchIndexRow[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/search/indexes', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { search, limit: limitStr, offset: offsetStr } = request.query

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = ['i.project_id = $1']
      const params: any[] = [projectId]
      let paramIndex = 2

      if (search) {
        conditions.push(`i.name ILIKE $${paramIndex}`)
        params.push(`%${search}%`)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const { total, indexRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total FROM inhouse_search_indexes i WHERE ${whereClause}`,
          params
        )

        const indexesResult = await client.query(
          `SELECT
             i.id,
             i.name,
             i.searchable_fields,
             i.field_weights,
             i.language,
             i.settings,
             (SELECT COUNT(*) FROM inhouse_search_documents d WHERE d.index_id = i.id)::int AS document_count,
             i.created_at,
             i.updated_at
           FROM inhouse_search_indexes i
           WHERE ${whereClause}
           ORDER BY i.name ASC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          indexRows: indexesResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'search_indexes_list',
        projectId,
        resourceType: 'search_index',
        metadata: { search, limit, offset, resultCount: indexRows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          indexes: indexRows,
          total,
          hasMore: offset + indexRows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list search indexes')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list search indexes',
      })
    }
  })

  // =========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/search/queries
  // =========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ListQueriesQuery
    Reply: { success: boolean; data?: { queries: SearchQueryRow[]; total: number; hasMore: boolean }; error?: string }
  }>('/v1/admin/inhouse/projects/:projectId/search/queries', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const {
      indexName,
      startDate,
      endDate,
      limit: limitStr,
      offset: offsetStr,
    } = request.query

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const { limit, offset } = parseLimitOffset(limitStr, offsetStr)

      const conditions: string[] = ['q.project_id = $1']
      const params: any[] = [projectId]
      let paramIndex = 2

      if (indexName) {
        conditions.push(`i.name = $${paramIndex}`)
        params.push(indexName.toLowerCase().trim())
        paramIndex++
      }

      if (startDate) {
        conditions.push(`q.created_at >= $${paramIndex}::timestamptz`)
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        conditions.push(`q.created_at <= $${paramIndex}::timestamptz`)
        params.push(endDate)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const { total, queryRows } = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        const countResult = await client.query(
          `SELECT COUNT(*) as total
           FROM inhouse_search_queries q
           JOIN inhouse_search_indexes i ON i.id = q.index_id
           WHERE ${whereClause}`,
          params
        )

        const queriesResult = await client.query(
          `SELECT
             q.id,
             q.index_id,
             i.name as index_name,
             q.query,
             q.result_count,
             q.latency_ms,
             q.created_at
           FROM inhouse_search_queries q
           JOIN inhouse_search_indexes i ON i.id = q.index_id
           WHERE ${whereClause}
           ORDER BY q.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        )

        return {
          total: parseInt(countResult.rows[0]?.total || '0', 10),
          queryRows: queriesResult.rows,
        }
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'search_queries_list',
        projectId,
        resourceType: 'search_query',
        metadata: { indexName, startDate, endDate, limit, offset, resultCount: queryRows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      return reply.send({
        success: true,
        data: {
          queries: queryRows,
          total,
          hasMore: offset + queryRows.length < total,
        },
      })
    } catch (error) {
      request.log.error({ error }, 'Failed to list search queries')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list search queries',
      })
    }
  })

  // =========================================================================
  // GET /v1/admin/inhouse/projects/:projectId/search/queries/export
  // =========================================================================
  fastify.get<{
    Params: { projectId: string }
    Querystring: ExportQueriesQuery
  }>('/v1/admin/inhouse/projects/:projectId/search/queries/export', { preHandler: readMiddleware as never }, async (request, reply) => {
    const adminRequest = request as AdminRequest
    const { projectId } = request.params
    const { indexName, startDate, endDate, format } = request.query

    try {
      const db = requirePool()
      if (!(await ensureProject(db, projectId))) {
        return reply.status(404).send({ success: false, error: 'Project not found' })
      }

      const normalizedFormat = format === 'json' ? 'json' : 'csv'

      const conditions: string[] = ['q.project_id = $1']
      const params: any[] = [projectId]
      let paramIndex = 2

      if (indexName) {
        conditions.push(`i.name = $${paramIndex}`)
        params.push(indexName.toLowerCase().trim())
        paramIndex++
      }

      if (startDate) {
        conditions.push(`q.created_at >= $${paramIndex}::timestamptz`)
        params.push(startDate)
        paramIndex++
      }

      if (endDate) {
        conditions.push(`q.created_at <= $${paramIndex}::timestamptz`)
        params.push(endDate)
        paramIndex++
      }

      const whereClause = conditions.join(' AND ')

      const result = await withStatementTimeout(db, STATEMENT_TIMEOUT, async (client) => {
        return client.query<SearchQueryRow>(
          `SELECT
             q.id,
             q.index_id,
             i.name as index_name,
             q.query,
             q.result_count,
             q.latency_ms,
             q.created_at
           FROM inhouse_search_queries q
           JOIN inhouse_search_indexes i ON i.id = q.index_id
           WHERE ${whereClause}
           ORDER BY q.created_at DESC`,
          params
        )
      })

      auditAdminAction({
        adminId: adminRequest.adminClaims.sub,
        action: 'search_queries_export',
        projectId,
        resourceType: 'search_query',
        metadata: { indexName, startDate, endDate, format: normalizedFormat, count: result.rows.length },
        ipAddress: request.ip || null,
        userAgent: request.headers['user-agent'] || null,
      })

      const filename = `search-queries-${indexName ? indexName : 'all'}-${new Date().toISOString().slice(0, 10)}.${normalizedFormat}`

      if (normalizedFormat === 'json') {
        reply.header('Content-Type', 'application/json')
        reply.header('Content-Disposition', `attachment; filename=\"${filename}\"`)
        return reply.send(JSON.stringify(result.rows, null, 2))
      }

      const headers = ['id', 'index_name', 'query', 'result_count', 'latency_ms', 'created_at']
      const rows = [headers.join(',')]
      for (const row of result.rows) {
        const values = [
          row.id,
          row.index_name,
          row.query,
          String(row.result_count),
          String(row.latency_ms),
          row.created_at,
        ].map((value) => {
          const text = String(value ?? '')
          const escaped = text.replace(/\"/g, '\"\"')
          return /[\",\\n]/.test(escaped) ? `\"${escaped}\"` : escaped
        })
        rows.push(values.join(','))
      }

      reply.header('Content-Type', 'text/csv')
      reply.header('Content-Disposition', `attachment; filename=\"${filename}\"`)
      return reply.send(rows.join('\\n'))
    } catch (error) {
      request.log.error({ error }, 'Failed to export search queries')
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to export search queries',
      })
    }
  })
}
