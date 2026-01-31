import { NextRequest, NextResponse } from 'next/server'
import { withApiAuth } from '@/lib/auth-middleware'
import { makeUserCtx } from '@/lib/db'
import { logger } from '@/utils/logger'
import { BonusService } from '@/services/payment/bonus-service'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'

// Prevent caching of quota data
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

interface QuotaCheckRequest {
  metric: 'ai_generations' | 'exports' | 'projects_created'
  amount?: number
}

const bonusService = new BonusService()

async function handleQuotaCheck(request: NextRequest, { user }: { user: any }) {
  try {
    const body: QuotaCheckRequest = await request.json()
    const { metric, amount = 1 } = body

    if (!metric) {
      return noCacheErrorResponse('Metric is required', 400)
    }

    logger.info('Checking usage quota', {
      userId: user?.id?.slice(0, 8),
      metric,
      amount
    })

    // ✅ CORRECT: Use RLS-based user context (CLAUDE.md guidance)
    const userCtx = await makeUserCtx()
    const { client: supabase } = userCtx

    // Get user's current plan and limits
    const { data: subscription, error: subError } = await supabase
      .rpc('get_user_subscription', { p_user_id: user?.id || null })

    if (subError && subError.code !== 'PGRST116') {
      logger.error('Failed to get subscription', subError)
      return noCacheErrorResponse('Failed to check subscription', 500)
    }

    // Default to free plan if no subscription
    const planName = (subscription && subscription.length > 0) ? subscription[0].plan_name : 'free'

    // Get plan limits
    const { data: planLimits, error: limitsError } = await supabase
      .from('plan_limits')
      .select('*')
      .eq('plan_name', planName)
      .single()

    if (limitsError) {
      logger.error('Failed to get plan limits', limitsError)
      return noCacheErrorResponse('Failed to check plan limits', 500)
    }

    // Get current usage
    const currentDate = new Date()
    const periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    periodStart.setHours(0, 0, 0, 0)

    const { data: usage, error: usageError } = await supabase
      .from('usage_tracking')
      .select('metric_name, metric_value')
      .eq('user_id', user?.id || '')
      .eq('period_start', periodStart.toISOString())

    if (usageError && usageError.code !== 'PGRST116') {
      logger.error('Failed to get usage', usageError)
    }

    // Convert usage array to object
    const usageData = usage?.reduce((acc: any, item: any) => {
      acc[item.metric_name] = item.metric_value
      return acc
    }, {} as Record<string, number>) || {}

    // Map metric to limit field
    const limitFieldMap = {
      ai_generations: 'max_ai_generations_per_month',
      exports: 'max_exports_per_month',
      projects_created: 'max_projects'
    }

    const limitField = limitFieldMap[metric]
    const limit = planLimits?.[limitField] || 0
    const currentUsage = usageData[metric] || 0

    // Check if unlimited (-1)
    if (limit === -1) {
      return noCacheResponse({
        allowed: true,
        limit: -1,
        used: currentUsage,
        remaining: -1,
        unlimited: true
      })
    }

    // For metrics that support bonuses, check bonus usage
    let bonusAvailable = 0
    if (metric === 'ai_generations' || metric === 'exports') {
      try {
        const bonusBalance = await bonusService.getRemainingUsage(user?.id || '', metric)
        bonusAvailable = bonusBalance.bonus
      } catch (error) {
        logger.error('Failed to get bonus usage', error)
      }
    }

    // Check if quota would be exceeded (considering base + bonus)
    const baseRemaining = Math.max(0, limit - currentUsage)
    const totalAvailable = baseRemaining + bonusAvailable
    const wouldExceed = amount > totalAvailable

    logger.info('Quota check result', {
      metric,
      limit,
      used: currentUsage,
      baseRemaining,
      bonusAvailable,
      totalAvailable,
      allowed: !wouldExceed
    })

    return noCacheResponse({
      allowed: !wouldExceed,
      limit,
      used: currentUsage,
      remaining: baseRemaining,
      bonusRemaining: bonusAvailable,
      totalRemaining: totalAvailable,
      unlimited: false
    })

  } catch (error) {
    logger.error('Quota check error:', error)
    return noCacheErrorResponse('Failed to check quota', 500)
  }
}

export const POST = withApiAuth(handleQuotaCheck, { requireAuth: true })