import { ServerLoggingService } from './serverLoggingService';
import { pool, getPool } from './databaseWrapper';

/**
 * Sanity Breakglass Recovery Service
 * 
 * ⚠️ EXTREME SECURITY RISK ⚠️
 * This service stores plaintext Sanity tokens for emergency access scenarios
 * Always enabled as failsafe for encrypted token failures
 * 
 * Use cases:
 * - Production emergency when encrypted tokens are corrupted
 * - TOKEN_ENCRYPTION_KEY rotation scenarios
 * - Critical Sanity content updates needed urgently
 * - Emergency access for support/debugging scenarios
 */

export interface SanityBreakglassEntry {
  id: string;
  connection_id: string;
  user_id: string;
  project_id?: string;
  auth_token_plaintext: string;  // 🚨 SECURITY RISK
  robot_token_plaintext?: string; // 🚨 SECURITY RISK
  webhook_secret_plaintext?: string; // 🚨 SECURITY RISK
  sanity_project_id: string;
  dataset_name: string;
  project_title?: string;
  api_version: string;
  created_by_admin_id?: string;
  reason: string;
  justification?: string;
  expires_at: Date;
  accessed_at?: Date;
  access_count: number;
  is_active: boolean;
  access_restricted_until?: Date;
  max_access_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface SanityBreakglassCredentials {
  sanity_project_id: string;
  dataset_name: string;
  auth_token: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  robot_token?: string | undefined;
  webhook_secret?: string | undefined;
  api_version: string;
  project_title?: string | undefined;
  access_count: number;
  expires_at: Date;
  max_remaining_uses: number;
  warning: string;
}

export class SanityBreakglassService {
  private static instance: SanityBreakglassService;
  private readonly loggingService: ServerLoggingService;
  private readonly database = pool;

  // Security constants
  private readonly DEFAULT_TTL_HOURS = 24;
  private readonly DEFAULT_MAX_ACCESS_COUNT = 10;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): SanityBreakglassService {
    if (!SanityBreakglassService.instance) {
      SanityBreakglassService.instance = new SanityBreakglassService();
    }
    return SanityBreakglassService.instance;
  }

  // =============================================================================
  // BREAKGLASS ENTRY MANAGEMENT
  // =============================================================================

