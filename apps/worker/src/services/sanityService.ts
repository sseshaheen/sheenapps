import { createClient, SanityClient, ClientConfig } from '@sanity/client';
import { TokenEncryptionService } from './tokenEncryptionService';
import { ServerLoggingService } from './serverLoggingService';
import { pool, getPool } from './databaseWrapper';
import { SanityBreakglassService } from './sanityBreakglassService';

/**
 * Core Sanity CMS Service
 * Handles connection management, authentication, and basic operations
 * Follows the Vercel integration pattern with dedicated tables and type safety
 */

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

export interface SanityConnection {
  id: string;
  user_id: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  project_id?: string | undefined;
  sanity_project_id: string;
  dataset_name: string;
  project_title?: string | undefined;
  
  // Authentication (encrypted)
  auth_token_encrypted: string;
  auth_token_iv: string;
  auth_token_auth_tag: string;
  robot_token_encrypted?: string;
  robot_token_iv?: string;
  robot_token_auth_tag?: string;
  token_type: 'personal' | 'robot' | 'jwt';
  token_expires_at?: Date;
  
  // Configuration
  api_version: string;
  use_cdn: boolean;
  perspective: 'published' | 'previewDrafts';
  realtime_enabled: boolean;
  webhook_secret?: string;
  
  // Schema tracking
  schema_version?: string;
  content_types: any[];
  last_schema_sync?: Date;
  
  // Health monitoring
  status: 'connected' | 'disconnected' | 'error' | 'revoked' | 'expired';
  error_message?: string;
  last_health_check?: Date;
  circuit_breaker_state: {
    consecutive_failures: number;
    is_open: boolean;
    last_failure_at?: Date;
    open_until?: Date;
  };
  
  // Real-time tracking
  last_webhook_event_id?: string;
  
  // MENA configuration
  i18n_strategy: 'document' | 'field';
  slug_policy: {
    mode: string;
    transliterate: boolean;
  };
  
  // Bridge to unified platform
  integration_connection_id?: string;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
  last_sync_at?: Date;
}

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

export interface SanityClientOptions {
  projectId: string;
  dataset: string;
  apiVersion: string;
  token: string;
  useCdn: boolean;
  perspective: 'published' | 'previewDrafts';
}

export interface SanityConnectionTestResult {
  success: boolean;
  message: string;
  projectInfo?: {
    id: string;
    name: string;
    datasets: string[];
  };
  error?: string;
}

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

export class SanityService {
  private static instance: SanityService;
  private readonly tokenEncryption: TokenEncryptionService;
  private readonly loggingService: ServerLoggingService;
  private readonly database = pool;
  private readonly breakglassService: SanityBreakglassService;
  private readonly clientCache = new Map<string, SanityClient>();
  
  // Circuit breaker configuration
  private readonly CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;
  private readonly CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute

  constructor() {
    this.tokenEncryption = TokenEncryptionService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
    this.breakglassService = SanityBreakglassService.getInstance();
  }

  static getInstance(): SanityService {
    if (!SanityService.instance) {
      SanityService.instance = new SanityService();
    }
    return SanityService.instance;
  }

  // =============================================================================
  // CONNECTION MANAGEMENT
  // =============================================================================

