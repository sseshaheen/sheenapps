/**
 * Project Mapping Utilities
 * Centralizes mapping logic between different project data interfaces
 * Eliminates scattered mapping boilerplate across components
 */

// ✅ PHASE 2: Mapping utility to eliminate boilerplate

/**
 * Enhanced project data interface with consistent camelCase naming
 */
export interface ProjectData {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  ownerId: string;
  businessIdea: string | null;
  templateData: object | null;
  hasTemplate: boolean;
  
  // Status fields with consistent camelCase
  buildStatus: 'queued' | 'building' | 'deployed' | 'failed' | 'rollingBack' | 'rollbackFailed';
  currentBuildId: string | null;
  currentVersionId: string | null;
  currentVersionName: string | null;
  framework: string;
  previewUrl: string | null;
  subdomain: string | null;
  lastBuildStarted: string | null;
  lastBuildCompleted: string | null;
  
  // Legacy fields (maintained during transition)
  buildId?: string | null;
  status?: string;
}

/**
 * Legacy status interface for backward compatibility
 */
export interface ProjectStatusData {
  id: string;
  buildStatus: string;
  currentVersionId: string | null;
  currentVersionName: string | null;
  previewUrl: string | null;
  subdomain: string | null;
  lastBuildStarted: string | null;
  lastBuildCompleted: string | null;
  updatedAt: string;
}

/**
 * Maps unified ProjectData to legacy ProjectStatusData interface
 * Used during transition period to maintain existing component compatibility
 * 
 * @param project - Enhanced project data with camelCase naming
 * @returns Legacy status data interface
 */
export const mapProjectToStatus = (project: ProjectData): ProjectStatusData => ({
  id: project.id,
  buildStatus: project.buildStatus,
  currentVersionId: project.currentVersionId,
  currentVersionName: project.currentVersionName,
  previewUrl: project.previewUrl,
  subdomain: project.subdomain,
  lastBuildStarted: project.lastBuildStarted,
  lastBuildCompleted: project.lastBuildCompleted,
  updatedAt: project.updatedAt
});

/**
 * Type guard to check if project has status data
 * Useful for components that need to verify data completeness
 * 
 * @param project - Any project-like object
 * @returns True if object has required status fields
 */
export const hasStatusData = (project: any): project is ProjectData => {
  return project && 
         typeof project.buildStatus === 'string' &&
         typeof project.id === 'string' &&
         typeof project.updatedAt === 'string';
};

/**
 * Validates that all required status fields are present
 * Useful for debugging missing data issues
 * 
 * @param project - Project data to validate
 * @returns True if all required fields present
 */
export const validateStatusFields = (project: ProjectData): boolean => {
  const requiredFields: (keyof ProjectData)[] = [
    'id', 
    'buildStatus', 
    'updatedAt',
    'currentVersionId',
    'previewUrl'
  ];
  
  return requiredFields.every(field => {
    const value = project[field];
    return value !== undefined && value !== null;
  });
};

/**
 * Helper to determine if project is in active operation state
 * Matches logic from use-project-status.ts for consistency
 * 
 * @param buildStatus - Current build status
 * @returns True if operation is active and needs monitoring
 */
export const isActiveOperation = (buildStatus: string): boolean => {
  return buildStatus === 'rollingBack'; // Only rollbacks need polling
};

/**
 * Helper to determine if project is in stable state
 * Used for optimizing polling behavior
 * 
 * @param buildStatus - Current build status
 * @returns True if project is in stable state
 */
export const isStableState = (buildStatus: string): boolean => {
  return ['deployed', 'failed', 'rollbackFailed'].includes(buildStatus);
};

/**
 * Helper to determine if project is building
 * Build progress handled by build events system - no polling needed
 * 
 * @param buildStatus - Current build status
 * @returns True if project is building
 */
export const isBuildingState = (buildStatus: string): boolean => {
  return buildStatus === 'building';
};

/**
 * Get user-friendly status message
 * Centralized status messaging for consistent UX
 * 
 * @param buildStatus - Current build status
 * @returns Human-readable status message
 */
export const getStatusMessage = (buildStatus: string): string => {
  switch (buildStatus) {
    case 'building':
      return 'Building your project...';
    case 'rollingBack':
      return 'Rolling back to previous version...';
    case 'queued':
      return 'Build queued - waiting for current operation to complete';
    case 'deployed':
      return 'Project deployed successfully';
    case 'failed':
      return 'Build failed - check logs for details';
    case 'rollbackFailed':
      return 'Rollback failed - please contact support';
    default:
      return 'Unknown status';
  }
};

/**
 * Debug helper to log project data structure
 * Useful for development and troubleshooting
 * 
 * @param project - Project data to log
 * @param context - Context string for logging
 */
export const debugProjectData = (project: ProjectData, context: string = 'Project'): void => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 ${context} Debug:`, {
      id: project.id.slice(0, 8),
      buildStatus: project.buildStatus,
      currentVersionId: project.currentVersionId?.slice(0, 8),
      hasStatusData: hasStatusData(project),
      isActive: isActiveOperation(project.buildStatus),
      isStable: isStableState(project.buildStatus),
      message: getStatusMessage(project.buildStatus)
    });
  }
};