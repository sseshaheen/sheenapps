import { Pool } from 'pg';
import type { ProjectVersion } from '../types/build';
import { Recommendation } from '../types/recommendations';

// Types for complete project creation
export interface CreateCompleteProjectParams {
  userId: string;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte';
  prompt?: string;
  name?: string;
}

export interface CreateCompleteProjectResult {
  projectId: string;
  versionId: string;
  buildId: string;
  buildMetricsId: number;
}

// Database connection pool - only create if DATABASE_URL is set
export const pool = process.env.DATABASE_URL ? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10 seconds for cloud DB
  query_timeout: 30000, // 30 seconds for query timeout
}) : null;

// Readonly database pool for admin inspector tools
// Uses separate credentials with DB-enforced read-only access
let readonlyPool: Pool | null = null;

// Helper function to ensure pool is available
export function getPool() {
  if (!pool) {
    throw new Error('Database connection pool not available - DATABASE_URL not configured');
  }
  return pool;
}

/**
 * Get database pool for queries (alias for getPool)
 * For non-transactional queries only - each call may use different connections
 */
export function getDatabase() {
  return getPool();
}

/**
 * Get readonly database pool for admin inspector tools.
 * Uses DATABASE_READONLY_URL with inhouse_admin_readonly role credentials.
 * This is DB-enforced read-only - the role cannot write even if app code tries.
 */
export function getReadonlyDatabase(): Pool {
  if (!readonlyPool) {
    const readonlyUrl = process.env.DATABASE_READONLY_URL;
    if (!readonlyUrl) {
      // Fallback to primary pool with warning - should configure in production
      console.warn('[DB] DATABASE_READONLY_URL not configured - using primary pool for inspector (not recommended for production)');
      return getPool();
    }
    readonlyPool = new Pool({
      connectionString: readonlyUrl,
      max: 5, // Lower limit for admin tools
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      query_timeout: 10000, // Shorter timeout for inspector queries
    });
  }
  return readonlyPool;
}

