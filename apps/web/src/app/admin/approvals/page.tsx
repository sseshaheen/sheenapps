/**
 * Pending Approvals Page
 * Shows all pending two-person approval requests
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { PendingApprovalsQueue } from '@/components/admin/PendingApprovalsQueue'

export default async function ApprovalsPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has approval permissions
  const hasApprovalPermission = 
    await AdminAuthService.hasPermission('admin.approve') ||
    await AdminAuthService.hasPermission('finance.refund')

  if (!hasApprovalPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Pending Approvals</h1>
        <p className="text-muted-foreground mt-1">
          Review and approve pending high-value operations requiring two-person authorization
        </p>
      </div>

      <PendingApprovalsQueue 
        adminId={adminSession.user.id}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
      />
    </div>
  )
}