  /**
   * Create breakglass entry (auto-called during connection creation)
   */
  async createBreakglassEntry(params: {
    connection_id: string;
    user_id: string;
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    project_id?: string | undefined;
    auth_token: string;
    robot_token?: string | undefined;
    webhook_secret?: string | undefined;
    sanity_project_id: string;
    dataset_name: string;
    project_title?: string | undefined;
    api_version?: string | undefined;
    admin_id?: string | undefined;
    reason?: string | undefined;
    ttl_hours?: number | undefined;
  }): Promise<SanityBreakglassEntry> {
    try {
      const {
        connection_id,
        user_id,
        project_id,
        auth_token,
        robot_token,
        webhook_secret,
        sanity_project_id,
        dataset_name,
        project_title,
        api_version = '2023-05-03',
        admin_id,
        reason = 'automatic_on_connection_create',
        ttl_hours = this.DEFAULT_TTL_HOURS
      } = params;

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ttl_hours);

      const query = `
        INSERT INTO sanity_breakglass_recovery (
          connection_id, user_id, project_id,
          auth_token_plaintext, robot_token_plaintext, webhook_secret_plaintext,
          sanity_project_id, dataset_name, project_title, api_version,
          created_by_admin_id, reason, expires_at, max_access_count
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        ON CONFLICT (connection_id)
        DO UPDATE SET
          auth_token_plaintext = EXCLUDED.auth_token_plaintext,
          robot_token_plaintext = EXCLUDED.robot_token_plaintext,
          webhook_secret_plaintext = EXCLUDED.webhook_secret_plaintext,
          project_title = EXCLUDED.project_title,
          api_version = EXCLUDED.api_version,
          expires_at = EXCLUDED.expires_at,
          updated_at = NOW()
        RETURNING *
      `;

      const values = [
        connection_id,
        user_id,
        project_id,
        auth_token,
        robot_token,
        webhook_secret,
        sanity_project_id,
        dataset_name,
        project_title,
        api_version,
        admin_id,
        reason,
        expiresAt,
        this.DEFAULT_MAX_ACCESS_COUNT
      ];

      const result = await getPool()!.query(query, values);
      const entry = this.mapBreakglassFromDb(result.rows[0]);

      await this.loggingService.logServerEvent(
        'error',
        'warn',
        'Sanity breakglass entry created',
        {
          connection_id,
          user_id,
          sanity_project_id,
          reason,
          expires_at: expiresAt,
          created_by_admin: admin_id || 'system'
        }
      );

      return entry;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'sanity_breakglass_creation_failed',
        error as Error,
        { connection_id: params.connection_id }
      );
      throw error;
    }
  }

  /**
   * Get breakglass credentials (admin-only with heavy audit logging)
   */
  async getBreakglassCredentials(
    connection_id: string,
    admin_id: string,
    justification: string
  ): Promise<SanityBreakglassCredentials> {
    try {
      // Get and validate breakglass entry
      const entry = await this.getBreakglassEntry(connection_id);
      if (!entry) {
        throw new Error('No breakglass entry found for connection');
      }

      if (!entry.is_active) {
        throw new Error('Breakglass entry is inactive');
      }

      if (entry.expires_at < new Date()) {
        await this.markEntryExpired(connection_id);
        throw new Error('Breakglass entry has expired');
      }

      if (entry.access_count >= entry.max_access_count) {
        throw new Error('Maximum access count reached');
      }

      if (entry.access_restricted_until && entry.access_restricted_until > new Date()) {
        throw new Error('Access temporarily restricted');
      }

      // Record access
      await this.recordBreakglassAccess(connection_id, admin_id, justification);

      await this.loggingService.logServerEvent(
        'error',
        'error', // High severity for breakglass access
        'Sanity breakglass credentials accessed',
        {
          connection_id,
          admin_id,
          justification,
          access_count: entry.access_count + 1,
          sanity_project_id: entry.sanity_project_id,
          user_id: entry.user_id
        }
      );

      return {
        sanity_project_id: entry.sanity_project_id,
        dataset_name: entry.dataset_name,
        auth_token: entry.auth_token_plaintext,
        robot_token: entry.robot_token_plaintext,
        webhook_secret: entry.webhook_secret_plaintext,
        api_version: entry.api_version,
        project_title: entry.project_title,
        access_count: entry.access_count + 1,
        expires_at: entry.expires_at,
        max_remaining_uses: entry.max_access_count - (entry.access_count + 1),
        warning: '⚠️ BREAKGLASS ACCESS: These are emergency plaintext credentials. Rotate immediately after use.'
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'sanity_breakglass_access_failed',
        error as Error,
        { connection_id, admin_id, justification }
      );
      throw error;
    }
  }

  /**
   * Get breakglass entry by connection ID
   */
  async getBreakglassEntry(connection_id: string): Promise<SanityBreakglassEntry | null> {
    try {
      const result = await getPool()!.query(
        'SELECT * FROM sanity_breakglass_recovery WHERE connection_id = $1',
        [connection_id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapBreakglassFromDb(result.rows[0]);

    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to get Sanity breakglass entry',
        { connection_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * List breakglass entries (admin-only)
   */
  async listBreakglassEntries(options?: {
    // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
    user_id?: string | undefined;
    expired?: boolean | undefined;
    project_id?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  }): Promise<{ entries: SanityBreakglassEntry[]; total: number }> {
    try {
      const { user_id, expired, project_id, limit = 50, offset = 0 } = options || {};

      let whereClause = 'WHERE 1=1';
      const values: any[] = [];
      let paramCount = 1;

      if (user_id) {
        whereClause += ` AND user_id = $${paramCount}`;
        values.push(user_id);
        paramCount++;
      }

      if (project_id) {
        whereClause += ` AND project_id = $${paramCount}`;
        values.push(project_id);
        paramCount++;
      }

      if (expired !== undefined) {
        if (expired) {
          whereClause += ` AND (expires_at < NOW() OR is_active = false)`;
        } else {
          whereClause += ` AND expires_at >= NOW() AND is_active = true`;
        }
      }

      // Get total count
      const countQuery = `SELECT COUNT(*) FROM sanity_breakglass_recovery ${whereClause}`;
      const countResult = await getPool()!.query(countQuery, values);
      const total = parseInt(countResult.rows[0].count);

      // Get entries (exclude plaintext tokens from list view)
      const entriesQuery = `
        SELECT 
          id, connection_id, user_id, project_id,
          sanity_project_id, dataset_name, project_title, api_version,
          created_by_admin_id, reason, justification,
          expires_at, accessed_at, access_count, is_active,
          access_restricted_until, max_access_count,
          created_at, updated_at,
          '[REDACTED]' as auth_token_plaintext,
          '[REDACTED]' as robot_token_plaintext,
          '[REDACTED]' as webhook_secret_plaintext
        FROM sanity_breakglass_recovery 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT $${paramCount} OFFSET $${paramCount + 1}
      `;

      const entriesResult = await getPool()!.query(entriesQuery, [...values, limit, offset]);
      const entries = entriesResult.rows.map(row => this.mapBreakglassFromDb(row));

      return { entries, total };

    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to list Sanity breakglass entries',
        { error: (error as Error).message }
      );
      throw error;
    }
  }

  /**
   * Revoke breakglass entry (admin-only)
   */
  async revokeBreakglassEntry(entry_id: string, admin_id: string, reason?: string): Promise<void> {
    try {
      const result = await getPool()!.query(
        'UPDATE sanity_breakglass_recovery SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING connection_id',
        [entry_id]
      );

      if (result.rowCount === 0) {
        throw new Error('Breakglass entry not found');
      }

      const connection_id = result.rows[0].connection_id;

      await this.loggingService.logServerEvent(
        'error',
        'warn',
        'Sanity breakglass entry revoked',
        {
          entry_id,
          connection_id,
          admin_id,
          reason: reason || 'manual_revocation'
        }
      );

    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to revoke Sanity breakglass entry',
        { entry_id, admin_id, error: (error as Error).message }
      );
      throw error;
    }
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Record breakglass access
   */
  private async recordBreakglassAccess(
    connection_id: string,
    admin_id: string,
    justification: string
  ): Promise<void> {
    await getPool()!.query(`
      UPDATE sanity_breakglass_recovery 
      SET 
        access_count = access_count + 1,
        accessed_at = NOW(),
        justification = COALESCE(justification, '') || E'\n' || $3 || ' (accessed by ' || $2 || ' at ' || NOW() || ')',
        updated_at = NOW()
      WHERE connection_id = $1
    `, [connection_id, admin_id, justification]);
  }

  /**
   * Mark entry as expired
   */
  private async markEntryExpired(connection_id: string): Promise<void> {
    await getPool()!.query(
      'UPDATE sanity_breakglass_recovery SET is_active = false, updated_at = NOW() WHERE connection_id = $1',
      [connection_id]
    );
  }

  /**
   * Map database row to breakglass entry object
   */
  private mapBreakglassFromDb(row: any): SanityBreakglassEntry {
    return {
      id: row.id,
      connection_id: row.connection_id,
      user_id: row.user_id,
      project_id: row.project_id,
      auth_token_plaintext: row.auth_token_plaintext,
      robot_token_plaintext: row.robot_token_plaintext,
      webhook_secret_plaintext: row.webhook_secret_plaintext,
      sanity_project_id: row.sanity_project_id,
      dataset_name: row.dataset_name,
      project_title: row.project_title,
      api_version: row.api_version,
      created_by_admin_id: row.created_by_admin_id,
      reason: row.reason,
      justification: row.justification,
      expires_at: row.expires_at,
      accessed_at: row.accessed_at,
      access_count: row.access_count,
      is_active: row.is_active,
      access_restricted_until: row.access_restricted_until,
      max_access_count: row.max_access_count,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  // =============================================================================
  // PUBLIC UTILITY METHODS
  // =============================================================================

  /**
   * Check if breakglass is available for connection
   */
  async isBreakglassAvailable(connection_id: string): Promise<boolean> {
    try {
      const entry = await this.getBreakglassEntry(connection_id);
      return !!(entry && entry.is_active && entry.expires_at > new Date());
    } catch {
      return false;
    }
  }

  /**
   * Get breakglass status for connection
   */
  async getBreakglassStatus(connection_id: string): Promise<{
    available: boolean;
    expires_at?: Date;
    access_count?: number;
    max_access_count?: number;
    reason?: string;
  }> {
    try {
      const entry = await this.getBreakglassEntry(connection_id);
      
      if (!entry) {
        return { available: false };
      }

      return {
        available: entry.is_active && entry.expires_at > new Date(),
        expires_at: entry.expires_at,
        access_count: entry.access_count,
        max_access_count: entry.max_access_count,
        reason: entry.reason
      };

    } catch (error) {
      return { available: false };
    }
  }

  /**
   * Cleanup expired breakglass entries
   */
  async cleanupExpiredEntries(): Promise<number> {
    try {
      const result = await getPool()!.query(
        'UPDATE sanity_breakglass_recovery SET is_active = false WHERE expires_at < NOW() AND is_active = true RETURNING id'
      );

      const cleanedCount = result.rowCount || 0;

      if (cleanedCount > 0) {
        await this.loggingService.logServerEvent(
          'error',
          'info',
          'Sanity breakglass entries auto-expired',
          { cleaned_count: cleanedCount }
        );
      }

      return cleanedCount;

    } catch (error) {
      await this.loggingService.logServerEvent(
        'error',
        'error',
        'Failed to cleanup expired Sanity breakglass entries',
        { error: (error as Error).message }
      );
      return 0;
    }
  }
}