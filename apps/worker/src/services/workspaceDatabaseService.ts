import { createClient } from '@supabase/supabase-js';
import type { LogTier } from './unifiedLogger';

export interface WorkspacePermissions {
  view_code: boolean;
  view_logs: boolean;
}

export interface WorkspaceSettings {
  project_id: string;
  owner_id: string;
  advisor_code_access: boolean;
  advisor_log_access: boolean;
  restricted_paths: string[];
  allowed_log_tiers: LogTier[];
  settings: Record<string, any>;
  updated_at: string;
}

export interface WorkspaceSession {
  session_id: string;
  project_id: string;
  advisor_id: string;
  status: 'active' | 'idle' | 'disconnected';
  last_activity: string;
  created_at: string;
  metadata: Record<string, any>;
}

export interface WorkspaceAuditEntry {
  id: string;
  session_id?: string;
  project_id: string;
  advisor_id: string;
  action_type: 'session_start' | 'session_end' | 'file_read' | 'log_stream_start' | 'log_stream_end' | 'path_blocked' | 'rate_limit_hit';
  resource_path?: string;
  client_ip?: string;
  user_agent?: string;
  timestamp: string;
  details: Record<string, any>;
}

/**
 * Database service for advisor workspace operations
 * Handles sessions, permissions, audit logging, and workspace settings
 */
export class WorkspaceDatabaseService {
  private supabase;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase configuration missing for workspace database service');
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Check if advisor has workspace access to project
   */
  async checkWorkspaceAccess(advisorId: string, projectId: string): Promise<{
    hasAccess: boolean;
    permissions?: WorkspacePermissions;
    settings?: WorkspaceSettings;
    reason?: string;
  }> {
    try {
      // Check if advisor is assigned to project with workspace permissions
      const { data: advisorData, error: advisorError } = await this.supabase
        .from('project_advisors')
        .select('workspace_permissions, status')
        .eq('project_id', projectId)
        .eq('advisor_id', advisorId)
        .eq('status', 'active')
        .single();

      if (advisorError || !advisorData) {
        return {
          hasAccess: false,
          reason: 'Advisor not assigned to project or assignment inactive'
        };
      }

      // Get project workspace settings
      const { data: settingsData, error: settingsError } = await this.supabase
        .from('project_workspace_settings')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (settingsError) {
        return {
          hasAccess: false,
          reason: 'Failed to retrieve workspace settings'
        };
      }

      const permissions = advisorData.workspace_permissions as WorkspacePermissions;
      const settings = settingsData as WorkspaceSettings;

      // Check if workspace access is enabled at project level
      if (!settings.advisor_code_access && !settings.advisor_log_access) {
        return {
          hasAccess: false,
          reason: 'Workspace access disabled for this project'
        };
      }

      return {
        hasAccess: true,
        permissions,
        settings
      };

    } catch (error) {
      console.error('Failed to check workspace access:', error);
      return {
        hasAccess: false,
        reason: 'Database error during access check'
      };
    }
  }

  /**
   * Start a new workspace session
   */
  async startSession(sessionId: string, advisorId: string, projectId: string, metadata: Record<string, any> = {}): Promise<WorkspaceSession | null> {
    try {
      const { data, error } = await this.supabase
        .from('advisor_workspace_sessions')
        .insert({
          session_id: sessionId,
          project_id: projectId,
          advisor_id: advisorId,
          status: 'active',
          metadata
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to start workspace session:', error);
        return null;
      }

      // Log audit event
      await this.logAuditEvent(sessionId, projectId, advisorId, 'session_start', undefined, {
        session_id: sessionId
      });

      return data as WorkspaceSession;
    } catch (error) {
      console.error('Error starting workspace session:', error);
      return null;
    }
  }

  /**
   * End a workspace session
   */
  async endSession(sessionId: string, advisorId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('advisor_workspace_sessions')
        .update({ status: 'disconnected' })
        .eq('session_id', sessionId)
        .eq('advisor_id', advisorId);

      if (error) {
        console.error('Failed to end workspace session:', error);
        return false;
      }

      // Get session info for audit log
      const { data: sessionData } = await this.supabase
        .from('advisor_workspace_sessions')
        .select('project_id')
        .eq('session_id', sessionId)
        .single();

      if (sessionData) {
        await this.logAuditEvent(sessionId, sessionData.project_id, advisorId, 'session_end', undefined, {
          session_id: sessionId
        });
      }

      return true;
    } catch (error) {
      console.error('Error ending workspace session:', error);
      return false;
    }
  }

