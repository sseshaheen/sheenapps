/**
 * Feedback Eligibility Record API Route
 * Server-side proxy for recording prompt shown/responded with HMAC authentication
 *
 * POST /api/feedback/eligibility/record - Record that a prompt was shown
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /api/feedback/eligibility/record
 * Record that a prompt was shown/dismissed/responded
 *
 * Body:
 *   - promptType: string (required)
 *   - anonymousId: string (required)
 *   - action: 'shown' | 'dismissed' | 'responded' (required)
 *   - featureId?: string (optional)
 */
export async function POST(request: NextRequest) {
  try {
    // Get user if authenticated
    let userId: string | undefined;
    try {
      const supabase = await createServerSupabaseClientNew();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id;
    } catch {
      // Anonymous is OK
    }

    // Parse request body
    const body = await request.json();

    // Inject userId if authenticated
    const enrichedBody = {
      ...body,
      userId,
    };

    const path = '/v1/feedback/eligibility/record';
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
      // Recording failures are non-critical - don't block UX
      console.warn('[Feedback API] Failed to record eligibility:', data);
      return NextResponse.json({ recorded: false });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Feedback API] Error recording eligibility:', error);
    // Recording failures are non-critical
    return NextResponse.json({ recorded: false });
  }
}