/**
 * Get a dedicated client for transactions
 * IMPORTANT: Always release the client in a finally block
 *
 * Usage:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     // ... your queries ...
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient() {
  const p = getPool();
  return p.connect();
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  if (!pool) {
    console.log('No database configured (DATABASE_URL not set)');
    return false;
  }
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

// Create a new project version
export async function createProjectVersion(
  version: Omit<ProjectVersion, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ProjectVersion> {
  // Debug logging for user comment
  if (version.changeType === 'rollback') {
    console.log('[DB] Creating rollback version with userComment:', version.userComment);
  }

  const query = `
    INSERT INTO project_versions (
      user_id, project_id, version_id, prompt, parent_version_id,
      preview_url, artifact_url, framework, build_duration_ms,
      install_duration_ms, deploy_duration_ms, output_size_bytes,
      ai_json, status, needs_rebuild, base_snapshot_id,
      cf_deployment_id, node_version, pnpm_version,
      major_version, minor_version, patch_version,
      version_name, version_description, change_type,
      artifact_checksum, display_version_number,
      ai_session_id, ai_session_created_at, ai_session_last_used_at,
      user_comment
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
    )
    RETURNING *
  `;

  const values = [
    version.userId,
    version.projectId,
    version.versionId,
    version.prompt,
    version.parentVersionId || null,
    version.previewUrl || null,
    version.artifactUrl || null,
    version.framework || null,
    version.buildDurationMs || null,
    version.installDurationMs || null,
    version.deployDurationMs || null,
    version.outputSizeBytes || null,
    version.claudeJson || null,
    version.status,
    version.needsRebuild || false,
    version.baseSnapshotId || null,
    version.cfDeploymentId || null,
    version.nodeVersion || null,
    version.pnpmVersion || null,
    version.majorVersion || null,
    version.minorVersion || null,
    version.patchVersion || null,
    version.versionName || null,
    version.versionDescription || null,
    version.changeType || null,
    version.artifactChecksum || null,
    version.displayVersionNumber || null,
    version.aiSessionId || null,
    version.aiSessionCreatedAt || null,
    version.aiSessionLastUsedAt || null,
    version.userComment || null,
  ];

  if (!pool) {
    throw new Error('Database not configured');
  }
  try {
    const result = await pool.query(query, values);
    return result.rows[0];
  } catch (error) {
    console.error('Error creating project version:', error);
    throw error;
  }
}

// Update project version
export async function updateProjectVersion(
  versionId: string,
  updates: Partial<ProjectVersion>
): Promise<ProjectVersion | null> {
  const allowedFields = [
    'preview_url', 'artifact_url', 'build_duration_ms',
    'install_duration_ms', 'deploy_duration_ms', 'output_size_bytes',
    'ai_json', 'status', 'needs_rebuild', 'cf_deployment_id',
    'ai_session_id', 'ai_session_created_at', 'ai_session_last_used_at',
    // Version metadata fields (consolidated table)
    'version_name', 'version_description', 'change_type',
    'major_version', 'minor_version', 'patch_version', 'prerelease',
    'breaking_risk', 'auto_classified', 'classification_confidence', 'classification_reasoning',
    'is_published', 'published_at', 'published_by_user_id', 'user_comment',
    // Three-lane deployment tracking fields
    'deployment_lane', 'deployment_lane_detected_at', 'deployment_lane_detection_origin',
    'deployment_lane_reasons', 'deployment_lane_switched', 'deployment_lane_switch_reason',
    'final_deployment_url', 'deployment_lane_manifest'
  ];

  const updateFields: string[] = [];
  const updateValues: any[] = [];
  let paramIndex = 1;

  Object.entries(updates).forEach(([key, value]) => {
    const dbField = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    if (allowedFields.includes(dbField)) {
      updateFields.push(`${dbField} = $${paramIndex}`);
      updateValues.push(value);
      paramIndex++;
    }
  });

  if (updateFields.length === 0) {
    return null;
  }

  updateValues.push(versionId);
  const query = `
    UPDATE project_versions
    SET ${updateFields.join(', ')}, updated_at = NOW()
    WHERE version_id = $${paramIndex}
    RETURNING *
  `;

  if (!pool) {
    throw new Error('Database not configured');
  }
  try {
    const result = await pool.query(query, updateValues);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error updating project version:', error);
    throw error;
  }
}

// Get latest version for a project
export async function getLatestProjectVersion(
  userId: string,
  projectId: string
): Promise<ProjectVersion | null> {
  const query = `
    SELECT * FROM project_versions
    WHERE user_id = $1 AND project_id = $2
    ORDER BY
      major_version DESC NULLS LAST,
      minor_version DESC NULLS LAST,
      patch_version DESC NULLS LAST,
      created_at DESC
    LIMIT 1
  `;

  if (!pool) {
    throw new Error('Database not configured');
  }
  try {
    const result = await pool.query(query, [userId, projectId]);
    if (!result.rows[0]) return null;

    // Map snake_case to camelCase for consistency
    const row = result.rows[0];
    return {
      ...row,
      userId: row.user_id,
      projectId: row.project_id,
      versionId: row.version_id,
      parentVersionId: row.parent_version_id,
      artifactUrl: row.artifact_url,
      previewUrl: row.preview_url,
      cfDeploymentId: row.cf_deployment_id,
      buildDurationMs: row.build_duration_ms,
      installDurationMs: row.install_duration_ms,
      deployDurationMs: row.deploy_duration_ms,
      outputSizeBytes: row.output_size_bytes,
      artifactChecksum: row.artifact_checksum,
      majorVersion: row.major_version,
      minorVersion: row.minor_version,
      patchVersion: row.patch_version,
      versionName: row.version_name,
      versionDescription: row.version_description,
      changeType: row.change_type,
      displayVersionNumber: row.display_version_number,
      aiSessionId: row.ai_session_id,
      aiSessionCreatedAt: row.ai_session_created_at,
      aiSessionLastUsedAt: row.ai_session_last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      needsRebuild: row.needs_rebuild
    };
  } catch (error) {
    console.error('Error getting latest project version:', error);
    throw error;
  }
}

// Get specific version
export async function getProjectVersion(
  versionId: string
): Promise<ProjectVersion | null> {
  const query = `SELECT * FROM project_versions WHERE version_id = $1`;

  if (!pool) {
    throw new Error('Database not configured');
  }
  try {
    const result = await pool.query(query, [versionId]);
    if (!result.rows[0]) return null;

    // Map snake_case database fields to camelCase for compatibility
    const row = result.rows[0];
    return {
      ...row,
      // Ensure camelCase fields are available for rollback validation
      userId: row.user_id,
      projectId: row.project_id,
      versionId: row.version_id,
      parentVersionId: row.parent_version_id,
      artifactUrl: row.artifact_url,
      previewUrl: row.preview_url,
      cfDeploymentId: row.cf_deployment_id,
      buildDurationMs: row.build_duration_ms,
      installDurationMs: row.install_duration_ms,
      deployDurationMs: row.deploy_duration_ms,
      outputSizeBytes: row.output_size_bytes,
      artifactChecksum: row.artifact_checksum,
      majorVersion: row.major_version,
      minorVersion: row.minor_version,
      patchVersion: row.patch_version,
      versionName: row.version_name,
      versionDescription: row.version_description,
      changeType: row.change_type,
      displayVersionNumber: row.display_version_number,
      aiSessionId: row.ai_session_id,
      aiSessionCreatedAt: row.ai_session_created_at,
      aiSessionLastUsedAt: row.ai_session_last_used_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      needsRebuild: row.needs_rebuild
    };
  } catch (error) {
    console.error('Error getting project version:', error);
    throw error;
  }
}

/**
 * Get version by buildId - looks up in project_build_metrics first since
 * buildId and versionId may be different in the modular build system.
 * Falls back to direct version_id lookup if not found in metrics.
 */
