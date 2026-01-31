/**
 * Audit Logs Page
 * Complete audit trail, security monitoring, and compliance tracking
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { AuditLogViewer } from '@/components/admin/AuditLogViewer'

export default async function AuditLogsPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has audit log permissions - typically super_admin only
  const hasAuditPermission = 
    await AdminAuthService.hasPermission('audit.read') ||
    adminSession.user.role === 'super_admin'

  if (!hasAuditPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">
          Complete audit trail of all administrative actions and system events
        </p>
      </div>

      <AuditLogViewer 
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}