import { pool } from './database';

/**
 * Helper function to detect database constraint violations
 */
function isConstraintViolation(error: any): boolean {
  return error.code === '23514' || // Check constraint violation (timing logic)
         error.code === '23503';   // Foreign key violation (build ID reference)
}

/**
 * Helper function to get constraint violation type for better error messages
 */
function getConstraintViolationType(error: any): string {
  if (error.code === '23514') {
    if (error.constraint === 'projects_build_timing_logical') {
      return 'Build timing constraint: completion time must be after start time';
    }
    return `Check constraint violation: ${error.constraint}`;
  }
  if (error.code === '23503') {
    if (error.constraint === 'projects_current_build_fk') {
      return 'Build ID not found in metrics table - build metrics record missing';
    }
    return `Foreign key constraint violation: ${error.constraint}`;
  }
  return error.message;
}

export interface ProjectConfig {
  status: 'queued' | 'building' | 'deployed' | 'failed' | 'canceled' | 'superseded' | 'rollingBack' | 'rollbackFailed';
  buildId: string;
  // Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
  lastBuildStarted?: Date | null | undefined;
  lastBuildCompleted?: Date | null | undefined;
  previewUrl?: string | undefined;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte' | undefined;
  versionId?: string | undefined;
  versionName?: string | undefined; // Frontend team requested: Human-readable version name
  // Three-lane deployment tracking fields
  deployment_lane?: string | undefined;
  deployment_lane_detected_at?: Date | undefined;
  deployment_lane_detection_origin?: string | undefined;
  deployment_lane_reasons?: string[] | undefined;
  deployment_lane_switched?: boolean | undefined;
  deployment_lane_switch_reason?: string | undefined;
}

/**
 * Update project build information in dedicated columns
 * This ensures the projects table reflects the latest build status
 */
