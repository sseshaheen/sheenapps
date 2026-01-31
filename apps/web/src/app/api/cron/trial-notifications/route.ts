import { NextRequest, NextResponse } from 'next/server'
import { TrialService } from '@/services/payment/trial-service'
import { NotificationService } from '@/services/payment/notification-service'
import { logger } from '@/utils/logger'

const trialService = new TrialService()
const notificationService = new NotificationService()

export async function GET(request: NextRequest) {
  try {
    // Verify this is an authorized cron request
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    logger.info('Processing trial notifications')

    // Check for trials ending in 7, 3, and 1 days
    const notificationDays = [7, 3, 1]
    let totalNotificationsSent = 0

    for (const days of notificationDays) {
      const trialsEndingSoon = await trialService.getTrialsEndingSoon(days)

      for (const trial of trialsEndingSoon) {
        try {
          await notificationService.sendTrialEndingReminder({
            email: trial.email,
            name: trial.name,
            trialEnd: trial.trialEnd,
            daysRemaining: trial.daysRemaining,
            planName: trial.planName
          })
          totalNotificationsSent++
        } catch (error) {
          logger.error('Failed to send trial notification', {
            userId: trial.userId,
            error
          })
        }
      }
    }

    // Cancel expired trials
    const canceledCount = await trialService.cancelExpiredTrials()

    logger.info('Trial notifications processed', {
      notificationsSent: totalNotificationsSent,
      trialsCanceled: canceledCount
    })

    return NextResponse.json({
      success: true,
      notificationsSent: totalNotificationsSent,
      trialsCanceled: canceledCount,
      processedAt: new Date()
    })

  } catch (error) {
    logger.error('Failed to process trial notifications', error)
    return NextResponse.json(
      { error: 'Failed to process trial notifications' },
      { status: 500 }
    )
  }
}

// Also support POST for some cron services
export const POST = GET