  /**
   * Create a new Sanity connection
   */
  async createConnection(params: {
    user_id: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    project_id?: string | undefined;
    sanity_project_id: string;
    dataset_name: string;
    project_title?: string | undefined;
    auth_token: string;
    robot_token?: string | undefined;
    token_type?: 'personal' | 'robot' | 'jwt' | undefined;
    api_version?: string | undefined;
    use_cdn?: boolean | undefined;
    perspective?: 'published' | 'previewDrafts' | undefined;
    realtime_enabled?: boolean | undefined;
    webhook_secret?: string | undefined;
    i18n_strategy?: 'document' | 'field' | undefined;
  }): Promise<SanityConnection> {
    try {
      // First test the connection to validate credentials
      const testResult = await this.testConnection({
        projectId: params.sanity_project_id,
        dataset: params.dataset_name,
        apiVersion: params.api_version || '2023-05-03',
        token: params.auth_token,
        useCdn: params.use_cdn !== false,
        perspective: params.perspective || 'published'
      });

      if (!testResult.success) {
        throw new Error(`Connection test failed: ${testResult.message}`);
      }

      // Encrypt tokens
      const authTokenEncrypted = await this.tokenEncryption.encryptToken(params.auth_token);
      let robotTokenEncrypted: any = null;
      
      if (params.robot_token) {
        robotTokenEncrypted = await this.tokenEncryption.encryptToken(params.robot_token);
      }

      // Generate webhook secret if not provided
      const webhookSecret = params.webhook_secret || this.generateWebhookSecret();

      // Create connection record
      const query = `
        INSERT INTO sanity_connections (
          user_id, project_id, sanity_project_id, dataset_name, project_title,
          auth_token_encrypted, auth_token_iv, auth_token_auth_tag,
          robot_token_encrypted, robot_token_iv, robot_token_auth_tag,
          token_type, api_version, use_cdn, perspective,
          realtime_enabled, webhook_secret, i18n_strategy, slug_policy,
          status, circuit_breaker_state
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19,
          'connected', $20
        ) RETURNING *
      `;

      const values = [
        params.user_id,
        params.project_id || null,
        params.sanity_project_id,
        params.dataset_name,
        params.project_title || testResult.projectInfo?.name,
        authTokenEncrypted.encrypted,
        authTokenEncrypted.iv,
        authTokenEncrypted.authTag,
        robotTokenEncrypted?.encrypted || null,
        robotTokenEncrypted?.iv || null,
        robotTokenEncrypted?.authTag || null,
        params.token_type || 'personal',
        params.api_version || '2023-05-03',
        params.use_cdn !== false,
        params.perspective || 'published',
        params.realtime_enabled !== false,
        webhookSecret,
        params.i18n_strategy || 'document',
        JSON.stringify({ mode: 'native', transliterate: false }),
        JSON.stringify({
          consecutive_failures: 0,
          is_open: false,
          last_failure_at: null,
          open_until: null
        })
      ];

      const result = await getPool()!.query(query, values);
      const connection = this.mapConnectionFromDb(result.rows[0]);

      await this.loggingService.logServerEvent(
        'health',
        'info',
        'Sanity connection created successfully',
        {
          connection_id: connection.id,
          sanity_project_id: params.sanity_project_id,
          dataset_name: params.dataset_name,
          user_id: params.user_id
        }
      );

      // Create breakglass entry (always-on plaintext fallback)
      try {
        await this.breakglassService.createBreakglassEntry({
          connection_id: connection.id,
          user_id: params.user_id,
          project_id: params.project_id,
          auth_token: params.auth_token,
          robot_token: params.robot_token,
          webhook_secret: webhookSecret,
          sanity_project_id: params.sanity_project_id,
          dataset_name: params.dataset_name,
          project_title: params.project_title || testResult.projectInfo?.name,
          api_version: params.api_version || '2023-05-03',
          reason: 'automatic_on_connection_create'
        });
      } catch (breakglassError) {
        await this.loggingService.logCriticalError(
          'sanity_breakglass_creation_failed',
          breakglassError as Error,
          { 
            connection_id: connection.id,
            user_id: params.user_id,
            sanity_project_id: params.sanity_project_id 
          }
        );
        // Don't fail connection creation if breakglass fails
      }

      // Trigger initial schema sync
      this.syncSchemaInBackground(connection.id).catch(error => {
        this.loggingService.logServerEvent(
          'capacity',
          'error',
          'Failed to sync schema after connection creation',
          { connection_id: connection.id, error: error.message }
        );
      });

      return connection;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'sanity_connection_creation_failed',
        error as Error,
        {
          sanity_project_id: params.sanity_project_id,
          dataset_name: params.dataset_name,
          user_id: params.user_id
        }
      );
      throw error;
    }
  }

  /**
   * Get a Sanity connection by ID
   */
  async getConnection(connection_id: string, user_id?: string): Promise<SanityConnection | null> {
    try {
      let query = `SELECT * FROM sanity_connections WHERE id = $1`;
      const values = [connection_id];

      if (user_id) {
        query += ` AND user_id = $2`;
        values.push(user_id);
      }

      const result = await getPool()!.query(query, values);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapConnectionFromDb(result.rows[0]);
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to retrieve Sanity connection',
        { connection_id, user_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * List all Sanity connections for a user
   */
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  async listConnections(user_id: string, project_id?: string | undefined): Promise<SanityConnection[]> {
    try {
      let query = `SELECT * FROM sanity_connections WHERE user_id = $1`;
      const values = [user_id];

      if (project_id) {
        query += ` AND project_id = $2`;
        values.push(project_id);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await getPool()!.query(query, values);
      return result.rows.map(row => this.mapConnectionFromDb(row));
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to list Sanity connections',
        { user_id, project_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * Update a Sanity connection
   */
  async updateConnection(connection_id: string, updates: Partial<{
    project_title: string;
    api_version: string;
    use_cdn: boolean;
    perspective: 'published' | 'previewDrafts';
    realtime_enabled: boolean;
    i18n_strategy: 'document' | 'field';
    slug_policy: { mode: string; transliterate: boolean };
  }>): Promise<SanityConnection> {
    try {
      const setClause = [];
      const values = [];
      let paramCount = 1;

      for (const [key, value] of Object.entries(updates)) {
        if (key === 'slug_policy') {
          setClause.push(`${key} = $${paramCount}`);
          values.push(JSON.stringify(value));
        } else {
          setClause.push(`${key} = $${paramCount}`);
          values.push(value);
        }
        paramCount++;
      }

      if (setClause.length === 0) {
        throw new Error('No updates provided');
      }

      const query = `
        UPDATE sanity_connections 
        SET ${setClause.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING *
      `;

      values.push(connection_id);

      const result = await getPool()!.query(query, values);
      
      if (result.rows.length === 0) {
        throw new Error('Connection not found');
      }

      // Clear cached client to pick up changes
      this.clientCache.delete(connection_id);

      return this.mapConnectionFromDb(result.rows[0]);
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to update Sanity connection',
        { connection_id, updates, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * Delete a Sanity connection
   */
  async deleteConnection(connection_id: string, user_id?: string): Promise<void> {
    try {
      let query = `DELETE FROM sanity_connections WHERE id = $1`;
      const values = [connection_id];

      if (user_id) {
        query += ` AND user_id = $2`;
        values.push(user_id);
      }

      const result = await getPool()!.query(query, values);
      
      if (result.rowCount === 0) {
        throw new Error('Connection not found or unauthorized');
      }

      // Clear cached client
      this.clientCache.delete(connection_id);

      await this.loggingService.logServerEvent(
        'health',
        'info',
        'Sanity connection deleted',
        { connection_id, user_id }
      );
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to delete Sanity connection',
        { connection_id, user_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  // =============================================================================
  // SANITY CLIENT MANAGEMENT
  // =============================================================================

  /**
   * Get authenticated Sanity client for a connection
   */
  async getSanityClient(connection_id: string): Promise<SanityClient> {
    // Check cache first
    if (this.clientCache.has(connection_id)) {
      return this.clientCache.get(connection_id)!;
    }

    const connection = await this.getConnection(connection_id);
    if (!connection) {
      throw new Error('Connection not found');
    }

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(connection)) {
      throw new Error('Connection circuit breaker is open - too many recent failures');
    }

    try {
      // Decrypt token
      const authToken = await this.tokenEncryption.decryptToken({
        encrypted: connection.auth_token_encrypted,
        iv: connection.auth_token_iv,
        authTag: connection.auth_token_auth_tag
      });

      // Create client
      const client = createClient({
        projectId: connection.sanity_project_id,
        dataset: connection.dataset_name,
        apiVersion: connection.api_version,
        token: authToken,
        useCdn: connection.use_cdn,
        perspective: connection.perspective
      });

      // Cache client for reuse
      this.clientCache.set(connection_id, client);

      return client;
    } catch (error) {
      await this.recordConnectionFailure(connection_id);
      throw new Error(`Failed to create Sanity client: ${(error as Error).message}`);
    }
  }

  /**
   * Test a Sanity connection
   */
  async testConnection(options: SanityClientOptions): Promise<SanityConnectionTestResult> {
    try {
      const client = createClient(options);
      
      // Test basic connectivity by fetching project info
      const project = await client.request({
        uri: `/projects/${options.projectId}`,
        method: 'GET'
      });

      return {
        success: true,
        message: 'Connection successful',
        projectInfo: {
          id: project.id,
          name: project.displayName || project.id,
          datasets: project.datasets || [options.dataset]
        }
      };
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      return {
        success: false,
        message: 'Connection failed',
        error: errorMessage
      };
    }
  }

  /**
   * Test an existing connection's health
   */
  async testConnectionHealth(connection_id: string): Promise<SanityConnectionTestResult> {
    try {
      const client = await this.getSanityClient(connection_id);
      
      // Simple query to test connectivity
      const result = await client.fetch('*[_type == "sanity.projectSettings"][0]');
      
      // Update last health check
      await getPool()!.query(
        'UPDATE sanity_connections SET last_health_check = NOW() WHERE id = $1',
        [connection_id]
      );

      await this.recordConnectionSuccess(connection_id);

      return {
        success: true,
        message: 'Health check passed'
      };
    } catch (error) {
      await this.recordConnectionFailure(connection_id);
      
      return {
        success: false,
        message: 'Health check failed',
        error: (error as Error).message
      };
    }
  }

  // =============================================================================
  // CIRCUIT BREAKER LOGIC
  // =============================================================================

  private isCircuitBreakerOpen(connection: SanityConnection): boolean {
    const { circuit_breaker_state } = connection;
    
    if (!circuit_breaker_state.is_open) {
      return false;
    }

    // Check if timeout has expired
    if (circuit_breaker_state.open_until && new Date() > new Date(circuit_breaker_state.open_until)) {
      // Reset circuit breaker
      this.resetCircuitBreaker(connection.id).catch(error => {
        this.loggingService.logServerEvent(
          'capacity',
          'error',
          'Failed to reset circuit breaker',
          { connection_id: connection.id, error: error.message }
        );
      });
      return false;
    }

    return true;
  }

  private async recordConnectionFailure(connection_id: string): Promise<void> {
    try {
      const query = `
        UPDATE sanity_connections 
        SET circuit_breaker_state = jsonb_set(
          jsonb_set(
            jsonb_set(
              circuit_breaker_state,
              '{consecutive_failures}',
              ((circuit_breaker_state->>'consecutive_failures')::int + 1)::text::jsonb
            ),
            '{last_failure_at}',
            to_jsonb(NOW())
          ),
          '{is_open}',
          CASE 
            WHEN ((circuit_breaker_state->>'consecutive_failures')::int + 1) >= $2
            THEN 'true'::jsonb
            ELSE 'false'::jsonb
          END
        ),
        circuit_breaker_state = CASE
          WHEN ((circuit_breaker_state->>'consecutive_failures')::int + 1) >= $2
          THEN jsonb_set(
            circuit_breaker_state,
            '{open_until}',
            to_jsonb(NOW() + INTERVAL '${this.CIRCUIT_BREAKER_TIMEOUT} milliseconds')
          )
          ELSE circuit_breaker_state
        END,
        status = 'error',
        updated_at = NOW()
        WHERE id = $1
      `;

      await getPool()!.query(query, [connection_id, this.CIRCUIT_BREAKER_FAILURE_THRESHOLD]);
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to record connection failure',
        { connection_id, error: (error as Error).message }
      );
    }
  }

  private async recordConnectionSuccess(connection_id: string): Promise<void> {
    try {
      await getPool()!.query(`
        UPDATE sanity_connections 
        SET circuit_breaker_state = jsonb_set(
          circuit_breaker_state,
          '{consecutive_failures}',
          '0'::jsonb
        ),
        status = 'connected',
        updated_at = NOW()
        WHERE id = $1
      `, [connection_id]);
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to record connection success',
        { connection_id, error: (error as Error).message }
      );
    }
  }

  private async resetCircuitBreaker(connection_id: string): Promise<void> {
    try {
      await getPool()!.query(`
        UPDATE sanity_connections 
        SET circuit_breaker_state = jsonb_set(
          jsonb_set(
            jsonb_set(
              circuit_breaker_state,
              '{consecutive_failures}',
              '0'::jsonb
            ),
            '{is_open}',
            'false'::jsonb
          ),
          '{open_until}',
          'null'::jsonb
        ),
        updated_at = NOW()
        WHERE id = $1
      `, [connection_id]);
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to reset circuit breaker',
        { connection_id, error: (error as Error).message }
      );
    }
  }

  // =============================================================================
  // SCHEMA MANAGEMENT
  // =============================================================================

  /**
   * Sync schema types from Sanity Studio
   */
  async syncSchema(connection_id: string): Promise<void> {
    try {
      const client = await this.getSanityClient(connection_id);
      
      // Fetch schema from Sanity GraphQL API
      const schema = await client.request({
        uri: '/v1/graphql/default/schema.json',
        method: 'GET'
      });

      // Process and store schema types
      if (schema?.data?.types) {
        for (const schemaType of schema.data.types) {
          await this.upsertSchemaType(connection_id, schemaType);
        }
      }

      // Update last schema sync timestamp
      await getPool()!.query(
        'UPDATE sanity_connections SET last_schema_sync = NOW() WHERE id = $1',
        [connection_id]
      );

      await this.loggingService.logServerEvent(
        'health',
        'info',
        'Schema sync completed',
        { connection_id }
      );
    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Schema sync failed',
        { connection_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * Sync schema in background (fire and forget)
   */
  private async syncSchemaInBackground(connection_id: string): Promise<void> {
    // Add a small delay to avoid immediate sync after connection creation
    setTimeout(() => {
      this.syncSchema(connection_id).catch(error => {
        this.loggingService.logServerEvent(
          'capacity',
          'error',
          'Background schema sync failed',
          { connection_id, error: error.message }
        );
      });
    }, 2000);
  }

  private async upsertSchemaType(connection_id: string, schemaType: any): Promise<void> {
    const query = `
      INSERT INTO sanity_schema_types (
        connection_id, type_name, type_category,
        field_definitions, validation_rules, preview_config,
        i18n_config, title, description, icon,
        schema_version, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
      ON CONFLICT (connection_id, type_name)
      DO UPDATE SET
        field_definitions = EXCLUDED.field_definitions,
        validation_rules = EXCLUDED.validation_rules,
        preview_config = EXCLUDED.preview_config,
        i18n_config = EXCLUDED.i18n_config,
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        icon = EXCLUDED.icon,
        schema_version = EXCLUDED.schema_version,
        updated_at = NOW()
    `;

    const values = [
      connection_id,
      schemaType.name,
      schemaType.type || 'document',
      JSON.stringify(schemaType.fields || []),
      JSON.stringify(schemaType.validation || []),
      JSON.stringify(schemaType.preview || {}),
      JSON.stringify(schemaType.i18n || {}),
      schemaType.title || schemaType.name,
      schemaType.description,
      schemaType.icon,
      schemaType.version || '1.0'
    ];

    await getPool()!.query(query, values);
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Generate a secure webhook secret
   */
  private generateWebhookSecret(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Map database row to connection object
   */
  private mapConnectionFromDb(row: any): SanityConnection {
    return {
      id: row.id,
      user_id: row.user_id,
      project_id: row.project_id,
      sanity_project_id: row.sanity_project_id,
      dataset_name: row.dataset_name,
      project_title: row.project_title,
      auth_token_encrypted: row.auth_token_encrypted,
      auth_token_iv: row.auth_token_iv,
      auth_token_auth_tag: row.auth_token_auth_tag,
      robot_token_encrypted: row.robot_token_encrypted,
      robot_token_iv: row.robot_token_iv,
      robot_token_auth_tag: row.robot_token_auth_tag,
      token_type: row.token_type,
      token_expires_at: row.token_expires_at,
      api_version: row.api_version,
      use_cdn: row.use_cdn,
      perspective: row.perspective,
      realtime_enabled: row.realtime_enabled,
      webhook_secret: row.webhook_secret,
      schema_version: row.schema_version,
      content_types: row.content_types || [],
      last_schema_sync: row.last_schema_sync,
      status: row.status,
      error_message: row.error_message,
      last_health_check: row.last_health_check,
      circuit_breaker_state: row.circuit_breaker_state || {
        consecutive_failures: 0,
        is_open: false,
        last_failure_at: null,
        open_until: null
      },
      last_webhook_event_id: row.last_webhook_event_id,
      i18n_strategy: row.i18n_strategy,
      slug_policy: row.slug_policy || { mode: 'native', transliterate: false },
      integration_connection_id: row.integration_connection_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_sync_at: row.last_sync_at
    };
  }

  /**
   * Clear cached client for connection
   */
  clearClientCache(connection_id?: string): void {
    if (connection_id) {
      this.clientCache.delete(connection_id);
    } else {
      this.clientCache.clear();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; connections: string[] } {
    return {
      size: this.clientCache.size,
      connections: Array.from(this.clientCache.keys())
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validate Sanity project ID format
 */
export function validateSanityProjectId(projectId: string): boolean {
  return /^[a-z0-9]{8}$/.test(projectId);
}

/**
 * Validate dataset name format
 */
export function validateDatasetName(datasetName: string): boolean {
  return /^[a-z0-9_-]+$/.test(datasetName) && datasetName.length >= 1 && datasetName.length <= 128;
}

/**
 * Extract document ID without draft prefix
 */
export function getCanonicalDocumentId(documentId: string): string {
  return documentId.replace(/^drafts\./, '');
}

/**
 * Check if document is a draft
 */
export function isDraftDocument(documentId: string): boolean {
  return documentId.startsWith('drafts.');
}