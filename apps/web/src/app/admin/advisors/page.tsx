/**
 * Advisor Management Page
 * Application approval workflow and advisor performance tracking
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { AdvisorManagementSystem } from '@/components/admin/AdvisorManagementSystem'

export default async function AdvisorsPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has advisor management permissions
  const hasAdvisorPermission = 
    await AdminAuthService.hasPermission('advisors.read') ||
    adminSession.user.role === 'super_admin'

  if (!hasAdvisorPermission) {
    redirect('/admin')
  }

  const canApproveAdvisors = 
    await AdminAuthService.hasPermission('advisors.approve') ||
    adminSession.user.role === 'super_admin'

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Advisor Management</h1>
        <p className="text-muted-foreground mt-1">
          Review advisor applications, manage approvals, and track advisor performance
        </p>
      </div>

      <AdvisorManagementSystem 
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
        canApproveAdvisors={canApproveAdvisors}
      />
    </div>
  )
}