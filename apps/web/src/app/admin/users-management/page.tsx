/**
 * User Management Page
 * Comprehensive user management with search, suspend, ban, and activity tracking
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { UserManagementInterface } from '@/components/admin/UserManagementInterface'

export default async function UserManagementPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has user management permissions
  const hasUserManagementPermission = 
    await AdminAuthService.hasPermission('users.read') ||
    adminSession.user.role === 'super_admin'

  if (!hasUserManagementPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-1">
          Search, view, and manage regular user accounts
        </p>
      </div>

      <UserManagementInterface 
        adminId={adminSession.user.id}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}