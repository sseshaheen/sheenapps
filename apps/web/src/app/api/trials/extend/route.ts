import { NextRequest, NextResponse } from 'next/server'
import { withApiAuth } from '@/lib/auth-middleware'
import { TrialService } from '@/services/payment/trial-service'
import { logger } from '@/utils/logger'
import { makeUserCtx } from '@/lib/db'
import { getLocaleFromRequest } from '@/lib/server-locale-utils'
import { createLocalizedErrorResponse } from '@/lib/api/error-messages'

const trialService = new TrialService()

interface ExtendTrialRequest {
  referralCode?: string
  reason?: string
}

async function handleExtendTrial(request: NextRequest, { user }: { user: any }) {
  const locale = await getLocaleFromRequest(request)

  try {
    const body: ExtendTrialRequest = await request.json()
    const { referralCode, reason = 'referral' } = body

    // ✅ CORRECT: Use RLS-based user context (CLAUDE.md guidance)
    const userCtx = await makeUserCtx()
    const { client: supabase } = userCtx

    // Validate referral if code provided
    if (referralCode) {
      const { data: referral, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referral_code', referralCode)
        .eq('status', 'converted')
        .single()

      if (error || !referral) {
        const errorResponse = await createLocalizedErrorResponse(
          request,
          'trials.invalidReferralCode',
          'INVALID_REFERRAL_CODE'
        )

        const response = NextResponse.json(errorResponse, { status: 400 })
        response.headers.set('Content-Language', locale)
        response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
        return response
      }

      // Check if this user already used this referral
      if (referral.referred_user_id === user.id) {
        const errorResponse = await createLocalizedErrorResponse(
          request,
          'trials.cannotUseSelfReferral',
          'CANNOT_USE_SELF_REFERRAL'
        )

        const response = NextResponse.json(errorResponse, { status: 400 })
        response.headers.set('Content-Language', locale)
        response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
        return response
      }
    }

    // Extend trial by 7 days for referral
    const additionalDays = reason === 'referral' ? 7 : 3
    const newTrialEnd = await trialService.extendTrial(user.id, additionalDays, reason)

    logger.info('Trial extended', {
      userId: user.id.slice(0, 8),
      additionalDays,
      reason,
      newTrialEnd
    })

    const response = NextResponse.json({
      success: true,
      newTrialEnd,
      additionalDays,
      message: `Your trial has been extended by ${additionalDays} days!`
    })

    response.headers.set('Content-Language', locale)
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
    return response

  } catch (error: any) {
    logger.error('Failed to extend trial', error)
    const errorResponse = await createLocalizedErrorResponse(
      request,
      'trials.extensionFailed',
      'EXTENSION_FAILED'
    )

    const response = NextResponse.json(errorResponse, { status: 500 })
    response.headers.set('Content-Language', locale)
    response.headers.set('Vary', 'x-sheen-locale, Accept-Language')
    return response
  }
}

export const POST = withApiAuth(handleExtendTrial, { requireAuth: true })