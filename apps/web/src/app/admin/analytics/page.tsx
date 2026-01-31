/**
 * Revenue Analytics Page
 * Comprehensive revenue metrics, forecasting, and segment analysis
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { RevenueAnalyticsDashboard } from '@/components/admin/RevenueAnalyticsDashboard'

export default async function AnalyticsPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has analytics permissions
  const hasAnalyticsPermission = 
    await AdminAuthService.hasPermission('analytics.read') ||
    adminSession.user.role === 'super_admin'

  if (!hasAnalyticsPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Revenue Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Track revenue metrics, growth trends, and financial forecasts
        </p>
      </div>

      <RevenueAnalyticsDashboard 
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}