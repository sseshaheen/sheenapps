import { NextRequest, NextResponse } from 'next/server'
import { withApiAuth } from '@/lib/auth-middleware'
import { TrialService } from '@/services/payment/trial-service'
import { logger } from '@/utils/logger'

const trialService = new TrialService()

async function handleCheckEligibility(request: NextRequest, { user }: { user: any }) {
  try {
    const trialInfo = await trialService.checkTrialEligibility(user.id)

    logger.info('Trial eligibility checked', {
      userId: user.id.slice(0, 8),
      isEligible: trialInfo.isEligible,
      hasUsedTrial: trialInfo.hasUsedTrial
    })

    return NextResponse.json({
      eligible: trialInfo.isEligible,
      hasUsedTrial: trialInfo.hasUsedTrial,
      currentTrialEnd: trialInfo.currentTrialEnd,
      daysRemaining: trialInfo.daysRemaining
    })

  } catch (error) {
    logger.error('Failed to check trial eligibility', error)
    return NextResponse.json(
      { error: 'Failed to check trial eligibility' },
      { status: 500 }
    )
  }
}

export const GET = withApiAuth(handleCheckEligibility, { requireAuth: true })