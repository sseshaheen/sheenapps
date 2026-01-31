/**
 * Feedback Alerts Cron Route
 * Called periodically to check for negative feedback trends and send alerts
 *
 * Recommended schedule: Every hour during business hours, every 4 hours otherwise
 *
 * Vercel Cron example (vercel.json):
 * {
 *   "crons": [{
 *     "path": "/api/cron/feedback-alerts",
 *     "schedule": "0 * * * *"
 *   }]
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { runFeedbackAlertCheck } from '@/services/feedback/feedback-alerting-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 30 // 30 second timeout

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Run alert checks
    const { result, sent, failed } = await runFeedbackAlertCheck()

    // Log summary
    console.log('[FEEDBACK_ALERTS_CRON]', {
      alertsTriggered: result.alerts.length,
      alertsSent: sent,
      alertsFailed: failed,
      metrics: {
        npsScore: result.metrics.nps?.npsScore,
        detractorRate: result.metrics.nps?.detractorRate,
        rageClicks: result.metrics.frustration?.rageClicks,
        unprocessed: result.metrics.backlog?.unprocessed,
      },
      checkedAt: result.checkedAt,
    })

    return NextResponse.json({
      success: true,
      alertsTriggered: result.alerts.length,
      alertsSent: sent,
      alertsFailed: failed,
      alerts: result.alerts.map((a) => ({
        key: a.key,
        severity: a.severity,
        title: a.title,
      })),
      metrics: {
        nps: result.metrics.nps
          ? {
              score: result.metrics.nps.npsScore,
              detractorRate: result.metrics.nps.detractorRate,
              total: result.metrics.nps.total,
            }
          : null,
        frustration: result.metrics.frustration
          ? {
              rageClicks: result.metrics.frustration.rageClicks,
              deadClicks: result.metrics.frustration.deadClicks,
            }
          : null,
        backlog: result.metrics.backlog
          ? {
              unprocessed: result.metrics.backlog.unprocessed,
              critical: result.metrics.backlog.criticalUnprocessed,
            }
          : null,
      },
      checkedAt: result.checkedAt,
    })
  } catch (error) {
    console.error('[FEEDBACK_ALERTS_CRON] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggering from admin dashboard
export async function POST(request: NextRequest) {
  return GET(request)
}
