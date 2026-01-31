/**
 * Version Management Service v2.4
 * Handles version publishing, unpublishing, rollback operations, and version history
 * Integrates with Worker API v2.4 enhanced features including smart action flags
 * 
 * SERVER-ONLY MODULE - Do not import in client components
 */

import 'server-only';

// Import from server location
import { getWorkerClient } from './worker-api-client';
import { logger } from '@/utils/logger';

// Enhanced version data from Worker API v2.4
export interface EnhancedVersion {
  id: string;
  semver: string;
  name: string;
  description: string;
  type: 'major' | 'minor' | 'patch';
  createdAt: string;
  deployedAt: string;
  
  // Publication information
  isPublished: boolean;
  publishedAt?: string;
  publishedBy?: string;
  userComment?: string;
  previewUrl: string;
  
  // Artifact availability metadata
  hasArtifact: boolean;
  artifactSize: number;
  
  // Smart action permissions with business logic
  canPreview: boolean;
  canRollback: boolean;
  canPublish: boolean;
  canUnpublish: boolean;
  
  // Accessibility hints for UI decisions
  accessibility: {
    rollbackDisabledReason: 'artifact_missing' | 'artifact_expired' | 'already_published' | 'deployment_failed' | null;
    previewDisabledReason: 'artifact_missing' | 'artifact_expired' | 'deployment_failed' | null;
  };
  
  // Retention information for user awareness
  retention: {
    expiresAt: string;
    daysRemaining: number; // Negative if expired
  };
}

// Project status with rollback states
export type ProjectStatus = 
  | 'building' 
  | 'deployed' 
  | 'failed'
  | 'rollingBack' 
  | 'rollbackFailed'
  | 'queued';

// Rollback response from Worker API
export interface RollbackResponse {
  success: boolean;
  message: string;
  rollbackVersionId: string;
  targetVersionId: string;
  previewUrl: string;
  status: ProjectStatus;
  jobId?: string;
  workingDirectory: {
    synced: boolean;
    message: string;
    extractedFiles: number;
  };
  publishInfo: {
    isPublished: boolean;
    canPublish: boolean;
    publishEndpoint: string;
    notice: string;
  };
}

// Publication response from Worker API
export interface PublicationResponse {
  success: boolean;
  message: string;
  publication: {
    versionId: string;
    publishedAt: string;
    publishedBy: string;
    comment: string;
  };
  domains: {
    updated: Array<{
      domain: string;
      type: 'sheenapps' | 'custom';
      status: 'active' | 'pending_verification' | 'failed';
      previewUrl: string;
    }>;
    failed: Array<any>;
  };
}

