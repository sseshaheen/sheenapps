/**
 * Billing Cancel Subscription Proxy Route
 * Secure proxy to worker payment service for subscription cancellation
 * 
 * SECURITY HARDENED:
 * - Server-side authentication via Supabase
 * - Required idempotency keys for all operations
 * - Claims-based worker authorization
 * - Worker uses claims to locate subscription (no additional params needed)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { 
  createPaymentClaims, 
  generateIdempotencyKey, 
  validateIdempotencyKey,
  getPaymentWorkerClient,
  generateCorrelationId,
  encodeClaims
} from '@/lib/worker/payment-client';
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers';

// Force dynamic rendering and prevent caching
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG;
export const runtime = 'nodejs'; // Prevent Edge runtime issues with crypto/HMAC

export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const supabase = await createServerSupabaseClientNew();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401);
    }

    // 2. Parse request (optional body for immediately flag)
    const body = await request.json().catch(() => ({}));
    
    // 3. Handle required idempotency key (SECURITY: Required for all payment operations)
    let idempotencyKey = request.headers.get('x-idempotency-key');
    if (!idempotencyKey) {
      idempotencyKey = generateIdempotencyKey('cancel', user.id);
    } else if (!validateIdempotencyKey(idempotencyKey)) {
      return noCacheErrorResponse({ 
        error: 'Invalid idempotency key format',
        details: 'Must be 8-64 alphanumeric/underscore/hyphen characters'
      }, 400);
    }

    // 4. Create claims
    const claims = createPaymentClaims(user);
    const correlationId = generateCorrelationId('cancel');

    // 5. Prepare worker request (optional immediately flag)
    const workerPayload = {
      immediately: Boolean(body.immediately) // Sanitize boolean if provided
    };

    // 6. Call worker (worker uses claims to locate subscription for MVP)
    const workerClient = getPaymentWorkerClient();
    const result = await workerClient.postWithoutCorrelation('/v1/payments/cancel', workerPayload, {
      'x-idempotency-key': idempotencyKey,
      'x-correlation-id': correlationId,
      'x-sheen-claims': encodeClaims(claims)
    }) as { status: string; message: string };

    return noCacheResponse({
      success: true,
      status: result.status,
      message: result.message,
      correlationId
    });

  } catch (error) {
    console.error('[Billing] Cancel failed:', error);
    
    // Handle specific worker errors
    if (error instanceof Error) {
      if (error.message.includes('INVALID_CLAIMS')) {
        return noCacheErrorResponse({
          error: 'Authentication expired',
          details: { success: false, code: 'INVALID_CLAIMS' }
        }, 401);
      }
      
      if (error.message.includes('SUBSCRIPTION_NOT_FOUND')) {
        return noCacheErrorResponse({
          error: 'No active subscription found',
          details: { success: false, code: 'SUBSCRIPTION_NOT_FOUND' }
        }, 404);
      }
      
      if (error.message.includes('SUBSCRIPTION_ALREADY_CANCELED')) {
        return noCacheErrorResponse({
          error: 'Subscription is already canceled',
          details: { success: false, code: 'SUBSCRIPTION_ALREADY_CANCELED' }
        }, 409);
      }
    }
    
    return noCacheErrorResponse({ 
      error: 'Cancellation failed',
      details: { success: false, timestamp: new Date().toISOString() }
    }, 500);
  }
}