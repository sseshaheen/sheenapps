import { NextRequest, NextResponse } from 'next/server'
import { withApiAuth } from '@/lib/auth-middleware'
import { TrialService } from '@/services/payment/trial-service'
import { logger } from '@/utils/logger'

const trialService = new TrialService()

async function handleGetAnalytics(request: NextRequest, { user }: { user: any }) {
  try {
    // This endpoint should be admin-only in production
    // For now, we'll allow any authenticated user to access it
    
    const url = new URL(request.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    const analytics = await trialService.getTrialAnalytics(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )

    logger.info('Trial analytics retrieved', {
      userId: user.id.slice(0, 8),
      dateRange: { startDate, endDate }
    })

    return NextResponse.json({
      success: true,
      analytics,
      generatedAt: new Date()
    })

  } catch (error) {
    logger.error('Failed to get trial analytics', error)
    return NextResponse.json(
      { error: 'Failed to retrieve trial analytics' },
      { status: 500 }
    )
  }
}

export const GET = withApiAuth(handleGetAnalytics, { requireAuth: true })