import { SanityService } from './sanityService';
import { ServerLoggingService } from './serverLoggingService';
import { pool, getPool } from './databaseWrapper';
import { getCanonicalDocumentId, isDraftDocument } from './sanityService';
import * as crypto from 'crypto';

/**
 * Sanity Content Sync Service
 * Handles document synchronization, querying, and content management
 * Implements efficient GROQ queries with caching and MENA-specific features
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface SanityDocument {
  id: string;
  connection_id: string;
  document_id: string;
  document_type: string;
  document_path?: string;
  revision_id: string;
  last_seen_rev?: string;
  version_type: 'draft' | 'published';
  canonical_document_id: string;
  is_draft: boolean;
  title?: string;
  slug?: string;
  language: string;
  content_hash?: string;
  preview_url?: string;
  published_at?: Date;
  last_modified: Date;
  cached_groq_queries: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface SyncResult {
  success: boolean;
  documents_synced: number;
  documents_updated: number;
  documents_created: number;
  documents_deleted: number;
  errors: string[];
  sync_duration_ms: number;
}

export interface QueryResult<T = any> {
  data: T;
  cached: boolean;
  query_time_ms: number;
  document_dependencies: string[];
}

export interface DocumentFilter {
  document_types?: string[];
  languages?: string[];
  published_only?: boolean;
  include_drafts?: boolean;
  modified_since?: Date;
  limit?: number;
  offset?: number;
}

export interface GroqQueryOptions {
  cache?: boolean;
  cache_ttl_seconds?: number;
  perspective?: 'published' | 'previewDrafts';
  use_cdn?: boolean;
}

// =============================================================================
// CONTENT SYNC SERVICE CLASS
// =============================================================================

export class SanityContentService {
  private static instance: SanityContentService;
  private readonly sanityService: SanityService;
  private readonly loggingService: ServerLoggingService;
  private readonly database = pool;

  constructor() {
    this.sanityService = SanityService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): SanityContentService {
    if (!SanityContentService.instance) {
      SanityContentService.instance = new SanityContentService();
    }
    return SanityContentService.instance;
  }

  // =============================================================================
  // DOCUMENT SYNCHRONIZATION
  // =============================================================================

  /**
   * Sync all documents from Sanity for a connection
   */
  async syncAllDocuments(connection_id: string, options?: {
    force?: boolean;
    document_types?: string[];
    batch_size?: number;
  }): Promise<SyncResult> {
    const startTime = Date.now();
    const { force = false, document_types, batch_size = 100 } = options || {};

    try {
      const client = await this.sanityService.getSanityClient(connection_id);
      const connection = await this.sanityService.getConnection(connection_id);
      
      if (!connection) {
        throw new Error('Connection not found');
      }

      let documentsCreated = 0;
      let documentsUpdated = 0;
      let documentsDeleted = 0;
      const errors: string[] = [];

      // Build GROQ query
      let groqQuery = '*[!(_id in path("_.**"))]'; // Exclude system documents
      
      if (document_types && document_types.length > 0) {
        const typeFilter = document_types.map(type => `_type == "${type}"`).join(' || ');
        groqQuery = `*[!(_id in path("_.**")) && (${typeFilter})]`;
      }

      groqQuery += `{
        _id,
        _type,
        _rev,
        _createdAt,
        _updatedAt,
        title,
        slug,
        language,
        "isDraft": _id match "drafts.*",
        ...
      }`;

      // Fetch documents from Sanity
      const documents = await client.fetch(groqQuery);

      // Process documents in batches
      for (let i = 0; i < documents.length; i += batch_size) {
        const batch = documents.slice(i, i + batch_size);
        
        for (const doc of batch) {
          try {
            const result = await this.syncDocument(connection_id, doc, { force });
            
            if (result.created) {
              documentsCreated++;
            } else if (result.updated) {
              documentsUpdated++;
            }
          } catch (error) {
            errors.push(`Failed to sync document ${doc._id}: ${(error as Error).message}`);
            await this.loggingService.logServerEvent(
              'capacity',
              'error',
              'Document sync failed',
              { 
                connection_id,
                document_id: doc._id,
                error: (error as Error).message
              }
            );
          }
        }

        // Small delay between batches to avoid overwhelming the database
        if (i + batch_size < documents.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Clean up deleted documents (if we have a last sync time)
      if (!force && connection.last_sync_at) {
        documentsDeleted = await this.cleanupDeletedDocuments(connection_id, documents);
      }

      // Update connection sync timestamp
      await getPool()!.query(
        'UPDATE sanity_connections SET last_sync_at = NOW() WHERE id = $1',
        [connection_id]
      );

      const syncDuration = Date.now() - startTime;

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Document sync completed',
        {
          connection_id,
          documents_synced: documents.length,
          documents_created: documentsCreated,
          documents_updated: documentsUpdated,
          documents_deleted: documentsDeleted,
          sync_duration_ms: syncDuration,
          error_count: errors.length
        }
      );

      return {
        success: true,
        documents_synced: documents.length,
        documents_created: documentsCreated,
        documents_updated: documentsUpdated,
        documents_deleted: documentsDeleted,
        errors,
        sync_duration_ms: syncDuration
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'sanity_document_sync_failed',
        error as Error,
        { connection_id }
      );

      return {
        success: false,
        documents_synced: 0,
        documents_created: 0,
        documents_updated: 0,
        documents_deleted: 0,
        errors: [(error as Error).message],
        sync_duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Sync a single document
   */
  async syncDocument(connection_id: string, sanityDoc: any, options?: {
    force?: boolean;
  }): Promise<{ created: boolean; updated: boolean }> {
    const { force = false } = options || {};

    try {
      const documentId = sanityDoc._id;
      const documentType = sanityDoc._type;
      const revisionId = sanityDoc._rev;
      const versionType = isDraftDocument(documentId) ? 'draft' : 'published';
      const canonicalId = getCanonicalDocumentId(documentId);

      // Compute content hash
      const contentHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(sanityDoc))
        .digest('hex');

      // Check if document already exists and is up to date
      if (!force) {
        const existing = await this.getLocalDocument(connection_id, documentId, versionType);
        if (existing && existing.revision_id === revisionId && existing.content_hash === contentHash) {
          return { created: false, updated: false };
        }
      }

      // Extract metadata
      const title = sanityDoc.title || sanityDoc.name || sanityDoc._id;
      const slug = sanityDoc.slug?.current || sanityDoc.slug;
      const language = sanityDoc.language || 'en';
      const lastModified = new Date(sanityDoc._updatedAt || sanityDoc._createdAt || Date.now());
      const publishedAt = versionType === 'published' ? lastModified : null;

      // Upsert document
      const query = `
        INSERT INTO sanity_documents (
          connection_id, document_id, document_type, document_path,
          revision_id, version_type, canonical_document_id,
          title, slug, language, content_hash,
          published_at, last_modified, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (connection_id, document_id, version_type)
        DO UPDATE SET
          revision_id = EXCLUDED.revision_id,
          title = EXCLUDED.title,
          slug = EXCLUDED.slug,
          language = EXCLUDED.language,
          content_hash = EXCLUDED.content_hash,
          published_at = EXCLUDED.published_at,
          last_modified = EXCLUDED.last_modified,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING (xmax = 0) AS was_insert
      `;

      const values = [
        connection_id,
        documentId,
        documentType,
        sanityDoc._path || null,
        revisionId,
        versionType,
        canonicalId,
        title,
        slug,
        language,
        contentHash,
        publishedAt,
        lastModified,
        JSON.stringify(sanityDoc)
      ];

      const result = await getPool()!.query(query, values);
      const wasInsert = result.rows[0].was_insert;

      // Invalidate caches that depend on this document
      await this.invalidateDocumentCaches(connection_id, documentId);

      return {
        created: wasInsert,
        updated: !wasInsert
      };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to sync individual document',
        { 
          connection_id,
          document_id: sanityDoc._id,
          error: (error as Error).message
        }
      );
      throw error;
    }
  }

  /**
   * Clean up documents that no longer exist in Sanity
   */
  private async cleanupDeletedDocuments(connection_id: string, currentDocs: any[]): Promise<number> {
    try {
      const currentDocIds = currentDocs.map(doc => doc._id);
      
      // Find local documents that are not in the current set
      const query = `
        DELETE FROM sanity_documents 
        WHERE connection_id = $1 
        AND document_id != ALL($2)
        AND updated_at < NOW() - INTERVAL '1 hour'
      `;

      const result = await getPool()!.query(query, [connection_id, currentDocIds]);
      return result.rowCount || 0;

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to cleanup deleted documents',
        { connection_id, error: (error as Error).message }
      );
      return 0;
    }
  }

  // =============================================================================
  // DOCUMENT QUERYING
  // =============================================================================

  /**
   * Execute GROQ query with caching
   */
  async executeGroqQuery<T = any>(
    connection_id: string, 
    groqQuery: string, 
    params?: Record<string, any>,
    options?: GroqQueryOptions
  ): Promise<QueryResult<T>> {
    const startTime = Date.now();
    const { 
      cache = true, 
      cache_ttl_seconds = 3600,
      perspective,
      use_cdn
    } = options || {};

    try {
      // Generate query hash for caching
      const queryHash = crypto
        .createHash('sha256')
        .update(groqQuery + JSON.stringify(params || {}))
        .digest('hex');

      // Check cache first
      if (cache) {
        const cached = await this.getCachedQuery(connection_id, queryHash);
        if (cached && !cached.invalidated_at && cached.expires_at > new Date()) {
          await this.updateCacheHitCount(cached.id);
          
          return {
            data: cached.result_data as T,
            cached: true,
            query_time_ms: Date.now() - startTime,
            document_dependencies: cached.depends_on_documents || []
          };
        }
      }

      // Execute query against Sanity
      const client = await this.sanityService.getSanityClient(connection_id);
      
      // Override client config if needed
      if (perspective || use_cdn !== undefined) {
        const connection = await this.sanityService.getConnection(connection_id);
        if (!connection) throw new Error('Connection not found');

        // Create a new client instance with overrides (this would need implementation)
        // For now, use the existing client
      }

      const result = await client.fetch(groqQuery, params || {});
      const queryTime = Date.now() - startTime;

      // Extract document dependencies from the query
      const documentDependencies = this.extractDocumentDependencies(groqQuery, result);

      // Cache the result
      if (cache) {
        await this.cacheQueryResult(connection_id, queryHash, groqQuery, params || {}, result, documentDependencies, cache_ttl_seconds);
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'GROQ query executed successfully',
        {
          connection_id,
          query_hash: queryHash,
          query_time_ms: queryTime,
          result_count: Array.isArray(result) ? result.length : 1,
          cached: false
        }
      );

      return {
        data: result as T,
        cached: false,
        query_time_ms: queryTime,
        document_dependencies: documentDependencies
      };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'GROQ query execution failed',
        { 
          connection_id,
          groq_query: groqQuery,
          error: (error as Error).message
        }
      );
      throw error;
    }
  }

  /**
   * Get documents with filtering
   */
  async getDocuments(connection_id: string, filter?: DocumentFilter): Promise<SanityDocument[]> {
    try {
      let whereClause = 'WHERE connection_id = $1';
      const values: any[] = [connection_id];
      let paramCount = 2;

      if (filter?.document_types && filter.document_types.length > 0) {
        whereClause += ` AND document_type = ANY($${paramCount})`;
        values.push(filter.document_types);
        paramCount++;
      }

      if (filter?.languages && filter.languages.length > 0) {
        whereClause += ` AND language = ANY($${paramCount})`;
        values.push(filter.languages);
        paramCount++;
      }

      if (filter?.published_only) {
        whereClause += ` AND version_type = 'published'`;
      } else if (filter?.include_drafts === false) {
        whereClause += ` AND version_type = 'published'`;
      }

      if (filter?.modified_since) {
        whereClause += ` AND last_modified >= $${paramCount}`;
        values.push(filter.modified_since);
        paramCount++;
      }

      let query = `SELECT * FROM sanity_documents ${whereClause} ORDER BY last_modified DESC`;

      if (filter?.limit) {
        query += ` LIMIT $${paramCount}`;
        values.push(filter.limit);
        paramCount++;
      }

      if (filter?.offset) {
        query += ` OFFSET $${paramCount}`;
        values.push(filter.offset);
      }

      const result = await getPool()!.query(query, values);
      return result.rows.map(row => this.mapDocumentFromDb(row));

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to get documents with filter',
        { connection_id, filter, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * Get a specific document
   */
  async getDocument(connection_id: string, document_id: string, version_type?: 'draft' | 'published'): Promise<SanityDocument | null> {
    try {
      let query = 'SELECT * FROM sanity_documents WHERE connection_id = $1 AND document_id = $2';
      const values = [connection_id, document_id];

      if (version_type) {
        query += ' AND version_type = $3';
        values.push(version_type);
      }

      const result = await getPool()!.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapDocumentFromDb(result.rows[0]);

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to get document',
        { connection_id, document_id, version_type, error: (error as Error).message }
      );
      throw error;
    }
  }

  // =============================================================================
  // QUERY CACHING
  // =============================================================================

  /**
   * Get cached query result
   */
  private async getCachedQuery(connection_id: string, query_hash: string): Promise<any | null> {
    try {
      const result = await getPool()!.query(
        'SELECT * FROM sanity_query_cache WHERE connection_id = $1 AND query_hash = $2',
        [connection_id, query_hash]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      // Log but don't fail - caching is optional
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to get cached query',
        { connection_id, query_hash, error: (error as Error).message }
      );
      return null;
    }
  }

  /**
   * Cache query result
   */
  private async cacheQueryResult(
    connection_id: string,
    query_hash: string,
    groq_query: string,
    query_params: Record<string, any>,
    result_data: any,
    depends_on_documents: string[],
    ttl_seconds: number
  ): Promise<void> {
    try {
      const resultHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(result_data))
        .digest('hex');

      const query = `
        INSERT INTO sanity_query_cache (
          connection_id, query_hash, groq_query, query_params,
          result_data, result_hash, depends_on_documents,
          expires_at, hit_count
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 
          NOW() + INTERVAL '${ttl_seconds} seconds', 0
        )
        ON CONFLICT (connection_id, query_hash)
        DO UPDATE SET
          result_data = EXCLUDED.result_data,
          result_hash = EXCLUDED.result_hash,
          depends_on_documents = EXCLUDED.depends_on_documents,
          expires_at = EXCLUDED.expires_at,
          invalidated_at = NULL,
          updated_at = NOW()
        RETURNING id
      `;

      const values = [
        connection_id,
        query_hash,
        groq_query,
        JSON.stringify(query_params),
        JSON.stringify(result_data),
        resultHash,
        depends_on_documents
      ];

      const cacheResult = await getPool()!.query(query, values);
      const cacheId = cacheResult.rows[0].id;

      // Store document dependencies in separate table
      if (depends_on_documents.length > 0) {
        for (const docId of depends_on_documents) {
          await getPool()!.query(
            'INSERT INTO sanity_query_dependencies (query_cache_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [cacheId, docId]
          );
        }
      }

    } catch (error) {
      // Log but don't fail - caching is optional
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to cache query result',
        { connection_id, query_hash, error: (error as Error).message }
      );
    }
  }

  /**
   * Update cache hit count
   */
  private async updateCacheHitCount(cache_id: string): Promise<void> {
    try {
      await getPool()!.query(
        'UPDATE sanity_query_cache SET hit_count = hit_count + 1, last_hit = NOW() WHERE id = $1',
        [cache_id]
      );
    } catch (error) {
      // Ignore errors for hit count updates
    }
  }

  /**
   * Invalidate caches for a specific document
   */
  private async invalidateDocumentCaches(connection_id: string, document_id: string): Promise<void> {
    try {
      // Invalidate caches that depend on this document
      await getPool()!.query(`
        UPDATE sanity_query_cache 
        SET invalidated_at = NOW()
        WHERE connection_id = $1 
        AND (
          depends_on_documents @> ARRAY[$2] OR
          id IN (
            SELECT query_cache_id 
            FROM sanity_query_dependencies 
            WHERE document_id = $2
          )
        )
      `, [connection_id, document_id]);

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to invalidate document caches',
        { connection_id, document_id, error: (error as Error).message }
      );
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Get local document record
   */
  private async getLocalDocument(connection_id: string, document_id: string, version_type: string): Promise<any | null> {
    const result = await getPool()!.query(
      'SELECT * FROM sanity_documents WHERE connection_id = $1 AND document_id = $2 AND version_type = $3',
      [connection_id, document_id, version_type]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Extract document dependencies from GROQ query and result
   */
  private extractDocumentDependencies(groqQuery: string, result: any): string[] {
    const dependencies: string[] = [];

    // Extract document IDs from result
    if (result) {
      const extractIds = (obj: any): void => {
        if (typeof obj === 'object' && obj !== null) {
          if (obj._id && typeof obj._id === 'string') {
            dependencies.push(obj._id);
          }
          
          if (Array.isArray(obj)) {
            obj.forEach(extractIds);
          } else {
            Object.values(obj).forEach(extractIds);
          }
        }
      };

      extractIds(result);
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Map database row to document object
   */
  private mapDocumentFromDb(row: any): SanityDocument {
    return {
      id: row.id,
      connection_id: row.connection_id,
      document_id: row.document_id,
      document_type: row.document_type,
      document_path: row.document_path,
      revision_id: row.revision_id,
      last_seen_rev: row.last_seen_rev,
      version_type: row.version_type,
      canonical_document_id: row.canonical_document_id,
      is_draft: row.is_draft,
      title: row.title,
      slug: row.slug,
      language: row.language || 'en',
      content_hash: row.content_hash,
      preview_url: row.preview_url,
      published_at: row.published_at,
      last_modified: row.last_modified,
      cached_groq_queries: row.cached_groq_queries || {},
      metadata: row.metadata || {},
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Get cache statistics for a connection
   */
  async getCacheStats(connection_id: string): Promise<{
    total_cached_queries: number;
    cache_hit_rate: number;
    cache_size_mb: number;
    most_popular_queries: Array<{ query: string; hit_count: number }>;
  }> {
    try {
      // Total cached queries
      const totalResult = await getPool()!.query(
        'SELECT COUNT(*) as total FROM sanity_query_cache WHERE connection_id = $1',
        [connection_id]
      );
      
      const total = parseInt(totalResult.rows[0].total);

      // Hit rate calculation
      const hitRateResult = await getPool()!.query(`
        SELECT 
          SUM(hit_count) as total_hits,
          COUNT(*) as total_queries
        FROM sanity_query_cache 
        WHERE connection_id = $1
      `, [connection_id]);

      const hitRate = total > 0 ? 
        (parseInt(hitRateResult.rows[0].total_hits) / total) : 0;

      // Cache size (rough estimate)
      const sizeResult = await getPool()!.query(`
        SELECT pg_column_size(result_data) as size 
        FROM sanity_query_cache 
        WHERE connection_id = $1
      `, [connection_id]);

      const sizeBytes = sizeResult.rows.reduce((sum: number, row: any) => sum + (row.size || 0), 0);
      const sizeMB = sizeBytes / (1024 * 1024);

      // Most popular queries
      const popularResult = await getPool()!.query(`
        SELECT groq_query, hit_count 
        FROM sanity_query_cache 
        WHERE connection_id = $1 
        ORDER BY hit_count DESC 
        LIMIT 5
      `, [connection_id]);

      return {
        total_cached_queries: total,
        cache_hit_rate: hitRate,
        cache_size_mb: Math.round(sizeMB * 100) / 100,
        most_popular_queries: popularResult.rows.map(row => ({
          query: row.groq_query.substring(0, 100) + (row.groq_query.length > 100 ? '...' : ''),
          hit_count: row.hit_count
        }))
      };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to get cache stats',
        { connection_id, error: (error as Error).message }
      );

      return {
        total_cached_queries: 0,
        cache_hit_rate: 0,
        cache_size_mb: 0,
        most_popular_queries: []
      };
    }
  }

  /**
   * Clear query cache for a connection
   */
  async clearQueryCache(connection_id: string, query_hash?: string): Promise<number> {
    try {
      let query = 'DELETE FROM sanity_query_cache WHERE connection_id = $1';
      const values = [connection_id];

      if (query_hash) {
        query += ' AND query_hash = $2';
        values.push(query_hash);
      }

      const result = await getPool()!.query(query, values);
      return result.rowCount || 0;

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to clear query cache',
        { connection_id, query_hash, error: (error as Error).message }
      );
      throw error;
    }
  }
}