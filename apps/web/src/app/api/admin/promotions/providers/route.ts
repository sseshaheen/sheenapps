import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { PromotionsAdminClient } from '@/lib/admin/promotions-admin-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'

// ✅ BACKEND CONFIRMED: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Admins can read provider capabilities
    if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
      return noCacheErrorResponse({
        error: 'Insufficient permissions to view provider capabilities.',
        required: 'admin or super_admin',
        available: session.user.role
      }, 403)
    }
    
    const correlationId = uuidv4()
    
    const result = await PromotionsAdminClient.getProviderCapabilities(
      correlationId
    )
    
    return noCacheResponse(result.data)
    
  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to fetch provider capabilities',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}