/**
 * Customer Health Dashboard Page
 * Monitor customer health scores and identify at-risk customers
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { sessionHasPermission } from '@/lib/admin/require-admin'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamic import to reduce build-time module graph
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 2)
const CustomerHealthDashboard = dynamic(
  () => import('@/components/admin/CustomerHealthDashboard').then(m => m.CustomerHealthDashboard)
)

export default async function CustomerHealthPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has customer health permissions (uses session, no extra async calls)
  if (!sessionHasPermission(adminSession, ['customer_health.read', 'customer_health.write'])) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Customer Health</h1>
        <p className="text-muted-foreground mt-1">
          Monitor customer health scores and identify at-risk customers
        </p>
      </div>

      <CustomerHealthDashboard
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}
