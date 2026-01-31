/**
 * DEPRECATED: Worker API Build Events Webhook
 * 
 * ⚠️ SUNSET NOTICE: This webhook endpoint has been deprecated and is no longer active.
 * The Worker team has disabled webhook delivery in favor of a polling-based approach.
 * 
 * Current Architecture (Post-Webhook):
 * Worker API → Polling Service → Database → UI
 * 
 * @deprecated Since August 2025 - Worker team sunset webhooks
 * @see docs/PROJECT_STATE_ARCHITECTURE_STRATEGIC_PLAN.md for current polling approach
 * @see src/services/worker-build-events-polling.ts for replacement implementation
 */

// COMMENTED OUT - Webhook functionality deprecated
// import { NextRequest, NextResponse } from 'next/server';
// import { publishBuildEvent, testBuildEventsPublisher } from '@/services/server/build-events-publisher';
// import { logger } from '@/utils/logger';
// import { createHmac } from 'crypto';

// DEPRECATED: Webhook functionality commented out
/*
// Webhook signature verification
function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expectedSignature = createHmac('sha256', secret)
    .update(body)
    .digest('hex');
  
  const receivedSignature = signature.replace('sha256=', '');
  return expectedSignature === receivedSignature;
}

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // DEPRECATED: Return 410 Gone to indicate webhook is no longer supported
  return NextResponse.json(
    {
      error: 'Webhook endpoint deprecated',
      message: 'Worker build events webhook has been sunset. System now uses polling-based architecture.',
      migration: {
        architecture: 'Worker API → Polling Service → Database → UI',
        documentation: 'docs/PROJECT_STATE_ARCHITECTURE_STRATEGIC_PLAN.md',
        replacement: 'src/services/worker-build-events-polling.ts'
      },
      timestamp: new Date().toISOString()
    },
    { status: 410 } // 410 Gone - Resource no longer available
  );
}

/*
  // DEPRECATED: Original webhook implementation - commented out for reference
  try {
    const body = await req.text();
    const signature = req.headers.get('x-worker-signature');
    const webhookSecret = process.env.WORKER_WEBHOOK_SECRET;

    logger.info('📡 Worker build event webhook received', {
      hasSignature: !!signature,
      bodyLength: body.length,
      hasSecret: !!webhookSecret
    });

    // Verify webhook signature
    if (webhookSecret && signature) {
      if (!verifyWebhookSignature(body, signature, webhookSecret)) {
        logger.warn('❌ Invalid webhook signature');
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        );
      }
    } else {
      logger.warn('⚠️ Webhook signature verification skipped (missing secret or signature)');
    }

    // Parse webhook payload
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      logger.error('❌ Invalid JSON in webhook payload:', error);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const { buildId, eventType, eventData, userId, timestamp } = payload;

    // Validate required fields
    if (!buildId || !eventType) {
      logger.error('❌ Missing required fields in webhook payload', { buildId, eventType });
      return NextResponse.json(
        { error: 'Missing required fields: buildId, eventType' },
        { status: 400 }
      );
    }

    // Validate event type
    const validEventTypes = ['queued', 'started', 'progress', 'completed', 'failed', 'cancelled'];
    if (!validEventTypes.includes(eventType)) {
      logger.error('❌ Invalid event type:', eventType);
      return NextResponse.json(
        { error: `Invalid event type. Must be one of: ${validEventTypes.join(', ')}` },
        { status: 400 }
      );
    }

    logger.info('✅ Valid webhook payload received', {
      buildId,
      eventType,
      userId,
      timestamp,
      hasEventData: !!eventData
    });

    // Publish event to Supabase real-time
    const result = await publishBuildEvent(
      buildId,
      eventType,
      eventData || {},
      userId
    );

    if (!result.success) {
      logger.error('❌ Failed to publish build event via webhook:', result.error);
      return NextResponse.json(
        { error: 'Failed to publish build event' },
        { status: 500 }
      );
    }

    logger.info('✅ Build event published to real-time system', {
      buildId,
      eventType
    });

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Build event processed successfully',
      buildId,
      eventType,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Worker build event webhook error:', error);
    
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
*/

// DEPRECATED: Health check endpoint also sunset
import { NextResponse } from 'next/server'

export async function GET() {
  // Return 410 Gone for health check as well
  return NextResponse.json(
    {
      status: 'deprecated',
      message: 'Webhook health check endpoint deprecated. Use polling-based architecture.',
      migration: {
        architecture: 'Worker API → Polling Service → Database → UI',
        healthCheck: 'Worker API polling service handles health internally',
        documentation: 'docs/PROJECT_STATE_ARCHITECTURE_STRATEGIC_PLAN.md'
      },
      timestamp: new Date().toISOString()
    },
    { status: 410 } // 410 Gone
  );
}

/*
// DEPRECATED: Original health check implementation
export async function GET() {
  try {
    // Test server-side build events publisher health
    const isHealthy = await testBuildEventsPublisher();
    
    if (!isHealthy) {
      return NextResponse.json(
        { 
          status: 'unhealthy', 
          error: 'Build events publisher unavailable' 
        },
        { status: 503 }
      );
    }
    
    return NextResponse.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'build-events-publisher',
      webhookEndpoint: '/api/webhooks/worker-build-events'
    });

  } catch (error) {
    logger.error('❌ Build events webhook health check failed:', error);
    
    return NextResponse.json(
      { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
*/