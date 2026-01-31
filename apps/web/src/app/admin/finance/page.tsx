/**
 * Financial Operations Page
 * Smart refund processing with two-person approval for high-value operations
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { FinancialDashboard } from '@/components/admin/FinancialDashboard'

export default async function FinancePage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has financial permissions
  const hasFinancePermission = 
    await AdminAuthService.hasPermission('finance.read') ||
    adminSession.user.role === 'super_admin'

  if (!hasFinancePermission) {
    redirect('/admin')
  }

  const canProcessRefunds = 
    await AdminAuthService.hasPermission('finance.refund') ||
    adminSession.user.role === 'super_admin'

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Financial Operations</h1>
        <p className="text-muted-foreground mt-1">
          Process refunds, view financial metrics, and manage payment operations
        </p>
      </div>

      <FinancialDashboard 
        adminId={adminSession.user.id}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
        canProcessRefunds={canProcessRefunds}
      />
    </div>
  )
}