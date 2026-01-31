import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { AdminManagementClient } from '@/lib/admin/admin-management-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Check if user can view admin list
    if (!['admin', 'super_admin'].includes(session.user.role)) {
      return noCacheErrorResponse({
        error: 'Insufficient privileges to view admin users',
        details: {
          code: 'INSUFFICIENT_PRIVILEGES'
        }
      }, 403)
    }

    // Get reason header
    const reason = request.headers.get('x-admin-reason')
    if (!reason) {
      return noCacheErrorResponse({
        error: 'Admin reason required',
        details: {
          code: 'MISSING_ADMIN_REASON',
          message: 'Sensitive operations require a reason in x-admin-reason header'
        }
      }, 400)
    }

    // Fetch admin users from backend
    const result = await AdminManagementClient.listAdmins(reason)

    return noCacheResponse(result)
  } catch (error: any) {
    console.error('List admin users error:', error)
    return noCacheErrorResponse({
      error: error.message || 'Failed to fetch admin users',
    }, 500)
  }
}