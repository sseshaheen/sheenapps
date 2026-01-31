import { TokenEncryptionService, TokenStorageUtils } from './tokenEncryptionService';
import { ServerLoggingService } from './serverLoggingService';
import { pool as db } from './database';

/**
 * Supabase Connection Service
 * Manages secure storage and retrieval of Supabase OAuth connections
 * Handles token encryption, refresh, and connection lifecycle
 */

export interface SupabaseTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
}

export interface SupabaseConnection {
  id: string;
  user_id: string;
  project_id: string;
  token_expires_at: Date;
  connection_status: 'active' | 'expired' | 'revoked';
  created_at: Date;
  updated_at: Date;
}

export interface SupabaseProject {
  id: string;
  ref: string;
  name: string;
  url: string;
  region: string;
  status: string;
  organization: string;
  canConnect: boolean;
}

export interface AccountDiscovery {
  projects: SupabaseProject[];
  needsProjectCreation: boolean;
  canCreateProjects: boolean;
  readyProjects: number;
  discoveryFailed?: boolean;
  error?: string;
  fallbackToManual?: boolean;
}

export interface ConnectionResult {
  connectionId: string;
  needsProjectCreation: boolean;
  availableProjects: number;
}

export class SupabaseConnectionService {
  private static instance: SupabaseConnectionService;
  private tokenEncryption: TokenEncryptionService;
  private loggingService: ServerLoggingService;

  constructor() {
    this.tokenEncryption = TokenEncryptionService.getInstance();
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): SupabaseConnectionService {
    if (!SupabaseConnectionService.instance) {
      SupabaseConnectionService.instance = new SupabaseConnectionService();
    }
    return SupabaseConnectionService.instance;
  }

  /**
   * Store a new Supabase OAuth connection with encrypted tokens
   */
  async storeConnection(
    userId: string,
    projectId: string,
    tokens: SupabaseTokens,
    discovery: AccountDiscovery
  ): Promise<string> {
    if (!db) throw new Error('Database not configured');
    if (!db) throw new Error('Database not configured');
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Prepare encrypted tokens for storage
      const { access_token_encrypted, refresh_token_encrypted } = await TokenStorageUtils.prepareForStorage({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token
      });

      // Calculate token expiry
      const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

      // Store or update connection
      const connectionResult = await client.query(`
        INSERT INTO supabase_connections
        (user_id, project_id, access_token_encrypted, refresh_token_encrypted, token_expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id, project_id)
        DO UPDATE SET
          access_token_encrypted = $3,
          refresh_token_encrypted = $4,
          token_expires_at = $5,
          connection_status = 'active',
          updated_at = NOW()
        RETURNING id
      `, [userId, projectId, access_token_encrypted, refresh_token_encrypted, expiresAt]);

      const connectionId = connectionResult.rows[0].id;

      // Store discovery data
      await client.query(`
        INSERT INTO supabase_account_discovery
        (connection_id, discovery_data)
        VALUES ($1, $2)
        ON CONFLICT (connection_id)
        DO UPDATE SET
          discovery_data = $2,
          discovered_at = NOW()
      `, [connectionId, JSON.stringify(discovery)]);

      // Update integration registry
      const projectRef = discovery.projects[0]?.ref || 'unknown';
      await client.query(`
        INSERT INTO project_integrations (project_id, type, status, connection_id, metadata)
        VALUES ($1, 'supabase', 'connected', $2, $3)
        ON CONFLICT (project_id, type) DO UPDATE
        SET status = 'connected', 
            connection_id = EXCLUDED.connection_id,
            metadata = project_integrations.metadata || EXCLUDED.metadata,
            updated_at = NOW(), 
            disconnected_at = NULL, 
            error_reason = NULL
      `, [projectId, connectionId, JSON.stringify({ ref: projectRef })]);

      await client.query('COMMIT');

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Supabase connection stored successfully',
        {
          connectionId,
          userId,
          projectId,
          projectCount: discovery.projects.length,
          expiresAt: expiresAt.toISOString()
        }
      );

