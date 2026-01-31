/**
 * Enhanced Promotions Management Page
 * Advanced campaign creation, regional targeting, and performance analytics
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { EnhancedPromotionSystem } from '@/components/admin/EnhancedPromotionSystem'

export default async function EnhancedPromotionsPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has promotions management permissions
  const hasPromotionsPermission =
    await AdminAuthService.hasPermission('promotion:read') ||
    adminSession.user.role === 'super_admin'

  if (!hasPromotionsPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Enhanced Promotions</h1>
        <p className="text-muted-foreground mt-1">
          Advanced campaign management with regional targeting and automation
        </p>
      </div>

      <EnhancedPromotionSystem 
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}