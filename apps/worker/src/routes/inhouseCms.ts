/**
 * In-House CMS Routes (Easy Mode)
 *
 * Content types + entries with API key auth.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { InhouseCmsService } from '../services/inhouse/InhouseCmsService'
import { validateApiKey } from '../services/inhouse/InhouseGatewayService'

const cmsService = new InhouseCmsService()

function getApiKey(request: FastifyRequest): string | null {
  const header = request.headers['x-api-key']
  if (typeof header === 'string' && header.length > 0) {
    return header
  }
  return null
}

async function requireProjectContext(request: FastifyRequest, reply: FastifyReply) {
  const apiKey = getApiKey(request)
  if (!apiKey) {
    reply.code(401).send({ ok: false, error: { code: 'API_KEY_REQUIRED', message: 'API key required' } })
    return null
  }

  const validation = await validateApiKey(apiKey)
  if (!validation.valid || !validation.projectId) {
    reply.code(401).send({ ok: false, error: { code: 'INVALID_API_KEY', message: validation.error || 'Invalid API key' } })
    return null
  }

  return {
    projectId: validation.projectId,
    ...(validation.keyType && { keyType: validation.keyType })
  }
}

function requireWriteAccess(context: { keyType?: string } | null, reply: FastifyReply) {
  if (!context) return false
  if (context.keyType !== 'server') {
    reply.code(403).send({ ok: false, error: { code: 'INSUFFICIENT_SCOPE', message: 'Server API key required' } })
    return false
  }
  return true
}

export async function inhouseCmsRoutes(app: FastifyInstance) {
  // Content types
  app.get('/v1/inhouse/cms/types', async (request, reply) => {
    const context = await requireProjectContext(request, reply)
    if (!context) return

    const types = await cmsService.listContentTypes(context.projectId)
    return reply.send({ ok: true, data: { types } })
  })

  app.post<{ Body: { name: string; slug: string; schema: Record<string, any> } }>(
    '/v1/inhouse/cms/types',
    async (request, reply) => {
      const context = await requireProjectContext(request, reply)
      if (!context || !requireWriteAccess(context, reply)) return

      const { name, slug, schema } = request.body || {}
      if (!name || !slug || !schema) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'name, slug, and schema are required' }
        })
      }

      const created = await cmsService.createContentType({
        projectId: context.projectId,
        name,
        slug,
        schema
      })

      return reply.send({ ok: true, data: { type: created } })
    }
  )

  // Content entries
  app.get('/v1/inhouse/cms/entries', async (request, reply) => {
    const context = await requireProjectContext(request, reply)
    if (!context) return

    const query = request.query as Record<string, any>
    const limit = query.limit ? Math.min(Math.max(Number(query.limit) || 50, 1), 100) : 50
    const offset = query.offset ? Math.max(Number(query.offset) || 0, 0) : 0
    const entries = await cmsService.listEntries({
      projectId: context.projectId,
      contentTypeId: query.contentTypeId,
      contentTypeSlug: query.contentType,
      status: query.status,
      locale: query.locale,
      limit,
      offset
    })

    return reply.send({ ok: true, data: { entries } })
  })

  app.post<{ Body: { contentTypeId: string; slug?: string; data: Record<string, any>; status?: string; locale?: string } }>(
    '/v1/inhouse/cms/entries',
    async (request, reply) => {
      const context = await requireProjectContext(request, reply)
      if (!context || !requireWriteAccess(context, reply)) return

      const { contentTypeId, slug, data, status, locale } = request.body || {}
      if (!contentTypeId || !data) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'contentTypeId and data are required' }
        })
      }

      // Validate status if provided
      const validStatuses = ['draft', 'published', 'archived'] as const
      if (status && !validStatuses.includes(status as any)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'status must be draft, published, or archived' }
        })
      }

      const entry = await cmsService.createEntry({
        projectId: context.projectId,
        contentTypeId,
        ...(slug && { slug }),
        data,
        ...(status && { status: status as 'draft' | 'published' | 'archived' }),
        ...(locale && { locale })
      })

      return reply.send({ ok: true, data: { entry } })
    }
  )

  // Media (read-only for public keys)
  app.get('/v1/inhouse/cms/media', async (request, reply) => {
    const context = await requireProjectContext(request, reply)
    if (!context) return

    const query = request.query as Record<string, any>
    const limit = query.limit ? Math.min(Math.max(Number(query.limit) || 50, 1), 100) : 50
    const offset = query.offset ? Math.max(Number(query.offset) || 0, 0) : 0
    const media = await cmsService.listMedia({
      projectId: context.projectId,
      limit,
      offset
    })

    return reply.send({ ok: true, data: { media } })
  })

  app.get('/v1/inhouse/cms/entries/:id', async (request, reply) => {
    const context = await requireProjectContext(request, reply)
    if (!context) return

    const entry = await cmsService.getEntry({
      projectId: context.projectId,
      entryId: (request.params as any).id
    })

    if (!entry) {
      return reply.code(404).send({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Entry not found' }
      })
    }

    return reply.send({ ok: true, data: { entry } })
  })

  app.patch<{ Body: { data?: Record<string, any>; status?: string; slug?: string | null; locale?: string } }>(
    '/v1/inhouse/cms/entries/:id',
    async (request, reply) => {
      const context = await requireProjectContext(request, reply)
      if (!context || !requireWriteAccess(context, reply)) return

      const { data, status, slug, locale } = request.body || {}

      // Validate status if provided
      const validStatuses = ['draft', 'published', 'archived'] as const
      if (status && !validStatuses.includes(status as any)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'status must be draft, published, or archived' }
        })
      }

      const entry = await cmsService.updateEntry({
        projectId: context.projectId,
        entryId: (request.params as any).id,
        ...(data && { data }),
        ...(status && { status: status as 'draft' | 'published' | 'archived' }),
        ...(slug !== undefined && { slug }),
        ...(locale && { locale })
      })

      if (!entry) {
        return reply.code(404).send({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Entry not found' }
        })
      }

      return reply.send({ ok: true, data: { entry } })
    }
  )
}
