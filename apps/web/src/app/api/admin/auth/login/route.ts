import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return noCacheErrorResponse({
        error: 'Email and password are required',
      }, 400)
    }

    // Call the admin auth service to login
    const loginResponse = await AdminAuthService.login(email, password)

    // Return success response (token is stored in httpOnly cookie)
    return noCacheResponse({
      success: true,
      user: loginResponse.user,
      permissions: loginResponse.permissions,
      expiresAt: loginResponse.expires_at,
    })
  } catch (error) {
    // Don't log full stack trace for expected auth failures
    const message = error instanceof Error ? error.message : 'Login failed'
    console.log('Admin login failed:', message)
    return noCacheErrorResponse({
      error: message,
    }, 401)
  }
}