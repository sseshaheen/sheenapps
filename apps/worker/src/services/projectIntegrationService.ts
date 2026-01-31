import { pool as db } from './database';
import { ServerLoggingService } from './serverLoggingService';

/**
 * Project Integration Service
 * Provides centralized management for project integrations registry
 * Implements the query patterns recommended by the consultant
 */

export interface ProjectIntegration {
  id: string;
  project_id: string;
  type: 'supabase' | 'sanity' | 'stripe';
  status: 'connected' | 'pending' | 'disconnected' | 'error' | 'revoked';
  connection_id?: string;
  connected_at: Date;
  disconnected_at?: Date;
  error_reason?: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ProjectWithIntegrations {
  id: string;
  name: string;
  active_integrations: string[];
  has_supabase: boolean;
  has_sanity: boolean;
  has_stripe: boolean;
}

export interface IntegrationCounts {
  type: string;
  total_connected: number;
  total_pending: number;
  total_error: number;
}

export class ProjectIntegrationService {
  private static instance: ProjectIntegrationService;
  private loggingService: ServerLoggingService;

  constructor() {
    this.loggingService = ServerLoggingService.getInstance();
  }

  static getInstance(): ProjectIntegrationService {
    if (!ProjectIntegrationService.instance) {
      ProjectIntegrationService.instance = new ProjectIntegrationService();
    }
    return ProjectIntegrationService.instance;
  }

