/**
 * Sanity Webhook Handler
 * Receives webhook events from Sanity and forwards to backend worker
 * Follows Next.js 13+ app router API route patterns
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/utils/logger';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * Handle Sanity webhook events
 * Forwards events to backend worker for processing
 */
export async function POST(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const { connectionId } = params;
    
    if (!connectionId) {
      return NextResponse.json(
        { error: 'Connection ID is required' },
        { status: 400 }
      );
    }

    // Get Sanity signature for verification
    const sanitySignature = request.headers.get('x-sanity-signature');
    const contentType = request.headers.get('content-type');

    logger.info('📨 Sanity webhook received', {
      connectionId,
      hasSignature: !!sanitySignature,
      contentType,
      userAgent: request.headers.get('user-agent')
    });

    // Read the raw body
    const body = await request.text();

    // Validate we have required headers
    if (!sanitySignature) {
      logger.warn('⚠️ Sanity webhook missing signature', { connectionId });
      return NextResponse.json(
        { error: 'Missing Sanity signature' },
        { status: 401 }
      );
    }

    // Forward to backend worker for processing
    const workerUrl = process.env.WORKER_BASE_URL;
    if (!workerUrl) {
      logger.error('🚨 WORKER_BASE_URL not configured');
      return NextResponse.json(
        { error: 'Backend configuration error' },
        { status: 500 }
      );
    }

    const forwardUrl = `${workerUrl}/api/integrations/sanity/webhook/${connectionId}`;
    
    logger.info('🔄 Forwarding webhook to backend', {
      connectionId,
      forwardUrl,
      bodyLength: body.length
    });

    // Forward the webhook with original headers
    const forwardResponse = await fetch(forwardUrl, {
      method: 'POST',
      headers: {
        'Content-Type': contentType || 'application/json',
        'X-Sanity-Signature': sanitySignature,
        'User-Agent': 'SheenApps-Frontend-Webhook-Forwarder/1.0',
        'X-Forwarded-For': request.headers.get('x-forwarded-for') || 'unknown',
        'X-Real-IP': request.headers.get('x-real-ip') || 'unknown'
      },
      body,
    });

    if (!forwardResponse.ok) {
      logger.error('🚨 Backend webhook processing failed', {
        connectionId,
        status: forwardResponse.status,
        statusText: forwardResponse.statusText
      });

      return NextResponse.json(
        { error: 'Webhook processing failed' },
        { status: forwardResponse.status }
      );
    }

    const result = await forwardResponse.json().catch(() => ({}));
    
    logger.info('✅ Webhook processed successfully', {
      connectionId,
      result: typeof result === 'object' ? Object.keys(result) : result
    });

    return NextResponse.json({ success: true, ...result });

  } catch (error) {
    logger.error('🚨 Webhook processing error', {
      connectionId: params?.connectionId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      { error: 'Internal webhook processing error' },
      { status: 500 }
    );
  }
}

/**
 * Handle webhook verification requests from Sanity
 * Some webhook services send GET requests to verify endpoints
 */
export async function GET(request: NextRequest, props: { params: Promise<{ connectionId: string }> }) {
  const params = await props.params;
  try {
    const { connectionId } = params;
    
    logger.info('🔍 Sanity webhook verification', { connectionId });

    // Check if this is a webhook verification request
    const challenge = request.nextUrl.searchParams.get('challenge');
    const verify = request.nextUrl.searchParams.get('verify');

    if (challenge) {
      // Echo back the challenge for verification
      logger.info('✅ Webhook challenge verified', { connectionId, challenge });
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    if (verify) {
      // Simple verification response
      return NextResponse.json({ 
        verified: true, 
        connectionId,
        timestamp: new Date().toISOString()
      });
    }

    // Default response for GET requests
    return NextResponse.json({
      message: 'Sanity webhook endpoint is active',
      connectionId,
      methods: ['POST'],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('🚨 Webhook verification error', {
      connectionId: params?.connectionId,
      error: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      { error: 'Webhook verification failed' },
      { status: 500 }
    );
  }
}

/**
 * Handle unsupported methods
 */
export async function PUT() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}