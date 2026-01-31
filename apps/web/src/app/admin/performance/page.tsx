/**
 * Performance Dashboard Page
 *
 * Displays Core Web Vitals and performance metrics for admin users.
 * Uses RUM data from the web_vitals tables.
 *
 * See: docs/PERFORMANCE_ANALYSIS.md - Section 12
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { PerformanceDashboard } from '@/components/admin/PerformanceDashboard'

export default async function PerformancePage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has analytics permissions
  const hasAnalyticsPermission =
    (await AdminAuthService.hasPermission('analytics.read')) ||
    adminSession.user.role === 'super_admin'

  if (!hasAnalyticsPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Performance Monitoring</h1>
        <p className="text-muted-foreground mt-1">
          Real User Monitoring (RUM) data from Core Web Vitals
        </p>
      </div>

      <PerformanceDashboard
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}
