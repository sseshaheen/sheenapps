import { pool } from './database';

/**
 * Service for managing Claude CLI session IDs across projects
 * Ensures session continuity between builds, updates, and chat plan mode
 */
export class SessionManagementService {
  /**
   * Update a project's last AI session ID and optionally the version's session ID
   * This ensures synchronization across all tables that track session IDs
   * 
   * @param projectId - The text project ID (which is actually the UUID from projects.id stored as text)
   * @param sessionId - The Claude session ID to store
   * @param source - Where this update is coming from (for logging)
   * @param versionId - Optional version ID to also update
   */
  static async updateProjectSession(
    projectId: string, 
    sessionId: string,
    source: 'create_preview' | 'update_project' | 'chat_plan' | 'metadata_generation' | 'build' | 'compact',
    versionId?: string
  ): Promise<void> {
    if (!projectId || !sessionId) {
      console.warn(`[SessionManagement] Missing projectId or sessionId:`, { projectId, sessionId, source });
      return;
    }

    if (!pool) {
      throw new Error('Database connection not available');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // The projectId parameter is the UUID from projects.id (stored as text in project_versions.project_id)
      // We need to cast it back to UUID to update the projects table
      let projectUUID: string;
      let oldSessionId: string | null = null;
      
      try {
        // Try to treat projectId as a UUID string
        const projectResult = await client.query(
          `SELECT id, last_ai_session_id 
           FROM projects 
           WHERE id = $1::uuid`,
          [projectId]
        );
        
        if (projectResult.rows.length > 0) {
          projectUUID = projectResult.rows[0].id;
          oldSessionId = projectResult.rows[0].last_ai_session_id;
        } else {
          // If not found, it might be a text project ID - shouldn't happen but let's be defensive
          console.warn(`[SessionManagement] No project found with UUID ${projectId}`);
          await client.query('ROLLBACK');
          return;
        }
      } catch (castError) {
        // If the projectId is not a valid UUID, log and return
        console.error(`[SessionManagement] Invalid project UUID format: ${projectId}`, castError);
        await client.query('ROLLBACK');
        return;
      }
      
      // Update projects table
      const projectUpdateResult = await client.query(
        `UPDATE projects 
         SET 
           last_ai_session_id = $1,
           last_ai_session_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [sessionId, projectUUID]
      );
      
      if (projectUpdateResult.rowCount === 0) {
        console.warn(`[SessionManagement] No project found with ID ${projectId}`);
        await client.query('ROLLBACK');
        return;
      }
      
      // Update project_versions if versionId provided
      if (versionId) {
        await client.query(
          `UPDATE project_versions
           SET 
             ai_session_id = $1,
             ai_session_last_used_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
           WHERE version_id = $2`,
          [sessionId, versionId]
        );
        console.log(`[SessionManagement] Updated version ${versionId} with session ${sessionId}`);
      }
      
      // Log the session transition for debugging
      if (oldSessionId && oldSessionId !== sessionId) {
        console.log(`[SessionManagement] Session transition for ${projectId}: ${oldSessionId} → ${sessionId} (${source})`);
      }
      
      await client.query('COMMIT');
      console.log(`[SessionManagement] Successfully updated project ${projectId} with session ${sessionId} from ${source}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`[SessionManagement] Failed to update session for project ${projectId}:`, error);
      // Don't throw - session tracking is supplementary, not critical
    } finally {
      client.release();
    }
  }
  
