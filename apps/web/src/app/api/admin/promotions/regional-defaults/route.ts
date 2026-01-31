import { NextRequest } from 'next/server'
import { AdminAuthService } from '@/lib/admin/admin-auth-service'
import { PromotionsAdminClient } from '@/lib/admin/promotions-admin-client'
import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
import type { RegionCode } from '@/types/billing'
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

    // Admins can read regional defaults
    if (session.user.role !== 'admin' && session.user.role !== 'super_admin') {
      return noCacheErrorResponse({
        error: 'Insufficient permissions to view regional defaults.',
        required: 'admin or super_admin',
        available: session.user.role
      }, 403)
    }
    
    const correlationId = uuidv4()
    
    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region') as RegionCode
    
    if (!region) {
      return noCacheErrorResponse({
        error: 'Region parameter is required',
        details: 'Please provide a region query parameter'
      }, 400)
    }
    
    const result = await PromotionsAdminClient.getRegionalDefaults(
      region,
      correlationId
    )
    
    return noCacheResponse(result.data)
    
  } catch (error) {
    return noCacheErrorResponse({
      error: 'Failed to fetch regional defaults',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
}