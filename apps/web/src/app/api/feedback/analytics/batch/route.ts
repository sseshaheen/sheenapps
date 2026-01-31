/**
 * Feedback Analytics Batch API Route
 * Server-side proxy for implicit signals batch with HMAC authentication
 *
 * POST /api/feedback/analytics/batch - Submit batch of implicit signals
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Rate limiting: max 60 events/minute per session
const MAX_EVENTS_PER_BATCH = 100;

/**
 * POST /api/feedback/analytics/batch
 * Submit batch of implicit signals (rage clicks, scroll depth, etc.)
 *
 * Body:
 *   - events: Array of implicit signal events
 */
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();

    // Validate events array
    if (!body.events || !Array.isArray(body.events)) {
      return NextResponse.json({ received: 0, errors: 1 }, { status: 400 });
    }

    // Enforce max batch size
    if (body.events.length > MAX_EVENTS_PER_BATCH) {
      return NextResponse.json(
        { received: 0, errors: 1, message: 'Batch too large' },
        { status: 400 }
      );
    }

    const path = '/v1/feedback/analytics/batch';
    const bodyString = JSON.stringify(body);

    // Generate HMAC auth headers
    const authHeaders = createWorkerAuthHeaders('POST', path, bodyString);

    // Forward to worker
    const response = await fetch(`${WORKER_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: bodyString,
    });

    const data = await response.json();

    if (!response.ok) {
      // Analytics failures are non-critical
      console.warn('[Feedback API] Failed to record analytics:', data);
      return NextResponse.json({ received: 0, errors: body.events.length });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Feedback API] Error recording analytics:', error);
    // Analytics failures are non-critical
    return NextResponse.json({ received: 0, errors: 1 });
  }
}
