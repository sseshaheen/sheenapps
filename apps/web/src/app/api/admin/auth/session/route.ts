import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { noCacheResponse } from '@/lib/api/response-helpers'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  try {
    const session = await AdminAuthService.getAdminSession()
    
    if (!session) {
      return noCacheResponse({
        authenticated: false,
        session: null,
      })
    }

    // Return session data
    return noCacheResponse({
      authenticated: true,
      session: {
        expiresAt: session.expiresAt,
        sessionId: session.sessionId,
        user: session.user,
        permissions: session.permissions,
      }
    })
  } catch (error) {
    console.error('Session check error:', error)
    return noCacheResponse({
      authenticated: false,
      session: null,
    })
  }
}