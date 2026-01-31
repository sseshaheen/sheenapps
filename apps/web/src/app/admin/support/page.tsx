/**
 * Support Ticket Management Page
 * SLA tracking, ticket routing, and message management
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { SupportTicketSystem } from '@/components/admin/SupportTicketSystem'

export default async function SupportPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has support permissions
  const hasSupportPermission = 
    await AdminAuthService.hasPermission('support.read') ||
    adminSession.user.role === 'super_admin'

  if (!hasSupportPermission) {
    redirect('/admin')
  }

  const canManageTickets = 
    await AdminAuthService.hasPermission('support.write') ||
    adminSession.user.role === 'super_admin'

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Support Management</h1>
        <p className="text-muted-foreground mt-1">
          Manage support tickets, track SLA compliance, and handle customer inquiries
        </p>
      </div>

      <SupportTicketSystem 
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
        canManageTickets={canManageTickets}
      />
    </div>
  )
}