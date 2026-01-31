import { ServerLoggingService } from './serverLoggingService';
import { SupabaseConnectionService, AccountDiscovery, SupabaseTokens } from './supabaseConnectionService';
import { pool as db } from './database';

/**
 * Supabase Breakglass Recovery Service
 * 
 * ⚠️ EXTREME SECURITY RISK ⚠️
 * This service stores plaintext OAuth tokens for emergency access scenarios
 * Only enable when ENABLE_BREAKGLASS_RECOVERY=true
 * 
 * Use cases:
 * - Production emergency when user OAuth is broken
 * - Critical deployment needed when Supabase Management API is down
 * - Emergency access for support/debugging scenarios
 */

export interface BreakglassEntry {
  id: string;
  connection_id: string;
  user_id: string;
  project_id: string;
  access_token_plaintext: string;  // 🚨 SECURITY RISK
  refresh_token_plaintext: string; // 🚨 SECURITY RISK
  supabase_project_ref: string;
  created_at: Date;
  accessed_at?: Date;
  access_count: number;
  created_by_admin_id?: string;
  reason: string;
  expires_at: Date;
  is_active: boolean;
  access_restricted_until?: Date;
}

export interface BreakglassCredentials {
  url: string;
  publishableKey: string;
  serviceRoleKey?: string;
  accessCount: number;
  expiresAt: Date;
  warning: string;
}

