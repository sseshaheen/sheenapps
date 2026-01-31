/**
 * Billing Entitlements Utility
 * Expert-hardened implementation for checking user subscription and credit entitlements
 * 
 * Features:
 * - Request timeout to prevent hanging SSR (3.5s)
 * - Defensive normalization for multi-provider compatibility
 * - Support for trialing subscriptions
 * - Graceful fallback on worker errors
 */

import 'server-only';
import { getPaymentWorkerClient } from '@/lib/worker/payment-client';

export interface UserEntitlements {
  hasActiveSub: boolean;
  hasCredits: boolean;
  totalSeconds: number;
}

/**
 * Get user's entitlements from worker API with expert hardening
 * @param userId - User ID to check entitlements for
 * @returns Promise<UserEntitlements> - Entitlements data with graceful fallbacks
 */
export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  // Expert hardening: Request timeout to prevent hanging SSR
  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), 3500);
  
  try {
    const worker = getPaymentWorkerClient();
    const response = await worker.get(`/v1/billing/enhanced-balance/${userId}`, {
      'Cache-Control': 'no-store'
    });
    
    // Expert: Defensive normalization for multi-provider compatibility
    const responseData = response as { data?: { subscription?: { status?: string }, totals?: { total_seconds?: number } } };
    const status = String(responseData.data?.subscription?.status || '').toLowerCase();
    const hasActiveSub = status === 'active' || status === 'trialing'; // Include trialing
    const totalSeconds = Number(responseData.data?.totals?.total_seconds ?? 0);
    
    return {
      hasActiveSub,
      hasCredits: totalSeconds > 0,
      totalSeconds
    };
  } catch (error) {
    console.error('Failed to get entitlements:', error);
    // Expert: Graceful fallback - treat as no entitlements and let page redirect to billing
    return { hasActiveSub: false, hasCredits: false, totalSeconds: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Check if user has access to premium features
 * @param entitlements - User entitlements object
 * @returns boolean - True if user has active subscription OR credits
 */
export function hasAccess(entitlements: UserEntitlements): boolean {
  return entitlements.hasActiveSub || entitlements.hasCredits;
}