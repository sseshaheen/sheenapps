/**
 * Customer 360 View Page
 * Comprehensive single-page view of all customer context
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { sessionHasPermission } from '@/lib/admin/require-admin'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamic import to reduce build-time module graph
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 2)
const Customer360Dashboard = dynamic(
  () => import('@/components/admin/Customer360Dashboard').then(m => m.Customer360Dashboard)
)

export default async function Customer360Page({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const { userId } = await params

  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has customer 360 permissions (uses session, no extra async calls)
  if (!sessionHasPermission(adminSession, ['customer_360.read', 'customer_360.write'])) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <Customer360Dashboard
        userId={userId}
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}
