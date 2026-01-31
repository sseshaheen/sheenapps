/**
 * Client-safe type definitions for version management
 * These types are shared between server and client code
 */

// Enhanced version data from Worker API v2.4
export interface EnhancedVersion {
  id: string;
  semver: string;
  name: string;
  description: string;
  type: 'major' | 'minor' | 'patch';
  createdAt: string;
  deployedAt: string;
  
  // Display version fields (Worker API v2.5 - immediate availability)
  displayVersion?: string;        // e.g., "v3" - always available immediately
  displayVersionNumber?: number;  // e.g., 3 - for sorting
  
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