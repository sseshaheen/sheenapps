import { NextRequest, NextResponse } from 'next/server'
import { withApiAuth } from '@/lib/auth-middleware'
import { TrialService } from '@/services/payment/trial-service'
import { BonusService } from '@/services/payment/bonus-service'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'
import { createLocalizedErrorResponse } from '@/lib/api/error-messages'

const trialService = new TrialService()
const bonusService = new BonusService()

interface StartTrialRequest {
  planName: 'starter' | 'growth' | 'scale'
}

async function handleStartTrial(request: NextRequest, { user }: { user: any }) {
  const locale = await getLocaleFromRequest(request)

  try {
    const body: StartTrialRequest = await request.json()
    const { planName } = body

    if (!planName) {
      const errorResponse = await createLocalizedErrorResponse(
        request,
        'trials.planRequired',
        'PLAN_REQUIRED'
      )

      const response = NextResponse.json(errorResponse, { status: 400 })
      response.headers.set('Content-Language', locale)
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
      return response
    }

    // ✅ CORRECT: Use RLS-based user context (CLAUDE.md guidance)
    const userCtx = await makeUserCtx()
    const { client: supabase } = userCtx

    // Check eligibility first
    const eligibility = await trialService.checkTrialEligibility(user.id)
    if (!eligibility.isEligible) {
      const errorResponse = await createLocalizedErrorResponse(
        request,
        'trials.notEligible',
        'NOT_ELIGIBLE'
      )

      const response = NextResponse.json({
        ...errorResponse,
        hasUsedTrial: eligibility.hasUsedTrial
      }, { status: 400 })
      response.headers.set('Content-Language', locale)
      response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
      return response
    }

    // Get or create customer record
    let customerId: string | undefined
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      // Create customer record
      const { data: newCustomer, error: customerError } = await supabase
        .from('customers')
        .insert({
          user_id: user.id,
          email: user.email
        })
        .select()
        .single()

      if (customerError) {
        logger.error('Failed to create customer', customerError)
        const errorResponse = await createLocalizedErrorResponse(
          request,
          'trials.customerCreationFailed',
          'CUSTOMER_CREATION_FAILED'
        )

        const response = NextResponse.json(errorResponse, { status: 500 })
        response.headers.set('Content-Language', locale)
        response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
        return response
      }

      customerId = newCustomer.id
    }

    // Start the trial
    const trialResult = await trialService.startTrial(user.id, planName, customerId)

    // Grant trial bonus
    await bonusService.grantBonusUsage({
      userId: user.id,
      metric: 'ai_generations',
      amount: 20, // Trial bonus amount
      reason: 'signup',
      expiresInDays: 30
    })

    logger.info('Trial started', {
      userId: user.id.slice(0, 8),
      planName,
      trialEnd: trialResult.trialEnd
    })

    const response = NextResponse.json({
      success: true,
      subscriptionId: trialResult.subscriptionId,
      trialEnd: trialResult.trialEnd,
      message: `Your ${planName} trial has started! It will end on ${trialResult.trialEnd.toLocaleDateString()}.`
    })

    response.headers.set('Content-Language', locale)
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
    return response

  } catch (error: any) {
    logger.error('Failed to start trial', error)
    const errorResponse = await createLocalizedErrorResponse(
      request,
      'general.internalError',
      'INTERNAL_ERROR'
    )

    const response = NextResponse.json(errorResponse, { status: 500 })
    response.headers.set('Content-Language', locale)
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
    return response
  }
}

export const POST = withApiAuth(handleStartTrial, { requireAuth: true })