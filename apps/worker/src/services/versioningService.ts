import { pool } from './database';

/**
 * Assigns a display version number immediately after successful deployment
 * This runs BEFORE metadata generation, ensuring users see version immediately
 */
export async function assignDisplayVersion(
  projectId: string, 
  versionId: string
): Promise<number> {
  if (!pool) {
    console.warn('[Versioning] Database not available');
    return 0;
  }

  try {
    // Use a transaction to prevent race conditions
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Lock the project's versions to prevent race conditions
      // Use a separate query for locking since FOR UPDATE doesn't work with aggregates
      await client.query(`
        SELECT 1 FROM project_versions
        WHERE project_id = $1
        FOR UPDATE
      `, [projectId]);
      
      // Now get the next version number
      const nextVersionResult = await client.query(`
        SELECT COALESCE(MAX(display_version_number), 0) + 1 as next_version
        FROM project_versions
        WHERE project_id = $1
      `, [projectId]);
      
      const nextVersion = nextVersionResult.rows[0].next_version;
      
      // Assign the version number immediately
      // Always update version_name to match display version for consistency
      await client.query(`
        UPDATE project_versions
        SET 
          display_version_number = $1,
          version_name = $2,
          updated_at = NOW()
        WHERE version_id = $3
        RETURNING display_version_number
      `, [nextVersion, `v${nextVersion}`, versionId]);
      
      await client.query('COMMIT');
      
      console.log(`[Versioning] Assigned v${nextVersion} to version ${versionId} for project ${projectId}`);
      return nextVersion;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[Versioning] Failed to assign display version:', error);
    return 0;
  }
}

/**
 * Gets the current version number for a project
 */
export async function getCurrentVersionNumber(projectId: string): Promise<number> {
  if (!pool) return 0;
  
  try {
    const result = await pool.query(`
      SELECT COALESCE(MAX(display_version_number), 0) as current_version
      FROM project_versions
      WHERE project_id = $1 AND status = 'deployed'
    `, [projectId]);
    
    return result.rows[0]?.current_version || 0;
  } catch (error) {
    console.error('[Versioning] Failed to get current version:', error);
    return 0;
  }
}

/**
 * Gets the next version number that will be assigned (preview only, doesn't reserve it)
 */
export async function getNextVersionNumber(projectId: string): Promise<number> {
  const current = await getCurrentVersionNumber(projectId);
  return current + 1;
}

/**
 * Checks if a version has been assigned a display number
 */
export async function hasDisplayVersion(versionId: string): Promise<boolean> {
  if (!pool) return false;
  
  try {
    const result = await pool.query(`
      SELECT display_version_number
      FROM project_versions
      WHERE version_id = $1
    `, [versionId]);
    
    return result.rows[0]?.display_version_number != null;
  } catch (error) {
    console.error('[Versioning] Failed to check display version:', error);
    return false;
  }
}