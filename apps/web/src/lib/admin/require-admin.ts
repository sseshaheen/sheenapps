/**
 * Admin Permission Enforcement Helper
 *
 * Use in API routes to enforce authentication + permissions.
 * Prevents authenticated admins without the right permission from accessing endpoints.
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheErrorResponse } from '@/lib/api/response-helpers'
import type { AdminSession } from '@/types/admin-auth'

type RequireAdminResult =
  | { session: AdminSession; error: null }
  | { session: null; error: Response }

/**
 * Enforce admin authentication and optionally permission.
 *
 * @param permission - Optional permission string (e.g., 'feature_flags.write')
 *                     Supports wildcards: 'feature_flags.*' or 'admin:*'
 * @returns Session if authorized, or error Response to return immediately
 *
 * @example
 * // Require any authenticated admin
 * const { session, error } = await requireAdmin()
 * if (error) return error
 *
 * @example
 * // Require specific permission
 * const { session, error } = await requireAdmin('feature_flags.write')
 * if (error) return error
 */
export async function requireAdmin(permission?: string): Promise<RequireAdminResult> {
  const session = await AdminAuthService.getAdminSession()

  if (!session) {
    return {
      session: null,
      error: noCacheErrorResponse({ error: 'Authentication required' }, 401),
    }
  }

  // super_admin bypasses all permission checks
  if (session.user.role === 'super_admin') {
    return { session, error: null }
  }

  // If permission required, check it
  if (permission) {
    const hasPermission = checkPermission(session.permissions, permission)
    if (!hasPermission) {
      return {
        session: null,
        error: noCacheErrorResponse({ error: 'Forbidden' }, 403),
      }
    }
  }

  return { session, error: null }
}

/**
 * Check if permission array includes the required permission.
 * Supports wildcards.
 */
function checkPermission(permissions: string[], required: string): boolean {
  // Direct match
  if (permissions.includes(required)) return true

  // Check for wildcard match (e.g., 'feature_flags.*' matches 'feature_flags.write')
  const [category] = required.split('.')
  if (permissions.includes(`${category}.*`)) return true

  // Check for admin wildcard
  if (permissions.includes('admin:*') || permissions.includes('admin.*')) return true

  return false
}

/**
 * Helper to check if session has any of the given permissions.
 * Useful for OR logic in permission checks.
 *
 * @example
 * const { session, error } = await requireAdmin()
 * if (error) return error
 * if (!hasAnyPermission(session, ['alerts.write', 'alerts.acknowledge'])) {
 *   return noCacheErrorResponse({ error: 'Forbidden' }, 403)
 * }
 */
export function hasAnyPermission(session: AdminSession, permissions: string[]): boolean {
  if (session.user.role === 'super_admin') return true
  return permissions.some((p) => checkPermission(session.permissions, p))
}

/**
 * Check if an admin session has any of the given permissions.
 * Use this in server pages to avoid multiple async hasPermission calls.
 *
 * @example
 * // In a server page
 * const session = await AdminAuthService.getAdminSession()
 * if (!session) redirect('/admin-login')
 * if (!sessionHasPermission(session, ['alerts.write', 'alerts.acknowledge'])) {
 *   redirect('/admin')
 * }
 */
export function sessionHasPermission(session: AdminSession, permissions: string[]): boolean {
  // super_admin bypasses all permission checks
  if (session.user.role === 'super_admin') return true
  return permissions.some((p) => checkPermission(session.permissions, p))
}

/**
 * Require inhouse.read permission for server pages.
 * Handles the common auth + permission check + redirect pattern.
 * Use in In-House admin pages to avoid boilerplate.
 *
 * @returns The admin session if authorized
 * @throws Redirects to /admin-login or /admin if not authorized
 *
 * @example
 * // In a server page
 * export default async function InhouseProjectsPage() {
 *   await requireInhousePageAccess()
 *   return <InhouseProjectsList />
 * }
 */
export async function requireInhousePageAccess(): Promise<AdminSession> {
  // Import redirect here to avoid issues with server-only modules
  const { redirect } = await import('next/navigation')

  const session = await AdminAuthService.getAdminSession()

  if (!session) {
    redirect('/admin-login')
  }

  if (!sessionHasPermission(session, ['inhouse.read'])) {
    redirect('/admin')
  }

  return session
}
