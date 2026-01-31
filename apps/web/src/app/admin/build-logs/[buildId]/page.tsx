/**
 * Individual Build Log Viewer Page
 * Shows detailed logs for a specific build ID
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect, notFound } from 'next/navigation'
import { adminApiClient } from '@/lib/admin/admin-api-client'
import { BuildLogViewer } from '@/components/admin/BuildLogViewer'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { BuildInfo } from '@/types/admin-build-logs'

interface BuildLogPageProps {
  params: Promise<{
    buildId: string
  }>
}

export default async function BuildLogPage({ params }: BuildLogPageProps) {
  const { buildId } = await params

  // Check admin JWT authentication and permissions
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check for read_logs permission
  const hasPermission = adminSession.permissions.includes('read_logs') ||
                       adminSession.permissions.includes('admin:*') ||
                       adminSession.user.role === 'super_admin'

  if (!hasPermission) {
    redirect('/admin/build-logs')
  }

  // Fetch build info directly (server component can use admin client)
  let buildInfo: BuildInfo
  try {
    buildInfo = await adminApiClient.getBuildInfo(buildId, {
      adminToken: adminSession.token
    })
  } catch (error) {
    console.error('Failed to fetch build info:', error)
    notFound()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with back button */}
      <div className="mb-8">
        <div className="flex items-center space-x-4 mb-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/build-logs" className="flex items-center">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Build Logs
            </Link>
          </Button>
        </div>

        <h1 className="text-3xl font-bold text-gray-900">
          Build Log: {buildId.slice(0, 8)}...
        </h1>

        {/* Build metadata */}
        <div className="mt-4 bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">Status:</span>
              <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                buildInfo.status === 'completed' ? 'bg-green-100 text-green-800' :
                buildInfo.status === 'failed' ? 'bg-red-100 text-red-800' :
                buildInfo.status === 'building' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {buildInfo.status}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Project:</span>
              <span className="ml-2 text-gray-900">{buildInfo.projectId.slice(0, 8)}...</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">User:</span>
              <span className="ml-2 text-gray-900">{buildInfo.userEmail || buildInfo.userId.slice(0, 8) + '...'}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Created:</span>
              <span className="ml-2 text-gray-900">
                {new Date(buildInfo.createdAt).toLocaleString()}
              </span>
            </div>
            {buildInfo.buildDurationMs && (
              <div>
                <span className="font-medium text-gray-700">Duration:</span>
                <span className="ml-2 text-gray-900">
                  {(buildInfo.buildDurationMs / 1000).toFixed(1)}s
                </span>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-700">Log Size:</span>
              <span className="ml-2 text-gray-900">
                {buildInfo.logExists ? `${(buildInfo.logSizeBytes / 1024).toFixed(1)} KB` : 'No logs'}
              </span>
            </div>
            {buildInfo.claudeRequests && (
              <div>
                <span className="font-medium text-gray-700">Claude Requests:</span>
                <span className="ml-2 text-gray-900">{buildInfo.claudeRequests}</span>
              </div>
            )}
            {buildInfo.memoryPeakMb && (
              <div>
                <span className="font-medium text-gray-700">Memory Peak:</span>
                <span className="ml-2 text-gray-900">{buildInfo.memoryPeakMb} MB</span>
              </div>
            )}
          </div>

          {/* Error message if failed */}
          {buildInfo.status === 'failed' && buildInfo.errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
              <div className="text-sm font-medium text-red-800">Build Error:</div>
              <div className="mt-1 text-sm text-red-700">{buildInfo.errorMessage}</div>
            </div>
          )}
        </div>
      </div>

      {/* Log viewer */}
      {buildInfo.logExists ? (
        <BuildLogViewer
          buildId={buildId}
          buildInfo={buildInfo}
        />
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                No Logs Available
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>
                  This build does not have log files available. This can happen if:
                </p>
                <ul className="mt-2 list-disc list-inside space-y-1">
                  <li>The build was created before logging was implemented</li>
                  <li>The build failed before logging started</li>
                  <li>The log files have been cleaned up due to retention policies</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}