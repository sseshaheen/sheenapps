import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserId } from '@/utils/advisor-state'
import { AdvisorServerAPIService } from '@/services/advisor-server-api'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'
import { logger } from '@/utils/logger'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/**
 * GET /api/advisor/profile
 * Fetch the current user's advisor profile (server-side proxy to worker API)
 */
export async function GET(request: NextRequest) {
  try {
    logger.info('🔐 /api/advisor/profile endpoint called', {
      url: request.url,
      method: request.method
    })

    // Get current user ID from server auth
    const userId = await getCurrentUserId()
    
    if (!userId) {
      logger.warn('⚠️ Authentication failed in advisor profile endpoint - no userId')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    logger.info('🔍 Fetching advisor profile', { userId: userId.slice(0, 8) })

    // Get locale using our smart detection utility
    const locale = await getLocaleFromRequest(request)

    // Call worker API from server context (this is allowed)
    const profile = await AdvisorServerAPIService.getProfile(userId, locale)
    
    if (!profile) {
      // Profile not found - user is not an advisor (expected for regular users)
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: profile
    })

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch advisor profile'
    
    logger.error('❌ Advisor profile fetch failed:', {
      error: errorMessage
    })

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}