import { NextRequest, NextResponse } from 'next/server'

import { createServerSupabaseClientNew } from '@/lib/supabase-server'
import { requireAdmin } from '@/lib/admin/require-admin'
import { AITimeBillingService } from '@/server/services/ai-time-billing'
import { logger } from '@/utils/logger'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'

// Prevent caching of balance data
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

/**
 * GET /api/worker/billing/balance/[userId]
 * Get AI time balance for a user
 * Auth: session user must match userId param, or caller must be admin with billing.read.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params

    // Validate user ID
    if (!userId) {
      return noCacheErrorResponse('User ID is required', 400)
    }

    // Verify session: caller must be the same user or an admin
    const supabase = await createServerSupabaseClientNew()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return noCacheErrorResponse('Authentication required', 401)
    }

    if (user.id !== userId) {
      const { error } = await requireAdmin('billing.read')
      if (error) return error
    }

    const effectiveUserId = userId

    logger.info(`📊 API: Fetching balance for user: ${effectiveUserId}`)

    // Fetch balance using server-side service
    const balance = await AITimeBillingService.getCachedBalance(effectiveUserId)
    
    logger.info(`✅ API: Balance retrieved for user ${effectiveUserId}`, {
      totalSeconds: balance.totals.total_seconds,
      paidSeconds: balance.totals.paid_seconds,
      bonusSeconds: balance.totals.bonus_seconds,
      planKey: balance.plan_key,
      subscriptionStatus: balance.subscription_status
    })

    return noCacheResponse(balance)
    
  } catch (error) {
    logger.error('❌ API: Failed to fetch balance:', error)
    
    // Return appropriate error response
    if (error instanceof Error && error.message.includes('not found')) {
      return noCacheErrorResponse('User not found', 404)
    }
    
    return noCacheErrorResponse('Failed to fetch balance', 500)
  }
}