// Version history response from Worker API
export interface VersionHistoryResponse {
  success: boolean;
  versions: EnhancedVersion[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export class VersionManagementService {
  /**
   * Consistent idempotency for all mutations
   */
  private async makeIdempotentRequest<T>(
    endpoint: string, 
    body: any, 
    idempotencyKey: string,
    method: 'POST' | 'GET' = 'POST'
  ): Promise<T> {
    const headers: Record<string, string> = {};
    
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    // Server-only module - no need for window check due to 'server-only' import

    if (method === 'POST') {
      return getWorkerClient().post<T>(endpoint, body, headers);
    } else {
      return getWorkerClient().get<T>(endpoint, headers);
    }
  }

  /**
   * Publish a version to make it live on all configured domains
   */
  async publishVersion(
    projectId: string, 
    versionId: string, 
    userId: string, 
    idempotencyKey: string,
    comment?: string
  ): Promise<PublicationResponse> {
    const endpoint = `/v1/projects/${projectId}/publish/${versionId}`;
    logger.info(`Publishing version ${versionId} for project ${projectId}`, {
      endpoint,
      userId,
      comment,
      idempotencyKey
    });
    
    const body = {
      userId,
      comment: comment || 'Published via SheenApps'
    };

    try {
      const response = await this.makeIdempotentRequest<PublicationResponse>(
        endpoint,
        body,
        idempotencyKey
      );

      logger.info(`✅ Version ${versionId} published successfully`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to publish version ${versionId}:`, error);
      throw error;
    }
  }

  /**
   * Unpublish the current live version
   */
  async unpublishVersion(
    projectId: string, 
    userId: string, 
    idempotencyKey: string
  ): Promise<{ success: boolean; message: string; unpublishedVersion: string; notice: string }> {
    logger.info(`Unpublishing current version for project ${projectId}`);
    
    const body = { userId };

    try {
      const response = await this.makeIdempotentRequest<{ success: boolean; message: string; unpublishedVersion: string; notice: string }>(
        `/v1/projects/${projectId}/unpublish`,
        body,
        idempotencyKey
      );

      logger.info(`✅ Project ${projectId} unpublished successfully`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to unpublish project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Rollback to a previous version with immediate preview update and background working directory sync
   */
  async rollbackVersion(
    projectId: string, 
    targetVersionId: string, 
    userId: string, 
    idempotencyKey: string,
    skipWorkingDirectory: boolean = false
  ): Promise<RollbackResponse> {
    logger.info(`Rolling back project ${projectId} to version ${targetVersionId}`);
    
    const body = {
      userId,
      projectId,
      targetVersionId,
      skipWorkingDirectory
    };

    try {
      const response = await this.makeIdempotentRequest<RollbackResponse>(
        '/v1/versions/rollback',
        body,
        idempotencyKey
      );

      logger.info(`✅ Rollback initiated for project ${projectId} - preview updated immediately`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to rollback project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get enhanced version history with smart action flags and accessibility hints
   * Uses Worker API v2.4 for complete version data
   */
  async getVersionHistory(
    projectId: string, 
    params?: { 
      state?: 'all' | 'published' | 'unpublished';
      limit?: number;
      offset?: number;
      includePatches?: boolean;
      showDeleted?: boolean;
    }
  ): Promise<VersionHistoryResponse> {
    logger.info(`Fetching version history for project ${projectId}`);
    
    const queryParams = new URLSearchParams({
      state: params?.state || 'all',
      limit: (params?.limit || 20).toString(),
      offset: (params?.offset || 0).toString(),
      includePatches: (params?.includePatches || false).toString(),
      showDeleted: (params?.showDeleted || false).toString()
    });
    
    const endpoint = `/v1/projects/${projectId}/versions?${queryParams}`;

    try {
      const response = await getWorkerClient().get<VersionHistoryResponse>(endpoint);
      
      logger.info(`✅ Retrieved ${response.versions.length} versions for project ${projectId}`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to fetch version history for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Add a domain to the project
   */
  async addDomain(
    projectId: string,
    domain: string,
    type: 'sheenapps' | 'custom',
    userId: string,
    idempotencyKey: string
  ): Promise<{
    success: boolean;
    domain: {
      id: string;
      domain: string;
      type: string;
      status: 'pending_verification' | 'active' | 'failed';
      verificationRequired?: {
        recordType: string;
        name: string;
        value: string;
      };
    };
  }> {
    logger.info(`Adding ${type} domain ${domain} to project ${projectId}`);
    
    const body = {
      userId,
      domain,
      type
    };

    try {
      const response = await this.makeIdempotentRequest<{
        success: boolean;
        domain: {
          id: string;
          domain: string;
          type: string;
          status: 'pending_verification' | 'active' | 'failed';
          verificationRequired?: {
            recordType: string;
            name: string;
            value: string;
          };
        };
      }>(
        `/v1/projects/${projectId}/domains`,
        body,
        idempotencyKey
      );

      logger.info(`✅ Domain ${domain} added to project ${projectId}`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to add domain ${domain} to project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get project domains with verification status
   */
  async getProjectDomains(projectId: string): Promise<{
    success: boolean;
    domains: Array<{
      id: string;
      domain: string;
      type: 'sheenapps' | 'custom';
      status: 'pending_verification' | 'active' | 'failed';
      createdAt: string;
      verifiedAt?: string;
      lastCheckedAt?: string;
      verificationRequired?: {
        recordType: string;
        name: string;
        value: string;
      };
    }>;
  }> {
    logger.info(`Fetching domains for project ${projectId}`);
    
    try {
      const response = await getWorkerClient().get<{
        success: boolean;
        domains: Array<{
          id: string;
          domain: string;
          type: 'sheenapps' | 'custom';
          status: 'pending_verification' | 'active' | 'failed';
          createdAt: string;
          verifiedAt?: string;
          lastCheckedAt?: string;
          verificationRequired?: {
            recordType: string;
            name: string;
            value: string;
          };
        }>;
      }>(`/v1/projects/${projectId}/domains`);
      
      logger.info(`✅ Retrieved domains for project ${projectId}`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to fetch domains for project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Generate idempotency key for operations
   */
  generateIdempotencyKey(operation: string, projectId: string): string {
    return `${operation}-${projectId}-${Date.now()}-${crypto.randomUUID()}`;
  }

  /**
   * Helper to check if a version can be rolled back based on API flags
   */
  canRollbackVersion(version: EnhancedVersion): boolean {
    return version.canRollback && version.hasArtifact;
  }

  /**
   * Helper to check if a version can be previewed based on API flags
   */
  canPreviewVersion(version: EnhancedVersion): boolean {
    return version.canPreview && version.hasArtifact;
  }

  /**
   * Helper to get user-friendly reason for disabled actions
   */
  getDisabledReason(
    version: EnhancedVersion, 
    action: 'rollback' | 'preview'
  ): string | null {
    const reason = action === 'rollback' 
      ? version.accessibility.rollbackDisabledReason
      : version.accessibility.previewDisabledReason;
    
    if (!reason) return null;
    
    // Convert snake_case to human-readable
    return reason.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Restore a version by using the rollback endpoint
   * The Worker API uses /v1/versions/rollback for restoring versions
   */
  async restoreVersion(
    projectId: string,
    sourceVersionId: string,
    userId: string,
    options: {
      createBackup?: boolean;
      comment?: string;
    } = {}
  ): Promise<{
    success: boolean;
    message: string;
    newVersionId: string;
    sourceVersionId: string;
    backupVersionId?: string;
    previewUrl: string;
    notice: string;
  }> {
    logger.info(`Restoring version ${sourceVersionId} for project ${projectId}`, options);
    
    // Use the rollback endpoint as that's what Worker API provides
    const body = {
      userId,
      projectId,
      targetVersionId: sourceVersionId,
      skipWorkingDirectory: false, // Always sync working directory for restore
      comment: options.comment // Include the user's comment for the restore operation
    };

    try {
      const idempotencyKey = this.generateIdempotencyKey('restore', projectId);
      const rollbackResponse = await this.makeIdempotentRequest<RollbackResponse>(
        '/v1/versions/rollback',
        body,
        idempotencyKey
      );

      // Transform rollback response to match restore format
      const response = {
        success: rollbackResponse.success,
        message: rollbackResponse.message,
        newVersionId: rollbackResponse.rollbackVersionId,
        sourceVersionId: rollbackResponse.targetVersionId,
        previewUrl: rollbackResponse.previewUrl,
        notice: rollbackResponse.publishInfo?.notice || 'Version restored successfully'
      };

      logger.info(`✅ Version restored successfully - new version: ${response.newVersionId}`);
      return response;
    } catch (error) {
      logger.error(`❌ Failed to restore version ${sourceVersionId} for project ${projectId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const versionService = new VersionManagementService();