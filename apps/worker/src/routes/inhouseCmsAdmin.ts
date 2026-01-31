/**
 * In-House CMS Admin Routes
 *
 * HMAC-authenticated endpoints for the SheenApps dashboard.
 */

import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'crypto'
import { InhouseCmsService } from '../services/inhouse/InhouseCmsService'
import { requireHmacSignature } from '../middleware/hmacValidation'
import { assertProjectAccess } from '../utils/projectAuth'
import { getBusinessEventsService } from '../services/businessEventsService'

const cmsService = new InhouseCmsService()
const CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const MAX_MEDIA_BYTES = 10 * 1024 * 1024

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file'
}

function validateBase64(content: string): { valid: boolean; error?: string } {
  if (!content || typeof content !== 'string') {
    return { valid: false, error: 'Content must be a base64 string' }
  }
  if (content.startsWith('data:')) {
    return { valid: false, error: 'Data URLs not allowed' }
  }
  if (content.length % 4 !== 0) {
    return { valid: false, error: 'Invalid base64 length' }
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
    return { valid: false, error: 'Invalid base64 characters' }
  }
  return { valid: true }
}

async function uploadToR2(params: {
  projectId: string
  filename: string
  content: Buffer
  contentType?: string
}): Promise<{ url: string; key: string; size: number }> {
  const accountId = process.env.CF_ACCOUNT_ID || ''
  const apiToken = process.env.CF_API_TOKEN_R2 || process.env.CF_API_TOKEN_WORKERS || ''
  const bucketName = process.env.CF_R2_BUCKET_MEDIA || process.env.CF_R2_BUCKET_BUILDS || 'sheenapps-media'

  if (!accountId || !apiToken) {
    throw new Error('R2 configuration missing')
  }

  const safeName = sanitizeFilename(params.filename)
  const mediaId = randomUUID()
  const key = `cms/${params.projectId}/${mediaId}/${safeName}`
  const encodedBucket = encodeURIComponent(bucketName)
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')

  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/r2/buckets/${encodedBucket}/objects/${encodedKey}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': params.contentType || 'application/octet-stream',
      },
      body: new Uint8Array(params.content)
    }
  )

  if (!response.ok) {
    const errorBody = await response.text().catch(() => 'Unknown error')
    throw new Error(`R2 upload failed: ${response.status} - ${errorBody}`)
  }

  // Encode key segments for the public URL (bucket is from env, key has user filename)
  const encodedPublicKey = key.split('/').map(encodeURIComponent).join('/')
  const url = `https://pub-${accountId}.r2.dev/${encodeURIComponent(bucketName)}/${encodedPublicKey}`
  return { url, key, size: params.content.length }
}

