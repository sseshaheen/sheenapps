/**
 * Inhouse Search Routes
 *
 * API routes for @sheenapps/search SDK
 */

import { FastifyInstance } from 'fastify'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { getInhouseSearchService } from '../services/inhouse/InhouseSearchService'
import { logActivity } from '../services/inhouse/InhouseActivityLogger'
import { assertProjectAccess } from '../utils/projectAuth'

import type {
  CreateIndexInput,
  UpdateIndexInput,
  IndexDocumentInput,
  QueryOptions,
} from '../services/inhouse/InhouseSearchService'

// ============================================================================
// Route Types
// ============================================================================

interface ProjectParams {
  projectId: string
}

interface IndexParams extends ProjectParams {
  indexName: string
}

interface DocumentParams extends IndexParams {
  docId: string
}

interface CreateIndexBody extends Omit<CreateIndexInput, 'name'> {
  userId?: string
}

interface UpdateIndexBody extends UpdateIndexInput {
  userId?: string
}

interface IndexBatchBody {
  documents: IndexDocumentInput[]
  userId?: string
}

interface DeleteBatchBody {
  ids: string[]
  userId?: string
}

interface QueryBody {
  q: string
  filters?: Record<string, unknown>
  select?: string[]
  sort?: string
  limit?: number
  offset?: number
  highlight?: boolean
  highlight_options?: {
    start_tag?: string
    end_tag?: string
    max_length?: number
  }
  userId?: string
}

interface SuggestBody {
  q: string
  limit?: number
  filters?: Record<string, unknown>
  userId?: string
}

interface ListDocumentsQuery {
  limit?: string
  offset?: string
  userId?: string
}

interface StatsQuery {
  startDate?: string
  endDate?: string
  userId?: string
}

// ============================================================================
// Routes
// ============================================================================