export async function getVersionByBuildId(
  buildId: string
): Promise<ProjectVersion | null> {
  if (!pool) {
    throw new Error('Database not configured');
  }

  try {
    // First try: look up in project_build_metrics to find the version_id
    const metricsQuery = `
      SELECT pbm.version_id, pbm.user_id, pbm.project_id
      FROM project_build_metrics pbm
      WHERE pbm.build_id = $1
    `;
    const metricsResult = await pool.query(metricsQuery, [buildId]);

    if (metricsResult.rows[0]) {
      const { version_id, user_id, project_id } = metricsResult.rows[0];
      console.log(`[DB] Found buildId ${buildId} in metrics, version_id: ${version_id}`);

      // Now look up the version record
      const version = await getProjectVersion(version_id);
      if (version) {
        return version;
      }

      // Version record might not exist yet (build in progress or failed)
      // Return a minimal version object with info from metrics
      console.log(`[DB] Version ${version_id} not in project_versions, using metrics data`);
      return {
        versionId: version_id,
        userId: user_id,
        projectId: project_id,
        status: 'building', // Assume building since no version record
      } as ProjectVersion;
    }

    // Second try: maybe buildId IS the versionId (legacy builds)
    console.log(`[DB] buildId ${buildId} not in metrics, trying direct version lookup`);
    return await getProjectVersion(buildId);

  } catch (error) {
    console.error('Error getting version by buildId:', error);
    throw error;
  }
}

// List all versions for a project
export async function listProjectVersions(
  userId: string,
  projectId: string,
  limit: number = 25
): Promise<ProjectVersion[]> {
  const query = `
    SELECT * FROM project_versions
    WHERE user_id = $1 AND project_id = $2
    ORDER BY
      major_version DESC NULLS LAST,
      minor_version DESC NULLS LAST,
      patch_version DESC NULLS LAST,
      created_at DESC
    LIMIT $3
  `;

  if (!pool) {
    throw new Error('Database not configured');
  }
  try {
    const result = await pool.query(query, [userId, projectId, limit]);
    // Map snake_case to camelCase for consistency
    return result.rows.map(row => ({
      ...row,
      userId: row.user_id,
      projectId: row.project_id,
      versionId: row.version_id,
      parentVersionId: row.parent_version_id,
      artifactUrl: row.artifact_url,
      previewUrl: row.preview_url,
      cfDeploymentId: row.cf_deployment_id,
      buildDurationMs: row.build_duration_ms,
      installDurationMs: row.install_duration_ms,
      deployDurationMs: row.deploy_duration_ms,
      outputSizeBytes: row.output_size_bytes,
      artifactChecksum: row.artifact_checksum,
      majorVersion: row.major_version,
      minorVersion: row.minor_version,
      patchVersion: row.patch_version,
      versionName: row.version_name,
      versionDescription: row.version_description,
      changeType: row.change_type,
      displayVersionNumber: row.display_version_number,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      needsRebuild: row.needs_rebuild
    }));
  } catch (error) {
    console.error('Error listing project versions:', error);
    throw error;
  }
}

