/**
 * Incident Management Page
 * Create, track, and resolve platform incidents with post-mortems
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { sessionHasPermission } from '@/lib/admin/require-admin'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamic import to reduce build-time module graph
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 2)
const IncidentManagementDashboard = dynamic(
  () => import('@/components/admin/IncidentManagementDashboard').then(m => m.IncidentManagementDashboard)
)

export default async function IncidentsPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Page access requires read OR create (uses session, no extra async calls)
  // UI gates create/resolve/edit actions separately
  if (!sessionHasPermission(adminSession, ['incidents.read', 'incidents.create'])) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Incident Management</h1>
        <p className="text-muted-foreground mt-1">
          Track, manage, and learn from platform incidents
        </p>
      </div>

      <IncidentManagementDashboard
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}
