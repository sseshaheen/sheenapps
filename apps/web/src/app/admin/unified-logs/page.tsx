/**
 * Unified Logs Admin Page
 * Comprehensive logging interface for all system tiers:
 * Build, Deploy, System, Action, and Lifecycle logs
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { UnifiedLogsContent } from '@/components/admin/UnifiedLogsContent'

export default async function UnifiedLogsPage() {
  // Check admin JWT authentication and permissions
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check for logs permission - allows both read_logs and admin:* permissions
  const hasPermission = adminSession.permissions.includes('read_logs') ||
                       adminSession.permissions.includes('admin:*') ||
                       adminSession.user.role === 'super_admin'

  if (!hasPermission) {
    redirect('/admin')
  }

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Unified Logs</h1>
        <p className="mt-2 text-gray-600">
          Comprehensive logging interface for Build, Deploy, System, Action, and Lifecycle logs
        </p>
      </div>

      {/* Main Content */}
      <UnifiedLogsContent />
    </div>
  )
}