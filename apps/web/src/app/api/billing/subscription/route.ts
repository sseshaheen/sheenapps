import { NextRequest, NextResponse } from 'next/server'
import { authPresets } from '@/lib/auth-middleware'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import type { BillingInfo, UserSubscriptionResponse } from '@/types/billing'
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers'

// Prevent caching of subscription data
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG

async function handleGetSubscription(request: NextRequest, { user }: { user: any }) {
  try {
    logger.info('📋 Fetching subscription', {
      userId: user?.id ? user.id.slice(0, 8) : 'anonymous'
    })

    // ✅ CORRECT: Use RLS-based user context (CLAUDE.md guidance)
    const userCtx = await makeUserCtx()
    const { client: supabase } = userCtx

    // Get user's active subscription
    const { data: subscription, error } = await supabase
      .rpc('get_user_subscription', { p_user_id: user.id })

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      logger.error('Failed to fetch subscription', error)
      return noCacheErrorResponse('Failed to fetch subscription', 500)
    }

    // If no subscription found, user is on free plan
    if (!subscription || subscription.length === 0) {
      // Get free plan limits
      const { data: freePlanLimits } = await supabase
        .from('plan_limits')
        .select('*')
        .eq('plan_name', 'free')
        .single()

      // Get current month usage for free users
      const currentPeriodStart = new Date()
      currentPeriodStart.setDate(1)
      currentPeriodStart.setHours(0, 0, 0, 0)

      const { data: usage } = await supabase
        .from('usage_tracking')
        .select('metric_name, metric_value')
        .eq('user_id', user.id)
        .eq('period_start', currentPeriodStart.toISOString())

      const usageData = usage?.reduce((acc, item) => {
        acc[item.metric_name] = item.metric_value
        return acc
      }, {} as Record<string, number>) || {}

      const response: BillingInfo = {
        subscription: null,
        plan: 'free',
        status: 'free' as any, // Free users don't have a subscription status
        limits: freePlanLimits,
        usage: usageData
      }

      return noCacheResponse({
        success: true,
        ...response
      })
    }

    const sub = subscription[0]

    // Get plan limits for current plan
    const { data: planLimits } = await supabase
      .from('plan_limits')
      .select('*')
      .eq('plan_name', sub.plan_name)
      .single()

    // Get current month usage
    const currentPeriodStart = new Date()
    currentPeriodStart.setDate(1)
    currentPeriodStart.setHours(0, 0, 0, 0)

    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('metric_name, metric_value')
      .eq('user_id', user.id)
      .eq('period_start', currentPeriodStart.toISOString())

    // Format usage data
    const usageData = usage?.reduce((acc, item) => {
      acc[item.metric_name] = item.metric_value
      return acc
    }, {} as Record<string, number>) || {}

    const subscriptionData: UserSubscriptionResponse = {
      subscription_id: sub.subscription_id,
      plan_name: sub.plan_name,
      status: sub.status,
      current_period_start: sub.current_period_start,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end
    }

    const response: BillingInfo = {
      subscription: subscriptionData,
      plan: sub.plan_name,
      status: sub.status,
      limits: planLimits,
      usage: usageData
    }

    return noCacheResponse({
      success: true,
      ...response
    })

  } catch (error) {
    logger.error('Subscription fetch failed', error)
    return noCacheErrorResponse('Failed to fetch subscription', 500)
  }
}

export const GET = authPresets.authenticated(handleGetSubscription)