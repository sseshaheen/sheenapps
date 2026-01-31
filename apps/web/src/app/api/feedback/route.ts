/**
 * Feedback Submission API Route
 * Server-side proxy for feedback submission with HMAC authentication
 *
 * POST /api/feedback - Submit explicit feedback
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081';

// No caching for feedback submissions
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

/**
 * POST /api/feedback
 * Submit explicit feedback (NPS, CSAT, binary, emoji, text, feature request, bug report)
 */
export async function POST(request: NextRequest) {
  try {
    // Get user if authenticated (optional - anonymous feedback allowed)
    let userId: string | undefined;
    try {
      const supabase = await createServerSupabaseClientNew();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    } catch {
      // Anonymous feedback is allowed
    }

    // Parse request body
    const body = await request.json();

    // Inject userId if authenticated
    const enrichedBody = {
      ...body,
      userId,
    };

    const path = '/v1/feedback';
    const bodyString = JSON.stringify(enrichedBody);

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
      return NextResponse.json(data, { status: response.status });
    }

    // Return 201 for new, 200 for duplicate (idempotent)
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('[Feedback API] Error submitting feedback:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