  /**
   * Get the last AI session ID for a project
   * @param projectId - The text project ID (UUID from projects.id as string)
   */
  static async getProjectSession(projectId: string): Promise<string | null> {
    if (!projectId) {
      return null;
    }

    try {
      if (!pool) {
        throw new Error('Database connection not available');
      }
      
      const query = `
        SELECT last_ai_session_id, last_ai_session_updated_at
        FROM projects
        WHERE id = $1::uuid
      `;
      
      const result = await pool.query(query, [projectId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const { last_ai_session_id, last_ai_session_updated_at } = result.rows[0];
      
      // Log for debugging
      if (last_ai_session_id) {
        console.log(`[SessionManagement] Found existing session ${last_ai_session_id} for project ${projectId}, last updated: ${last_ai_session_updated_at}`);
      }
      
      return last_ai_session_id;
    } catch (error) {
      console.error(`[SessionManagement] Failed to get session for project ${projectId}:`, error);
      return null;
    }
  }

  /**
   * Check if a session is still valid for a project
   * @param projectId - The text project ID (UUID from projects.id as string)
   */
  static async isSessionValidForProject(projectId: string, sessionId: string): Promise<boolean> {
    if (!projectId || !sessionId) {
      return false;
    }

    try {
      if (!pool) {
        throw new Error('Database connection not available');
      }
      
      const query = `
        SELECT 1
        FROM projects
        WHERE id = $1::uuid AND last_ai_session_id = $2
      `;
      
      const result = await pool.query(query, [projectId, sessionId]);
      return result.rows.length > 0;
    } catch (error) {
      console.error(`[SessionManagement] Failed to validate session for project ${projectId}:`, error);
      return false;
    }
  }

  /**
   * Clear session for a project (useful for forcing a fresh session)
   * @param projectId - The text project ID (UUID from projects.id as string)
   */
  static async clearProjectSession(projectId: string): Promise<void> {
    if (!projectId) {
      return;
    }

    try {
      if (!pool) {
        throw new Error('Database connection not available');
      }
      
      const query = `
        UPDATE projects 
        SET 
          last_ai_session_id = NULL,
          last_ai_session_updated_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1::uuid
      `;
      
      await pool.query(query, [projectId]);
      console.log(`[SessionManagement] Cleared session for project ${projectId}`);
    } catch (error) {
      console.error(`[SessionManagement] Failed to clear session for project ${projectId}:`, error);
    }
  }

  /**
   * Get the chain of sessions for a project (for debugging)
   * Returns all sessions associated with the project's versions in chronological order
   */
  static async getSessionChain(projectId: string): Promise<Array<{
    sessionId: string;
    versionId: string;
    lastUsed: Date;
  }>> {
    try {
      const query = `
        SELECT DISTINCT 
          ai_session_id as session_id,
          version_id,
          ai_session_last_used_at as last_used
        FROM project_versions
        WHERE project_id = $1 
          AND ai_session_id IS NOT NULL
        ORDER BY ai_session_last_used_at DESC
      `;
      
      if (!pool) {
        throw new Error('Database connection not available');
      }
      
      const result = await pool.query(query, [projectId]);
      return result.rows;
    } catch (error) {
      console.error(`[SessionManagement] Failed to get session chain for project ${projectId}:`, error);
      return [];
    }
  }

  /**
   * Check session synchronization status between projects and versions tables
   */
  static async checkSessionSync(projectId: string): Promise<{
    inSync: boolean;
    projectSession: string | null;
    latestVersionSession: string | null;
    versionId: string | null;
  }> {
    try {
      const query = `
        SELECT 
          p.last_ai_session_id as project_session,
          pv.ai_session_id as version_session,
          pv.version_id
        FROM projects p
        LEFT JOIN LATERAL (
          SELECT ai_session_id, version_id
          FROM project_versions
          WHERE project_id = p.id::text
          ORDER BY created_at DESC
          LIMIT 1
        ) pv ON true
        WHERE p.id = $1::uuid
      `;
      
      if (!pool) {
        throw new Error('Database connection not available');
      }
      
      const result = await pool.query(query, [projectId]);
      
      if (result.rows.length === 0) {
        return {
          inSync: false,
          projectSession: null,
          latestVersionSession: null,
          versionId: null
        };
      }
      
      const { project_session, version_session, version_id } = result.rows[0];
      
      return {
        inSync: project_session === version_session,
        projectSession: project_session,
        latestVersionSession: version_session,
        versionId: version_id
      };
    } catch (error) {
      console.error(`[SessionManagement] Failed to check sync for project ${projectId}:`, error);
      return {
        inSync: false,
        projectSession: null,
        latestVersionSession: null,
        versionId: null
      };
    }
  }

  /**
   * Get session statistics for monitoring
   */
  static async getSessionStats(): Promise<{
    totalProjects: number;
    projectsWithSessions: number;
    recentSessions: number;
  }> {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_projects,
          COUNT(last_ai_session_id) as projects_with_sessions,
          COUNT(CASE 
            WHEN last_ai_session_updated_at > CURRENT_TIMESTAMP - INTERVAL '1 hour' 
            THEN 1 
          END) as recent_sessions
        FROM projects
      `;
      
      if (!pool) {
        throw new Error('Database connection not available');
      }
      
      const result = await pool.query(query);
      
      if (result.rows.length === 0) {
        return {
          totalProjects: 0,
          projectsWithSessions: 0,
          recentSessions: 0
        };
      }
      
      const { total_projects, projects_with_sessions, recent_sessions } = result.rows[0];
      
      return {
        totalProjects: parseInt(total_projects),
        projectsWithSessions: parseInt(projects_with_sessions),
        recentSessions: parseInt(recent_sessions)
      };
    } catch (error) {
      console.error(`[SessionManagement] Failed to get session stats:`, error);
      return {
        totalProjects: 0,
        projectsWithSessions: 0,
        recentSessions: 0
      };
    }
  }
}