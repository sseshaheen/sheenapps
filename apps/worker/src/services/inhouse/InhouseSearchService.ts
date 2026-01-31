/**
 * InhouseSearchService - Full-text search service for @sheenapps/search SDK
 *
 * Provides full-text search using PostgreSQL FTS (tsvector/tsquery).
 * Supports index management, document indexing, search queries, and suggestions.
 */

import { getPool } from '../database'
import crypto from 'crypto'

// ============================================================================
// Types
// ============================================================================

export type FieldWeight = 'A' | 'B' | 'C' | 'D'

export interface IndexSettings {
  maxDocumentSize?: number
  stopWords?: string[]
  synonyms?: Record<string, string[]>
}

export interface SearchIndex {
  id: string
  projectId: string
  name: string
  searchableFields: string[]
  fieldWeights: Record<string, FieldWeight>
  language: string
  settings: IndexSettings
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface SearchDocument {
  id: string
  indexName: string
  docId: string
  content: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface CreateIndexInput {
  name: string
  searchableFields: string[]
  fieldWeights?: Record<string, FieldWeight>
  language?: string
  settings?: IndexSettings
}

export interface UpdateIndexInput {
  searchableFields?: string[]
  fieldWeights?: Record<string, FieldWeight>
  language?: string
  settings?: IndexSettings
}

export interface IndexDocumentInput {
  id: string
  content: Record<string, unknown>
}

export interface QueryOptions {
  q: string
  filters?: Record<string, unknown>
  select?: string[]
  sort?: string
  limit?: number
  offset?: number
  highlight?: boolean
  highlightOptions?: {
    startTag?: string
    endTag?: string
    maxLength?: number
  }
}

export interface SearchHit<T = Record<string, unknown>> {
  id: string
  score: number
  content: T
  highlights?: Record<string, string[]>
}

export interface QueryResult<T = Record<string, unknown>> {
  hits: SearchHit<T>[]
  total: number
  took: number
  hasMore: boolean
}

export interface SuggestOptions {
  q: string
  limit?: number
  filters?: Record<string, unknown>
}

export interface SuggestResult {
  suggestions: string[]
  took: number
}

export interface SearchStats {
  indexName: string
  period: { start: string; end: string }
  totals: {
    documents: number
    queries: number
    averageLatencyMs: number
  }
  topQueries: Array<{ query: string; count: number; avgResults: number }>
  noResultQueries: Array<{ query: string; count: number }>
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  hasMore: boolean
}

// ============================================================================
// Service
// ============================================================================

export class InhouseSearchService {
  // --------------------------------------------------------------------------
  // Index Management
  // --------------------------------------------------------------------------

  async createIndex(projectId: string, input: CreateIndexInput): Promise<SearchIndex> {
    const pool = getPool()
    const normalizedName = input.name.toLowerCase().trim()

    // Validate name format
    if (!/^[a-z][a-z0-9_-]{0,99}$/.test(normalizedName)) {
      throw {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Index name must start with a letter and contain only lowercase letters, numbers, underscores, and hyphens',
      }
    }

    // Validate searchable field names (prevents SQL injection via field names)
    for (const field of input.searchableFields) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(field)) {
        throw {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: `Invalid field name: ${field}. Field names must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
        }
      }
    }

    const result = await pool.query<SearchIndex>(
      `INSERT INTO inhouse_search_indexes (
         project_id, name, searchable_fields, field_weights, language, settings
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING
         id,
         project_id AS "projectId",
         name,
         searchable_fields AS "searchableFields",
         field_weights AS "fieldWeights",
         language,
         settings,
         0 AS "documentCount",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [
        projectId,
        normalizedName,
        input.searchableFields,
        JSON.stringify(input.fieldWeights || {}),
        input.language || 'english',
        JSON.stringify(input.settings || {}),
      ]
    )

    return result.rows[0]!
  }

  async getIndex(projectId: string, indexName: string): Promise<SearchIndex | null> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()

    const result = await pool.query<SearchIndex>(
      `SELECT
         i.id,
         i.project_id AS "projectId",
         i.name,
         i.searchable_fields AS "searchableFields",
         i.field_weights AS "fieldWeights",
         i.language,
         i.settings,
         (SELECT COUNT(*) FROM inhouse_search_documents d WHERE d.index_id = i.id)::int AS "documentCount",
         i.created_at AS "createdAt",
         i.updated_at AS "updatedAt"
       FROM inhouse_search_indexes i
       WHERE i.project_id = $1 AND i.name = $2`,
      [projectId, normalizedName]
    )

    return result.rows[0] || null
  }

  async updateIndex(projectId: string, indexName: string, input: UpdateIndexInput): Promise<SearchIndex | null> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()

    const updates: string[] = []
    const values: unknown[] = [projectId, normalizedName]
    let paramIndex = 3

    if (input.searchableFields !== undefined) {
      // Validate searchable field names (prevents SQL injection via field names)
      for (const field of input.searchableFields) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(field)) {
          throw {
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: `Invalid field name: ${field}. Field names must start with a letter or underscore and contain only alphanumeric characters and underscores.`,
          }
        }
      }
      updates.push(`searchable_fields = $${paramIndex++}`)
      values.push(input.searchableFields)
    }
    if (input.fieldWeights !== undefined) {
      updates.push(`field_weights = $${paramIndex++}`)
      values.push(JSON.stringify(input.fieldWeights))
    }
    if (input.language !== undefined) {
      updates.push(`language = $${paramIndex++}`)
      values.push(input.language)
    }
    if (input.settings !== undefined) {
      updates.push(`settings = $${paramIndex++}`)
      values.push(JSON.stringify(input.settings))
    }