      return connectionId;

    } catch (error) {
      await client.query('ROLLBACK');
      await this.loggingService.logCriticalError(
        'supabase_connection_storage_failed',
        error as Error,
        { userId, projectId }
      );
      throw new Error('Failed to store Supabase connection');
    } finally {
      client.release();
    }
  }

  /**
   * Get a Supabase connection by user and project
   */
  async getConnection(userId: string, projectId: string): Promise<SupabaseConnection | null> {
    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        SELECT id, user_id, project_id, token_expires_at, connection_status, created_at, updated_at
        FROM supabase_connections
        WHERE user_id = $1 AND project_id = $2 AND connection_status = 'active'
      `, [userId, projectId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      await this.loggingService.logCriticalError(
        'supabase_connection_retrieval_failed',
        error as Error,
        { userId, projectId }
      );
      throw new Error('Failed to retrieve Supabase connection');
    }
  }

  /**
   * Get valid tokens, refreshing if needed
   */
  async getValidTokens(connectionId: string): Promise<SupabaseTokens> {
    try {
      if (!db) throw new Error('Database not configured');
      // Get connection with encrypted tokens
      const result = await db.query(`
        SELECT access_token_encrypted, refresh_token_encrypted, token_expires_at, connection_status
        FROM supabase_connections
        WHERE id = $1 AND connection_status = 'active'
      `, [connectionId]);

      if (result.rows.length === 0) {
        throw new Error('Connection not found or inactive');
      }

      const connection = result.rows[0];
      const now = Date.now();
      const expiresAt = new Date(connection.token_expires_at).getTime();
      const twoMinutes = 2 * 60 * 1000;

      // Check if tokens need refresh (expire in < 2 minutes)
      if (expiresAt < now + twoMinutes) {
        return await this.refreshTokens(connectionId);
      }

      // Decrypt and return current tokens
      const tokens = await TokenStorageUtils.retrieveFromStorage({
        access_token_encrypted: connection.access_token_encrypted,
        refresh_token_encrypted: connection.refresh_token_encrypted
      });

      return tokens;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'token_retrieval_failed',
        error as Error,
        { connectionId }
      );
      throw error;
    }
  }

  /**
   * Refresh OAuth tokens using refresh token
   */
  async refreshTokens(connectionId: string): Promise<SupabaseTokens> {
    try {
      if (!db) throw new Error('Database not configured');
      // Get current encrypted refresh token
      const result = await db.query(`
        SELECT refresh_token_encrypted, user_id, project_id
        FROM supabase_connections
        WHERE id = $1 AND connection_status = 'active'
      `, [connectionId]);

      if (result.rows.length === 0) {
        throw new Error('Connection not found or inactive');
      }

      const connection = result.rows[0];
      const { refresh_token } = await TokenStorageUtils.retrieveFromStorage({
        access_token_encrypted: '{}', // Not needed for refresh
        refresh_token_encrypted: connection.refresh_token_encrypted
      });

      // Call Supabase token refresh endpoint
      const response = await this.fetchWithRetry('https://api.supabase.com/v1/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(
            `${process.env.SUPABASE_OAUTH_CLIENT_ID}:${process.env.SUPABASE_OAUTH_CLIENT_SECRET}`
          ).toString('base64')
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refresh_token
        }),
        timeout: 10000
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Refresh token expired - mark connection as expired
          await this.markConnectionExpired(connectionId);
          throw new Error('Refresh token expired - re-authentication required');
        }
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const newTokens = await response.json() as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      // Update stored tokens
      await this.updateStoredTokens(connectionId, newTokens);

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Supabase tokens refreshed successfully',
        { connectionId, userId: connection.user_id, projectId: connection.project_id }
      );

      return {
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        expires_in: newTokens.expires_in
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'token_refresh_failed',
        error as Error,
        { connectionId }
      );
      throw error;
    }
  }

  /**
   * Update stored tokens after refresh
   */
  private async updateStoredTokens(connectionId: string, tokens: SupabaseTokens): Promise<void> {
    const { access_token_encrypted, refresh_token_encrypted } = await TokenStorageUtils.prepareForStorage({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token
    });

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    if (!db) throw new Error('Database not configured');
    await db.query(`
      UPDATE supabase_connections
      SET 
        access_token_encrypted = $2,
        refresh_token_encrypted = $3,
        token_expires_at = $4,
        updated_at = NOW()
      WHERE id = $1
    `, [connectionId, access_token_encrypted, refresh_token_encrypted, expiresAt]);
  }

  /**
   * Mark a connection as expired
   */
  async markConnectionExpired(connectionId: string): Promise<void> {
    if (!db) throw new Error('Database not configured');
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Mark connection as expired
      await client.query(`
        UPDATE supabase_connections
        SET connection_status = 'expired', updated_at = NOW()
        WHERE id = $1
      `, [connectionId]);

      // Update integration registry to error status
      await client.query(`
        UPDATE project_integrations
        SET status = 'error', 
            error_reason = 'OAuth token expired',
            updated_at = NOW()
        WHERE connection_id = $1 AND type = 'supabase'
      `, [connectionId]);

      await client.query('COMMIT');

      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Supabase connection marked as expired',
        { connectionId }
      );

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get stored account discovery data
   */
  async getStoredDiscovery(connectionId: string): Promise<AccountDiscovery> {
    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        SELECT discovery_data
        FROM supabase_account_discovery
        WHERE connection_id = $1
      `, [connectionId]);

      if (result.rows.length === 0) {
        throw new Error('Discovery data not found');
      }

      return result.rows[0].discovery_data;
    } catch (error) {
      await this.loggingService.logCriticalError(
        'discovery_retrieval_failed',
        error as Error,
        { connectionId }
      );
      throw new Error('Failed to retrieve discovery data');
    }
  }

  /**
   * Delete a Supabase connection (disconnect)
   */
  async deleteConnection(userId: string, projectId: string): Promise<boolean> {
    if (!db) throw new Error('Database not configured');
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Delete discovery data first (foreign key constraint)
      await client.query(`
        DELETE FROM supabase_account_discovery
        WHERE connection_id IN (
          SELECT id FROM supabase_connections
          WHERE user_id = $1 AND project_id = $2
        )
      `, [userId, projectId]);

      // Update integration registry to disconnected status before deleting
      await client.query(`
        UPDATE project_integrations
        SET status = 'disconnected', 
            disconnected_at = NOW(),
            updated_at = NOW()
        WHERE project_id = $2 AND type = 'supabase'
      `, [userId, projectId]);

      // Delete connection
      const result = await client.query(`
        DELETE FROM supabase_connections
        WHERE user_id = $1 AND project_id = $2
        RETURNING id
      `, [userId, projectId]);

      await client.query('COMMIT');

      const deleted = result.rows.length > 0;

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Supabase connection deleted',
        { userId, projectId, deleted, connectionId: result.rows[0]?.id }
      );

      return deleted;

    } catch (error) {
      await client.query('ROLLBACK');
      await this.loggingService.logCriticalError(
        'connection_deletion_failed',
        error as Error,
        { userId, projectId }
      );
      throw new Error('Failed to delete Supabase connection');
    } finally {
      client.release();
    }
  }

  /**
   * OAuth state management for CSRF protection
   */
  async storeStateNonce(nonce: string, userId: string, projectId: string, codeVerifier?: string): Promise<void> {
    try {
      if (!db) throw new Error('Database not configured');
    await db.query(`
        INSERT INTO oauth_state_nonces (nonce, user_id, project_id, code_verifier)
        VALUES ($1, $2, $3, $4)
      `, [nonce, userId, projectId, codeVerifier]);
    } catch (error) {
      await this.loggingService.logCriticalError(
        'state_nonce_storage_failed',
        error as Error,
        { nonce, userId, projectId }
      );
      throw new Error('Failed to store OAuth state nonce');
    }
  }

  /**
   * Validate and consume OAuth state nonce (prevents replay attacks)
   */
  async validateAndConsumeStateNonce(nonce: string, userId: string, projectId: string): Promise<{ valid: boolean; codeVerifier?: string }> {
    if (!db) throw new Error('Database not configured');
    const client = await db.connect();

    try {
      await client.query('BEGIN');

      // Check if nonce exists and is valid
      const result = await client.query(`
        SELECT code_verifier
        FROM oauth_state_nonces
        WHERE nonce = $1 AND user_id = $2 AND project_id = $3 
          AND consumed = FALSE AND expires_at > NOW()
      `, [nonce, userId, projectId]);

      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return { valid: false };
      }

      const codeVerifier = result.rows[0].code_verifier;

      // Mark as consumed
      await client.query(`
        UPDATE oauth_state_nonces
        SET consumed = TRUE
        WHERE nonce = $1
      `, [nonce]);

      await client.query('COMMIT');

      return { valid: true, codeVerifier };

    } catch (error) {
      await client.query('ROLLBACK');
      await this.loggingService.logCriticalError(
        'state_nonce_validation_failed',
        error as Error,
        { nonce, userId, projectId }
      );
      throw new Error('Failed to validate OAuth state nonce');
    } finally {
      client.release();
    }
  }

  /**
   * Store idempotency result for OAuth exchange
   */
  async storeIdempotencyResult(key: string, result: ConnectionResult): Promise<void> {
    try {
      if (!db) throw new Error('Database not configured');
    await db.query(`
        INSERT INTO oauth_exchange_idempotency (idempotency_key, user_id, project_id, result)
        VALUES ($1, $2, $3, $4)
      `, [key, 'unknown', 'unknown', JSON.stringify(result)]);
    } catch (error) {
      // Non-critical error - log but don't throw
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Failed to store idempotency result',
        { key, error: (error as Error).message }
      );
    }
  }

  /**
   * Check for existing idempotency result
   */
  async checkIdempotency(key: string): Promise<ConnectionResult | null> {
    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        SELECT result
        FROM oauth_exchange_idempotency
        WHERE idempotency_key = $1 AND expires_at > NOW()
      `, [key]);

      return result.rows.length > 0 ? result.rows[0].result : null;
    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'warn',
        'Failed to check idempotency',
        { key, error: (error as Error).message }
      );
      return null;
    }
  }

  /**
   * Utility: Fetch with retry logic
   */
  private async fetchWithRetry(url: string, options: any, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 10000);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        return response;

      } catch (error) {
        if (i === retries - 1) throw error;
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }

    throw new Error('Max retries exceeded');
  }

  /**
   * Clean up expired OAuth data (run via cron)
   */
  async cleanupExpiredData(): Promise<number> {
    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query('SELECT cleanup_expired_oauth_data()');
      const deletedCount = result.rows[0]?.cleanup_expired_oauth_data || 0;

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'OAuth data cleanup completed',
        { deletedCount }
      );

      return deletedCount;
    } catch (error) {
      await this.loggingService.logCriticalError(
        'oauth_cleanup_failed',
        error as Error
      );
      return 0;
    }
  }
}