export class SupabaseBreakglassService {
  private static instance: SupabaseBreakglassService;
  private loggingService: ServerLoggingService;
  private connectionService: SupabaseConnectionService;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
    this.connectionService = SupabaseConnectionService.getInstance();
  }

  static getInstance(): SupabaseBreakglassService {
    if (!SupabaseBreakglassService.instance) {
      SupabaseBreakglassService.instance = new SupabaseBreakglassService();
    }
    return SupabaseBreakglassService.instance;
  }

  /**
   * Check if breakglass recovery is enabled
   */
  isEnabled(): boolean {
    return process.env.ENABLE_BREAKGLASS_RECOVERY === 'true';
  }

  /**
   * Create breakglass recovery entry - STORES PLAINTEXT TOKENS
   * ⚠️ WARNING: Use only for emergency scenarios
   */
  async createBreakglassRecovery(
    userId: string,
    projectId: string,
    tokens: SupabaseTokens,
    discovery: AccountDiscovery,
    reason: string,
    adminId: string = 'system'
  ): Promise<string | null> {
    if (!this.isEnabled()) {
      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Breakglass recovery creation skipped - disabled',
        { userId, projectId, reason }
      );
      return null;
    }

    try {
      const projectRef = discovery.projects[0]?.ref;
      if (!projectRef) {
        await this.loggingService.logServerEvent('capacity', 'error', 'No project ref for breakglass recovery', { 
          userId, 
          projectId,
          projectCount: discovery.projects.length 
        });
        return null;
      }

      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        INSERT INTO supabase_breakglass_recovery
        (connection_id, user_id, project_id, access_token_plaintext, refresh_token_plaintext, supabase_project_ref, created_by_admin_id, reason)
        SELECT id, $2, $3, $4, $5, $6, $7, $8
        FROM supabase_connections
        WHERE user_id = $2 AND project_id = $3
        ON CONFLICT (connection_id)
        DO UPDATE SET
          access_token_plaintext = $4,
          refresh_token_plaintext = $5,
          reason = $8,
          created_at = NOW(),
          created_by_admin_id = $7,
          expires_at = NOW() + INTERVAL '24 hours',
          is_active = TRUE,
          access_count = 0
        RETURNING id
      `, [
        null, // connection_id filled by SELECT
        userId,
        projectId,
        tokens.access_token,      // 🚨 PLAINTEXT STORAGE
        tokens.refresh_token,     // 🚨 PLAINTEXT STORAGE
        projectRef,
        adminId,
        reason
      ]);

      const breakglassId = result.rows[0]?.id;

      if (breakglassId) {
        await this.loggingService.logCriticalError(
          'breakglass_created',
          new Error('Breakglass recovery created with plaintext tokens'),
          {
            breakglassId,
            userId,
            projectId,
            reason,
            adminId,
            projectRef,
            warningLevel: 'EXTREME_SECURITY_RISK',
            plainTextTokensStored: true
          }
        );
      }

      return breakglassId;

    } catch (error) {
      await this.loggingService.logCriticalError('breakglass_creation_failed', error as Error, { 
        userId, 
        projectId, 
        reason, 
        adminId 
      });
      return null;
    }
  }

  /**
   * Retrieve breakglass credentials - RETURNS PLAINTEXT TOKENS
   * ⚠️ WARNING: All access is logged and audited
   */
  async getBreakglassCredentials(
    userId: string,
    projectId: string,
    adminId: string,
    justification: string
  ): Promise<BreakglassCredentials> {
    if (!this.isEnabled()) {
      throw new Error('Breakglass recovery is disabled');
    }

    // Require explicit admin authorization
    if (!await this.verifyBreakglassPermission(adminId)) {
      throw new Error('Insufficient permissions for breakglass access');
    }

    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        UPDATE supabase_breakglass_recovery
        SET
          accessed_at = NOW(),
          access_count = access_count + 1
        WHERE user_id = $1 AND project_id = $2 AND is_active = TRUE AND expires_at > NOW()
        RETURNING access_token_plaintext, refresh_token_plaintext, supabase_project_ref, access_count, expires_at
      `, [userId, projectId]);

      if (result.rows.length === 0) {
        throw new Error('No active breakglass recovery found');
      }

      const recovery = result.rows[0];

      // Log every access for security audit
      await this.loggingService.logCriticalError(
        'breakglass_accessed',
        new Error('Breakglass tokens accessed'),
        {
          userId,
          projectId,
          adminId,
          justification,
          accessCount: recovery.access_count,
          projectRef: recovery.supabase_project_ref,
          warningLevel: 'PLAINTEXT_TOKEN_ACCESS'
        }
      );

      // Get current Supabase API keys using the plaintext token
      const credentials = await this.fetchWithRetry(
        `https://api.supabase.com/v1/projects/${recovery.supabase_project_ref}/api-keys?reveal=true`,
        {
          headers: { 
            'Authorization': `Bearer ${recovery.access_token_plaintext}`,
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      if (!credentials.ok) {
        throw new Error(`Supabase API failed: ${credentials.status}`);
      }

      const keys = await credentials.json() as Array<{name: string, api_key: string}>;

      return {
        url: `https://${recovery.supabase_project_ref}.supabase.co`,
        publishableKey: keys.find(k => k.name === 'anon')?.api_key || '',
        serviceRoleKey: keys.find(k => k.name === 'service_role')?.api_key || '',
        accessCount: recovery.access_count,
        expiresAt: new Date(recovery.expires_at),
        warning: 'BREAKGLASS ACCESS - ALL USAGE LOGGED AND AUDITED'
      };

    } catch (error) {
      await this.loggingService.logCriticalError('breakglass_access_failed', error as Error, { 
        userId, 
        projectId, 
        adminId,
        justification 
      });
      throw error;
    }
  }

  /**
   * List active breakglass entries (admin only)
   */
  async listActiveBreakglass(adminId: string): Promise<BreakglassEntry[]> {
    if (!this.isEnabled()) {
      return [];
    }

    if (!await this.verifyBreakglassPermission(adminId)) {
      throw new Error('Insufficient permissions for breakglass management');
    }

    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        SELECT 
          id, connection_id, user_id, project_id, supabase_project_ref,
          created_at, accessed_at, access_count, created_by_admin_id, reason,
          expires_at, is_active, access_restricted_until
        FROM supabase_breakglass_recovery
        WHERE is_active = TRUE AND expires_at > NOW()
        ORDER BY created_at DESC
      `);

      return result.rows.map((row: any) => ({
        ...row,
        // Never return plaintext tokens in list view
        access_token_plaintext: '[REDACTED]',
        refresh_token_plaintext: '[REDACTED]'
      }));

    } catch (error) {
      await this.loggingService.logCriticalError('breakglass_list_failed', error as Error, { adminId });
      throw new Error('Failed to list breakglass entries');
    }
  }

  /**
   * Revoke breakglass access
   */
  async revokeBreakglassAccess(
    userId: string,
    projectId: string,
    adminId: string,
    reason?: string
  ): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    if (!await this.verifyBreakglassPermission(adminId)) {
      throw new Error('Insufficient permissions for breakglass management');
    }

    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        UPDATE supabase_breakglass_recovery
        SET 
          is_active = FALSE, 
          access_restricted_until = NOW() + INTERVAL '1 hour',
          reason = COALESCE($4, reason || ' - REVOKED')
        WHERE user_id = $1 AND project_id = $2
        RETURNING id
      `, [userId, projectId, adminId, reason]);

      const revoked = result.rows.length > 0;

      if (revoked) {
        await this.loggingService.logCriticalError(
          'breakglass_revoked',
          new Error('Breakglass access revoked'),
          { 
            userId, 
            projectId, 
            adminId,
            reason,
            breakglassId: result.rows[0].id
          }
        );
      }

      return revoked;

    } catch (error) {
      await this.loggingService.logCriticalError('breakglass_revocation_failed', error as Error, { 
        userId, 
        projectId, 
        adminId 
      });
      throw new Error('Failed to revoke breakglass access');
    }
  }

  /**
   * Cleanup expired breakglass entries (run via cron)
   */
  async cleanupExpiredBreakglass(): Promise<number> {
    if (!this.isEnabled()) {
      return 0;
    }

    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        DELETE FROM supabase_breakglass_recovery
        WHERE expires_at < NOW() OR is_active = FALSE
        RETURNING id, user_id, project_id, reason
      `);

      const deletedCount = result.rows.length;

      if (deletedCount > 0) {
        await this.loggingService.logServerEvent('capacity', 'error', 'Breakglass cleanup completed', {
          deletedCount,
          deletedEntries: result.rows.map((row: any) => ({
            id: row.id,
            userId: row.user_id,
            projectId: row.project_id,
            reason: row.reason
          }))
        });
      }

      return deletedCount;

    } catch (error) {
      await this.loggingService.logCriticalError('breakglass_cleanup_failed', error as Error);
      return 0;
    }
  }

  /**
   * Check if user has breakglass access
   */
  async hasBreakglassAccess(userId: string, projectId: string): Promise<boolean> {
    if (!this.isEnabled()) {
      return false;
    }

    try {
      if (!db) throw new Error('Database not configured');
      const result = await db.query(`
        SELECT 1 FROM supabase_breakglass_recovery
        WHERE user_id = $1 AND project_id = $2 AND is_active = TRUE AND expires_at > NOW()
        LIMIT 1
      `, [userId, projectId]);

      return result.rows.length > 0;

    } catch (error) {
      await this.loggingService.logServerEvent('capacity', 'error', 'Breakglass access check failed', {
        userId,
        projectId,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Verify admin has breakglass permissions
   */
  private async verifyBreakglassPermission(adminId: string): Promise<boolean> {
    try {
      // Implementation depends on your admin system
      // For now, check if admin exists and has appropriate role
      if (!db) throw new Error('Database not configured');
      const admin = await db.query(`
        SELECT role FROM admins WHERE id = $1 AND is_active = TRUE
      `, [adminId]);

      if (admin.rows.length === 0) {
        return false;
      }

      const role = admin.rows[0].role;
      return role === 'super_admin' || role === 'breakglass_admin';

    } catch (error) {
      await this.loggingService.logServerEvent('capacity', 'error', 'Admin permission check failed', {
        adminId,
        error: (error as Error).message
      });
      return false;
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
   * Create breakglass entry from existing connection (automatic)
   */
  async createFromConnection(
    connectionId: string,
    reason: string = 'automatic_on_oauth',
    adminId: string = 'system'
  ): Promise<string | null> {
    if (!this.isEnabled()) {
      return null;
    }

    try {
      // Get connection and tokens
      if (!db) throw new Error('Database not configured');
      const connection = await db.query(`
        SELECT user_id, project_id, access_token_encrypted, refresh_token_encrypted
        FROM supabase_connections
        WHERE id = $1 AND connection_status = 'active'
      `, [connectionId]);

      if (connection.rows.length === 0) {
        return null;
      }

      const { user_id, project_id } = connection.rows[0];

      // Get decrypted tokens
      const tokens = await this.connectionService.getValidTokens(connectionId);
      
      // Get discovery data
      const discovery = await this.connectionService.getStoredDiscovery(connectionId);

      // Create breakglass entry
      return await this.createBreakglassRecovery(
        user_id,
        project_id,
        tokens,
        discovery,
        reason,
        adminId
      );

    } catch (error) {
      await this.loggingService.logCriticalError('breakglass_auto_creation_failed', error as Error, {
        connectionId,
        reason,
        adminId
      });
      return null;
    }
  }

  /**
   * Get breakglass statistics for monitoring
   */
  async getBreakglassStats(): Promise<{
    enabled: boolean;
    activeEntries: number;
    totalAccesses: number;
    expiredEntries: number;
    recentAccesses: Array<{
      userId: string;
      projectId: string;
      accessedAt: Date;
      adminId: string;
    }>;
  }> {
    const stats = {
      enabled: this.isEnabled(),
      activeEntries: 0,
      totalAccesses: 0,
      expiredEntries: 0,
      recentAccesses: [] as Array<{
        userId: string;
        projectId: string;
        accessedAt: Date;
        adminId: string;
      }>
    };

    if (!this.isEnabled()) {
      return stats;
    }

    try {
      // Get active entries count
      if (!db) throw new Error('Database not configured');
      const activeResult = await db.query(`
        SELECT COUNT(*) as count, SUM(access_count) as total_accesses
        FROM supabase_breakglass_recovery
        WHERE is_active = TRUE AND expires_at > NOW()
      `);

      stats.activeEntries = parseInt(activeResult.rows[0]?.count || '0');
      stats.totalAccesses = parseInt(activeResult.rows[0]?.total_accesses || '0');

      // Get expired entries count
      if (!db) throw new Error('Database not configured');
      const expiredResult = await db.query(`
        SELECT COUNT(*) as count
        FROM supabase_breakglass_recovery
        WHERE expires_at <= NOW() OR is_active = FALSE
      `);

      stats.expiredEntries = parseInt(expiredResult.rows[0]?.count || '0');

      // Get recent accesses (last 24 hours)
      if (!db) throw new Error('Database not configured');
      const recentResult = await db.query(`
        SELECT user_id, project_id, accessed_at, created_by_admin_id
        FROM supabase_breakglass_recovery
        WHERE accessed_at > NOW() - INTERVAL '24 hours'
        ORDER BY accessed_at DESC
        LIMIT 10
      `);

      stats.recentAccesses = recentResult.rows.map((row: any) => ({
        userId: row.user_id,
        projectId: row.project_id,
        accessedAt: new Date(row.accessed_at),
        adminId: row.created_by_admin_id
      }));

      return stats;

    } catch (error) {
      await this.loggingService.logCriticalError('breakglass_stats_failed', error as Error);
      return stats;
    }
  }
}