// Get version by Cloudflare deployment ID with version metadata
export async function getVersionByDeploymentId(
  deploymentId: string
): Promise<(ProjectVersion & { versionName?: string }) | null> {
  const query = `
    SELECT *
    FROM project_versions
    WHERE cf_deployment_id = $1
  `;

  if (!pool) {
    throw new Error('Database not configured');
  }
  try {
    const result = await pool.query(query, [deploymentId]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    // Add computed versionName if not already set (now from consolidated table)
    let versionName = row.version_name;
    if (!versionName && row.major_version !== null) {
      versionName = `v${row.major_version}.${row.minor_version}.${row.patch_version}`;
    }

    return {
      ...row,
      versionName
    };
  } catch (error) {
    console.error('Error getting version by deployment ID:', error);
    throw error;
  }
}

// Clean up old versions (for retention policy)
export async function cleanupOldVersions(
  retentionDays: number = 365
): Promise<number> {
  const query = `
    DELETE FROM project_versions
    WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
    AND status != 'deployed'
    RETURNING id
  `;

  if (!pool) {
    throw new Error('Database not configured');
  }
  try {
    const result = await pool.query(query);
    return result.rowCount || 0;
  } catch (error) {
    console.error('Error cleaning up old versions:', error);
    throw error;
  }
}

/**
 * Save project recommendations
 */
export async function saveProjectRecommendations(data: {
  projectId: string;
  versionId: string;
  buildId?: string;
  userId: string;
  recommendations: Recommendation[];
}): Promise<void> {
  if (!pool) {
    console.log('Database not configured - skipping recommendations save');
    return;
  }

  const query = `
    INSERT INTO project_recommendations (project_id, version_id, build_id, user_id, recommendations)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (project_id, version_id)
    DO UPDATE SET
      recommendations = EXCLUDED.recommendations,
      build_id = EXCLUDED.build_id,
      user_id = EXCLUDED.user_id,
      created_at = CURRENT_TIMESTAMP
  `;

  try {
    await pool.query(query, [data.projectId, data.versionId, data.buildId || null, data.userId, JSON.stringify(data.recommendations)]);
    console.log(`[DB] Saved recommendations for ${data.projectId}/${data.versionId}`);
  } catch (error: any) {
    // If table doesn't exist, log but don't fail
    if (error.code === '42P01') {
      console.log('[DB] project_recommendations table does not exist yet - skipping save');
      return;
    }
    console.error('Error saving project recommendations:', error);
    throw error;
  }
}

/**
 * Get project recommendations by buildId (direct lookup)
 */
export async function getProjectRecommendationsByBuildId(
  buildId: string,
  userId?: string
): Promise<any | null> {
  if (!pool) {
    console.log('Database not configured - returning null for recommendations');
    return null;
  }

  try {
    let query: string;
    let params: any[];

    if (userId) {
      // Security: Only return recommendations for the specified user
      query = `
        SELECT project_id, version_id, recommendations, created_at
        FROM project_recommendations
        WHERE build_id = $1 AND user_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `;
      params = [buildId, userId];
    } else {
      // Fallback: lookup without user filtering (for backward compatibility)
      query = `
        SELECT project_id, version_id, recommendations, created_at
        FROM project_recommendations
        WHERE build_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `;
      params = [buildId];
    }

    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      projectId: result.rows[0].project_id,
      versionId: result.rows[0].version_id,
      recommendations: result.rows[0].recommendations,
      createdAt: result.rows[0].created_at
    };
  } catch (error: any) {
    // If table doesn't exist, log but don't fail
    if (error.code === '42P01') {
      console.log('[DB] project_recommendations table does not exist yet');
      return null;
    }
    console.error('Error getting project recommendations by buildId:', error);
    throw error;
  }
}

/**
 * Get all recommendations for a user (useful for frontend dashboards)
 */
