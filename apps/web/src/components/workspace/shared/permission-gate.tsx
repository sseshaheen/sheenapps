/**
 * Permission Gate Component
 *
 * Higher-order component for permission-based rendering
 * Part of Phase 3 client integration preparation
 */

'use client'

import React from 'react'
import {
  PermissionCheck,
  PermissionCheckResult,
  WorkspacePermissions
} from '@/types/workspace-permissions'
import { useWorkspacePermissions } from '@/hooks/workspace/use-workspace-permissions'

interface PermissionGateProps {
  // Required permission check
  requires: PermissionCheck | PermissionCheck[]

  // Content to render when permission is granted
  children: React.ReactNode

  // Optional fallback content when permission is denied
  fallback?: React.ReactNode

  // Optional custom permission check function
  customCheck?: (permissions: WorkspacePermissions) => PermissionCheckResult

  // Show reason for denial (default: false)
  showReason?: boolean

  // Custom styling
  className?: string
}

interface PermissionGateResult {
  allowed: boolean
  reason?: string
  fallbackAction?: string
}

export function PermissionGate({
  requires,
  children,
  fallback,
  customCheck,
  showReason = false,
  className
}: PermissionGateProps) {
  const workspaceContext = React.useContext(WorkspacePermissionContext)
  const safeContext = workspaceContext ?? {
    userId: 'unknown',
    role: 'client' as const,
    projectId: 'unknown',
    isProjectOwner: false,
    advisorPermissions: {
      view_code: false,
      view_logs: false,
      manage_sessions: false
    }
  }

  const { permissions, checkPermission } = useWorkspacePermissions({
    context: safeContext
  })

  // Check permissions
  const result = React.useMemo((): PermissionGateResult => {
    // Custom check takes precedence
    if (customCheck) {
      return customCheck(permissions)
    }

    // Handle array of required permissions (all must pass)
    if (Array.isArray(requires)) {
      for (const permission of requires) {
        const check = checkPermission(permission)
        if (!check.allowed) {
          return check
        }
      }
      return { allowed: true }
    }

    // Single permission check
    return checkPermission(requires)
  }, [permissions, checkPermission, requires, customCheck])

  if (!workspaceContext) {
    console.warn('PermissionGate used outside WorkspacePermissionProvider')
    return fallback || null
  }

  // Render based on permission result
  if (result.allowed) {
    return <>{children}</>
  }

  // Show fallback content
  if (fallback) {
    return <div className={className}>{fallback}</div>
  }

  // Show denial reason if requested
  if (showReason && result.reason) {
    return (
      <div className={`text-muted-foreground text-sm p-4 ${className || ''}`}>
        <div className="font-medium">Access Denied</div>
        <div>{result.reason}</div>
        {result.fallbackAction && (
          <div className="mt-2 text-xs">
            Suggestion: {result.fallbackAction}
          </div>
        )}
      </div>
    )
  }

  // Default: render nothing
  return null
}

// Context for workspace permissions
export const WorkspacePermissionContext = React.createContext<{
  userId: string
  role: 'advisor' | 'client' | 'project_owner'
  projectId: string
  isProjectOwner: boolean
  advisorPermissions?: {
    view_code: boolean
    view_logs: boolean
    manage_sessions: boolean
  }
} | null>(null)

// Provider component
interface WorkspacePermissionProviderProps {
  userId: string
  role: 'advisor' | 'client' | 'project_owner'
  projectId: string
  isProjectOwner: boolean
  advisorPermissions?: {
    view_code: boolean
    view_logs: boolean
    manage_sessions: boolean
  }
  children: React.ReactNode
}

export function WorkspacePermissionProvider({
  userId,
  role,
  projectId,
  isProjectOwner,
  advisorPermissions,
  children
}: WorkspacePermissionProviderProps) {
  const value = React.useMemo(() => ({
    userId,
    role,
    projectId,
    isProjectOwner,
    advisorPermissions
  }), [userId, role, projectId, isProjectOwner, advisorPermissions])

  return (
    <WorkspacePermissionContext.Provider value={value}>
      {children}
    </WorkspacePermissionContext.Provider>
  )
}

// Hook to access permission context
export function useWorkspacePermissionContext() {
  const context = React.useContext(WorkspacePermissionContext)

  if (!context) {
    throw new Error('useWorkspacePermissionContext must be used within WorkspacePermissionProvider')
  }

  return context
}

// Utility components for common permission checks
export function RequireFileAccess({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <PermissionGate requires="canViewFiles" fallback={fallback}>
      {children}
    </PermissionGate>
  )
}

export function RequireLogAccess({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <PermissionGate requires="canViewLogs" fallback={fallback}>
      {children}
    </PermissionGate>
  )
}

export function RequireEditAccess({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <PermissionGate requires="canEditFiles" fallback={fallback}>
      {children}
    </PermissionGate>
  )
}

export function RequireAdminAccess({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <PermissionGate requires={['canManagePermissions', 'canConfigureWorkspace']} fallback={fallback}>
      {children}
    </PermissionGate>
  )
}

// Permission-aware button component
interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  requires: PermissionCheck | PermissionCheck[]
  showTooltipOnDenied?: boolean
  children: React.ReactNode
}

export function PermissionButton({
  requires,
  showTooltipOnDenied = true,
  children,
  ...buttonProps
}: PermissionButtonProps) {
  const context = useWorkspacePermissionContext()
  const { checkPermission } = useWorkspacePermissions({ context })

  const result = React.useMemo(() => {
    if (Array.isArray(requires)) {
      for (const permission of requires) {
        const check = checkPermission(permission)
        if (!check.allowed) return check
      }
      return { allowed: true }
    }
    return checkPermission(requires)
  }, [requires, checkPermission])

  if (!result.allowed) {
    return (
      <button
        {...buttonProps}
        disabled={true}
        title={showTooltipOnDenied ? result.reason : undefined}
        className={`${buttonProps.className || ''} opacity-50 cursor-not-allowed`}
      >
        {children}
      </button>
    )
  }

  return (
    <button {...buttonProps}>
      {children}
    </button>
  )
}
