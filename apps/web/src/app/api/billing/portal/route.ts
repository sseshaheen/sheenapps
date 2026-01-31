/**
 * Billing Portal Proxy Route
 * Secure proxy to worker payment service for billing portal access
 * 
 * SECURITY HARDENED:
 * - Server-side authentication via Supabase
 * - Required idempotency keys for all operations
 * - Claims-based worker authorization
 * - No client-controlled returnUrl (worker builds allowlisted URLs)
 * - Locale sanitization with allowlist
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { 
  createPaymentClaims, 
  generateIdempotencyKey, 
  validateIdempotencyKey,
  getPaymentWorkerClient,
  sanitizeLocale,
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

    // 2. Sanitize locale with allowlist (defense in depth)
    const rawLocale = request.headers.get('x-locale') || request.headers.get('x-sheen-locale') || 'en';
    const locale = sanitizeLocale(rawLocale);

    // 3. Handle required idempotency key (SECURITY: Required for all payment operations)
    let idempotencyKey = request.headers.get('x-idempotency-key');
    if (!idempotencyKey) {
      idempotencyKey = generateIdempotencyKey('portal', user.id);
    } else if (!validateIdempotencyKey(idempotencyKey)) {
      return noCacheErrorResponse({ 
        error: 'Invalid idempotency key format',
        details: 'Must be 8-64 alphanumeric/underscore/hyphen characters'
      }, 400);
    }

    // 4. Create claims
    const claims = createPaymentClaims(user);
    const correlationId = generateCorrelationId('portal');

    // 5. Call worker - no returnUrl from client (worker builds allowlisted URLs)
    // SECURITY: Worker server-side builds return URLs to prevent redirect attacks
    const workerClient = getPaymentWorkerClient();
    const result = await workerClient.postWithoutCorrelation('/v1/payments/portal', {}, {
      'x-idempotency-key': idempotencyKey,
      'x-correlation-id': correlationId,
      'x-sheen-claims': encodeClaims(claims),
      'x-sheen-locale': locale
    }) as { url: string };

    return noCacheResponse({
      success: true,
      url: result.url,
      correlationId
    });

  } catch (error) {
    console.error('[Billing] Portal failed:', error);
    
    // Handle specific worker errors
    if (error instanceof Error) {
      if (error.message.includes('INVALID_CLAIMS')) {
        return noCacheErrorResponse({
          error: 'Authentication expired',
          details: { success: false, code: 'INVALID_CLAIMS' }
        }, 401);
      }
      
      if (error.message.includes('CUSTOMER_NOT_FOUND')) {
        return noCacheErrorResponse({
          error: 'No billing account found. Please subscribe to a plan first.',
          details: { success: false, code: 'CUSTOMER_NOT_FOUND' }
        }, 404);
      }
    }
    
    return noCacheErrorResponse({ 
      error: 'Portal creation failed',
      details: { success: false, timestamp: new Date().toISOString() }
    }, 500);
  }
}