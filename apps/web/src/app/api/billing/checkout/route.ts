/**
 * Billing Checkout Proxy Route
 * Secure proxy to worker payment service for checkout session creation
 *
 * SECURITY HARDENED:
 * - Server-side authentication via Supabase
 * - Required idempotency keys for all operations
 * - Claims-based worker authorization
 * - Locale sanitization with allowlist
 * - Plan validation against allowlist
 * - No client-controlled data forwarded to worker
 */

import { DYNAMIC_ROUTE_CONFIG, noCacheErrorResponse, noCacheResponse } from '@/lib/api/response-helpers';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import {
  createPaymentClaims,
  encodeClaims,
  generateCorrelationId,
  generateIdempotencyKey,
  getPaymentWorkerClient,
  sanitizeLocale,
  validateIdempotencyKey,
  validatePlanId
} from '@/lib/worker/payment-client';
import { NextRequest } from 'next/server';

// Force dynamic rendering and prevent caching
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG;
export const runtime = 'nodejs'; // Prevent Edge runtime issues with crypto/HMAC

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication - Use server auth client
    const supabase = await createServerSupabaseClientNew();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401);
    }

    // 2. Parse request body
    const body = await request.json();

    // 3. Validate required fields with worker allowlist
    if (!body.planId || !validatePlanId(body.planId)) {
      return noCacheErrorResponse({
        error: 'Invalid planId',
        details: 'Must be one of: free, lite, starter, builder, pro, ultra'
      }, 400);
    }

    // 4. Handle idempotency key (SECURITY: Required for all payment operations)
    let idempotencyKey = request.headers.get('x-idempotency-key');
    if (!idempotencyKey) {
      // Generate if not provided
      idempotencyKey = generateIdempotencyKey('checkout', user.id, body.planId);
    } else if (!validateIdempotencyKey(idempotencyKey)) {
      return noCacheErrorResponse({
        error: 'Invalid idempotency key format',
        details: 'Must be 8-64 alphanumeric/underscore/hyphen characters'
      }, 400);
    }

    // 5. Sanitize locale with allowlist (defense in depth)
    const rawLocale = request.headers.get('x-locale') || request.headers.get('x-sheen-locale') || 'en';
    const locale = sanitizeLocale(rawLocale);

    // 6. Create claims (security critical)
    const claims = createPaymentClaims(user);
    const correlationId = generateCorrelationId('checkout');

    // 7. Prepare worker request (only forward validated data)
    const workerPayload = {
      planId: body.planId,
      trial: Boolean(body.trial) // Sanitize boolean
    };



    // 8. Call worker (pure proxy - no business logic)
    const workerClient = getPaymentWorkerClient();
    const result = await workerClient.postWithoutCorrelation('/v1/payments/checkout', workerPayload, {
      'x-idempotency-key': idempotencyKey,
      'x-correlation-id': correlationId,
      'x-sheen-claims': encodeClaims(claims),
      'x-sheen-locale': locale
    }) as { url: string; sessionId: string };

    // 9. Return success response with correlation for debugging
    return noCacheResponse({
      success: true,
      url: result.url,
      sessionId: result.sessionId,
      correlationId
    });

  } catch (error) {
    console.error('[Billing] Checkout failed:', error);

    // Handle specific worker errors
    if (error instanceof Error) {
      if (error.message.includes('InsufficientBalanceError')) {
        return noCacheErrorResponse({
          error: 'Insufficient balance',
          details: { success: false, code: 'INSUFFICIENT_BALANCE' }
        }, 402);
      }

      if (error.message.includes('INVALID_CLAIMS')) {
        return noCacheErrorResponse({
          error: 'Authentication expired',
          details: { success: false, code: 'INVALID_CLAIMS' }
        }, 401);
      }
    }

    // Generic error response
    return noCacheErrorResponse({
      error: 'Checkout failed',
      details: { success: false, timestamp: new Date().toISOString() }
    }, 500);
  }
}
