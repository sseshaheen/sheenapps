/**
 * Workspace Permissions Hook
 *
 * Calculates and provides role-based permissions for workspace components
 * Part of Phase 3 client integration preparation
 */

'use client'

import { useMemo } from 'react'
import {
  WorkspacePermissions,
  PermissionContext,
  PermissionCheck,
  PermissionCheckResult,
  LogTier,
  UserRole
} from '@/types/workspace-permissions'

interface UseWorkspacePermissionsProps {
  context: PermissionContext
}

interface UseWorkspacePermissionsResult {
  permissions: WorkspacePermissions
  checkPermission: (permission: PermissionCheck) => PermissionCheckResult
  hasAnyFileAccess: boolean
  hasAnyLogAccess: boolean
  canPerformAdminActions: boolean
  isFullAccess: boolean
}

export function useWorkspacePermissions({
  context
}: UseWorkspacePermissionsProps): UseWorkspacePermissionsResult {

  const permissions = useMemo((): WorkspacePermissions => {
    const { role, isProjectOwner, advisorPermissions } = context

    // Project owners have full access
    if (isProjectOwner || role === 'project_owner') {
      return {
        canEditFiles: true,
        canViewFiles: true,
        canDownloadFiles: true,
        canViewLogs: true,
        canViewLogHistory: true,
        logTiers: ['system', 'application', 'build', 'deploy'],
        canManageSessions: true,
        canViewSessions: true,
        canViewMetrics: true,
        canExportMetrics: true,
        canManagePermissions: true,
        canConfigureWorkspace: true,
        canReceiveNotifications: true,
        canViewPresence: true
      }
    }

    // Client permissions (project users)
    if (role === 'client') {
      return {
        canEditFiles: true,
        canViewFiles: true,
        canDownloadFiles: true,
        canViewLogs: true,
        canViewLogHistory: true,
        logTiers: ['application', 'build', 'deploy'], // No system logs
        canManageSessions: true,
        canViewSessions: false,
        canViewMetrics: true,
        canExportMetrics: false,
        canManagePermissions: false,
        canConfigureWorkspace: false,
        canReceiveNotifications: true,
        canViewPresence: true
      }
    }

    // Advisor permissions (based on granted permissions)
    if (role === 'advisor') {
      const viewCode = advisorPermissions?.view_code ?? false
      const viewLogs = advisorPermissions?.view_logs ?? false
      const manageSessions = advisorPermissions?.manage_sessions ?? false

      return {
        canEditFiles: false, // Advisors cannot edit files
        canViewFiles: viewCode,
        canDownloadFiles: viewCode,
        canViewLogs: viewLogs,
        canViewLogHistory: viewLogs,
        logTiers: viewLogs ? ['application', 'build'] : [], // Limited log access
        canManageSessions: manageSessions,
        canViewSessions: false,
        canViewMetrics: manageSessions,
        canExportMetrics: false,
        canManagePermissions: false,
        canConfigureWorkspace: false,
        canReceiveNotifications: true,
        canViewPresence: false // No collaborative features for advisors
      }
    }

    // Default: no permissions
    return {
      canEditFiles: false,
      canViewFiles: false,
      canDownloadFiles: false,
      canViewLogs: false,
      canViewLogHistory: false,
      logTiers: [],
      canManageSessions: false,
      canViewSessions: false,
      canViewMetrics: false,
      canExportMetrics: false,
      canManagePermissions: false,
      canConfigureWorkspace: false,
      canReceiveNotifications: false,
      canViewPresence: false
    }
  }, [context])

  const checkPermission = useMemo(() => {
    return (permission: PermissionCheck): PermissionCheckResult => {
      const allowed = permissions[permission]

      if (allowed) {
        return { allowed: true }
      }

      // Provide helpful feedback for denied permissions
      const { role } = context

      switch (permission) {
        case 'canEditFiles':
          return {
            allowed: false,
            reason: role === 'advisor' ? 'Advisors have read-only access' : 'Insufficient permissions',
            fallbackAction: 'Contact project owner for edit access'
          }

        case 'canViewFiles':
          return {
            allowed: false,
            reason: 'File access not granted',
            fallbackAction: 'Request code viewing permissions'
          }

        case 'canViewLogs':
          return {
            allowed: false,
            reason: 'Log access not granted',
            fallbackAction: 'Request log viewing permissions'
          }

        case 'canManagePermissions':
          return {
            allowed: false,
            reason: 'Only project owners can manage permissions',
            fallbackAction: 'Contact project owner'
          }

        case 'canConfigureWorkspace':
          return {
            allowed: false,
            reason: 'Only project owners can configure workspace settings',
            fallbackAction: 'Contact project owner'
          }

        default:
          return {
            allowed: false,
            reason: 'Permission denied',
            fallbackAction: 'Contact project owner for access'
          }
      }
    }
  }, [permissions, context])

  const hasAnyFileAccess = permissions.canViewFiles || permissions.canEditFiles
  const hasAnyLogAccess = permissions.canViewLogs || permissions.canViewLogHistory
  const canPerformAdminActions = permissions.canManagePermissions || permissions.canConfigureWorkspace
  const isFullAccess = context.isProjectOwner || context.role === 'project_owner'

  return {
    permissions,
    checkPermission,
    hasAnyFileAccess,
    hasAnyLogAccess,
    canPerformAdminActions,
    isFullAccess
  }
}

// Helper to create permission context from user data
export function createPermissionContext({
  userId,
  role,
  projectId,
  isProjectOwner,
  advisorPermissions
}: {
  userId: string
  role: UserRole
  projectId: string
  isProjectOwner: boolean
  advisorPermissions?: {
    view_code: boolean
    view_logs: boolean
    manage_sessions: boolean
  }
}): PermissionContext {
  return {
    userId,
    role,
    projectId,
    isProjectOwner,
    advisorPermissions
  }
}

// Helper to check if a role has specific tier access
export function canAccessLogTier(permissions: WorkspacePermissions, tier: LogTier): boolean {
  return permissions.logTiers.includes(tier)
}

// Helper to get filtered log tiers for a role
export function getAvailableLogTiers(role: UserRole, isProjectOwner: boolean): LogTier[] {
  if (isProjectOwner || role === 'project_owner') {
    return ['system', 'application', 'build', 'deploy']
  }

  if (role === 'client') {
    return ['application', 'build', 'deploy']
  }

  if (role === 'advisor') {
    return ['application', 'build']
  }

  return []
}