    if (updates.length === 0) {
      return this.getIndex(projectId, indexName)
    }

    updates.push('updated_at = NOW()')

    const result = await pool.query<SearchIndex>(
      `UPDATE inhouse_search_indexes
       SET ${updates.join(', ')}
       WHERE project_id = $1 AND name = $2
       RETURNING
         id,
         project_id AS "projectId",
         name,
         searchable_fields AS "searchableFields",
         field_weights AS "fieldWeights",
         language,
         settings,
         (SELECT COUNT(*) FROM inhouse_search_documents d WHERE d.index_id = inhouse_search_indexes.id)::int AS "documentCount",
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      values
    )

    return result.rows[0] || null
  }

  async deleteIndex(projectId: string, indexName: string): Promise<boolean> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()

    const result = await pool.query(
      `DELETE FROM inhouse_search_indexes WHERE project_id = $1 AND name = $2`,
      [projectId, normalizedName]
    )

    return (result.rowCount ?? 0) > 0
  }

  async listIndexes(projectId: string): Promise<PaginatedResult<SearchIndex>> {
    const pool = getPool()

    const result = await pool.query<SearchIndex>(
      `SELECT
         i.id,
         i.project_id AS "projectId",
         i.name,
         i.searchable_fields AS "searchableFields",
         i.field_weights AS "fieldWeights",
         i.language,
         i.settings,
         (SELECT COUNT(*) FROM inhouse_search_documents d WHERE d.index_id = i.id)::int AS "documentCount",
         i.created_at AS "createdAt",
         i.updated_at AS "updatedAt"
       FROM inhouse_search_indexes i
       WHERE i.project_id = $1
       ORDER BY i.name ASC`,
      [projectId]
    )

    return {
      items: result.rows,
      total: result.rows.length,
      hasMore: false,
    }
  }

  // --------------------------------------------------------------------------
  // Document Indexing
  // --------------------------------------------------------------------------

  async indexDocument(
    projectId: string,
    indexName: string,
    input: IndexDocumentInput
  ): Promise<SearchDocument> {
    const pool = getPool()

    // Get index configuration
    const index = await this.getIndex(projectId, indexName)
    if (!index) {
      throw { statusCode: 404, code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` }
    }

    // Note: search_vector is computed automatically by DB trigger (trg_inhouse_search_documents_vector)
    const result = await pool.query<SearchDocument>(
      `INSERT INTO inhouse_search_documents (project_id, index_id, doc_id, content)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (index_id, doc_id) DO UPDATE SET
         content = EXCLUDED.content,
         updated_at = NOW()
       RETURNING
         id,
         (SELECT name FROM inhouse_search_indexes WHERE id = index_id) AS "indexName",
         doc_id AS "docId",
         content,
         created_at AS "createdAt",
         updated_at AS "updatedAt"`,
      [projectId, index.id, input.id, JSON.stringify(input.content)]
    )

    return result.rows[0]!
  }

  async indexDocumentBatch(
    projectId: string,
    indexName: string,
    documents: IndexDocumentInput[]
  ): Promise<{ indexed: number; failed: number; errors?: Array<{ id: string; error: string }> }> {
    const pool = getPool()

    // Get index configuration
    const index = await this.getIndex(projectId, indexName)
    if (!index) {
      throw { statusCode: 404, code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` }
    }

    let indexed = 0
    const errors: Array<{ id: string; error: string }> = []

    // Process in batches of 100
    // Note: search_vector is computed automatically by DB trigger
    const batchSize = 100
    for (let i = 0; i < documents.length; i += batchSize) {
      const batch = documents.slice(i, i + batchSize)

      const values: unknown[] = []
      const placeholders: string[] = []
      let paramIndex = 1

      for (const doc of batch) {
        placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`)
        values.push(projectId, index.id, doc.id, JSON.stringify(doc.content))
      }

      if (placeholders.length > 0) {
        const result = await pool.query(
          `INSERT INTO inhouse_search_documents (project_id, index_id, doc_id, content)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (index_id, doc_id) DO UPDATE SET
             content = EXCLUDED.content,
             updated_at = NOW()`,
          values
        )
        indexed += result.rowCount ?? 0
      }
    }

    return {
      indexed,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  async getDocument(projectId: string, indexName: string, docId: string): Promise<SearchDocument | null> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()

    const result = await pool.query<SearchDocument>(
      `SELECT
         d.id,
         i.name AS "indexName",
         d.doc_id AS "docId",
         d.content,
         d.created_at AS "createdAt",
         d.updated_at AS "updatedAt"
       FROM inhouse_search_documents d
       JOIN inhouse_search_indexes i ON i.id = d.index_id
       WHERE d.project_id = $1 AND i.name = $2 AND d.doc_id = $3`,
      [projectId, normalizedName, docId]
    )

    return result.rows[0] || null
  }

  async deleteDocument(projectId: string, indexName: string, docId: string): Promise<boolean> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()

    const result = await pool.query(
      `DELETE FROM inhouse_search_documents d
       USING inhouse_search_indexes i
       WHERE d.index_id = i.id AND d.project_id = $1 AND i.name = $2 AND d.doc_id = $3`,
      [projectId, normalizedName, docId]
    )

    return (result.rowCount ?? 0) > 0
  }

  async deleteDocumentBatch(projectId: string, indexName: string, docIds: string[]): Promise<number> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()

    const result = await pool.query(
      `DELETE FROM inhouse_search_documents d
       USING inhouse_search_indexes i
       WHERE d.index_id = i.id AND d.project_id = $1 AND i.name = $2 AND d.doc_id = ANY($3)`,
      [projectId, normalizedName, docIds]
    )

    return result.rowCount ?? 0
  }

  async listDocuments(
    projectId: string,
    indexName: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<PaginatedResult<SearchDocument>> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()
    const limit = Math.min(options.limit || 20, 100)
    const offset = options.offset || 0

    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM inhouse_search_documents d
       JOIN inhouse_search_indexes i ON i.id = d.index_id
       WHERE d.project_id = $1 AND i.name = $2`,
      [projectId, normalizedName]
    )
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10)

    const result = await pool.query<SearchDocument>(
      `SELECT
         d.id,
         i.name AS "indexName",
         d.doc_id AS "docId",
         d.content,
         d.created_at AS "createdAt",
         d.updated_at AS "updatedAt"
       FROM inhouse_search_documents d
       JOIN inhouse_search_indexes i ON i.id = d.index_id
       WHERE d.project_id = $1 AND i.name = $2
       ORDER BY d.created_at DESC
       LIMIT $3 OFFSET $4`,
      [projectId, normalizedName, limit, offset]
    )

    return {
      items: result.rows,
      total,
      hasMore: offset + result.rows.length < total,
    }
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  async query<T = Record<string, unknown>>(
    projectId: string,
    indexName: string,
    options: QueryOptions
  ): Promise<QueryResult<T>> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()
    const startTime = Date.now()

    // Get index configuration
    const index = await this.getIndex(projectId, indexName)
    if (!index) {
      throw { statusCode: 404, code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` }
    }

    const limit = Math.min(options.limit || 20, 100)
    const offset = options.offset || 0

    // Build allowed fields set for SQL injection prevention
    const allowedFields = new Set(index.searchableFields)

    // Use websearch_to_tsquery for better UX (handles quotes, minus, etc)
    let whereClause = `WHERE d.project_id = $1 AND i.name = $2 AND d.search_vector @@ websearch_to_tsquery($3::regconfig, $4)`
    const values: unknown[] = [projectId, normalizedName, index.language, options.q]
    let paramIndex = 5

    // Apply filters with parameterized key access (SQL injection prevention)
    if (options.filters) {
      for (const [key, value] of Object.entries(options.filters)) {
        if (value === undefined || value === null) continue

        // Validate key to prevent SQL injection
        this.assertValidFieldKey(key, allowedFields)

        if (typeof value === 'object' && !Array.isArray(value)) {
          // Handle operators like { $lt: 100, $gt: 10 }
          for (const [op, opValue] of Object.entries(value as Record<string, unknown>)) {
            // Use parameterized key access: (d.content ->> $N)
            switch (op) {
              case '$lt':
                whereClause += ` AND (d.content ->> $${paramIndex++})::numeric < $${paramIndex++}`
                values.push(key, opValue)
                break
              case '$lte':
                whereClause += ` AND (d.content ->> $${paramIndex++})::numeric <= $${paramIndex++}`
                values.push(key, opValue)
                break
              case '$gt':
                whereClause += ` AND (d.content ->> $${paramIndex++})::numeric > $${paramIndex++}`
                values.push(key, opValue)
                break
              case '$gte':
                whereClause += ` AND (d.content ->> $${paramIndex++})::numeric >= $${paramIndex++}`
                values.push(key, opValue)
                break
              case '$ne':
                whereClause += ` AND (d.content ->> $${paramIndex++}) != $${paramIndex++}`
                values.push(key, opValue)
                break
              case '$in':
                whereClause += ` AND (d.content ->> $${paramIndex++}) = ANY($${paramIndex++})`
                values.push(key, opValue)
                break
            }
          }
        } else {
          whereClause += ` AND (d.content ->> $${paramIndex++}) = $${paramIndex++}`
          values.push(key, value)
        }
      }
    }

    // Get total count
    const countResult = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM inhouse_search_documents d
       JOIN inhouse_search_indexes i ON i.id = d.index_id
       ${whereClause}`,
      values
    )
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10)

    // Build select clause - searchableFields are validated at index creation
    let selectClause = `
      d.doc_id AS "id",
      ts_rank(d.search_vector, websearch_to_tsquery($3::regconfig, $4)) AS score,
      d.content`

    if (options.highlight) {
      const startTag = this.escapeHtmlTag(options.highlightOptions?.startTag || '<mark>')
      const endTag = this.escapeHtmlTag(options.highlightOptions?.endTag || '</mark>')
      const maxWords = Math.min(Math.floor((options.highlightOptions?.maxLength || 200) / 5), 50)

      // Searchable fields are from index config (validated at creation time)
      const highlightSelects = index.searchableFields.map((field) => {
        // Field names from index config are safe (validated at index creation)
        return `ts_headline(
          $3::regconfig,
          COALESCE(d.content ->> '${this.escapeIdentifier(field)}', ''),
          websearch_to_tsquery($3::regconfig, $4),
          'StartSel=${startTag}, StopSel=${endTag}, MaxFragments=3, MaxWords=${maxWords}'
        ) AS "highlight_${this.escapeIdentifier(field)}"`
      })
      selectClause += ', ' + highlightSelects.join(', ')
    }

    // Build order clause with validated sort field
    let orderClause = 'ORDER BY score DESC'
    if (options.sort) {
      const desc = options.sort.startsWith('-')
      const sortField = desc ? options.sort.slice(1) : options.sort
      this.assertValidFieldKey(sortField, allowedFields)
      // Use parameterized key access for sort
      orderClause = `ORDER BY (d.content ->> $${paramIndex++}) ${desc ? 'DESC' : 'ASC'}, score DESC`
      values.push(sortField)
    }

    const result = await pool.query(
      `SELECT ${selectClause}
       FROM inhouse_search_documents d
       JOIN inhouse_search_indexes i ON i.id = d.index_id
       ${whereClause}
       ${orderClause}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset]
    )

    // Build hits
    const hits: SearchHit<T>[] = result.rows.map((row) => {
      const hit: SearchHit<T> = {
        id: row.id,
        score: parseFloat(row.score),
        content: row.content as T,
      }

      if (options.highlight) {
        hit.highlights = {}
        for (const field of index.searchableFields) {
          const highlightValue = row[`highlight_${field}`]
          if (highlightValue && highlightValue !== row.content?.[field]) {
            hit.highlights[field] = [highlightValue]
          }
        }
        if (Object.keys(hit.highlights).length === 0) {
          delete hit.highlights
        }
      }

      // Filter select fields
      if (options.select && options.select.length > 0) {
        const filteredContent: Record<string, unknown> = {}
        for (const field of options.select) {
          if ((row.content as Record<string, unknown>)[field] !== undefined) {
            filteredContent[field] = (row.content as Record<string, unknown>)[field]
          }
        }
        hit.content = filteredContent as T
      }

      return hit
    })

    // Log query for stats (fire and forget)
    this.logQuery(projectId, index.id, options.q, total, Date.now() - startTime).catch(() => {})

    return {
      hits,
      total,
      took: Date.now() - startTime,
      hasMore: offset + hits.length < total,
    }
  }

  async suggest(
    projectId: string,
    indexName: string,
    options: SuggestOptions
  ): Promise<SuggestResult> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()
    const startTime = Date.now()

    const index = await this.getIndex(projectId, indexName)
    if (!index) {
      throw { statusCode: 404, code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` }
    }

    const limit = Math.min(options.limit || 5, 20)

    // Use prefix matching on the first searchable field
    const primaryField = index.searchableFields[0]
    if (!primaryField) {
      return { suggestions: [], took: Date.now() - startTime }
    }
    const searchTerm = options.q.toLowerCase().trim()

    // Use parameterized field access for consistency (field is validated at index creation)
    const result = await pool.query<{ value: string }>(
      `SELECT DISTINCT (d.content ->> $3) AS value
       FROM inhouse_search_documents d
       JOIN inhouse_search_indexes i ON i.id = d.index_id
       WHERE d.project_id = $1 AND i.name = $2
         AND LOWER(d.content ->> $3) LIKE $4
       ORDER BY value
       LIMIT $5`,
      [projectId, normalizedName, primaryField, `${searchTerm}%`, limit]
    )

    return {
      suggestions: result.rows.map((row) => row.value),
      took: Date.now() - startTime,
    }
  }

  // --------------------------------------------------------------------------
  // Statistics
  // --------------------------------------------------------------------------

  async getStats(
    projectId: string,
    indexName: string,
    options: { startDate?: string; endDate?: string } = {}
  ): Promise<SearchStats> {
    const pool = getPool()
    const normalizedName = indexName.toLowerCase().trim()

    const index = await this.getIndex(projectId, indexName)
    if (!index) {
      throw { statusCode: 404, code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` }
    }

    const startDate = options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const endDate = options.endDate || new Date().toISOString()

    // Get query stats
    const statsResult = await pool.query<{
      queries: string
      avg_latency: string
    }>(
      `SELECT
         COUNT(*) as queries,
         AVG(latency_ms) as avg_latency
       FROM inhouse_search_queries
       WHERE index_id = $1 AND created_at >= $2 AND created_at <= $3`,
      [index.id, startDate, endDate]
    )

    // Get top queries
    const topQueriesResult = await pool.query<{
      query: string
      count: string
      avg_results: string
    }>(
      `SELECT
         query,
         COUNT(*) as count,
         AVG(result_count) as avg_results
       FROM inhouse_search_queries
       WHERE index_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY query
       ORDER BY count DESC
       LIMIT 10`,
      [index.id, startDate, endDate]
    )

    // Get no-result queries
    const noResultsResult = await pool.query<{
      query: string
      count: string
    }>(
      `SELECT
         query,
         COUNT(*) as count
       FROM inhouse_search_queries
       WHERE index_id = $1 AND created_at >= $2 AND created_at <= $3 AND result_count = 0
       GROUP BY query
       ORDER BY count DESC
       LIMIT 10`,
      [index.id, startDate, endDate]
    )

    const stats = statsResult.rows[0] ?? { queries: '0', avg_latency: '0' }

    return {
      indexName: normalizedName,
      period: { start: startDate, end: endDate },
      totals: {
        documents: index.documentCount,
        queries: parseInt(stats.queries ?? '0', 10),
        averageLatencyMs: parseFloat(stats.avg_latency ?? '0') || 0,
      },
      topQueries: topQueriesResult.rows.map((row) => ({
        query: row.query,
        count: parseInt(row.count, 10),
        avgResults: parseFloat(row.avg_results) || 0,
      })),
      noResultQueries: noResultsResult.rows.map((row) => ({
        query: row.query,
        count: parseInt(row.count, 10),
      })),
    }
  }

  // --------------------------------------------------------------------------
  // Reindex
  // --------------------------------------------------------------------------

  async reindex(projectId: string, indexName: string): Promise<{ jobId: string }> {
    const pool = getPool()

    const index = await this.getIndex(projectId, indexName)
    if (!index) {
      throw { statusCode: 404, code: 'INDEX_NOT_FOUND', message: `Index '${indexName}' not found` }
    }

    const jobId = crypto.randomUUID()

    // Start async reindex (fire and forget)
    this.executeReindex(index).catch((error) => {
      console.error(`Reindex failed for ${indexName}:`, error)
    })

    return { jobId }
  }

  private async executeReindex(index: SearchIndex): Promise<void> {
    const pool = getPool()

    // Single SQL statement using the DB function - much faster than N+1 updates
    await pool.query(
      `UPDATE inhouse_search_documents d
       SET search_vector = inhouse_build_search_vector(
         d.content,
         i.searchable_fields,
         i.field_weights,
         i.language::regconfig
       ),
       updated_at = NOW()
       FROM inhouse_search_indexes i
       WHERE d.index_id = i.id AND i.id = $1`,
      [index.id]
    )
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /**
   * Validate that a field key is allowed (SQL injection prevention).
   * Only allows alphanumeric + underscore, and must be in the allowed set.
   */
  private assertValidFieldKey(key: string, allowedFields: Set<string>): void {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      throw {
        statusCode: 400,
        code: 'INVALID_FILTER_FIELD',
        message: `Invalid field name '${key}': must be alphanumeric with underscores`,
      }
    }
    if (!allowedFields.has(key)) {
      throw {
        statusCode: 400,
        code: 'INVALID_FILTER_FIELD',
        message: `Field '${key}' is not a searchable field`,
      }
    }
  }

  /**
   * Escape HTML tag for use in ts_headline options.
   * Only allows simple tags like <mark>, <b>, <em>.
   */
  private escapeHtmlTag(tag: string): string {
    // Only allow basic alphanumeric tags
    const match = tag.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)>$/)
    if (!match) {
      return '<mark>' // Default if invalid
    }
    return tag
  }

  /**
   * Escape identifier for safe use in SQL.
   * Used for field names from index config (already validated at creation).
   */
  private escapeIdentifier(name: string): string {
    // Double any existing double-quotes and wrap in double-quotes if needed
    return name.replace(/"/g, '""')
  }

  private async logQuery(
    projectId: string,
    indexId: string,
    query: string,
    resultCount: number,
    latencyMs: number
  ): Promise<void> {
    const pool = getPool()

    await pool.query(
      `INSERT INTO inhouse_search_queries (project_id, index_id, query, result_count, latency_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [projectId, indexId, query.substring(0, 500), resultCount, latencyMs]
    )
  }
}

// ============================================================================
// Singleton
// ============================================================================

let serviceInstance: InhouseSearchService | null = null

export function getInhouseSearchService(): InhouseSearchService {
  if (!serviceInstance) {
    serviceInstance = new InhouseSearchService()
  }
  return serviceInstance
}