export async function inhouseSearchRoutes(fastify: FastifyInstance): Promise<void> {
  const hmacMiddleware = requireHmacSignature()

  // --------------------------------------------------------------------------
  // Index Management
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/projects/:projectId/search/indexes/:indexName
   *
   * Create a search index
   */
  fastify.post<{
    Params: IndexParams
    Body: CreateIndexBody
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId, ...input } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()

    try {
      const result = await service.createIndex(projectId, {
        name: indexName,
        ...input,
      })

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'search',
        action: 'create_index',
        resourceType: 'index',
        resourceId: result.id,
        metadata: { indexName },
      })

      return reply.status(201).send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }

      // Handle duplicate index error
      if (err.code === '23505') {
        return reply.status(409).send({
          ok: false,
          error: { code: 'INDEX_ALREADY_EXISTS', message: `Index '${indexName}' already exists` },
        })
      }

      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * GET /v1/inhouse/projects/:projectId/search/indexes/:indexName
   *
   * Get a search index
   */
  fastify.get<{
    Params: IndexParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()
    const result = await service.getIndex(projectId, indexName)

    if (!result) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` },
      })
    }

    return reply.send({ ok: true, data: result })
  })

  /**
   * PATCH /v1/inhouse/projects/:projectId/search/indexes/:indexName
   *
   * Update a search index
   */
  fastify.patch<{
    Params: IndexParams
    Body: UpdateIndexBody
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId, ...input } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()

    try {
      const result = await service.updateIndex(projectId, indexName, input)

      if (!result) {
        return reply.status(404).send({
          ok: false,
          error: { code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` },
        })
      }

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'search',
        action: 'update_index',
        resourceType: 'index',
        resourceId: result.id,
        metadata: { indexName },
      })

      return reply.send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * DELETE /v1/inhouse/projects/:projectId/search/indexes/:indexName
   *
   * Delete a search index
   */
  fastify.delete<{
    Params: IndexParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()
    const deleted = await service.deleteIndex(projectId, indexName)

    if (!deleted) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` },
      })
    }

    logActivity({
      projectId,
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      service: 'search',
      action: 'delete_index',
      resourceType: 'index',
      metadata: { indexName },
    })

    return reply.send({ ok: true, data: { deleted: true } })
  })

  /**
   * GET /v1/inhouse/projects/:projectId/search/indexes
   *
   * List all search indexes
   */
  fastify.get<{
    Params: ProjectParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/search/indexes', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()
    const result = await service.listIndexes(projectId)

    return reply.send({
      ok: true,
      data: {
        indexes: result.items,
        total: result.total,
        hasMore: result.hasMore,
      },
    })
  })

  // --------------------------------------------------------------------------
  // Document Management
  // --------------------------------------------------------------------------

  /**
   * PUT /v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/:docId
   *
   * Index a document (upsert)
   */
  fastify.put<{
    Params: DocumentParams
    Body: { content: Record<string, unknown>; userId?: string }
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/:docId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName, docId } = request.params
    const { content, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()

    try {
      const result = await service.indexDocument(projectId, indexName, { id: docId, content })

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'search',
        action: 'index_document',
        resourceType: 'document',
        resourceId: result.id,
        metadata: { indexName, docId },
      })

      return reply.status(201).send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * POST /v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/batch
   *
   * Batch index documents
   */
  fastify.post<{
    Params: IndexParams
    Body: IndexBatchBody
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/batch', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { documents, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()

    try {
      const result = await service.indexDocumentBatch(projectId, indexName, documents)

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'search',
        action: 'index_batch',
        resourceType: 'document',
        metadata: { indexName, indexed: result.indexed, failed: result.failed },
      })

      return reply.send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * GET /v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/:docId
   *
   * Get a document
   */
  fastify.get<{
    Params: DocumentParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/:docId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName, docId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()
    const result = await service.getDocument(projectId, indexName, docId)

    if (!result) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
      })
    }

    return reply.send({ ok: true, data: result })
  })

  /**
   * DELETE /v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/:docId
   *
   * Delete a document
   */
  fastify.delete<{
    Params: DocumentParams
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/:docId', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName, docId } = request.params
    const { userId } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()
    const deleted = await service.deleteDocument(projectId, indexName, docId)

    if (!deleted) {
      return reply.status(404).send({
        ok: false,
        error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document not found' },
      })
    }

    logActivity({
      projectId,
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      service: 'search',
      action: 'delete_document',
      resourceType: 'document',
      metadata: { indexName, docId },
    })

    return reply.send({ ok: true, data: { deleted: true } })
  })

  /**
   * POST /v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/delete-batch
   *
   * Batch delete documents
   */
  fastify.post<{
    Params: IndexParams
    Body: DeleteBatchBody
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/documents/delete-batch', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { ids, userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()
    const deleted = await service.deleteDocumentBatch(projectId, indexName, ids)

    logActivity({
      projectId,
      actorId: userId,
      actorType: userId ? 'user' : 'system',
      service: 'search',
      action: 'delete_batch',
      resourceType: 'document',
      metadata: { indexName, deleted },
    })

    return reply.send({ ok: true, data: { deleted } })
  })

  /**
   * GET /v1/inhouse/projects/:projectId/search/indexes/:indexName/documents
   *
   * List documents
   */
  fastify.get<{
    Params: IndexParams
    Querystring: ListDocumentsQuery
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/documents', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId, ...options } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()
    const result = await service.listDocuments(projectId, indexName, {
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
      offset: options.offset ? parseInt(options.offset, 10) : undefined,
    })

    return reply.send({
      ok: true,
      data: {
        documents: result.items,
        total: result.total,
        hasMore: result.hasMore,
      },
    })
  })

  // --------------------------------------------------------------------------
  // Search & Suggest
  // --------------------------------------------------------------------------

  /**
   * POST /v1/inhouse/projects/:projectId/search/indexes/:indexName/query
   *
   * Search documents
   */
  fastify.post<{
    Params: IndexParams
    Body: QueryBody
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/query', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId, highlight_options, ...options } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    if (!options.q || options.q.trim().length === 0) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_QUERY', message: 'Query string is required' },
      })
    }

    const service = getInhouseSearchService()

    try {
      const queryOptions: QueryOptions = {
        ...options,
        highlightOptions: highlight_options ? {
          startTag: highlight_options.start_tag,
          endTag: highlight_options.end_tag,
          maxLength: highlight_options.max_length,
        } : undefined,
      }

      const result = await service.query(projectId, indexName, queryOptions)

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'search',
        action: 'query',
        resourceType: 'index',
        metadata: { indexName, q: options.q, total: result.total },
      })

      return reply.send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * POST /v1/inhouse/projects/:projectId/search/indexes/:indexName/suggest
   *
   * Get search suggestions
   */
  fastify.post<{
    Params: IndexParams
    Body: SuggestBody
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/suggest', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId, ...options } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    if (!options.q || options.q.trim().length === 0) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'INVALID_QUERY', message: 'Query string is required' },
      })
    }

    const service = getInhouseSearchService()

    try {
      const result = await service.suggest(projectId, indexName, options)
      return reply.send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  // --------------------------------------------------------------------------
  // Statistics & Reindex
  // --------------------------------------------------------------------------

  /**
   * GET /v1/inhouse/projects/:projectId/search/indexes/:indexName/stats
   *
   * Get search statistics
   */
  fastify.get<{
    Params: IndexParams
    Querystring: StatsQuery
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/stats', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId, startDate, endDate } = request.query

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()

    try {
      const result = await service.getStats(projectId, indexName, { startDate, endDate })
      return reply.send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })

  /**
   * POST /v1/inhouse/projects/:projectId/search/indexes/:indexName/reindex
   *
   * Reindex all documents
   */
  fastify.post<{
    Params: IndexParams
    Body: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/search/indexes/:indexName/reindex', {
    preHandler: hmacMiddleware as never,
  }, async (request, reply) => {
    const { projectId, indexName } = request.params
    const { userId } = request.body

    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const service = getInhouseSearchService()

    try {
      const result = await service.reindex(projectId, indexName)

      logActivity({
        projectId,
        actorId: userId,
        actorType: userId ? 'user' : 'system',
        service: 'search',
        action: 'reindex',
        resourceType: 'index',
        metadata: { indexName, jobId: result.jobId },
      })

      return reply.status(202).send({ ok: true, data: result })
    } catch (error: unknown) {
      const err = error as { statusCode?: number; code?: string; message?: string }
      return reply.status(err.statusCode || 500).send({
        ok: false,
        error: { code: err.code || 'INTERNAL_ERROR', message: err.message || 'Internal server error' },
      })
    }
  })
}
