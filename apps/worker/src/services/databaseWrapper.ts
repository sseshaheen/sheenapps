import type { ProjectVersion } from '../types/build';
import * as db from './database';
import { Recommendation } from '../types/recommendations';

// Re-export getPool and getDatabase for safe database access
export const { getPool, getDatabase } = db;

// Re-export pool for legacy imports - may be null if DATABASE_URL not configured
// Services should check for null or use getPool() which throws with a clear error
export const pool = db.pool;

/**
 * Upsert a project version - creates if not exists, updates if exists
 */
export async function upsertProjectVersion(
  version: Omit<ProjectVersion, 'id' | 'createdAt' | 'updatedAt'>
): Promise<ProjectVersion> {
  try {
    // Try to create first
    return await db.createProjectVersion(version);
  } catch (error: any) {
    // If duplicate key error, update instead
    if (error.code === '23505' && error.constraint === 'project_versions_version_id_key') {
      console.log(`[DB] Version ${version.versionId} exists, updating instead`);
      
      // Extract updateable fields
      const { userId, projectId, versionId, ...updateableFields } = version;
      
      const updated = await db.updateProjectVersion(versionId, updateableFields);
      if (!updated) {
        throw new Error(`Failed to update version ${versionId}`);
      }
      return updated;
    }
    
    // Handle other constraint errors gracefully
    if (error.code === '23505') {
      console.log(`[DB] Constraint error creating version ${version.versionId}:`, {
        code: error.code,
        constraint: error.constraint,
        message: error.message
      });
      
      // If it's a different constraint error, try to get the existing version
      try {
        const existing = await db.getProjectVersion(version.versionId);
        if (existing) {
          console.log(`[DB] Found existing version ${version.versionId}, returning it`);
          return existing;
        }
      } catch (getError) {
        console.log(`[DB] Could not retrieve existing version ${version.versionId}:`, getError);
      }
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Create or update project version status and/or metadata
 * @param status - Optional: only update status if provided (prevents metadata worker from setting 'deployed' prematurely)
 */
export async function updateProjectVersionStatus(
  versionId: string,
  status: 'building' | 'deployed' | 'failed' | null,
  additionalUpdates?: Partial<ProjectVersion>
): Promise<ProjectVersion> {
  const updates: Partial<ProjectVersion> = {
    ...additionalUpdates
  };

  // Only include status in update if explicitly provided (not null)
  if (status !== null) {
    updates.status = status;
  }

  const updated = await db.updateProjectVersion(versionId, updates);
  if (!updated) {
    throw new Error(`Version ${versionId} not found`);
  }
  return updated;
}

/**
 * Check if a project version exists
 */
export async function projectVersionExists(versionId: string): Promise<boolean> {
  if (!db.pool) {
    throw new Error('Database not configured');
  }
  
  try {
    const result = await db.pool.query(
      'SELECT 1 FROM project_versions WHERE version_id = $1',
      [versionId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking project version existence:', error);
    throw error;
  }
}

/**
 * Save project recommendations to database
 */
export async function saveProjectRecommendations(data: {
  projectId: string;
  versionId: string;
  buildId?: string;
  userId: string;
  recommendations: Recommendation[];
}): Promise<void> {
  return db.saveProjectRecommendations(data);
}

/**
 * Get project recommendations by buildId (direct lookup)
 */
export async function getProjectRecommendationsByBuildId(
  buildId: string,
  userId?: string
): Promise<any | null> {
  return db.getProjectRecommendationsByBuildId(buildId, userId);
}

/**
 * Get project recommendations
 */
export async function getProjectRecommendations(
  userId: string,
  projectId: string,
  versionId?: string
): Promise<any | null> {
  return db.getProjectRecommendations(userId, projectId, versionId);
}

// DEPRECATED: Version metadata functions - use consolidated table approach instead
// export interface VersionMetadataCreate {
//   version_id: string;
//   project_id: string;
//   user_id: string;
//   major_version: number;
//   minor_version: number;
//   patch_version: number;
//   prerelease?: string;
//   version_name: string;
//   version_description: string;
//   change_type: string;
//   breaking_risk: string;
//   auto_classified: boolean;
//   classification_confidence?: number;
//   classification_reasoning?: string;
//   parent_version_id?: string;
//   from_recommendation_id?: number;
//   files_changed: number;
//   lines_added: number;
//   lines_removed: number;
//   build_duration_ms: number;
//   git_commit_sha: string;
//   git_tag: string;
// }

// DEPRECATED: Use updateProjectVersion directly with consolidated table
// export async function createVersionMetadata(data: VersionMetadataCreate) {
//   console.warn('[DB] createVersionMetadata deprecated - use updateProjectVersion directly with consolidated table');
//   
//   // Use consolidated table approach instead
//   const updates = {
//     majorVersion: data.major_version,
//     minorVersion: data.minor_version,
//     patchVersion: data.patch_version,
//     prerelease: data.prerelease,
//     versionName: data.version_name,
//     versionDescription: data.version_description,
//     changeType: data.change_type,
//     breakingRisk: data.breaking_risk,
//     autoClassified: data.auto_classified,
//     classificationConfidence: data.classification_confidence,
//     classificationReasoning: data.classification_reasoning
//   };
//   
//   return await db.updateProjectVersion(data.version_id, updates);
// }

export async function getLatestVersionMetadata(projectId: string) {
  if (!db.pool) {
    return null;
  }
  
  // Query consolidated table instead of old metadata table
  const query = `
    SELECT 
      version_id,
      project_id,
      user_id,
      version_name,
      version_description,
      change_type,
      major_version,
      minor_version,
      patch_version,
      prerelease,
      breaking_risk,
      auto_classified,
      classification_confidence,
      classification_reasoning,
      created_at
    FROM project_versions
    WHERE project_id = $1 
    AND major_version IS NOT NULL  -- Only get versions that have metadata populated
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  const result = await db.pool.query(query, [projectId]);
  return result.rows[0] || null;
}

export async function getProjectVersionMetadata(versionId: string) {
  if (!db.pool) {
    return null;
  }
  
  // Query consolidated table instead of old metadata table
  const query = `
    SELECT 
      version_id,
      project_id,
      user_id,
      version_name,
      version_description,
      change_type,
      major_version,
      minor_version,
      patch_version,
      prerelease,
      breaking_risk,
      auto_classified,
      classification_confidence,
      classification_reasoning,
      is_published,
      published_at,
      published_by_user_id,
      user_comment,
      created_at
    FROM project_versions
    WHERE version_id = $1
  `;
  
  const result = await db.pool.query(query, [versionId]);
  return result.rows[0] || null;
}

export async function getVersionBySemver(
  projectId: string,
  major: number,
  minor: number,
  patch: number,
  prerelease?: string
) {
  if (!db.pool) {
    return null;
  }
  
  const query = prerelease
    ? `SELECT * FROM project_versions 
       WHERE project_id = $1 AND major_version = $2 AND minor_version = $3 
       AND patch_version = $4 AND prerelease = $5`
    : `SELECT * FROM project_versions 
       WHERE project_id = $1 AND major_version = $2 AND minor_version = $3 
       AND patch_version = $4 AND prerelease IS NULL`;
  
  const values = prerelease 
    ? [projectId, major, minor, patch, prerelease]
    : [projectId, major, minor, patch];
  
  const result = await db.pool.query(query, values);
  return result.rows[0] || null;
}

// DEPRECATED: Use updateProjectVersion directly with consolidated table
// export async function updateVersionMetadata(versionId: string, updates: any) {
//   console.warn('[DB] updateVersionMetadata deprecated - use updateProjectVersion directly with consolidated table');
//   
//   // Use consolidated table approach instead
//   return await db.updateProjectVersion(versionId, updates);
// }

// DEPRECATED: Use getProjectVersionHistoryWithPublication for consolidated table approach
// export async function getProjectVersionHistory(
//   projectId: string,
//   options: { limit: number; offset: number; includeCheckpoints?: boolean }
// ) {
//   if (!db.pool) {
//     return { versions: [], total: 0 };
//   }
//   
//   const { limit, offset, includeCheckpoints = false } = options;
//   
//   // Use consolidated table instead of old metadata table
//   const query = includeCheckpoints
//     ? `SELECT * FROM project_versions 
//        WHERE project_id = $1 
//        ORDER BY created_at DESC 
//        LIMIT $2 OFFSET $3`
//     : `SELECT * FROM project_versions 
//        WHERE project_id = $1 AND (change_type IN ('minor', 'major') OR change_type IS NULL)
//        ORDER BY created_at DESC 
//        LIMIT $2 OFFSET $3`;
//   
//   const countQuery = includeCheckpoints
//     ? `SELECT COUNT(*) FROM project_versions WHERE project_id = $1`
//     : `SELECT COUNT(*) FROM project_versions 
//        WHERE project_id = $1 AND (change_type IN ('minor', 'major') OR change_type IS NULL)`;
//   
//   const [versionsResult, countResult] = await Promise.all([
//     db.pool.query(query, [projectId, limit, offset]),
//     db.pool.query(countQuery, [projectId])
//   ]);
//   
//   return {
//     versions: versionsResult.rows,
//     total: parseInt(countResult.rows[0].count)
//   };
// }

/**
 * Get project version history with publication information
 */
export async function getProjectVersionHistoryWithPublication(
  projectId: string,
  options: { 
    limit: number; 
    offset: number; 
    includeCheckpoints?: boolean;
    state?: 'published' | 'unpublished' | 'all';
    showDeleted?: boolean;
  }
) {
  if (!db.pool) {
    return { versions: [], total: 0 };
  }
  
  const { limit, offset, includeCheckpoints = false, state = 'all', showDeleted = false } = options;
  
  // Build WHERE conditions for consolidated table
  const conditions = ['project_id = $1'];
  const params = [projectId];
  let paramIndex = 2;
  
  // Filter by version type (only if we have change_type data)
  if (!includeCheckpoints) {
    conditions.push(`(change_type IN ('minor', 'major', 'patch') OR change_type IS NULL)`);
  }
  
  // Filter by publication state
  if (state === 'published') {
    conditions.push('is_published = true');
  } else if (state === 'unpublished') {
    conditions.push('(is_published = false OR is_published IS NULL)');
  }
  
  // Handle soft deleted versions (placeholder for future implementation)
  if (!showDeleted) {
    // Note: soft_deleted_at column doesn't exist yet in consolidated table
    // This is future-proofing for when it's added
    // conditions.push('soft_deleted_at IS NULL');
  }
  
  const whereClause = conditions.join(' AND ');
  
  // SINGLE TABLE QUERY - No JOINs needed!
  const query = `
    SELECT 
      version_id,
      project_id,
      user_id,
      version_name,
      version_description,
      change_type,
      major_version,
      minor_version,
      patch_version,
      prerelease,
      breaking_risk,
      auto_classified,
      classification_confidence,
      classification_reasoning,
      is_published,
      published_at,
      published_by_user_id,
      user_comment,
      -- Core build fields
      preview_url,
      artifact_url,
      status as deploy_status,
      created_at,
      updated_at,
      -- Build metrics
      build_duration_ms,
      install_duration_ms,
      deploy_duration_ms,
      output_size_bytes,
      artifact_size,
      -- Additional fields for compatibility
      CASE WHEN is_published THEN 'published' ELSE 'unpublished' END as publication_status,
      published_by_user_id as published_by,
      -- Git stats placeholders (will be 0 until populated)
      0 as files_changed,
      0 as lines_added,
      0 as lines_removed,
      null as from_recommendation_id
    FROM project_versions
    WHERE ${whereClause}
    ORDER BY 
      display_version_number DESC NULLS LAST,
      created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `;
  
  const countQuery = `
    SELECT COUNT(*) 
    FROM project_versions
    WHERE ${whereClause}
  `;
  
  params.push(limit.toString(), offset.toString());
  
  const [versionsResult, countResult] = await Promise.all([
    db.pool.query(query, params),
    db.pool.query(countQuery, params.slice(0, -2)) // Remove limit/offset for count
  ]);
  
  return {
    versions: versionsResult.rows,
    total: parseInt(countResult.rows[0].count)
  };
}

// DEPRECATED: No longer needed with consolidated table approach
// export async function linkVersionMetadata(versionId: string, metadataId: string) {
//   if (!db.pool) {
//     console.warn('Database connection not available, skipping version metadata link');
//     return;
//   }
//   
//   const query = `
//     UPDATE project_versions
//     SET version_metadata_id = $2
//     WHERE version_id = $1
//   `;
//   
//   await db.pool.query(query, [versionId, metadataId]);
// }

// Re-export the createProjectVersion to maintain backward compatibility
export const createProjectVersion = db.createProjectVersion;

// Re-export other functions from database.ts
export {
  testConnection,
  getLatestProjectVersion,
  updateProjectVersion,
  listProjectVersions
} from './database';