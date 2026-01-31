/**
 * Pricing Management Page
 * Catalog versioning, activation, and usage analytics
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { PricingManagementSystem } from '@/components/admin/PricingManagementSystem'

export default async function PricingPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has pricing management permissions
  const hasPricingPermission = 
    await AdminAuthService.hasPermission('pricing.read') ||
    adminSession.user.role === 'super_admin'

  if (!hasPricingPermission) {
    redirect('/admin')
  }

  const canManagePricing = 
    await AdminAuthService.hasPermission('pricing.write') ||
    adminSession.user.role === 'super_admin'

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Pricing Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage pricing catalogs, create versions, and analyze usage patterns
        </p>
      </div>

      <PricingManagementSystem 
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
        canManagePricing={canManagePricing}
      />
    </div>
  )
}