import { NextRequest, NextResponse } from 'next/server'
import { BonusService } from '@/services/payment/bonus-service'
import { NotificationService } from '@/services/payment/notification-service'
import { logger } from '@/utils/logger'
import { makeAdminCtx } from '@/lib/db'

const bonusService = new BonusService()
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

    logger.info('Processing bonus notifications')

    // ⚠️ ADMIN: System operation for cron job (CLAUDE.md guidance)
    const adminCtx = makeAdminCtx()
    const { client: supabase } = adminCtx

    // Get bonuses expiring in 3 days
    const expiringBonuses = await bonusService.getExpiringBonuses(3)
    let totalNotificationsSent = 0

    for (const bonus of expiringBonuses) {
      try {
        // Get user details
        const { data: userData } = await supabase
          .auth.admin.getUserById(bonus.user_id)

        if (userData?.user) {
          await notificationService.sendBonusExpiringReminder({
            email: userData.user.email!,
            name: userData.user.user_metadata?.name,
            amount: bonus.expiring_amount,
            expiryDate: new Date(bonus.earliest_expiry)
          })

          // Mark as notified
          await bonusService.markBonusesAsNotified(bonus.user_id, bonus.metric)
          totalNotificationsSent++
        }
      } catch (error) {
        logger.error('Failed to send bonus notification', {
          userId: bonus.user_id,
          error
        })
      }
    }

    // Archive expired bonuses
    await bonusService.archiveExpiredBonuses()

    logger.info('Bonus notifications processed', {
      notificationsSent: totalNotificationsSent
    })

    return NextResponse.json({
      success: true,
      notificationsSent: totalNotificationsSent,
      processedAt: new Date()
    })

  } catch (error) {
    logger.error('Failed to process bonus notifications', error)
    return NextResponse.json(
      { error: 'Failed to process bonus notifications' },
      { status: 500 }
    )
  }
}

// Also support POST for some cron services
export const POST = GET