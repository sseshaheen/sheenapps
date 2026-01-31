import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { AdminManagementClient } from '@/lib/admin/admin-management-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
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
        error: 'Only super admins can create admin users',
        details: {
          code: 'INSUFFICIENT_PRIVILEGES',
          required_role: 'super_admin',
          current_role: session.user.role
        }
      }, 403)
    }

    // Get request body
    const body = await request.json()
    const { email, password, role, permissions, display_name, reason } = body

    // Validate required fields
    if (!email || !password || !role || !reason) {
      return noCacheErrorResponse({
        error: 'Missing required fields',
        details: {
          message: 'Email, password, role, and reason are required'
        }
      }, 400)
    }

    // Validate password strength
    const passwordValidation = AdminManagementClient.validatePassword(password)
    if (!passwordValidation.valid) {
      return noCacheErrorResponse({
        error: 'Invalid password',
        details: {
          message: 'Password does not meet requirements',
          errors: passwordValidation.errors
        }
      }, 400)
    }

    // Create admin user via backend
    const result = await AdminManagementClient.createAdminUser(
      {
        email,
        password,
        role,
        permissions: permissions || ['admin:*'],
        display_name,
      },
      reason
    )

    return noCacheResponse(result)
  } catch (error: any) {
    console.error('Create admin user error:', error)
    return noCacheErrorResponse({
      error: error.message || 'Failed to create admin user',
    }, 500)
  }
}