export async function updateProjectConfig(
  projectId: string, 
  configUpdates: Partial<ProjectConfig>
): Promise<void> {
  if (!pool) {
    console.warn('[ProjectConfig] Database pool not available, skipping config update');
    return;
  }

  try {
    console.log(`[ProjectConfig] Updating project ${projectId} config:`, configUpdates);

    // Build dynamic SQL query for only the fields that are being updated
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (configUpdates.status !== undefined) {
      updateFields.push(`build_status = $${paramIndex++}`);
      values.push(configUpdates.status);
    }

    if (configUpdates.buildId !== undefined) {
      updateFields.push(`current_build_id = $${paramIndex++}`);
      values.push(configUpdates.buildId);
    }

    if (configUpdates.versionId !== undefined) {
      updateFields.push(`current_version_id = $${paramIndex++}`);
      values.push(configUpdates.versionId);
    }

    if (configUpdates.versionName !== undefined) {
      updateFields.push(`current_version_name = $${paramIndex++}`);
      values.push(configUpdates.versionName);
    }

    if (configUpdates.framework !== undefined) {
      updateFields.push(`framework = $${paramIndex++}`);
      values.push(configUpdates.framework);
    }

    if (configUpdates.previewUrl !== undefined) {
      updateFields.push(`preview_url = $${paramIndex++}`);
      values.push(configUpdates.previewUrl);
    }

    if (configUpdates.lastBuildStarted !== undefined) {
      updateFields.push(`last_build_started = $${paramIndex++}`);
      values.push(configUpdates.lastBuildStarted);
    }

    if (configUpdates.lastBuildCompleted !== undefined) {
      updateFields.push(`last_build_completed = $${paramIndex++}`);
      values.push(configUpdates.lastBuildCompleted); // This will handle null values correctly
    }

    if (updateFields.length === 0) {
      console.log(`[ProjectConfig] No valid fields to update for project ${projectId}`);
      return;
    }

    // Always update the updated_at timestamp
    updateFields.push(`updated_at = NOW()`);
    values.push(projectId);

    // CRITICAL: Ensure projectId is valid UUID format
    // PostgreSQL silently fails if UUID is malformed
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(projectId)) {
      console.error(`[ProjectConfig] ❌ INVALID PROJECT ID FORMAT: '${projectId}' is not a valid UUID`);
      console.error(`[ProjectConfig] Expected format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);
      throw new Error(`Invalid project ID format: ${projectId}`);
    }

    const query = `
      UPDATE projects 
      SET ${updateFields.join(', ')} 
      WHERE id = $${paramIndex}::uuid
    `;

    console.log(`[ProjectConfig] Executing query: ${query}`);
    console.log(`[ProjectConfig] With values:`, values);
    console.log(`[ProjectConfig] Project ID type: ${typeof projectId}, value: '${projectId}'`);
    
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      console.warn(`[ProjectConfig] ⚠️ Project ${projectId} not found - NO ROWS UPDATED`);
      
      // Check if project exists at all
      const checkResult = await pool.query(
        'SELECT id, build_status FROM projects WHERE id::text = $1 OR id = $1::uuid',
        [projectId]
      );
      
      if (checkResult.rows.length > 0) {
        console.error(`[ProjectConfig] ❌ CRITICAL: Project EXISTS but UPDATE failed!`);
        console.error(`[ProjectConfig] Found project:`, checkResult.rows[0]);
        console.error(`[ProjectConfig] This suggests a WHERE clause issue or transaction problem`);
      } else {
        console.error(`[ProjectConfig] ❌ Project genuinely does not exist in database`);
        
        // List all projects to debug
        const allProjectsResult = await pool.query(
          'SELECT id, name, build_status FROM projects LIMIT 5'
        );
        console.log(`[ProjectConfig] Sample of existing projects:`, allProjectsResult.rows);
      }
      
      return;
    }

    console.log(`[ProjectConfig] ✅ Successfully updated project ${projectId} config - ${result.rowCount} rows affected`);
    
    // Verify the update actually worked
    if (configUpdates.status) {
      const verifyResult = await pool.query(
        'SELECT id, build_status FROM projects WHERE id = $1::uuid',
        [projectId]
      );
      if (verifyResult.rows.length > 0) {
        console.log(`[ProjectConfig] ✓ Verified build_status is now: ${verifyResult.rows[0].build_status} for project ${verifyResult.rows[0].id}`);
      } else {
        console.error(`[ProjectConfig] ❌ Could not verify status update - project ${projectId} not found!`);
        
        // Debug: Check without UUID casting
        const debugResult = await pool.query(
          'SELECT id::text, build_status FROM projects WHERE id::text LIKE $1',
          [`%${projectId.slice(0, 8)}%`]
        );
        if (debugResult.rows.length > 0) {
          console.error(`[ProjectConfig] Found similar projects:`, debugResult.rows);
        }
      }
    }
  } catch (error) {
    if (isConstraintViolation(error)) {
      const violationType = getConstraintViolationType(error);
      console.error(`[ProjectConfig] Constraint violation updating project ${projectId}: ${violationType}`);
      console.error('[ProjectConfig] Update values that caused violation:', JSON.stringify(configUpdates, null, 2));
    } else {
      console.error('[ProjectConfig] Failed to update project config:', error);
    }
    // Don't throw - this is supplementary data, shouldn't break builds
  }
}

/**
 * Safe project config update with retry logic for constraint violations
 */
export async function safeUpdateProjectConfig(
  projectId: string, 
  configUpdates: Partial<ProjectConfig>, 
  retries = 2
): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await updateProjectConfig(projectId, configUpdates);
      return;
    } catch (error) {
      if (isConstraintViolation(error) && attempt < retries) {
        console.log(`[ProjectConfig] Constraint violation, retrying ${attempt}/${retries} for project ${projectId}`);
        // Small delay before retry
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }
      throw error;
    }
  }
}

/**
 * Get current project configuration from dedicated columns
 */
export async function getProjectConfig(projectId: string): Promise<ProjectConfig | null> {
  if (!pool) {
    console.warn('[ProjectConfig] Database pool not available');
    return null;
  }

  try {
    const result = await pool.query(`
      SELECT 
        build_status as status,
        current_build_id as "buildId",
        current_version_id as "versionId",
        current_version_name as "versionName",
        framework,
        preview_url as "previewUrl",
        last_build_started as "lastBuildStarted",
        last_build_completed as "lastBuildCompleted"
      FROM projects 
      WHERE id = $1
    `, [projectId]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    return {
      status: row.status,
      buildId: row.buildId,
      versionId: row.versionId,
      versionName: row.versionName,
      framework: row.framework,
      previewUrl: row.previewUrl,
      lastBuildStarted: row.lastBuildStarted,
      lastBuildCompleted: row.lastBuildCompleted
    };
  } catch (error) {
    console.error('[ProjectConfig] Failed to get project config:', error);
    return null;
  }
}

/**
 * Fix stale project configs by updating them with latest build information
 * This can be used to repair existing inconsistencies
 */
export async function repairProjectConfigs(): Promise<{ updated: number; errors: number }> {
  if (!pool) {
    console.warn('[ProjectConfig] Database pool not available');
    return { updated: 0, errors: 0 };
  }

  console.log('[ProjectConfig] Starting project config repair...');
  let updated = 0;
  let errors = 0;

  try {
    // Comprehensive query to sync project columns with latest build data
    const query = `
      UPDATE projects p
      SET 
        build_status = COALESCE(
          CASE pbm.status
            WHEN 'started' THEN 'building'::build_status
            WHEN 'ai_completed' THEN 'building'::build_status  
            WHEN 'deployed' THEN 'deployed'::build_status
            WHEN 'failed' THEN 'failed'::build_status
            ELSE 'queued'::build_status
          END,
          'queued'::build_status
        ),
        current_build_id = pbm.build_id,
        current_version_id = pv.version_id,
        framework = COALESCE(pv.framework, p.framework, 'react'),
        preview_url = pv.preview_url,
        last_build_started = pbm.started_at,
        last_build_completed = pbm.completed_at,
        updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (p.id)
          p.id as project_id,
          pv.version_id,
          pv.preview_url,
          pv.framework,
          pbm.build_id,
          pbm.status,
          pbm.started_at,
          pbm.completed_at
        FROM projects p
        LEFT JOIN project_versions pv ON p.id = pv.project_id
        LEFT JOIN project_build_metrics pbm ON pv.version_id = pbm.version_id
        ORDER BY p.id, pv.created_at DESC, pbm.started_at DESC
      ) latest
      WHERE p.id = latest.project_id
      AND (
        p.build_status != COALESCE(
          CASE latest.status
            WHEN 'started' THEN 'building'::build_status
            WHEN 'ai_completed' THEN 'building'::build_status
            WHEN 'deployed' THEN 'deployed'::build_status
            WHEN 'failed' THEN 'failed'::build_status
            ELSE 'queued'::build_status
          END,
          'queued'::build_status
        )
        OR p.current_build_id IS DISTINCT FROM latest.build_id
        OR p.current_version_id IS DISTINCT FROM latest.version_id
        OR p.framework IS DISTINCT FROM COALESCE(latest.framework, p.framework, 'react')
        OR p.preview_url IS DISTINCT FROM latest.preview_url
        OR p.last_build_started IS DISTINCT FROM latest.started_at  
        OR p.last_build_completed IS DISTINCT FROM latest.completed_at
      )
    `;

    const result = await pool.query(query);
    updated = result.rowCount || 0;

    console.log(`[ProjectConfig] Repair completed: ${updated} projects updated`);
    return { updated, errors: 0 };
  } catch (error) {
    console.error('[ProjectConfig] Failed to repair project configs:', error);
    return { updated, errors: 1 };
  }
}

