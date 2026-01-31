/**
 * 📋 Version Repository
 * 
 * Phase 2.4: Version Management Repository Implementation
 * Server-side version data access with built-in security and access control
 * 
 * CURRENT FOCUS: Version history, metadata, and database operations
 * REPLACES: Direct Supabase calls to project_versions table
 * COMPLEMENTS: VersionManagementService (which handles Worker API calls)
 * 
 * SECURITY MODEL:
 * - Every operation validates user authentication
 * - Project ownership validation for version access
 * - Read-only access for version history and metadata
 * - Admin-level access for version management operations
 * 
 * Reference: LEGACY_CODE_MIGRATION_PLAN.md Phase 2.4
 */

import 'server-only'
import { BaseRepository, type TableRow, type TableInsert, type TableUpdate } from './base-repository'
import { logger } from '@/utils/logger'

// ====================================
// TYPE DEFINITIONS
// ====================================

// Now using proper TypeScript types from updated schema
export type ProjectVersion = TableRow<'project_versions'>
export type ProjectVersionInsert = TableInsert<'project_versions'>
export type ProjectVersionUpdate = TableUpdate<'project_versions'>

// Version metadata and status types
export interface VersionStatus {
  versionId: string | null
  versionName: string | null
  isProcessing: boolean
  buildStatus: string | null
  previewUrl: string | null
  artifactUrl: string | null
  createdAt: string | null
  buildDuration?: number
}

export interface VersionHistoryItem {
  id: string
  versionId: string
  prompt: string
  parentVersionId: string | null
  previewUrl: string | null
  artifactUrl: string | null
  framework: string | null
  buildDuration: number | null
  createdAt: string
  updatedAt: string
}

export interface VersionMetrics {
  totalVersions: number
  successfulBuilds: number
  failedBuilds: number
  averageBuildTime: number
  lastBuildTime: string | null
}

export interface CreateVersionData {
  projectId: string
  versionId: string
  prompt: string
  parentVersionId?: string
  previewUrl?: string
  artifactUrl?: string
  framework?: string
  buildDuration?: number
}

// ====================================
// VERSION REPOSITORY
// ====================================

/**
 * Server-side Version Repository
 * 
 * Handles version-related database operations with secure access control:
 * - Version history and metadata queries
 * - Version status tracking and updates
 * - Build metrics and analytics
 * - Project-scoped version management
 * 
 * NOTE: This repository handles DATABASE operations for versions.
 * For Worker API operations (publish, rollback, etc.), use VersionManagementService.
 */
export class VersionRepository extends BaseRepository {

  // ====================================
  // VERSION HISTORY OPERATIONS
  // ====================================

  /**
   * Get version history for a project with access control
   * 
   * Returns paginated version history with build status and metadata
   */
  static async getVersionHistory(
    projectId: string,
    userId: string,
    options: {
      limit?: number
      offset?: number
      includeArtifacts?: boolean
      sortBy?: 'created_at' | 'build_duration'
      sortOrder?: 'asc' | 'desc'
    } = {}
  ): Promise<VersionHistoryItem[]> {
    const user = await this.getCurrentUser()
    
    this.logOperation('getVersionHistory', 'project_versions', projectId, user.id)

    // Verify project access
    await this.verifyProjectAccess(projectId, user.id)

    const {
      limit = 20,
      offset = 0,
      includeArtifacts = true,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options

    try {
      let query = super.getServiceClient()
        .from('project_versions')
        .select('*')
        .eq('project_id', projectId)
        .order(sortBy, { ascending: sortOrder === 'asc' })
        .range(offset, offset + limit - 1)

      // Filter out entries without artifacts if requested
      if (!includeArtifacts) {
        query = query.not('artifact_url', 'is', null)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(`Failed to fetch version history: ${error.message}`)
      }

      const versions: VersionHistoryItem[] = (data || []).map(version => ({
        id: version.id,
        versionId: version.version_id,
        prompt: version.prompt,
        parentVersionId: version.parent_version_id,
        previewUrl: version.preview_url,
        artifactUrl: version.artifact_url,
        framework: version.framework,
        buildDuration: version.build_duration_ms,
        createdAt: version.created_at,
        updatedAt: version.updated_at
      }))

      logger.info(`📋 Retrieved ${versions.length} versions for project ${projectId}`, {
        userId: user.id.slice(0, 8),
        limit,
        offset
      })

      return versions

    } catch (error) {
      logger.error('Version history fetch failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        projectId
      })
      throw error
    }
  }