  /**
   * Get projects with their active integrations for dashboard display
   * Uses the consultant's recommended query pattern
   */
  async getProjectsWithIntegrations(userId: string): Promise<ProjectWithIntegrations[]> {
    if (!db) throw new Error('Database not configured');

    try {
      const result = await db.query(`
        SELECT p.id,
               p.name,
               COALESCE(json_agg(DISTINCT pi.type) FILTER (WHERE pi.status='connected'), '[]'::json) AS active_integrations,
               EXISTS (SELECT 1 FROM project_integrations pi2 
                       WHERE pi2.project_id=p.id AND pi2.type='supabase' AND pi2.status='connected') AS has_supabase,
               EXISTS (SELECT 1 FROM project_integrations pi3 
                       WHERE pi3.project_id=p.id AND pi3.type='sanity' AND pi3.status='connected') AS has_sanity,
               EXISTS (SELECT 1 FROM project_integrations pi4 
                       WHERE pi4.project_id=p.id AND pi4.type='stripe' AND pi4.status='connected') AS has_stripe
        FROM projects p
        LEFT JOIN project_integrations pi ON pi.project_id = p.id
        WHERE p.owner_id = $1
        GROUP BY p.id, p.name
        ORDER BY p.created_at DESC
      `, [userId]);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        active_integrations: row.active_integrations,
        has_supabase: row.has_supabase,
        has_sanity: row.has_sanity,
        has_stripe: row.has_stripe
      }));

    } catch (error) {
      await this.loggingService.logCriticalError(
        'project_integrations_query_failed',
        error as Error,
        { userId }
      );
      throw new Error('Failed to retrieve project integrations');
    }
  }

  /**
   * Get detailed integration status for a specific project
   */
  async getProjectIntegrations(projectId: string): Promise<ProjectIntegration[]> {
    if (!db) throw new Error('Database not configured');

    try {
      const result = await db.query(`
        SELECT id, project_id, type, status, connection_id, 
               connected_at, disconnected_at, error_reason, metadata,
               created_at, updated_at
        FROM project_integrations
        WHERE project_id = $1
        ORDER BY created_at DESC
      `, [projectId]);

      return result.rows.map((row: any) => {
        const integration: ProjectIntegration = {
          id: row.id,
          project_id: row.project_id,
          type: row.type,
          status: row.status,
          connection_id: row.connection_id,
          connected_at: new Date(row.connected_at),
          error_reason: row.error_reason,
          metadata: row.metadata,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at)
        };
        if (row.disconnected_at) {
          integration.disconnected_at = new Date(row.disconnected_at);
        }
        return integration;
      });

    } catch (error) {
      await this.loggingService.logCriticalError(
        'project_integration_details_failed',
        error as Error,
        { projectId }
      );
      throw new Error('Failed to retrieve project integration details');
    }
  }

  /**
   * Get integration counts by type for analytics
   * Uses the consultant's recommended aggregation pattern
   */
  async getIntegrationCounts(): Promise<IntegrationCounts[]> {
    if (!db) throw new Error('Database not configured');

    try {
      const result = await db.query(`
        SELECT type,
               COUNT(*) FILTER (WHERE status = 'connected') as total_connected,
               COUNT(*) FILTER (WHERE status = 'pending') as total_pending,
               COUNT(*) FILTER (WHERE status = 'error') as total_error
        FROM project_integrations
        GROUP BY type
        ORDER BY type
      `);

      return result.rows.map((row: any) => ({
        type: row.type,
        total_connected: parseInt(row.total_connected || '0'),
        total_pending: parseInt(row.total_pending || '0'),
        total_error: parseInt(row.total_error || '0')
      }));

    } catch (error) {
      await this.loggingService.logCriticalError(
        'integration_counts_failed',
        error as Error
      );
      throw new Error('Failed to retrieve integration counts');
    }
  }

  /**
   * Check if a project has a specific integration type
   * Uses the consultant's optimized EXISTS query with partial index
   */
  async hasIntegration(projectId: string, integrationType: 'supabase' | 'sanity' | 'stripe'): Promise<boolean> {
    if (!db) throw new Error('Database not configured');

    try {
      const result = await db.query(`
        SELECT EXISTS (
          SELECT 1 FROM project_integrations 
          WHERE project_id = $1 AND type = $2 AND status = 'connected'
        ) as has_integration
      `, [projectId, integrationType]);

      return result.rows[0]?.has_integration || false;

    } catch (error) {
      await this.loggingService.logServerEvent(
        'capacity',
        'error',
        'Integration check failed',
        { projectId, integrationType, error: (error as Error).message }
      );
      return false;
    }
  }

  /**
   * Update integration status (for manual status changes)
   */
  async updateIntegrationStatus(
    projectId: string,
    integrationType: 'supabase' | 'sanity' | 'stripe',
    status: 'connected' | 'pending' | 'disconnected' | 'error' | 'revoked',
    errorReason?: string
  ): Promise<boolean> {
    if (!db) throw new Error('Database not configured');

    try {
      const result = await db.query(`
        UPDATE project_integrations
        SET status = $3,
            error_reason = $4,
            disconnected_at = CASE WHEN $3 IN ('disconnected', 'revoked') THEN NOW() ELSE disconnected_at END,
            updated_at = NOW()
        WHERE project_id = $1 AND type = $2
        RETURNING id
      `, [projectId, integrationType, status, errorReason || null]);

      const updated = result.rows.length > 0;

      await this.loggingService.logServerEvent(
        'capacity',
        'info',
        'Integration status updated',
        { projectId, integrationType, status, updated, errorReason }
      );

      return updated;

    } catch (error) {
      await this.loggingService.logCriticalError(
        'integration_status_update_failed',
        error as Error,
        { projectId, integrationType, status }
      );
      throw new Error('Failed to update integration status');
    }
  }

  /**
   * Get integration health summary for monitoring
   */
  async getIntegrationHealthSummary(): Promise<{
    total_integrations: number;
    healthy_integrations: number;
    error_integrations: number;
    health_percentage: number;
  }> {
    if (!db) throw new Error('Database not configured');

    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_integrations,
          COUNT(*) FILTER (WHERE status = 'connected') as healthy_integrations,
          COUNT(*) FILTER (WHERE status = 'error') as error_integrations
        FROM project_integrations
      `);

      const row = result.rows[0];
      const total = parseInt(row.total_integrations || '0');
      const healthy = parseInt(row.healthy_integrations || '0');
      const errors = parseInt(row.error_integrations || '0');

      return {
        total_integrations: total,
        healthy_integrations: healthy,
        error_integrations: errors,
        health_percentage: total > 0 ? Math.round((healthy / total) * 100) : 100
      };

    } catch (error) {
      await this.loggingService.logCriticalError(
        'integration_health_summary_failed',
        error as Error
      );
      return {
        total_integrations: 0,
        healthy_integrations: 0,
        error_integrations: 0,
        health_percentage: 100
      };
    }
  }
}