export async function getUserRecommendations(
  userId: string,
  limit: number = 50
): Promise<any[]> {
  if (!pool) {
    console.log('Database not configured - returning empty recommendations');
    return [];
  }

  try {
    const query = `
      SELECT project_id, version_id, build_id, recommendations, created_at
      FROM project_recommendations
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await pool.query(query, [userId, limit]);

    return result.rows.map(row => ({
      projectId: row.project_id,
      versionId: row.version_id,
      buildId: row.build_id,
      recommendations: row.recommendations,
      createdAt: row.created_at
    }));
  } catch (error: any) {
    // If table doesn't exist, log but don't fail
    if (error.code === '42P01') {
      console.log('[DB] project_recommendations table does not exist yet');
      return [];
    }
    console.error('Error getting user recommendations:', error);
    throw error;
  }
}

/**
 * Get project recommendations
 */
export async function getProjectRecommendations(
  userId: string,
  projectId: string,
  versionId?: string
): Promise<any | null> {
  if (!pool) {
    console.log('Database not configured');
    return null;
  }

  let query: string;
  let params: any[];

  if (versionId) {
    // Get recommendations for specific version
    query = `
      SELECT r.version_id, r.recommendations, r.created_at
      FROM project_recommendations r
      JOIN project_versions v ON r.version_id = v.version_id
      WHERE v.user_id = $1 AND v.project_id = $2 AND r.version_id = $3
    `;
    params = [userId, projectId, versionId];
  } else {
    // Get latest recommendations
    query = `
      SELECT r.version_id, r.recommendations, r.created_at
      FROM project_recommendations r
      JOIN project_versions v ON r.version_id = v.version_id
      WHERE v.user_id = $1 AND v.project_id = $2
      ORDER BY r.created_at DESC
      LIMIT 1
    `;
    params = [userId, projectId];
  }

  try {
    const result = await pool.query(query, params);
    if (result.rows.length > 0) {
      return {
        versionId: result.rows[0].version_id,
        recommendations: result.rows[0].recommendations,
        createdAt: result.rows[0].created_at
      };
    }
    return null;
  } catch (error: any) {
    // If table doesn't exist, return null
    if (error.code === '42P01') {
      console.log('[DB] project_recommendations table does not exist yet');
      return null;
    }
    console.error('Error getting project recommendations:', error);
    throw error;
  }
}

/**
 * Create project for build with delayed version creation
 * Generates server-side IDs and prevents race conditions
 * Version record created only on successful build completion
 */
export async function createCompleteProject(
  params: CreateCompleteProjectParams
): Promise<CreateCompleteProjectResult> {
  if (!pool) {
    throw new Error('Database not configured');
  }

  const { userId, framework = 'react', prompt = null, name = 'Untitled Project' } = params;

  try {
    const query = `
      SELECT project_id, version_id, build_id, build_metrics_id
      FROM create_project_for_build($1, $2, $3, $4)
    `;

    const result = await pool.query(query, [userId, framework, prompt, name]);

    if (result.rows.length === 0) {
      throw new Error('Failed to create project - no result returned');
    }

    const row = result.rows[0];
    return {
      projectId: row.project_id,
      versionId: row.version_id,
      buildId: row.build_id,
      buildMetricsId: row.build_metrics_id
    };
  } catch (error: any) {
    console.error('Error creating complete project:', error);

    // Handle advisory lock conflicts (double-click prevention)
    if (error.code === '55P03') { // advisory lock conflict
      throw new Error('Project creation already in progress. Please wait and try again.');
    }

    throw error;
  }
}

/**
 * Create version record on successful build completion
 * Called by streamWorker when build succeeds
 */
export async function createVersionOnSuccess(
  projectId: string,
  versionId: string,
  userId: string,
  prompt: string,
  framework: string,
  aiSessionId?: string
): Promise<void> {
  if (!pool) {
    throw new Error('Database not configured');
  }

  try {
    const query = `SELECT create_version_on_success($1, $2, $3, $4, $5, $6)`;
    await pool.query(query, [projectId, versionId, userId, prompt, framework, aiSessionId || null]);
    console.log(`[DB] Created version record ${versionId} for successful build`);
  } catch (error: any) {
    console.error('Error creating version on success:', error);
    throw error;
  }
}


// Close database connection pool
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
  }
}