  /**
   * Get version status for a specific project
   * 
   * Used by version polling hooks to track current version state
   */
  static async getVersionStatus(projectId: string, userId: string): Promise<VersionStatus | null> {
    const user = await this.getCurrentUser()
    
    this.logOperation('getVersionStatus', 'project_versions', projectId, user.id)

    // Verify project access
    await this.verifyProjectAccess(projectId, user.id)

    try {
      // Get the latest version for this project
      const { data, error } = await super.getServiceClient()
        .from('project_versions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to fetch version status: ${error.message}`)
      }

      if (!data) {
        return null
      }

      const status: VersionStatus = {
        versionId: data.version_id,
        versionName: data.version_name || `Version ${data.version_id.slice(0, 8)}`,
        isProcessing: data.status === 'building',
        buildStatus: data.status,
        previewUrl: data.preview_url,
        artifactUrl: data.artifact_url,
        createdAt: data.created_at,
        buildDuration: data.build_duration_ms
      }

      logger.info(`📊 Version status retrieved for project ${projectId}`, {
        userId: user.id.slice(0, 8),
        versionId: status.versionId?.slice(0, 8),
        buildStatus: status.buildStatus
      })

      return status

    } catch (error) {
      logger.error('Version status fetch failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        projectId
      })
      throw error
    }
  }

  // ====================================
  // VERSION CREATION AND UPDATES
  // ====================================

  /**
   * Create a new version record
   * 
   * Called when a new build starts or completes
   */
  static async createVersion(data: CreateVersionData): Promise<ProjectVersion> {
    const user = await this.getCurrentUser()
    
    this.logOperation('createVersion', 'project_versions', data.versionId, user.id)

    // Verify project access
    await this.verifyProjectAccess(data.projectId, user.id)

    try {
      const versionData: ProjectVersionInsert = {
        user_id: user.id,
        project_id: data.projectId,
        version_id: data.versionId,
        prompt: data.prompt,
        parent_version_id: data.parentVersionId || null,
        preview_url: data.previewUrl || null,
        artifact_url: data.artifactUrl || null,
        framework: data.framework || null,
        build_duration_ms: data.buildDuration || null,
        status: 'building', // Required field - new versions start as building
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data: createdVersion, error } = await super.getServiceClient()
        .from('project_versions')
        .insert(versionData)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to create version: ${error.message}`)
      }

      logger.info(`✅ Created version ${data.versionId} for project ${data.projectId}`, {
        userId: user.id.slice(0, 8),
        framework: data.framework,
        buildDuration: data.buildDuration
      })

      return createdVersion

    } catch (error) {
      logger.error('Version creation failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        versionId: data.versionId,
        projectId: data.projectId
      })
      throw error
    }
  }

  /**
   * Update version record with build results
   * 
   * Called when build completes with preview URL, artifact URL, etc.
   */
  static async updateVersion(
    versionId: string,
    updates: {
      previewUrl?: string
      artifactUrl?: string
      buildDuration?: number
      buildStatus?: string
      framework?: string
    }
  ): Promise<ProjectVersion> {
    const user = await this.getCurrentUser()
    
    this.logOperation('updateVersion', 'project_versions', versionId, user.id)

    try {
      // First get the version to verify access
      const { data: existingVersion, error: fetchError } = await super.getServiceClient()
        .from('project_versions')
        .select('project_id')
        .eq('version_id', versionId)
        .single()

      if (fetchError || !existingVersion) {
        throw new Error(`Version not found: ${versionId}`)
      }

      // Verify project access
      await this.verifyProjectAccess(existingVersion.project_id, user.id)

      // Prepare update data
      const updateData: ProjectVersionUpdate = {
        updated_at: new Date().toISOString()
      }

      if (updates.previewUrl !== undefined) updateData.preview_url = updates.previewUrl
      if (updates.artifactUrl !== undefined) updateData.artifact_url = updates.artifactUrl
      if (updates.buildDuration !== undefined) updateData.build_duration_ms = updates.buildDuration
      if (updates.framework !== undefined) updateData.framework = updates.framework

      const { data: updatedVersion, error } = await super.getServiceClient()
        .from('project_versions')
        .update(updateData)
        .eq('version_id', versionId)
        .select()
        .single()

      if (error) {
        throw new Error(`Failed to update version: ${error.message}`)
      }

      logger.info(`🔄 Updated version ${versionId}`, {
        userId: user.id.slice(0, 8),
        updates: Object.keys(updates).join(', ')
      })

      return updatedVersion

    } catch (error) {
      logger.error('Version update failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        versionId
      })
      throw error
    }
  }

  // ====================================
  // VERSION ANALYTICS AND METRICS
  // ====================================

  /**
   * Get version metrics for a project
   * 
   * Provides build analytics and performance metrics
   */
  static async getVersionMetrics(projectId: string, userId: string): Promise<VersionMetrics> {
    const user = await this.getCurrentUser()
    
    this.logOperation('getVersionMetrics', 'project_versions', projectId, user.id)

    // Verify project access
    await this.verifyProjectAccess(projectId, user.id)

    try {
      // Get version counts and build metrics
      const { data: versions, error } = await super.getServiceClient()
        .from('project_versions')
        .select('build_duration_ms, artifact_url, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Failed to fetch version metrics: ${error.message}`)
      }

      const totalVersions = versions?.length || 0
      const successfulBuilds = versions?.filter(v => v.artifact_url).length || 0
      const failedBuilds = totalVersions - successfulBuilds

      // Calculate average build time (only successful builds with duration)
      const buildsWithDuration = versions?.filter(v => v.build_duration_ms && v.artifact_url) || []
      const averageBuildTime = buildsWithDuration.length > 0
        ? buildsWithDuration.reduce((sum, v) => sum + (v.build_duration_ms || 0), 0) / buildsWithDuration.length
        : 0

      const lastBuildTime = versions?.length > 0 ? versions[0].created_at : null

      const metrics: VersionMetrics = {
        totalVersions,
        successfulBuilds,
        failedBuilds,
        averageBuildTime: Math.round(averageBuildTime),
        lastBuildTime
      }

      logger.info(`📊 Version metrics calculated for project ${projectId}`, {
        userId: user.id.slice(0, 8),
        totalVersions,
        successfulBuilds,
        failedBuilds
      })

      return metrics

    } catch (error) {
      logger.error('Version metrics calculation failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        projectId
      })
      throw error
    }
  }

  // ====================================
  // VERSION LOOKUP OPERATIONS
  // ====================================

  /**
   * Find version by version ID with access control
   */
  static async findByVersionId(versionId: string, userId: string): Promise<ProjectVersion | null> {
    const user = await this.getCurrentUser()
    
    this.logOperation('findByVersionId', 'project_versions', versionId, user.id)

    try {
      const { data, error } = await super.getServiceClient()
        .from('project_versions')
        .select('*')
        .eq('version_id', versionId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') { // Not found
          return null
        }
        throw new Error(`Failed to find version: ${error.message}`)
      }

      // Verify project access
      await this.verifyProjectAccess(data.project_id, user.id)

      logger.info(`🔍 Found version ${versionId}`, {
        userId: user.id.slice(0, 8),
        projectId: data.project_id
      })

      return data

    } catch (error) {
      logger.error('Version lookup failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        versionId
      })
      throw error
    }
  }

  /**
   * Get latest version for a project
   */
  static async getLatestVersion(projectId: string, userId: string): Promise<ProjectVersion | null> {
    const user = await this.getCurrentUser()
    
    this.logOperation('getLatestVersion', 'project_versions', projectId, user.id)

    // Verify project access
    await this.verifyProjectAccess(projectId, user.id)

    try {
      const { data, error } = await super.getServiceClient()
        .from('project_versions')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to get latest version: ${error.message}`)
      }

      if (data) {
        logger.info(`📋 Latest version retrieved for project ${projectId}`, {
          userId: user.id.slice(0, 8),
          versionId: data.version_id.slice(0, 8)
        })
      }

      return data

    } catch (error) {
      logger.error('Latest version fetch failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        projectId
      })
      throw error
    }
  }

  // ====================================
  // VERSION CLEANUP OPERATIONS
  // ====================================

  /**
   * Delete old versions based on retention policy
   * 
   * Admin operation for cleanup and storage management
   */
  static async cleanupOldVersions(
    projectId: string,
    options: {
      keepCount?: number
      olderThanDays?: number
      deleteArtifacts?: boolean
    } = {}
  ): Promise<{ deletedCount: number; freedSpace?: number }> {
    const user = await this.getCurrentUser()
    
    this.logOperation('cleanupOldVersions', 'project_versions', projectId, user.id)

    // Verify project access
    await this.verifyProjectAccess(projectId, user.id)

    const {
      keepCount = 50, // Keep last 50 versions
      olderThanDays = 90, // Delete versions older than 90 days
      deleteArtifacts = false
    } = options

    try {
      // Get versions to delete (beyond keep count and older than retention period)
      const cutoffDate = new Date(Date.now() - (olderThanDays * 24 * 60 * 60 * 1000)).toISOString()
      
      const { data: versionsToDelete, error: fetchError } = await super.getServiceClient()
        .from('project_versions')
        .select('id, version_id, artifact_url')
        .eq('project_id', projectId)
        .lt('created_at', cutoffDate)
        .order('created_at', { ascending: false })
        .range(keepCount, 1000) // Skip the most recent keepCount versions

      if (fetchError) {
        throw new Error(`Failed to identify versions for cleanup: ${fetchError.message}`)
      }

      if (!versionsToDelete || versionsToDelete.length === 0) {
        logger.info(`🧹 No versions to cleanup for project ${projectId}`, {
          userId: user.id.slice(0, 8)
        })
        return { deletedCount: 0 }
      }

      // Delete the versions
      const versionIds = versionsToDelete.map(v => v.id)
      const { error: deleteError } = await super.getServiceClient()
        .from('project_versions')
        .delete()
        .in('id', versionIds)

      if (deleteError) {
        throw new Error(`Failed to delete versions: ${deleteError.message}`)
      }

      logger.info(`🧹 Cleaned up ${versionsToDelete.length} old versions for project ${projectId}`, {
        userId: user.id.slice(0, 8),
        deletedVersions: versionsToDelete.map(v => v.version_id.slice(0, 8))
      })

      // Note: Artifact deletion would need integration with storage service
      // This is left as a TODO for future implementation

      return { deletedCount: versionsToDelete.length }

    } catch (error) {
      logger.error('Version cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
        userId: user.id.slice(0, 8),
        projectId
      })
      throw error
    }
  }

  // ====================================
  // HELPER METHODS
  // ====================================

  /**
   * Verify user has access to project containing the version
   */
  private static async verifyProjectAccess(projectId: string, userId: string): Promise<void> {
    const { data, error } = await super.getServiceClient()
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('owner_id', userId)
      .single()

    if (error || !data) {
      throw new Error(`Access denied: You do not have permission to access project ${projectId}`)
    }
  }
}

// ====================================
// EXPERT IMPLEMENTATION NOTES
// ====================================

/*
PRODUCTION-FOCUSED DESIGN DECISIONS:

1. ✅ CLEAR SEPARATION OF CONCERNS:
   - VersionRepository handles DATABASE operations (project_versions table)
   - VersionManagementService handles WORKER API operations (publish, rollback, etc.)
   - Clean boundary between local database and external service

2. ✅ SECURITY-FIRST ACCESS CONTROL:
   - All operations require authentication via getCurrentUser()
   - Project ownership validation for every version operation
   - No direct version access without project permission verification

3. ✅ EXPERT RECOMMENDATIONS APPLIED:
   - Repository pattern consistent with ProjectRepository and FileRepository
   - Proper error handling and standardized logging
   - Type-safe interfaces for all operations
   - Built-in pagination and filtering for large datasets

4. ✅ PERFORMANCE OPTIMIZATIONS:
   - Efficient queries with proper indexing assumptions
   - Pagination support for version history
   - Optional artifact filtering to reduce payload size
   - Calculated metrics to avoid repeated queries

5. ✅ MAINTENANCE AND CLEANUP:
   - Version cleanup operations for storage management
   - Retention policy enforcement
   - Metrics calculation for monitoring build performance
   - Future-ready for artifact storage integration

MIGRATION FROM DIRECT SUPABASE CALLS:

// ❌ Before: Direct client-side database calls
const { data } = await supabase
  .from('project_versions')
  .select('*')
  .eq('project_id', projectId)

// ✅ After: Repository with access control
const versions = await VersionRepository.getVersionHistory(projectId, userId)

USAGE EXAMPLES:

// ✅ Get version status for polling
const status = await VersionRepository.getVersionStatus(projectId, userId)

// ✅ Create version record when build starts
await VersionRepository.createVersion({
  projectId,
  versionId: 'v1.2.3-abc123',
  prompt: 'Add contact form with validation'
})

// ✅ Update version when build completes
await VersionRepository.updateVersion(versionId, {
  previewUrl: 'https://preview.example.com',
  artifactUrl: 'https://storage.example.com/artifact.zip',
  buildDuration: 45000
})

// ✅ Get build metrics for analytics
const metrics = await VersionRepository.getVersionMetrics(projectId, userId)
console.log(`Success rate: ${metrics.successfulBuilds / metrics.totalVersions * 100}%`)

INTEGRATION NOTES:

1. Database Schema Dependencies:
   - Requires project_versions table with standard columns
   - Assumes foreign key relationship with projects table
   - Compatible with existing version_id format (ULID/UUID)

2. Worker API Integration:
   - Use VersionManagementService for publish/rollback operations
   - This repository only handles local database state
   - Both services work together for complete version management

3. Migration Path:
   - Replace direct project_versions queries with repository calls
   - Update hooks like use-version-updates to use API routes
   - Migrate components to use new standardized interfaces
*/