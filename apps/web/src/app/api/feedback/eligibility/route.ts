/**
 * Feedback Eligibility API Route
 * Server-side proxy for eligibility checks with HMAC authentication
 *
 * GET /api/feedback/eligibility - Check if user should see a prompt
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { createWorkerAuthHeaders } from '@/utils/worker-auth';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';

const WORKER_BASE_URL = process.env.WORKER_BASE_URL || 'http://localhost:8081';

// Short cache for eligibility checks (1 minute)
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/feedback/eligibility
 * Check if user is eligible to see a specific prompt type
 *
 * Query params:
 *   - promptType: string (required)
 *   - anonymousId: string (required)
 *   - featureId?: string (optional)
 */
export async function GET(request: NextRequest) {
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const promptType = searchParams.get('promptType');
    const anonymousId = searchParams.get('anonymousId');
    const featureId = searchParams.get('featureId');

    if (!promptType || !anonymousId) {
      return NextResponse.json(
        { eligible: false, reason: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // Build query string
    const queryParams = new URLSearchParams({
      promptType,
      anonymousId,
    });
    if (userId) queryParams.set('userId', userId);
    if (featureId) queryParams.set('featureId', featureId);

    const path = '/v1/feedback/eligibility';
    const pathWithQuery = `${path}?${queryParams.toString()}`;

    // Generate HMAC auth headers
    const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, '');

    // Forward to worker
    const response = await fetch(`${WORKER_BASE_URL}${pathWithQuery}`, {
      method: 'GET',
      headers: authHeaders,
    });

    const data = await response.json();

    if (!response.ok) {
      // Fail closed - if check fails, don't show prompt
      return NextResponse.json(
        { eligible: false, reason: 'check_failed' },
        { status: 200 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[Feedback API] Error checking eligibility:', error);
    // Fail closed
    return NextResponse.json({ eligible: false, reason: 'check_failed' });
  }
}
