/**
 * 🛡️ Admin Permission Gate Component
 * Expert-validated permission-based access control for admin UI components
 * 
 * Key features:
 * - Granular permission checking
 * - Graceful fallback rendering
 * - Admin role-based access
 * - TypeScript safety for permission types
 */

'use client'

import { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Lock } from 'lucide-react'
import type { AdminPermission } from '@/types/admin'

export interface PermissionGateProps {
  /** Required permissions (user must have ALL of these) */
  requiredPermissions?: AdminPermission[]
  
  /** Alternative permissions (user must have AT LEAST ONE of these) */
  anyOfPermissions?: AdminPermission[]
  
  /** Required admin role */
  requiredRole?: 'admin' | 'super_admin'
  
  /** User's current permissions */
  userPermissions: AdminPermission[]
  
  /** User's current admin role */
  userRole: 'admin' | 'super_admin' | null
  
  /** Content to render if access is granted */
  children: ReactNode
  
  /** Fallback content for insufficient permissions */
  fallback?: ReactNode
  
  /** Show permission error instead of hiding content */
  showError?: boolean
  
  /** Custom error message */
  errorMessage?: string
  
  /** Additional CSS classes */
  className?: string
}

/**
 * Permission gate component that controls access to admin features
 */
export function PermissionGate({
  requiredPermissions = [],
  anyOfPermissions = [],
  requiredRole,
  userPermissions,
  userRole,
  children,
  fallback,
  showError = false,
  errorMessage,
  className
}: PermissionGateProps) {
  
  // Check if user has required role
  const hasRequiredRole = !requiredRole || (
    userRole === requiredRole || 
    (requiredRole === 'admin' && userRole === 'super_admin') // super_admin includes admin
  )
  
  // Check if user has all required permissions
  const hasRequiredPermissions = requiredPermissions.length === 0 || 
    requiredPermissions.every(permission => userPermissions.includes(permission))
  
  // Check if user has any of the alternative permissions
  const hasAnyOfPermissions = anyOfPermissions.length === 0 ||
    anyOfPermissions.some(permission => userPermissions.includes(permission))
  
  // Determine if access should be granted
  const hasAccess = hasRequiredRole && hasRequiredPermissions && hasAnyOfPermissions
  
  if (hasAccess) {
    return <div className={className}>{children}</div>
  }
  
  // Handle access denied
  if (showError) {
    const defaultMessage = generateErrorMessage({
      requiredPermissions,
      anyOfPermissions,
      requiredRole,
      userPermissions,
      userRole
    })
    
    return (
      <Alert variant="destructive" className={className}>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          {errorMessage || defaultMessage}
        </AlertDescription>
      </Alert>
    )
  }
  
  if (fallback) {
    return <div className={className}>{fallback}</div>
  }
  
  // Default: render nothing
  return null
}

/**
 * Generate a helpful error message based on missing permissions
 */
function generateErrorMessage({
  requiredPermissions,
  anyOfPermissions,
  requiredRole,
  userPermissions,
  userRole
}: {
  requiredPermissions: AdminPermission[]
  anyOfPermissions: AdminPermission[]
  requiredRole?: 'admin' | 'super_admin'
  userPermissions: AdminPermission[]
  userRole: 'admin' | 'super_admin' | null
}): string {
  if (!userRole) {
    return 'Admin access required'
  }
  
  if (requiredRole && userRole !== requiredRole && !(requiredRole === 'admin' && userRole === 'super_admin')) {
    return `${requiredRole === 'super_admin' ? 'Super admin' : 'Admin'} role required`
  }
  
  const missingRequired = requiredPermissions.filter(p => !userPermissions.includes(p))
  if (missingRequired.length > 0) {
    return `Missing required permissions: ${missingRequired.join(', ')}`
  }
  
  if (anyOfPermissions.length > 0 && !anyOfPermissions.some(p => userPermissions.includes(p))) {
    return `Requires one of: ${anyOfPermissions.join(', ')}`
  }
  
  return 'Insufficient permissions'
}

/**
 * Hook for checking permissions in components
 */
export function usePermissionCheck(
  userPermissions: AdminPermission[],
  userRole: 'admin' | 'super_admin' | null
) {
  const hasPermission = (permission: AdminPermission): boolean => {
    return userPermissions.includes(permission)
  }
  
  const hasAnyPermission = (permissions: AdminPermission[]): boolean => {
    return permissions.some(permission => userPermissions.includes(permission))
  }
  
  const hasAllPermissions = (permissions: AdminPermission[]): boolean => {
    return permissions.every(permission => userPermissions.includes(permission))
  }
  
  const hasRole = (role: 'admin' | 'super_admin'): boolean => {
    return userRole === role || (role === 'admin' && userRole === 'super_admin')
  }
  
  const canSuspendUsers = hasPermission('users.suspend')
  const canBanUsers = hasPermission('users.ban')
  const canProcessRefunds = hasPermission('finance.refund')
  const canApproveAdvisors = hasPermission('advisors.approve')
  const canViewAudit = hasPermission('audit.view')
  const canRead = hasPermission('admin.read')
  
  return {
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    hasRole,
    // Convenience flags
    canSuspendUsers,
    canBanUsers,
    canProcessRefunds,
    canApproveAdvisors,
    canViewAudit,
    canRead,
    // Role checks
    isAdmin: userRole === 'admin',
    isSuperAdmin: userRole === 'super_admin',
    isAnyAdmin: userRole !== null
  }
}

/**
 * Simple permission gate for inline use
 */
export function PermissionGuard({
  permission,
  userPermissions,
  children,
  fallback = null
}: {
  permission: AdminPermission
  userPermissions: AdminPermission[]
  children: ReactNode
  fallback?: ReactNode
}) {
  return userPermissions.includes(permission) ? <>{children}</> : <>{fallback}</>
}

/**
 * Role-based gate for admin roles
 */
export function RoleGate({
  requiredRole,
  userRole,
  children,
  fallback = null
}: {
  requiredRole: 'admin' | 'super_admin'
  userRole: 'admin' | 'super_admin' | null
  children: ReactNode
  fallback?: ReactNode
}) {
  const hasAccess = userRole === requiredRole || (requiredRole === 'admin' && userRole === 'super_admin')
  return hasAccess ? <>{children}</> : <>{fallback}</>
}