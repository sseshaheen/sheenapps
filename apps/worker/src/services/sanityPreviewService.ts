import * as crypto from 'crypto';
import { SanityService } from './sanityService';
import { SanityContentService } from './sanityContentService';
import { ServerLoggingService } from './serverLoggingService';
import { pool, getPool } from './databaseWrapper';

/**
 * Sanity Preview Service
 * Handles secure preview URL generation, token management, and MENA-specific previews
 * Implements SHA-256 hashing for security and supports TTL expiry and single-use options
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface SanityPreviewDeployment {
  id: string;
  connection_id: string;
  preview_url: string;
  preview_secret_hash: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  deployment_id?: string | undefined;
  preview_secret_ttl: Date;
  used_at?: Date | undefined;
  single_use: boolean;
  preview_theme: {
    fontFamily: string;
    numeralSystem: string;
    rtl: boolean;
    [key: string]: any;
  };
  document_ids: string[];
  content_hash: string;
  status: 'active' | 'expired' | 'invalidated';
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CreatePreviewOptions {
  document_ids: string[];
  preview_url: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  deployment_id?: string | undefined;
  ttl_hours?: number | undefined;
  single_use?: boolean | undefined;
  theme_overrides?: Partial<{
    fontFamily: string;
    numeralSystem: 'western' | 'eastern';
    rtl: boolean;
    primaryColor: string;
    backgroundColor: string;
  }> | undefined;
}

export interface ValidatePreviewResult {
  valid: boolean;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  preview?: SanityPreviewDeployment | undefined;
  error?: string | undefined;
  used?: boolean | undefined;
  expired?: boolean | undefined;
}

export interface PreviewContent {
  documents: any[];
  theme: any;
  metadata: {
    connection_id: string;
    generated_at: string;
    expires_at: string;
    document_count: number;
    languages: string[];
  };
}

// =============================================================================
// PREVIEW SERVICE CLASS
// =============================================================================

export class SanityPreviewService {
  private static instance: SanityPreviewService;
  private readonly sanityService: SanityService;
  private readonly contentService: SanityContentService;
  private readonly loggingService: ServerLoggingService;
  private readonly database = pool;

  // Default MENA-optimized theme
  private readonly DEFAULT_MENA_THEME = {
    fontFamily: 'Cairo, Tajawal, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto',
    numeralSystem: 'eastern',
    rtl: true,
    primaryColor: '#1976d2',
    backgroundColor: '#ffffff',
    textColor: '#333333',
    linkColor: '#1976d2'
  };

  constructor() {
    this.sanityService = SanityService.getInstance();
    this.contentService = SanityContentService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): SanityPreviewService {
    if (!SanityPreviewService.instance) {
      SanityPreviewService.instance = new SanityPreviewService();
    }
    return SanityPreviewService.instance;
  }

  // =============================================================================
  // PREVIEW CREATION & MANAGEMENT
  // =============================================================================

  /**
   * Create a new preview deployment with secure token
   */
  async createPreview(connection_id: string, options: CreatePreviewOptions): Promise<{
    preview: SanityPreviewDeployment;
    secret: string;
  }> {
    try {
      const {
        document_ids,
        preview_url,
        deployment_id,
        ttl_hours = 24,
        single_use = false,
        theme_overrides = {}
      } = options;

      // Validate connection
      const connection = await this.sanityService.getConnection(connection_id);
      if (!connection) {
        throw new Error('Connection not found');
      }

      // Generate secure preview secret
      const previewSecret = this.generatePreviewSecret();
      const previewSecretHash = this.hashPreviewSecret(previewSecret);

      // Fetch document content for hash generation
      const documents = await Promise.all(
        document_ids.map(id => this.contentService.getDocument(connection_id, id))
      );

      const validDocuments = documents.filter(doc => doc !== null);
      if (validDocuments.length === 0) {
        throw new Error('No valid documents found for preview');
      }

      // Generate content hash
      const contentHash = this.generateContentHash(validDocuments);

      // Merge theme with MENA defaults
      const previewTheme = {
        ...this.DEFAULT_MENA_THEME,
        ...theme_overrides
      };

      // Calculate expiry times
      const ttlDate = new Date();
      ttlDate.setHours(ttlDate.getHours() + ttl_hours);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ttl_hours);

      // Store preview deployment
      const query = `
        INSERT INTO sanity_preview_deployments (
          connection_id, preview_url, preview_secret_hash, deployment_id,
          preview_secret_ttl, single_use, preview_theme,
          document_ids, content_hash, status, expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10
        ) RETURNING *
      `;

      const values = [
        connection_id,
        preview_url,
        previewSecretHash,
        deployment_id,
        ttlDate,
        single_use,
        JSON.stringify(previewTheme),
        document_ids,
        contentHash,
        expiresAt
      ];

      const result = await getPool()!.query(query, values);
      const previewDeployment = this.mapPreviewFromDb(result.rows[0]);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Sanity preview created successfully',
        {
          connection_id,
          preview_id: previewDeployment.id,
          document_count: document_ids.length,
          ttl_hours,
          single_use
        }
      );

      return {
        preview: previewDeployment,
        secret: previewSecret
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'sanity_preview_creation_failed',
        error as Error,
        { connection_id, document_count: options.document_ids.length }
      );
      throw error;
    }
  }

  /**
   * Validate preview secret and get preview data
   */
  async validatePreviewSecret(preview_id: string, secret: string): Promise<ValidatePreviewResult> {
    try {
      // Get preview deployment
      const preview = await this.getPreview(preview_id);
      if (!preview) {
        return {
          valid: false,
          error: 'Preview not found'
        };
      }

      // Check if expired
      if (preview.expires_at < new Date() || preview.preview_secret_ttl < new Date()) {
        await this.markPreviewExpired(preview_id);
        return {
          valid: false,
          preview,
          error: 'Preview expired',
          expired: true
        };
      }

      // Check if already used (for single-use previews)
      if (preview.single_use && preview.used_at) {
        return {
          valid: false,
          preview,
          error: 'Preview already used',
          used: true
        };
      }

      // Validate secret using timing-safe comparison
      const providedHash = this.hashPreviewSecret(secret);
      const expectedHash = Buffer.from(preview.preview_secret_hash, 'hex');
      const providedHashBuffer = Buffer.from(providedHash, 'hex');

      const isValid = expectedHash.length === providedHashBuffer.length && 
                     crypto.timingSafeEqual(expectedHash, providedHashBuffer);

      if (!isValid) {
        await this.loggingService.logServerEvent(
          'capacity',
          'warn',
          'Invalid preview secret attempt',
          { preview_id }
        );

        return {
          valid: false,
          preview,
          error: 'Invalid preview secret'
        };
      }

      // Mark as used if single-use
      if (preview.single_use) {
        await this.markPreviewUsed(preview_id);
        preview.used_at = new Date();
      }

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Preview secret validated successfully',
        { preview_id, single_use: preview.single_use }
      );

      return {
        valid: true,
        preview
      };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Preview secret validation failed',
        { preview_id, error: (error as Error).message }
      );

      return {
        valid: false,
        error: (error as Error).message
      };
    }
  }

  /**
   * Get preview content with documents and theme
   */
  async getPreviewContent(preview_id: string): Promise<PreviewContent | null> {
    try {
      const preview = await this.getPreview(preview_id);
      if (!preview) {
        return null;
      }

      // Fetch all documents for this preview
      const documents = await Promise.all(
        preview.document_ids.map(async (document_id) => {
          const doc = await this.contentService.getDocument(preview.connection_id, document_id);
          return doc ? doc.metadata : null;
        })
      );

      const validDocuments = documents.filter(doc => doc !== null);

      // Extract languages
      const languages = [...new Set(validDocuments.map(doc => doc.language || 'en'))];

      return {
        documents: validDocuments,
        theme: preview.preview_theme,
        metadata: {
          connection_id: preview.connection_id,
          generated_at: preview.created_at.toISOString(),
          expires_at: preview.expires_at.toISOString(),
          document_count: validDocuments.length,
          languages
        }
      };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to get preview content',
        { preview_id, error: (error as Error).message }
      );
      return null;
    }
  }

  // =============================================================================
  // PREVIEW QUERIES & MANAGEMENT
  // =============================================================================

  /**
   * Get preview deployment by ID
   */
  async getPreview(preview_id: string): Promise<SanityPreviewDeployment | null> {
    try {
      const result = await getPool()!.query(
        'SELECT * FROM sanity_preview_deployments WHERE id = $1',
        [preview_id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapPreviewFromDb(result.rows[0]);

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to get preview',
        { preview_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * List preview deployments for a connection
   */
  async listPreviews(connection_id: string, options?: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    status?: 'active' | 'expired' | 'invalidated' | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ previews: SanityPreviewDeployment[]; total: number }> {
    try {
      const { status, limit = 50, offset = 0 } = options || {};

      let whereClause = 'WHERE connection_id = $1';
      const values: any[] = [connection_id];
      let paramCount = 2;

      if (status) {
        whereClause += ` AND status = $${paramCount}`;
        values.push(status);
        paramCount++;
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM sanity_preview_deployments ${whereClause}`;
      const countResult = await getPool()!.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get previews
      const previewsQuery = `
        SELECT * FROM sanity_preview_deployments 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;
      
      const previewsResult = await getPool()!.query(previewsQuery, [...values, limit, offset]);
      const previews = previewsResult.rows.map(row => this.mapPreviewFromDb(row));

      return { previews, total };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to list previews',
        { connection_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * Invalidate a preview (revoke access)
   */
  async invalidatePreview(preview_id: string): Promise<void> {
    try {
      await getPool()!.query(
        'UPDATE sanity_preview_deployments SET status = $1, updated_at = NOW() WHERE id = $2',
        ['invalidated', preview_id]
      );

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Preview invalidated',
        { preview_id }
      );

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to invalidate preview',
        { preview_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * Clean up expired previews
   */
  async cleanupExpiredPreviews(connection_id?: string): Promise<number> {
    try {
      let query = `
        UPDATE sanity_preview_deployments 
        SET status = 'expired', updated_at = NOW()
        WHERE status = 'active' AND expires_at < NOW()
      `;
      const values: any[] = [];

      if (connection_id) {
        query += ' AND connection_id = $1';
        values.push(connection_id);
      }

      const result = await getPool()!.query(query, values);
      const cleanedUp = result.rowCount || 0;

      if (cleanedUp > 0) {
        await this.loggingService.logServerEvent(
          'capacity',
          'info',
          'Expired previews cleaned up',
          { connection_id, cleaned_up: cleanedUp }
        );
      }

      return cleanedUp;

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to cleanup expired previews',
        { connection_id, error: (error as Error).message }
      );
      return 0;
    }
  }

  // =============================================================================
  // SECURITY & UTILITY METHODS
  // =============================================================================

  /**
   * Generate secure preview secret
   */
  private generatePreviewSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash preview secret using SHA-256
   */
  private hashPreviewSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Generate content hash for change detection
   */
  private generateContentHash(documents: any[]): string {
    const contentString = documents
      .map(doc => `${doc.document_id}:${doc.revision_id}:${doc.content_hash}`)
      .sort()
      .join('|');

    return crypto.createHash('sha256').update(contentString).digest('hex');
  }

  /**
   * Mark preview as used
   */
  private async markPreviewUsed(preview_id: string): Promise<void> {
    await getPool()!.query(
      'UPDATE sanity_preview_deployments SET used_at = NOW(), updated_at = NOW() WHERE id = $1',
      [preview_id]
    );
  }

  /**
   * Mark preview as expired
   */
  private async markPreviewExpired(preview_id: string): Promise<void> {
    await getPool()!.query(
      'UPDATE sanity_preview_deployments SET status = $1, updated_at = NOW() WHERE id = $2',
      ['expired', preview_id]
    );
  }

  /**
   * Map database row to preview object
   */
  private mapPreviewFromDb(row: any): SanityPreviewDeployment {
    return {
      id: row.id,
      connection_id: row.connection_id,
      preview_url: row.preview_url,
      preview_secret_hash: row.preview_secret_hash,
      deployment_id: row.deployment_id,
      preview_secret_ttl: row.preview_secret_ttl,
      used_at: row.used_at,
      single_use: row.single_use,
      preview_theme: row.preview_theme || this.DEFAULT_MENA_THEME,
      document_ids: row.document_ids || [],
      content_hash: row.content_hash,
      status: row.status,
      expires_at: row.expires_at,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Generate preview URL with embedded secret
   */
  generatePreviewUrl(base_url: string, preview_id: string, secret: string): string {
    const url = new URL(base_url);
    url.searchParams.set('preview', preview_id);
    url.searchParams.set('secret', secret);
    return url.toString();
  }

  /**
   * Extract preview parameters from URL
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  extractPreviewParams(url: string): { preview_id?: string | undefined; secret?: string | undefined } {
    try {
      const urlObj = new URL(url);
      return {
        preview_id: urlObj.searchParams.get('preview') || undefined,
        secret: urlObj.searchParams.get('secret') || undefined
      };
    } catch {
      return {};
    }
  }

  /**
   * Get preview statistics for a connection
   */
  async getPreviewStats(connection_id: string): Promise<{
    total_previews: number;
    active_previews: number;
    expired_previews: number;
    single_use_previews: number;
    most_previewed_documents: Array<{ document_id: string; preview_count: number }>;
  }> {
    try {
      // Basic counts
      const countsResult = await getPool()!.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired,
          SUM(CASE WHEN single_use = true THEN 1 ELSE 0 END) as single_use
        FROM sanity_preview_deployments 
        WHERE connection_id = $1
      `, [connection_id]);

      const counts = countsResult.rows[0];

      // Most previewed documents
      const docsResult = await getPool()!.query(`
        SELECT 
          unnest(document_ids) as document_id,
          COUNT(*) as preview_count
        FROM sanity_preview_deployments 
        WHERE connection_id = $1
        GROUP BY document_id
        ORDER BY preview_count DESC
        LIMIT 5
      `, [connection_id]);

      return {
        total_previews: parseInt(counts.total),
        active_previews: parseInt(counts.active),
        expired_previews: parseInt(counts.expired),
        single_use_previews: parseInt(counts.single_use),
        most_previewed_documents: docsResult.rows
      };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Failed to get preview stats',
        { connection_id, error: (error as Error).message }
      );

      return {
        total_previews: 0,
        active_previews: 0,
        expired_previews: 0,
        single_use_previews: 0,
        most_previewed_documents: []
      };
    }
  }
}