/**
 * In-House CMS Service
 *
 * Minimal CMS for Easy Mode apps:
 * - Content types (schema stored as JSON)
 * - Content entries (JSON data, draft/published/archived)
 */

import { getDatabase } from '../database'

export interface ContentType {
  id: string
  projectId: string
  name: string
  slug: string
  schema: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface ContentEntry {
  id: string
  projectId: string
  contentTypeId: string
  slug: string | null
  data: Record<string, any>
  status: 'draft' | 'published' | 'archived'
  locale: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MediaItem {
  id: string
  projectId: string
  filename: string
  mimeType: string | null
  sizeBytes: number | null
  url: string
  altText: string | null
  metadata: Record<string, any>
  createdAt: string
}

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase()
}

function mapContentType(row: any): ContentType {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    slug: row.slug,
    schema: row.schema || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapEntry(row: any): ContentEntry {
  return {
    id: row.id,
    projectId: row.project_id,
    contentTypeId: row.content_type_id,
    slug: row.slug,
    data: row.data || {},
    status: row.status,
    locale: row.locale,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function mapMedia(row: any): MediaItem {
  return {
    id: row.id,
    projectId: row.project_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url: row.url,
    altText: row.alt_text,
    metadata: row.metadata || {},
    createdAt: row.created_at
  }
}

export class InhouseCmsService {
  async createContentType(params: {
    projectId: string
    name: string
    slug: string
    schema: Record<string, any>
  }): Promise<ContentType> {
    const db = getDatabase()
    const slug = normalizeSlug(params.slug)

    const result = await db.query(
      `
      INSERT INTO public.inhouse_content_types (project_id, name, slug, schema)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [params.projectId, params.name, slug, params.schema]
    )

    return mapContentType(result.rows[0])
  }

  async listContentTypes(projectId: string): Promise<ContentType[]> {
    const db = getDatabase()
    const result = await db.query(
      `
      SELECT * FROM public.inhouse_content_types
      WHERE project_id = $1
      ORDER BY created_at DESC
      `,
      [projectId]
    )
    return result.rows.map(mapContentType)
  }

  async getContentTypeBySlug(projectId: string, slug: string): Promise<ContentType | null> {
    const db = getDatabase()
    const result = await db.query(
      `
      SELECT * FROM public.inhouse_content_types
      WHERE project_id = $1 AND slug = $2
      LIMIT 1
      `,
      [projectId, normalizeSlug(slug)]
    )
    if (result.rows.length === 0) return null
    return mapContentType(result.rows[0])
  }

  async createEntry(params: {
    projectId: string
    contentTypeId: string
    slug?: string | null
    data: Record<string, any>
    status?: 'draft' | 'published' | 'archived'
    locale?: string
  }): Promise<ContentEntry> {
    const db = getDatabase()
    const slug = params.slug ? normalizeSlug(params.slug) : null
    const status = params.status || 'draft'
    const locale = params.locale || 'en'
    const publishedAt = status === 'published' ? new Date().toISOString() : null

    const result = await db.query(
      `
      INSERT INTO public.inhouse_content_entries (
        project_id, content_type_id, slug, data, status, locale, published_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [params.projectId, params.contentTypeId, slug, params.data, status, locale, publishedAt]
    )

    return mapEntry(result.rows[0])
  }

  async listEntries(params: {
    projectId: string
    contentTypeId?: string
    contentTypeSlug?: string
    status?: 'draft' | 'published' | 'archived'
    locale?: string
    limit?: number
    offset?: number
  }): Promise<ContentEntry[]> {
    const db = getDatabase()
    const limit = Math.min(Math.max(params.limit || 20, 1), 100)
    const offset = Math.max(params.offset || 0, 0)
    const values: any[] = [params.projectId]
    const conditions: string[] = ['project_id = $1']

    if (params.contentTypeId) {
      values.push(params.contentTypeId)
      conditions.push(`content_type_id = $${values.length}`)
    }

    if (params.contentTypeSlug) {
      values.push(normalizeSlug(params.contentTypeSlug))
      conditions.push(`content_type_id = (SELECT id FROM public.inhouse_content_types WHERE project_id = $1 AND slug = $${values.length})`)
    }

    if (params.status) {
      values.push(params.status)
      conditions.push(`status = $${values.length}`)
    }

    if (params.locale) {
      values.push(params.locale)
      conditions.push(`locale = $${values.length}`)
    }

    values.push(limit, offset)

    const result = await db.query(
      `
      SELECT * FROM public.inhouse_content_entries
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
      `,
      values
    )

    return result.rows.map(mapEntry)
  }

  async getEntry(params: { projectId: string; entryId: string }): Promise<ContentEntry | null> {
    const db = getDatabase()
    const result = await db.query(
      `
      SELECT * FROM public.inhouse_content_entries
      WHERE project_id = $1 AND id = $2
      LIMIT 1
      `,
      [params.projectId, params.entryId]
    )
    if (result.rows.length === 0) return null
    return mapEntry(result.rows[0])
  }

  async updateEntry(params: {
    projectId: string
    entryId: string
    data?: Record<string, any>
    status?: 'draft' | 'published' | 'archived'
    slug?: string | null
    locale?: string
  }): Promise<ContentEntry | null> {
    const db = getDatabase()
    const updates: string[] = []
    const values: any[] = []

    if (params.data) {
      values.push(params.data)
      updates.push(`data = $${values.length}`)
    }
    if (params.status) {
      values.push(params.status)
      updates.push(`status = $${values.length}`)
      if (params.status === 'published') {
        updates.push(`published_at = NOW()`)
      }
    }
    if (params.slug !== undefined) {
      values.push(params.slug ? normalizeSlug(params.slug) : null)
      updates.push(`slug = $${values.length}`)
    }
    if (params.locale) {
      values.push(params.locale)
      updates.push(`locale = $${values.length}`)
    }

    if (updates.length === 0) {
      return this.getEntry({ projectId: params.projectId, entryId: params.entryId })
    }

    values.push(params.projectId, params.entryId)
    const result = await db.query(
      `
      UPDATE public.inhouse_content_entries
      SET ${updates.join(', ')}
      WHERE project_id = $${values.length - 1} AND id = $${values.length}
      RETURNING *
      `,
      values
    )

    if (result.rows.length === 0) return null
    return mapEntry(result.rows[0])
  }

  async createMedia(params: {
    projectId: string
    filename: string
    mimeType?: string | null
    sizeBytes?: number | null
    url: string
    altText?: string | null
    metadata?: Record<string, any>
  }): Promise<MediaItem> {
    const db = getDatabase()
    const result = await db.query(
      `
      INSERT INTO public.inhouse_media (
        project_id, filename, mime_type, size_bytes, url, alt_text, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        params.projectId,
        params.filename,
        params.mimeType || null,
        params.sizeBytes || null,
        params.url,
        params.altText || null,
        params.metadata || {}
      ]
    )

    return mapMedia(result.rows[0])
  }

  async listMedia(params: {
    projectId: string
    limit?: number
    offset?: number
  }): Promise<MediaItem[]> {
    const db = getDatabase()
    const limit = Math.min(Math.max(params.limit || 20, 1), 100)
    const offset = Math.max(params.offset || 0, 0)

    const result = await db.query(
      `
      SELECT * FROM public.inhouse_media
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      OFFSET $3
      `,
      [params.projectId, limit, offset]
    )

    return result.rows.map(mapMedia)
  }
}
