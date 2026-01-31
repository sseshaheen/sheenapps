/**
 * Feedback Dashboard Page
 * Admin triage and review of user feedback submissions
 */

import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { redirect } from 'next/navigation'
import { FeedbackDashboard } from '@/components/admin/FeedbackDashboard'

export default async function FeedbackPage() {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()

  if (!adminSession) {
    redirect('/admin-login')
  }

  // Check if user has feedback permission
  const hasFeedbackPermission =
    (await AdminAuthService.hasPermission('feedback.view')) ||
    (await AdminAuthService.hasPermission('feedback.admin')) ||
    adminSession.user.role === 'super_admin'

  if (!hasFeedbackPermission) {
    redirect('/admin')
  }

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold">Feedback Triage</h1>
        <p className="text-muted-foreground mt-1">
          Review, triage, and respond to user feedback. Close the loop to turn
          detractors into advocates.
        </p>
      </div>

      <FeedbackDashboard
        adminId={adminSession.user.id}
        adminEmail={adminSession.user.email}
        adminRole={adminSession.user.role as 'admin' | 'super_admin'}
        permissions={adminSession.permissions}
      />
    </div>
  )
}
