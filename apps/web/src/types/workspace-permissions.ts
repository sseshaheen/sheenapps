/**
 * Workspace Permissions Types
 *
 * Defines role-based permissions for workspace access
 * Part of Phase 3 client integration preparation
 */

export type LogTier = 'system' | 'application' | 'build' | 'deploy'
export type UserRole = 'advisor' | 'client' | 'project_owner'

export interface WorkspacePermissions {
  // File system permissions
  canEditFiles: boolean           // false for advisors, true for clients
  canViewFiles: boolean           // true for both
  canDownloadFiles: boolean       // true for both

  // Log system permissions
  canViewLogs: boolean            // true for both
  canViewLogHistory: boolean      // role-dependent
  logTiers: LogTier[]            // filtered by role

  // Session management
  canManageSessions: boolean      // true for both
  canViewSessions: boolean        // true for project owners, limited for others

  // Monitoring and metrics
  canViewMetrics: boolean         // role-dependent
  canExportMetrics: boolean       // true for project owners only

  // Administrative
  canManagePermissions: boolean   // true for project owners only
  canConfigureWorkspace: boolean  // true for project owners only

  // Real-time features
  canReceiveNotifications: boolean // true for both
  canViewPresence: boolean        // true for collaborative features
}

export interface PermissionContext {
  userId: string
  role: UserRole
  projectId: string
  isProjectOwner: boolean
  advisorPermissions?: {
    view_code: boolean
    view_logs: boolean
    manage_sessions: boolean
  }
}

export interface WorkspaceUser {
  id: string
  role: UserRole
  displayName: string
  avatar?: string
  isActive: boolean
  lastSeen: Date
  permissions: WorkspacePermissions
}

// Permission validation helpers
export type PermissionCheck = keyof WorkspacePermissions

export interface PermissionCheckResult {
  allowed: boolean
  reason?: string
  fallbackAction?: string
}