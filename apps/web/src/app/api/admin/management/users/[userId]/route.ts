import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { AdminManagementClient } from '@/lib/admin/admin-management-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params
  try {
    // Check if user is authenticated
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Check if user is super admin
    if (session.user.role !== 'super_admin') {
      return noCacheErrorResponse({
        error: 'Only super admins can revoke admin privileges',
        details: {
          code: 'INSUFFICIENT_PRIVILEGES',
          required_role: 'super_admin',
          current_role: session.user.role
        }
      }, 403)
    }

    // Prevent self-revocation
    if (session.user.id === userId) {
      return noCacheErrorResponse({
        error: 'Cannot revoke your own admin privileges',
        details: {
          code: 'SELF_REVOCATION_NOT_ALLOWED'
        }
      }, 400)
    }

    // Get reason header
    const reason = request.headers.get('x-admin-reason')
    if (!reason) {
      return noCacheErrorResponse({
        error: 'Admin reason required',
        details: {
          code: 'MISSING_ADMIN_REASON',
          message: 'Revoking admin privileges requires a reason in x-admin-reason header'
        }
      }, 400)
    }

    // Revoke admin privileges via backend
    const result = await AdminManagementClient.revokeAdminPrivileges(userId, reason)

    return noCacheResponse(result)
  } catch (error: any) {
    console.error('Revoke admin privileges error:', error)
    return noCacheErrorResponse({
      error: error.message || 'Failed to revoke admin privileges',
    }, 500)
  }
}