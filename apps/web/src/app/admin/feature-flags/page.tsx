/**
 * Feature Flags Management Page
 * Kill switches and targeted releases for controlling feature availability
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { sessionHasPermission } from '@/lib/admin/require-admin'
import { redirect } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamic import to reduce build-time module graph
// See: docs/BUILD_TIME_OPTIMIZATION_PLAN.md (Phase 2)
const FeatureFlagsManagement = dynamic(
  () => import('@/components/admin/FeatureFlagsManagement').then(m => m.FeatureFlagsManagement)
)

export default async function FeatureFlagsPage() {
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Page access requires read OR write (uses session, no extra async calls)
  // UI gates write actions separately
  if (!sessionHasPermission(adminSession, ['feature_flags.read', 'feature_flags.write'])) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Feature Flags</h1>
        <p className="text-muted-foreground mt-1">
          Manage kill switches and targeted feature releases
        </p>
      </div>

      <FeatureFlagsManagement
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
      />
    </div>
  )
}
