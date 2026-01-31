/**
 * Trust & Safety Page
 * Risk assessment, violation enforcement, and emergency actions
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { TrustSafetyDashboard } from '@/components/admin/TrustSafetyDashboard'

export default async function TrustSafetyPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has trust & safety permissions
  const hasTrustSafetyPermission = 
    await AdminAuthService.hasPermission('violations.enforce') ||
    adminSession.user.role === 'super_admin'

  if (!hasTrustSafetyPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Trust & Safety</h1>
        <p className="text-muted-foreground mt-1">
          Monitor user risk, enforce violations, and maintain platform safety
        </p>
      </div>

      <TrustSafetyDashboard 
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}