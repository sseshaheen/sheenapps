/**
 * Admin Build Logs Page
 * Lists recent builds and provides access to individual build logs
 */

import { BuildLogsContent } from '@/components/admin/BuildLogsContent'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'

export default async function BuildLogsPage() {
  // Check admin JWT authentication and permissions
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check for read_logs permission as specified by backend team
  const hasPermission = adminSession.permissions.includes('read_logs') ||
                       adminSession.permissions.includes('admin:*') ||
                       adminSession.user.role === 'super_admin'

  if (!hasPermission) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Access Restricted
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  You need the <code className="bg-yellow-100 px-1 rounded">read_logs</code> permission to access build logs.
                </p>
                <p className="mt-2">
                  Contact a super admin to request access if you need to debug build issues.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Build Logs</h1>
        <p className="mt-2 text-gray-600">
          Monitor and debug AI agent build processes.
        </p>
      </div>

      <BuildLogsContent />
    </div>
  )
}
