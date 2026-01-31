/**
 * System Health Dashboard Page
 * Real-time platform status, SLO compliance, and service health monitoring
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { sessionHasPermission } from '@/lib/admin/require-admin'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamic import to reduce build-time module graph
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 2)
const SystemHealthDashboard = dynamic(
  () => import('@/components/admin/SystemHealthDashboard').then(m => m.SystemHealthDashboard)
)

export default async function SystemHealthPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has system health read permissions (uses session, no extra async calls)
  if (!sessionHasPermission(adminSession, ['system_health.read', 'analytics.read'])) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">System Health</h1>
        <p className="text-muted-foreground mt-1">
          Real-time platform status, SLO compliance, and service health
        </p>
      </div>

      <SystemHealthDashboard
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}
