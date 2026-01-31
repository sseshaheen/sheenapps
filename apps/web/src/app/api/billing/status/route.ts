/**
 * Billing Status Proxy Route
 * Secure proxy to worker payment service for subscription status retrieval
 * 
 * SECURITY HARDENED:
 * - Server-side authentication via Supabase
 * - Claims-based worker authorization
 * - Worker validates claims.userId === params.userId for security
 * - No idempotency required for read operations
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClientNew } from '@/lib/supabase-server';
import { 
  createPaymentClaims, 
  getPaymentWorkerClient,
  generateCorrelationId,
  encodeClaims
} from '@/lib/worker/payment-client';
import { noCacheResponse, noCacheErrorResponse, DYNAMIC_ROUTE_CONFIG } from '@/lib/api/response-helpers';

// Force dynamic rendering and prevent caching
export const { dynamic, revalidate, fetchCache } = DYNAMIC_ROUTE_CONFIG;
export const runtime = 'nodejs'; // Prevent Edge runtime issues with crypto/HMAC

export async function GET(request: NextRequest) {
  try {
    // 1. Authentication
    const supabase = await createServerSupabaseClientNew();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return noCacheErrorResponse('Unauthorized', 401);
    }

    // 2. Create claims
    const claims = createPaymentClaims(user);
    const correlationId = generateCorrelationId('status');

    // 3. Call worker with userId param (worker implementation expects this)
    // Note: Worker validates claims.userId === params.userId for security
    const workerClient = getPaymentWorkerClient();
    const result = await workerClient.get(`/v1/payments/status/${user.id}`, {
      'x-correlation-id': correlationId,
      'x-sheen-claims': encodeClaims(claims)
    }) as {
      hasSubscription: boolean;
      status: string | null;
      planName: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean | null;
    };

    // 4. Add cache-busting timestamp for debugging
    return noCacheResponse({
      hasSubscription: result.hasSubscription,
      status: result.status,
      planName: result.planName,
      currentPeriodEnd: result.currentPeriodEnd,
      cancelAtPeriodEnd: result.cancelAtPeriodEnd,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Billing] Status check failed:', error);
    
    // Handle specific worker errors
    if (error instanceof Error) {
      if (error.message.includes('INVALID_CLAIMS')) {
        return noCacheErrorResponse({
          error: 'Authentication expired',
          details: { code: 'INVALID_CLAIMS' }
        }, 401);
      }
      
      if (error.message.includes('CUSTOMER_NOT_FOUND')) {
        return noCacheErrorResponse({
          error: 'No billing account found',
          details: { 
            code: 'CUSTOMER_NOT_FOUND',
            // Provide default status for new users
            hasSubscription: false,
            status: null,
            planName: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: null
          }
        }, 404);
      }
    }
    
    return noCacheErrorResponse({ 
      error: 'Status check failed',
      details: { timestamp: new Date().toISOString() }
    }, 500);
  }
}