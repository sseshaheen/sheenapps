import { redirect } from 'next/navigation'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { AdminNavigationMobile } from '@/components/admin/AdminNavigationMobile'
import { AdminAuthProvider } from '@/components/admin/AdminAuthProvider'
import { QueryProvider } from '@/components/providers/query-provider'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Check admin JWT authentication
  const adminSession = await AdminAuthService.getAdminSession()
  
  if (!adminSession) {
    // Redirect to admin login page
    redirect('/admin-login')
  }

  // Get permissions from the admin session
  const permissions = adminSession.permissions || []

  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProvider>
          <AdminAuthProvider>
            <div className="min-h-screen bg-gray-50">
              {/* Mobile-Responsive Admin Navigation with permission-based visibility */}
              <AdminNavigationMobile 
                userEmail={adminSession.user.email}
                userRole={adminSession.user.role as 'admin' | 'super_admin'}
                permissions={permissions}
              />

              {/* Main Content - Responsive padding for mobile, tablet, desktop */}
              <main className="flex-1">
                <div className="py-4 sm:py-6">
                  <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10">
                    {children}
                  </div>
                </div>
              </main>
            </div>
          </AdminAuthProvider>
        </QueryProvider>
      </body>
    </html>
  )
}