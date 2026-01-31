import { NextRequest, NextResponse } from 'next/server'
import { withApiAuth } from '@/lib/auth-middleware'
import { makeUserCtx } from '@/lib/db'
import { logger } from '@/utils/logger'
import { BonusService } from '@/services/payment/bonus-service'

interface TrackUsageRequest {
  metric: 'ai_generations' | 'exports' | 'projects_created'
  amount?: number
  metadata?: Record<string, any>
}

const bonusService = new BonusService()

async function handleTrackUsage(request: NextRequest, { user }: { user: any }) {
  try {
    const body: TrackUsageRequest = await request.json()
    const { metric, amount = 1, metadata = {} } = body

    if (!metric) {
      return NextResponse.json(
        { error: 'Metric is required' },
        { status: 400 }
      )
    }

    // ✅ CORRECT: Use RLS-based user context (CLAUDE.md guidance)
    const userCtx = await makeUserCtx()
    const { client: supabase } = userCtx

    if (!user?.id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 401 }
      )
    }

    logger.info('Tracking usage', {
      userId: user.id.slice(0, 8),
      metric,
      amount,
      metadata
    })


    // Get or create current period usage record
    const currentDate = new Date()
    const periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
    periodStart.setHours(0, 0, 0, 0)

    // First try to get existing record for this metric
    const { data: existingUsage, error: fetchError } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', user.id)
      .eq('period_start', periodStart.toISOString())
      .eq('metric_name', metric)
      .single()

    if (fetchError && fetchError.code !== 'PGRST116') {
      logger.error('Failed to fetch usage', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch usage data' },
        { status: 500 }
      )
    }

    let newValue
    
    if (existingUsage) {
      // Update existing record
      newValue = existingUsage.metric_value + amount
      
      const { error } = await supabase
        .from('usage_tracking')
        .update({
          metric_value: newValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingUsage.id)

      if (error) {
        logger.error('Failed to update usage', error)
        return NextResponse.json(
          { error: 'Failed to update usage' },
          { status: 500 }
        )
      }
    } else {
      // Create new record
      newValue = amount
      const periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      periodEnd.setHours(23, 59, 59, 999)
      
      const { error } = await supabase
        .from('usage_tracking')
        .insert({
          user_id: user.id,
          metric_name: metric,
          metric_value: newValue,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString()
        })

      if (error) {
        logger.error('Failed to create usage record', error)
        return NextResponse.json(
          { error: 'Failed to create usage record' },
          { status: 500 }
        )
      }
    }

    // Consume bonus usage if applicable
    if (metric === 'ai_generations' || metric === 'exports') {
      try {
        // Check if user has base quota remaining
        const { data: subscription } = await supabase
          .rpc('get_user_subscription', { p_user_id: user.id })

        const planName = subscription?.[0]?.plan_name || 'free'

        const { data: planLimits } = await supabase
          .from('plan_limits')
          .select('*')
          .eq('plan_name', planName)
          .single()

        const limitFieldMap = {
          ai_generations: 'max_ai_generations_per_month',
          exports: 'max_exports_per_month'
        }
        const baseLimit = planLimits?.[limitFieldMap[metric]] || 0

        // If user has exceeded base limit and it's not unlimited, consume from bonus
        if (baseLimit !== -1 && newValue > baseLimit) {
          const bonusToConsume = Math.min(amount, newValue - baseLimit)
          await bonusService.consumeBonus(user.id, metric, bonusToConsume)
          
          logger.info('Bonus consumed', {
            userId: user.id.slice(0, 8),
            metric,
            bonusConsumed: bonusToConsume
          })
        }
      } catch (error) {
        logger.error('Failed to consume bonus', error)
      }
    }

    logger.info('Usage tracked successfully', {
      userId: user.id.slice(0, 8),
      metric,
      newTotal: newValue
    })

    return NextResponse.json({
      success: true,
      usage: {
        [metric]: newValue
      }
    })

  } catch (error) {
    logger.error('Track usage error:', error)
    return NextResponse.json(
      { error: 'Failed to track usage' },
      { status: 500 }
    )
  }
}

export const POST = withApiAuth(handleTrackUsage, { requireAuth: true })