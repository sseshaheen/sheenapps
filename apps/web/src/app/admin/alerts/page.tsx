/**
 * Alert Management Page
 * Configure alert rules and manage firing alerts
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { sessionHasPermission } from '@/lib/admin/require-admin'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamic import to reduce build-time module graph
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 2)
const AlertManagementDashboard = dynamic(
  () => import('@/components/admin/AlertManagementDashboard').then(m => m.AlertManagementDashboard)
)

export default async function AlertsPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Page access requires read OR write OR acknowledge (uses session, no extra async calls)
  // UI gates write/acknowledge actions separately
  if (!sessionHasPermission(adminSession, ['alerts.read', 'alerts.write', 'alerts.acknowledge'])) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Alert Management</h1>
        <p className="text-muted-foreground mt-1">
          Configure alert rules and respond to firing alerts
        </p>
      </div>

      <AlertManagementDashboard
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}
