/**
 * AI Time Balance Hook (v1 Enhanced Implementation)
 * React hooks for managing AI time balance state with React Query
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { EnhancedBalance } from '@/types/worker-api';
import type { InsufficientFundsError, BatchOperationRequest, BatchOperationResponse } from '@/types/billing';
import { logger } from '@/utils/logger';

// =============================================================================
// 🆕 ENHANCED BALANCE HOOKS (v1 Implementation)
// Using React Query with intelligent polling strategy per backend recommendations
// =============================================================================

/**
 * Fetch enhanced balance from new API endpoint
 */
async function fetchEnhancedBalance(userId: string): Promise<EnhancedBalance> {
  const params = new URLSearchParams({
    _t: Date.now().toString() // Cache-busting timestamp
  });
  
  const response = await fetch(`/api/v1/billing/enhanced-balance/${userId}?${params}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

/**
 * Enhanced Balance Hook with React Query (v1)
 * Implements backend-recommended polling strategy: 30s staleTime, 60s refetch, focus refetch
 */
export function useEnhancedBalance(userId: string) {
  return useQuery({
    queryKey: ['enhanced-balance', userId],
    queryFn: () => fetchEnhancedBalance(userId),
    staleTime: 30 * 1000,        // 30 seconds (backend confirmed)
    refetchInterval: 60 * 1000,   // 1 minute intelligent polling
    refetchOnWindowFocus: true,   // Refresh when user returns
    enabled: !!userId && userId.trim().length > 0, // Ensure userId is not empty string
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Batch Operation Check Hook (Expert recommendation)
 */
export function useBatchOperationCheck() {
  const queryClient = useQueryClient();

  const checkBatchOperations = async (
    userId: string, 
    operations: BatchOperationRequest[]
  ): Promise<BatchOperationResponse> => {
    const response = await fetch('/api/v1/billing/check-sufficient-batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        user_id: userId,
        operations
      })
    });

    if (!response.ok) {
      throw new Error(`Batch check failed: ${response.status}`);
    }

    return response.json();
  };

  return {
    checkBatchOperations,
    // Invalidate balance after operations
    invalidateBalance: (userId: string) => {
      queryClient.invalidateQueries({ queryKey: ['enhanced-balance', userId] });
    }
  };
}

/**
 * Preemptive Balance Check Hook (Expert recommendation) 
 */
export function usePreemptiveBalanceCheck() {
  const { data: balance } = useEnhancedBalance(''); // Will be passed userId from component
  
  const checkBeforeOperation = (operationType: string, estimatedSeconds: number): boolean => {
    if (!balance) return false;
    
    if (balance.totals.total_seconds < estimatedSeconds) {
      logger.warn('Insufficient balance for operation', {
        operation: operationType,
        required: estimatedSeconds,
        available: balance.totals.total_seconds
      });
      return false;
    }
    
    return true;
  };

  return {
    balance,
    checkBeforeOperation,
    isReady: !!balance
  };
}

/**
 * Usage Analytics Hook (v1 Implementation with React Query)
 */
export function useUsageAnalytics(userId: string) {
  return useQuery({
    queryKey: ['usage-analytics', userId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/billing/usage/${userId}?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch usage analytics: ${response.status}`);
      }
      
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes for usage analytics
    refetchInterval: false,    // Only refetch on demand for analytics
    enabled: !!userId && userId.trim().length > 0, // Ensure userId is not empty string
  });
}

/**
 * Enhanced Formatted Balance Hook (v1 Implementation)
 * Provides enhanced balance data with proper formatting utilities
 */
export function useFormattedEnhancedBalance(userId: string) {
  const { data: balance, isLoading, error, refetch } = useEnhancedBalance(userId);

  // Enhanced formatting with bucket breakdown
  const formattedBalance = balance ? {
    // Total and breakdowns in minutes (user-friendly)
    totalMinutes: Math.floor(balance.totals.total_seconds / 60),
    paidMinutes: Math.floor(balance.totals.paid_seconds / 60),
    bonusMinutes: Math.floor(balance.totals.bonus_seconds / 60),
    
    // Bucket details
    dailyBonusMinutes: balance.bonus.daily_minutes,
    monthlyBonusUsed: balance.bonus.used_this_month_minutes,
    monthlyBonusCap: balance.bonus.monthly_cap_minutes,
    
    // Expiry information
    nextExpiryAt: balance.totals.next_expiry_at ? new Date(balance.totals.next_expiry_at) : null,
    
    // Raw seconds for calculations
    totalSeconds: balance.totals.total_seconds,
    
    // Plan information (expert enhancement)
    planKey: balance.plan_key,
    subscriptionStatus: balance.subscription_status,
    
    // Bucket visualization data
    buckets: {
      daily: balance.buckets.daily.map(bucket => ({
        minutes: Math.floor(bucket.seconds / 60),
        seconds: bucket.seconds,
        expiresAt: new Date(bucket.expires_at)
      })),
      paid: balance.buckets.paid.map(bucket => ({
        minutes: Math.floor(bucket.seconds / 60),
        seconds: bucket.seconds,
        source: bucket.source,
        expiresAt: new Date(bucket.expires_at)
      }))
    }
  } : null;

  return {
    formattedBalance,
    rawBalance: balance,
    isLoading,
    error,
    refetch
  };
}