export async function inhouseCmsAdminRoutes(app: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  app.get('/v1/inhouse/cms/admin/types', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    const query = request.query as Record<string, any>
    const projectId = query.projectId as string
    const userId = query.userId as string
    if (!projectId) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }
    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }
    const types = await cmsService.listContentTypes(projectId)
    return reply.send({ ok: true, data: { types } })
  })

  app.post<{ Body: { projectId: string; userId?: string; name: string; slug: string; schema: Record<string, any> } }>(
    '/v1/inhouse/cms/admin/types',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, userId, name, slug, schema } = request.body || {}
      if (!projectId || !name || !slug || !schema) {
        return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Missing fields' } })
      }
      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const created = await cmsService.createContentType({ projectId, name, slug, schema })

      // Funnel: content_type_created
      try {
        await getBusinessEventsService().insertEvent({
          projectId,
          eventType: 'content_type_created',
          occurredAt: new Date().toISOString(),
          source: 'server',
          payload: { name, slug, fieldCount: schema?.fields?.length || 0 },
          idempotencyKey: `content-type-created:${projectId}:${created.id}`,
          actorId: userId,
          actorType: 'user',
        })
      } catch (_) { /* non-critical */ }

      return reply.send({ ok: true, data: { type: created } })
    }
  )

  app.get('/v1/inhouse/cms/admin/entries', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    const query = request.query as Record<string, any>
    const projectId = query.projectId as string
    const userId = query.userId as string
    if (!projectId) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }
    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const limit = query.limit ? Math.min(Math.max(Number(query.limit) || 50, 1), 100) : 50
    const offset = query.offset ? Math.max(Number(query.offset) || 0, 0) : 0
    const entries = await cmsService.listEntries({
      projectId,
      contentTypeId: query.contentTypeId,
      contentTypeSlug: query.contentType,
      status: query.status,
      locale: query.locale,
      limit,
      offset
    })

    return reply.send({ ok: true, data: { entries } })
  })

  app.post<{ Body: { projectId: string; userId?: string; contentTypeId: string; slug?: string; data: Record<string, any>; status?: string; locale?: string } }>(
    '/v1/inhouse/cms/admin/entries',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, userId, contentTypeId, slug, data, status, locale } = request.body || {}
      if (!projectId || !contentTypeId || !data) {
        return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Missing fields' } })
      }
      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
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
        projectId,
        contentTypeId,
        ...(slug && { slug }),
        data,
        ...(status && { status: status as 'draft' | 'published' | 'archived' }),
        ...(locale && { locale })
      })

      // Funnel: entry_created
      try {
        await getBusinessEventsService().insertEvent({
          projectId,
          eventType: 'entry_created',
          occurredAt: new Date().toISOString(),
          source: 'server',
          payload: {
            contentTypeId,
            status: status || 'draft',
            locale: locale || 'default',
          },
          idempotencyKey: `entry-created:${projectId}:${entry.id}`,
          actorId: userId,
          actorType: 'user',
        })
      } catch (_) { /* non-critical */ }

      return reply.send({ ok: true, data: { entry } })
    }
  )

  app.patch<{ Body: { projectId: string; userId?: string; data?: Record<string, any>; status?: string; slug?: string | null; locale?: string } }>(
    '/v1/inhouse/cms/admin/entries/:id',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, userId, data, status, slug, locale } = request.body || {}
      if (!projectId) {
        return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
      }
      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      // Validate status if provided
      const validStatuses = ['draft', 'published', 'archived'] as const
      if (status && !validStatuses.includes(status as any)) {
        return reply.code(400).send({
          ok: false,
          error: { code: 'VALIDATION_ERROR', message: 'status must be draft, published, or archived' }
        })
      }

      const entry = await cmsService.updateEntry({
        projectId,
        entryId: (request.params as any).id,
        ...(data && { data }),
        ...(status && { status: status as 'draft' | 'published' | 'archived' }),
        ...(slug !== undefined && { slug }),
        ...(locale && { locale })
      })

      if (!entry) {
        return reply.code(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'Entry not found' } })
      }

      return reply.send({ ok: true, data: { entry } })
    }
  )

  app.get('/v1/inhouse/cms/admin/media', { preHandler: hmacMiddleware as any }, async (request, reply) => {
    const query = request.query as Record<string, any>
    const projectId = query.projectId as string
    const userId = query.userId as string
    if (!projectId) {
      return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'projectId required' } })
    }
    // Authorize project access
    if (userId) {
      await assertProjectAccess(projectId, userId)
    }

    const limit = query.limit ? Math.min(Math.max(Number(query.limit) || 50, 1), 100) : 50
    const offset = query.offset ? Math.max(Number(query.offset) || 0, 0) : 0
    const media = await cmsService.listMedia({
      projectId,
      ...(limit !== undefined && { limit }),
      ...(offset !== undefined && { offset })
    })

    return reply.send({ ok: true, data: { media } })
  })

  app.post<{ Body: { projectId: string; userId?: string; filename: string; contentBase64: string; contentType?: string; altText?: string; metadata?: Record<string, any> } }>(
    '/v1/inhouse/cms/admin/media',
    { preHandler: hmacMiddleware as any },
    async (request, reply) => {
      const { projectId, userId, filename, contentBase64, contentType, altText, metadata } = request.body || {}
      if (!projectId || !filename || !contentBase64) {
        return reply.code(400).send({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Missing fields' } })
      }
      // Authorize project access
      if (userId) {
        await assertProjectAccess(projectId, userId)
      }

      const base64Validation = validateBase64(contentBase64)
      if (!base64Validation.valid) {
        return reply.code(400).send({ ok: false, error: { code: 'INVALID_BASE64', message: base64Validation.error || 'Invalid base64' } })
      }

      const estimatedSize = Math.ceil((contentBase64.length * 3) / 4)
      if (estimatedSize > MAX_MEDIA_BYTES) {
        return reply.code(413).send({ ok: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 10MB limit' } })
      }

      const buffer = Buffer.from(contentBase64, 'base64')
      if (buffer.length > MAX_MEDIA_BYTES) {
        return reply.code(413).send({ ok: false, error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 10MB limit' } })
      }

      const upload = await uploadToR2({
        projectId,
        filename,
        content: buffer,
        ...(contentType && { contentType })
      })

      const media = await cmsService.createMedia({
        projectId,
        filename,
        ...(contentType && { mimeType: contentType }),
        sizeBytes: upload.size,
        url: upload.url,
        ...(altText && { altText }),
        ...(metadata && { metadata })
      })

      return reply.send({ ok: true, data: { media } })
    }
  )
}