  /**
   * Update session activity
   */
  async updateSessionActivity(sessionId: string, advisorId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('advisor_workspace_sessions')
        .update({ 
          last_activity: new Date().toISOString(),
          status: 'active'
        })
        .eq('session_id', sessionId)
        .eq('advisor_id', advisorId);

      return !error;
    } catch (error) {
      console.error('Error updating session activity:', error);
      return false;
    }
  }

  /**
   * Get active sessions for a project
   */
  async getActiveSessions(projectId: string): Promise<WorkspaceSession[]> {
    try {
      const { data, error } = await this.supabase
        .from('advisor_workspace_sessions')
        .select('*')
        .eq('project_id', projectId)
        .in('status', ['active', 'idle'])
        .order('last_activity', { ascending: false });

      if (error) {
        console.error('Failed to get active sessions:', error);
        return [];
      }

      return data as WorkspaceSession[];
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  /**
   * Log audit event
   */
  async logAuditEvent(
    sessionId: string | undefined,
    projectId: string,
    advisorId: string,
    actionType: WorkspaceAuditEntry['action_type'],
    resourcePath?: string,
    details: Record<string, any> = {},
    clientIp?: string,
    userAgent?: string
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('advisor_workspace_audit_log')
        .insert({
          session_id: sessionId,
          project_id: projectId,
          advisor_id: advisorId,
          action_type: actionType,
          resource_path: resourcePath,
          client_ip: clientIp,
          user_agent: userAgent,
          details
        });

      if (error) {
        console.error('Failed to log audit event:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error logging audit event:', error);
      return false;
    }
  }

  /**
   * Get workspace settings for a project
   */
  async getWorkspaceSettings(projectId: string): Promise<WorkspaceSettings | null> {
    try {
      const { data, error } = await this.supabase
        .from('project_workspace_settings')
        .select('*')
        .eq('project_id', projectId)
        .single();

      if (error) {
        console.error('Failed to get workspace settings:', error);
        return null;
      }

      return data as WorkspaceSettings;
    } catch (error) {
      console.error('Error getting workspace settings:', error);
      return null;
    }
  }

  /**
   * Update workspace settings (project owner only)
   */
  async updateWorkspaceSettings(
    projectId: string,
    ownerId: string,
    updates: Partial<Omit<WorkspaceSettings, 'project_id' | 'owner_id' | 'updated_at'>>
  ): Promise<WorkspaceSettings | null> {
    try {
      const { data, error } = await this.supabase
        .from('project_workspace_settings')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('project_id', projectId)
        .eq('owner_id', ownerId)
        .select()
        .single();

      if (error) {
        console.error('Failed to update workspace settings:', error);
        return null;
      }

      return data as WorkspaceSettings;
    } catch (error) {
      console.error('Error updating workspace settings:', error);
      return null;
    }
  }

  /**
   * Update advisor workspace permissions (project owner only)
   */
  async updateAdvisorPermissions(
    projectId: string,
    advisorId: string,
    permissions: WorkspacePermissions,
    grantedBy: string
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('project_advisors')
        .update({
          workspace_permissions: permissions,
          workspace_granted_by: grantedBy,
          workspace_granted_at: new Date().toISOString()
        })
        .eq('project_id', projectId)
        .eq('advisor_id', advisorId);

      if (error) {
        console.error('Failed to update advisor permissions:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating advisor permissions:', error);
      return false;
    }
  }

  /**
   * Cleanup stale sessions (older than 30 minutes)
   */
  async cleanupStaleSessions(): Promise<number> {
    try {
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data, error } = await this.supabase
        .from('advisor_workspace_sessions')
        .update({ status: 'disconnected' })
        .in('status', ['active', 'idle'])
        .lt('last_activity', thirtyMinutesAgo)
        .select('session_id');

      if (error) {
        console.error('Failed to cleanup stale sessions:', error);
        return 0;
      }

      return data.length;
    } catch (error) {
      console.error('Error cleaning up stale sessions:', error);
      return 0;
    }
  }

  /**
   * Get project root path for file access
   * This is a placeholder - in production, you'd get this from project configuration
   */
  async getProjectRootPath(projectId: string): Promise<string | null> {
    try {
      // TODO: In production, this would query the projects table for the actual storage path
      // For now, return a placeholder path
      const { data, error } = await this.supabase
        .from('projects')
        .select('id')
        .eq('id', projectId)
        .single();

      if (error || !data) {
        return null;
      }

      // Placeholder path - replace with actual project storage logic
      return `/tmp/projects/${projectId}`;
    } catch (error) {
      console.error('Error getting project root path:', error);
      return null;
    }
  }
}

// Export singleton instance
export const workspaceDatabaseService = new WorkspaceDatabaseService();