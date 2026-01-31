import { NextRequest, NextResponse } from 'next/server'
import { WebhookRetryService } from '@/services/payment/webhook-retry-service'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes max

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get retry stats before processing
    const retryService = new WebhookRetryService()
    const statsBefore = await retryService.getRetryStats()

    console.log('Starting webhook retry job:', {
      pending: statsBefore.pending,
      maxRetriesReached: statsBefore.maxRetriesReached,
      timestamp: new Date().toISOString()
    })

    // Process pending retries
    await retryService.processPendingRetries()

    // Get stats after processing
    const statsAfter = await retryService.getRetryStats()

    const processed = statsBefore.pending - statsAfter.pending
    
    console.log('Webhook retry job completed:', {
      processed,
      remaining: statsAfter.pending,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({
      success: true,
      processed,
      stats: {
        before: statsBefore,
        after: statsAfter
      },
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error('Webhook retry job error:', error)
    
    return NextResponse.json(
      { 
        error: 'Internal server error',
        message: error.message 
      },
      { status: 500 }
    )
  }
}