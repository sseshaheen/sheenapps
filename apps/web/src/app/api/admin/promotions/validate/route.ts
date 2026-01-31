import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { PromotionsAdminClient } from '@/lib/admin/promotions-admin-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import { v4 as uuidv4 } from 'uuid'

// ✅ BACKEND CONFIRMED: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function POST(request: NextRequest) {
  try {
    // Check admin JWT authentication
    const session = await AdminAuthService.getAdminSession()
    if (!session) {
      return noCacheErrorResponse({
        error: 'Authentication required',
      }, 401)
    }

    // Only super_admin can validate promotions
    if (session.user.role !== 'super_admin') {
      return noCacheErrorResponse({
        error: 'Insufficient permissions for promotion validation. Super admin required.',
        required: 'super_admin',
        available: session.user.role
      }, 403)
    }
    
    const body = await request.json()
    const reason = request.headers.get('x-admin-reason') || 'Promotion validation'
    const correlationId = uuidv4()
    
    // ✅ RATE LIMITING: 100 requests/minute per user (handled by backend)
    const result = await PromotionsAdminClient.validatePromotion(
      body,
      reason,
      correlationId
    )
    
    return noCacheResponse(result.data)
    
  } catch (error) {
    return noCacheErrorResponse({
      error: 'Validation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}