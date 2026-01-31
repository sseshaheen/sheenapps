/**
 * Billing Overview Hook
 *
 * Single hook that fetches balance, usage, and catalog in one API call.
 * Replaces separate useEnhancedBalance + useUsageAnalytics + usePricingCatalog calls
 * on the billing page.
 */

import { useQuery } from '@tanstack/react-query'
import type { SupportedCurrency } from '@/hooks/use-pricing-catalog'

export interface BillingOverviewData {
  balance: {
    version?: string
    totals: {
      total_seconds: number
      paid_seconds: number
      bonus_seconds: number
      next_expiry_at: string | null
    }
    buckets: {
      daily: Array<{ seconds: number; expires_at: string }>
      paid: Array<{ seconds: number; source: string; expires_at: string }>
    }
    bonus: {
      daily_minutes: number
      used_this_month_minutes: number
      monthly_cap_minutes: number
    }
    plan_key: 'free' | 'paid'
    subscription_status: 'active' | 'inactive'
  }
  usage: {
    total_seconds: number
    by_operation: Record<string, number>
  }
  catalog: {
    subscriptions: Array<{
      key: string
      name: string
      price: number
      monthlyPrice: number
      yearlyPrice?: number
      currency: string
      minutes: number
    }>
    packages: Array<{
      key: string
      name: string
      price: number
      currency: string
      minutes: number
    }>
    rollover_policy: string
    version: string
    currency: string
  } | null
  currency_fallback_from: string | null
}

async function fetchBillingOverview(
  userId: string,
  currency: SupportedCurrency
): Promise<BillingOverviewData> {
  const params = new URLSearchParams({
    currency,
    _t: Date.now().toString(),
  })

  const response = await fetch(`/api/v1/billing/overview/${userId}?${params}`, {
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Cache-Control': 'no-cache' },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

export function useBillingOverview(userId: string, currency: SupportedCurrency = 'USD') {
  return useQuery({
    queryKey: ['billing-overview', userId, currency],
    queryFn: () => fetchBillingOverview(userId, currency),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: !!userId && userId.trim().length > 0,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}
