# Frontend Usage & Billing System Integration Guide

## Overview

This guide provides complete integration instructions for the enhanced usage & billing system. The system features expert-validated bucket-based AI time tracking, comprehensive pricing catalog management, and standardized error handling.

## Core Concepts

### Bucket-Based Balance System
AI time is tracked in **buckets** with different sources and expiry dates:
- **Daily**: 15-minute daily bonus (expires daily)
- **Subscription**: Monthly included minutes (expires monthly)  
- **Rollover**: Unused subscription minutes (expires after 90 days)
- **Package**: One-time purchased minutes (expires after 90 days)
- **Welcome**: New user bonus (never expires)
- **Gift**: Support-granted bonus (never expires)

### Consumption Priority (Expert-Specified)
1. **Daily buckets first** (to prevent waste)
2. **Paid buckets by earliest expiry** (prevents expiration)
3. **Tie-breaker: smallest remaining balance** (reduces fragmentation)

### Monthly Bonus Cap
Free tier users are limited to **300 minutes of bonus time per month** to prevent abuse.

---

## TypeScript Types

```typescript
// Pricing Catalog Types
export interface PricingCatalog {
  version: string;
  rollover_policy: {
    days: number;
  };
  subscriptions: SubscriptionPlan[];
  packages: Package[];
}

export interface SubscriptionPlan {
  key: string;
  name: string;
  minutes: number;
  price: number;
  bonusDaily?: number;
  monthlyBonusCap?: number;
  rolloverCap?: number;
  taxInclusive: boolean;  // 🆕 Expert recommendation
  advisor: {
    eligible: boolean;
    payoutUSD?: number;
  };
}

export interface Package {
  key: string;
  name: string;
  minutes: number;
  price: number;
  taxInclusive: boolean;  // 🆕 Expert recommendation
}

// Balance Types
export interface EnhancedBalance {
  version: string;
  plan_key?: string;              // 🆕 Expert recommendation for frontend gating
  subscription_status?: string;   // 🆕 Expert recommendation for frontend gating  
  catalog_version?: string;       // 🆕 Expert recommendation for cache busting
  totals: {
    total_seconds: number;
    paid_seconds: number;
    bonus_seconds: number;
    next_expiry_at: string | null;
  };
  buckets: {
    daily: Array<{ seconds: number; expires_at: string; }>;
    paid: Array<{ seconds: number; expires_at: string; source: string; }>;
  };
  bonus: {
    daily_minutes: number;
    used_this_month_minutes: number;
    monthly_cap_minutes: number;
  };
}

export interface BalanceBucket {
  source: 'daily' | 'subscription' | 'rollover' | 'package' | 'welcome' | 'gift';
  seconds: number;
  expires_at: string | null;
}

// Usage Analytics Types
export interface UsageAnalytics {
  total_seconds: number;
  by_operation: Record<string, number>;
  daily_trend: Array<{
    date: string;
    seconds: number;
  }>;
}

// Billing Events Types
export type BillingEventType = 
  | 'subscription_credit' 
  | 'package_credit'
  | 'daily_bonus'
  | 'consumption'
  | 'rollover_created'
  | 'rollover_discard'
  | 'rollover_discard_pending'
  | 'auto_topup_triggered'
  | 'adjustment';

export interface BillingEvent {
  type: BillingEventType;
  seconds: number;
  reason: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface BillingEventHistory {
  events: BillingEvent[];
}

// Error Types  
export interface InsufficientFundsError {
  error: 'INSUFFICIENT_AI_TIME';
  http_status: 402;
  balance_seconds: number;
  breakdown_seconds: {
    bonus_daily: number;
    paid: number;
  };
  suggestions: Array<{
    type: 'package' | 'upgrade';
    key?: string;
    plan?: string;
    minutes?: number;
  }>;
  catalog_version: string;
  resume_token?: string;  // 🆕 Expert recommendation for retry logic
}

// 🆕 Expert recommendation - Batch Operations
export interface BatchOperationRequest {
  operation: 'build' | 'plan' | 'export' | 'metadata_generation';
  estimate_seconds: number;
}

export interface BatchCheckRequest {
  userId: string;
  operations: BatchOperationRequest[];
}

export interface BatchOperationResult {
  operation: string;
  ok: boolean;
  deficit_seconds: number;
  suggestions?: Array<{
    type: 'package' | 'upgrade';
    key?: string;
    plan?: string;
    minutes?: number;
  }>;
}

// 🆕 Expert recommendation - Currency Support
export interface CurrencyAwareCatalog extends PricingCatalog {
  currency_fallback_from?: string;  // Original requested currency when fallback occurred
}
```

---

## API Integration

### 1. Get Pricing Catalog (🆕 Enhanced with Currency Support)

**Endpoint**: `GET /v1/billing/catalog?currency=USD|EUR|GBP|EGP|SAR|AED`

```typescript
// 🆕 Currency-aware catalog fetch (Expert recommendation)
async function getPricingCatalog(
  currency: string = 'USD',
  lastETag?: string
): Promise<CurrencyAwareCatalog | null> {
  const endpoint = `/v1/billing/catalog?currency=${currency}`;
  const headers: Record<string, string> = {};
  
  if (lastETag) {
    headers['If-None-Match'] = lastETag;
  }
  
  const response = await fetch(endpoint, { headers });
  
  if (response.status === 304) {
    return null; // Use cached version
  }
  
  if (!response.ok) {
    throw new Error('Failed to fetch pricing catalog');
  }
  
  const catalog: CurrencyAwareCatalog = await response.json();
  
  // 🆕 Handle currency fallback
  if (catalog.currency_fallback_from) {
    console.warn(`Currency ${catalog.currency_fallback_from} not available, using USD`);
    // Show user notification: "Prices shown in USD (${catalog.currency_fallback_from} not available)"
  }
  
  return catalog;
}

// 🆕 React Query integration with ETag caching
function usePricingCatalog(currency: string = 'USD') {
  return useQuery({
    queryKey: ['catalog', currency],
    queryFn: async ({ queryKey }) => {
      const [, curr] = queryKey;
      return getPricingCatalog(curr as string);
    },
    staleTime: 5 * 60 * 1000,  // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false
  });
}
```

### 2. Get Enhanced User Balance (🆕 Enhanced with Plan Metadata)

**Endpoint**: `GET /v1/billing/balance/:userId` (Now uses enhanced balance by default)

```typescript
// 🆕 Enhanced balance with plan metadata (Expert recommendation)
async function getEnhancedBalance(userId: string): Promise<EnhancedBalance> {
  const endpoint = `/v1/billing/balance/${userId}`;
  
  const response = await fetch(endpoint, {
    headers: {
      'X-HMAC-Signature': generateHMAC('GET', endpoint, ''),
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch user balance');
  }
  
  return response.json();
}

// 🆕 React Query integration with recommended caching strategy
function useUserBalance(userId: string) {
  return useQuery({
    queryKey: ['balance', userId],
    queryFn: () => getEnhancedBalance(userId),
    staleTime: 30 * 1000,        // 30s stale time
    refetchInterval: 60 * 1000,   // Refresh every 60s
    refetchOnWindowFocus: true,   // Refresh when user returns
    cacheTime: 0                  // Don't persist between sessions (security)
  });
}

// 🆕 Enhanced helper function with plan gating
function formatBalanceDisplay(balance: EnhancedBalance) {
  const totalMinutes = Math.floor(balance.totals.total_seconds / 60);
  const paidMinutes = Math.floor(balance.totals.paid_seconds / 60);
  const bonusMinutes = Math.floor(balance.totals.bonus_seconds / 60);
  
  return {
    totalMinutes,
    paidMinutes,
    bonusMinutes,
    planName: balance.plan_key || 'free',  // 🆕 For frontend gating
    subscriptionActive: balance.subscription_status === 'active',
    catalogVersion: balance.catalog_version, // 🆕 For cache busting
    nextExpiry: balance.totals.next_expiry_at ? new Date(balance.totals.next_expiry_at) : null,
    bonusUsedThisMonth: balance.bonus.used_this_month_minutes,
    bonusRemainingThisMonth: balance.bonus.monthly_cap_minutes - balance.bonus.used_this_month_minutes,
    // 🆕 Bucket breakdown for detailed UI
    buckets: {
      dailySeconds: balance.buckets.daily.reduce((sum, b) => sum + b.seconds, 0),
      paidSeconds: balance.buckets.paid.reduce((sum, b) => sum + b.seconds, 0),
      nextDailyExpiry: balance.buckets.daily[0]?.expires_at,
      nextPaidExpiry: balance.buckets.paid[0]?.expires_at
    }
  };
}
```

### 3. Get Usage Analytics

**Endpoint**: `GET /v1/billing/usage/:userId?period=day|month`

```typescript
async function getUsageAnalytics(
  userId: string, 
  period: 'day' | 'month' = 'month'
): Promise<UsageAnalytics> {
  const endpoint = `/v1/billing/usage/${userId}?period=${period}`;
  
  const response = await fetch(endpoint, {
    headers: {
      'X-HMAC-Signature': generateHMAC('GET', endpoint, ''),
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch usage analytics');
  }
  
  return response.json();
}

// Helper for chart data
function formatUsageForChart(analytics: UsageAnalytics) {
  return {
    totalMinutes: Math.floor(analytics.total_seconds / 60),
    operationBreakdown: Object.entries(analytics.by_operation).map(([operation, seconds]) => ({
      operation,
      minutes: Math.floor(seconds / 60),
      percentage: Math.round((seconds / analytics.total_seconds) * 100)
    })),
    dailyTrend: analytics.daily_trend.map(day => ({
      date: day.date,
      minutes: Math.floor(day.seconds / 60)
    }))
  };
}
```

### 4. Get Billing Event History

**Endpoint**: `GET /v1/billing/events/:userId?limit=50`

```typescript
async function getBillingEvents(
  userId: string, 
  limit: number = 50
): Promise<BillingEventHistory> {
  const endpoint = `/v1/billing/events/${userId}?limit=${limit}`;
  
  const response = await fetch(endpoint, {
    headers: {
      'X-HMAC-Signature': generateHMAC('GET', endpoint, ''),
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch billing events');
  }
  
  return response.json();
}

// Helper for event display
function formatBillingEvent(event: BillingEvent) {
  const minutes = Math.abs(Math.floor(event.seconds / 60));
  const isCredit = event.seconds > 0;
  
  return {
    type: event.type,
    description: event.reason,
    minutes,
    isCredit,
    timestamp: new Date(event.timestamp),
    icon: getBillingEventIcon(event.type),
    color: isCredit ? 'green' : 'red'
  };
}

function getBillingEventIcon(type: BillingEventType): string {
  const icons = {
    subscription_credit: '🔄',
    package_credit: '📦',
    daily_bonus: '🎁',
    consumption: '⚡',
    rollover_created: '💾',
    rollover_discard: '🗑️',
    rollover_discard_pending: '⚠️',
    auto_topup_triggered: '🔋',
    adjustment: '⚖️'
  };
  return icons[type] || '📝';
}
```

### 5. Purchase Package

**Endpoint**: `POST /v1/billing/packages/purchase`

```typescript
interface PackagePurchaseRequest {
  package_key: string;
}

interface PackagePurchaseResponse {
  checkout_url: string;
}

async function purchasePackage(packageKey: string): Promise<PackagePurchaseResponse> {
  const endpoint = '/v1/billing/packages/purchase';
  const body = JSON.stringify({ package_key: packageKey });
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HMAC-Signature': generateHMAC('POST', endpoint, body),
    },
    body
  });
  
  if (!response.ok) {
    throw new Error('Failed to initiate package purchase');
  }
  
  return response.json();
}

// Usage example
async function handlePackagePurchase(packageKey: string) {
  try {
    const { checkout_url } = await purchasePackage(packageKey);
    
    // Redirect to Stripe Checkout
    window.location.href = checkout_url;
  } catch (error) {
    console.error('Package purchase failed:', error);
    // Handle error (show toast, etc.)
  }
}
```

---

## Error Handling

### Standard 402 Insufficient Funds

All operations that require AI time will return a **standard 402 error** when insufficient balance:

```typescript
async function handleAIOperation(operationData: any) {
  try {
    const response = await fetch('/api/ai/operation', {
      method: 'POST',
      body: JSON.stringify(operationData),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.status === 402) {
      const error: InsufficientFundsError = await response.json();
      handleInsufficientFunds(error);
      return;
    }
    
    if (!response.ok) {
      throw new Error('Operation failed');
    }
    
    return response.json();
  } catch (error) {
    console.error('AI operation error:', error);
    throw error;
  }
}

function handleInsufficientFunds(error: InsufficientFundsError) {
  const remainingMinutes = Math.floor(error.balance_seconds / 60);
  
  // Show modal with balance and purchase options
  showInsufficientFundsModal({
    remainingMinutes,
    breakdown: {
      bonus: Math.floor(error.breakdown_seconds.bonus_daily / 60),
      paid: Math.floor(error.breakdown_seconds.paid / 60)
    },
    suggestions: error.suggestions.map(suggestion => ({
      type: suggestion.type,
      label: suggestion.type === 'package' 
        ? `${suggestion.key} Pack (${suggestion.minutes} min)`
        : `Upgrade to ${suggestion.plan}`,
      action: () => {
        if (suggestion.type === 'package') {
          handlePackagePurchase(suggestion.key!);
        } else {
          // Redirect to subscription upgrade
          window.location.href = `/billing/upgrade?plan=${suggestion.plan}`;
        }
      }
    }))
  });
}
```

---

## React Components & Hooks

### Balance Display Hook

```typescript
import { useState, useEffect } from 'react';

export function useUserBalance(userId: string) {
  const [balance, setBalance] = useState<EnhancedBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    let mounted = true;
    
    async function fetchBalance() {
      try {
        setLoading(true);
        const balanceData = await getEnhancedBalance(userId);
        
        if (mounted) {
          setBalance(balanceData);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch balance');
          setBalance(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    
    fetchBalance();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [userId]);
  
  return { balance, loading, error, refetch: () => fetchBalance() };
}
```

### Balance Display Component

```typescript
import React from 'react';
import { useUserBalance } from './hooks/useUserBalance';

interface BalanceDisplayProps {
  userId: string;
  compact?: boolean;
}

export function BalanceDisplay({ userId, compact = false }: BalanceDisplayProps) {
  const { balance, loading, error } = useUserBalance(userId);
  
  if (loading) {
    return <div className="animate-pulse bg-gray-200 h-20 rounded" />;
  }
  
  if (error || !balance) {
    return (
      <div className="text-red-600 text-sm">
        Failed to load balance: {error}
      </div>
    );
  }
  
  const formatted = formatBalanceDisplay(balance);
  
  if (compact) {
    return (
      <div className="flex items-center space-x-2">
        <span className="text-lg font-semibold">{formatted.totalMinutes}m</span>
        <span className="text-sm text-gray-500">remaining</span>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">AI Time Balance</h3>
        <span className="text-sm text-gray-500 capitalize">
          {balance.plan_key} Plan
        </span>
      </div>
      
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold text-blue-600">
            {formatted.totalMinutes}
          </div>
          <div className="text-sm text-gray-500">Total Minutes</div>
        </div>
        
        <div>
          <div className="text-2xl font-bold text-green-600">
            {formatted.paidMinutes}
          </div>
          <div className="text-sm text-gray-500">Paid</div>
        </div>
        
        <div>
          <div className="text-2xl font-bold text-purple-600">
            {formatted.bonusMinutes}
          </div>
          <div className="text-sm text-gray-500">Bonus</div>
        </div>
      </div>
      
      {balance.plan_key === 'free' && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-sm text-gray-600">
            Monthly Bonus: {formatted.bonusUsedThisMonth} / {balance.bonus.monthly_cap_minutes} minutes used
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
            <div 
              className="bg-purple-600 h-2 rounded-full" 
              style={{ 
                width: `${(formatted.bonusUsedThisMonth / balance.bonus.monthly_cap_minutes) * 100}%` 
              }}
            />
          </div>
        </div>
      )}
      
      {formatted.nextExpiry && (
        <div className="mt-4 text-sm text-amber-600">
          ⏰ Next expiry: {formatted.nextExpiry.toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
```

### Usage Analytics Component

```typescript
import React from 'react';
import { Line } from 'react-chartjs-2';

interface UsageAnalyticsProps {
  userId: string;
  period: 'day' | 'month';
}

export function UsageAnalytics({ userId, period }: UsageAnalyticsProps) {
  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    getUsageAnalytics(userId, period)
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId, period]);
  
  if (loading || !analytics) {
    return <div>Loading analytics...</div>;
  }
  
  const formatted = formatUsageForChart(analytics);
  
  const chartData = {
    labels: formatted.dailyTrend.map(d => d.date),
    datasets: [{
      label: 'Minutes Used',
      data: formatted.dailyTrend.map(d => d.minutes),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4
    }]
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">
        Usage Analytics ({period === 'day' ? 'Today' : 'This Month'})
      </h3>
      
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div>
          <div className="text-3xl font-bold text-blue-600">
            {formatted.totalMinutes}
          </div>
          <div className="text-gray-500">Total Minutes Used</div>
        </div>
        
        <div>
          <div className="space-y-1">
            {formatted.operationBreakdown.map(op => (
              <div key={op.operation} className="flex justify-between text-sm">
                <span className="capitalize">{op.operation}:</span>
                <span>{op.minutes}m ({op.percentage}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      <div className="h-64">
        <Line data={chartData} options={{ maintainAspectRatio: false }} />
      </div>
    </div>
  );
}
```

---

## Integration Patterns

### 1. Polling Strategy (Current Implementation)

**Note**: Real-time updates via SSE will ship post-launch. Current implementation uses intelligent polling.

```typescript
// Optimized polling for balance updates
import { useQuery } from '@tanstack/react-query';

function useBalanceQuery(userId: string) {
  return useQuery({
    queryKey: ['balance', userId],
    queryFn: () => getEnhancedBalance(userId),
    staleTime: 30000,      // 30 seconds
    refetchInterval: 60000, // 1 minute  
    refetchOnWindowFocus: true
  });
}
```

### 2. Preemptive Balance Checks

```typescript
// Check balance before starting operations
async function startAIOperation(operationData: any) {
  const balance = await getEnhancedBalance(operationData.userId);
  
  // Estimate operation cost (could come from API)
  const estimatedSeconds = estimateOperationCost(operationData);
  
  if (balance.totals.total_seconds < estimatedSeconds) {
    // Show insufficient funds modal preemptively
    handleInsufficientFunds({
      error: 'INSUFFICIENT_AI_TIME',
      balance_seconds: balance.totals.total_seconds,
      // ... rest of error structure
    } as InsufficientFundsError);
    return;
  }
  
  // Proceed with operation
  return performAIOperation(operationData);
}
```

### 3. Currency-Aware Catalog Queries

```typescript
// Use currency filtering for localized pricing
function usePricingCatalogQuery(currency = 'USD') {
  return useQuery({
    queryKey: ['pricing-catalog', currency],
    queryFn: () => getPricingCatalog(currency),
    staleTime: 10 * 60 * 1000, // 10 minutes (catalogs change rarely)
    refetchOnWindowFocus: false
  });
}

// Updated API call to support currency filtering
async function getPricingCatalog(currency?: string): Promise<PricingCatalog> {
  const url = currency 
    ? `/v1/billing/catalog?currency=${currency}`
    : '/v1/billing/catalog';
    
  const response = await authenticatedFetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch pricing catalog');
  }
  
  return response.json();
}
```

### 4. Currency-Aware Purchase Flow

```typescript
// Purchase with currency preference
interface PurchaseRequest {
  package_key: string;
  currency?: 'USD' | 'EUR' | 'GBP' | 'EGP' | 'SAR' | 'AED';
}

interface PurchaseResponse {
  checkout_url: string;
  currency: string;
  unit_amount_cents: number;
  display_price: number;
  package_minutes: number;
  currency_fallback_from?: string;
  session_id: string;
}

async function purchasePackage(request: PurchaseRequest): Promise<PurchaseResponse> {
  const response = await authenticatedFetch('/v1/billing/packages/purchase', {
    method: 'POST',
    body: JSON.stringify(request)
  });
  
  if (!response.ok) {
    throw new Error('Failed to initiate purchase');
  }
  
  return response.json();
}

// React component for purchase flow
function PurchaseButton({ packageKey, userCurrency = 'USD' }: { 
  packageKey: string; 
  userCurrency?: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  
  const handlePurchase = async () => {
    setIsLoading(true);
    try {
      const result = await purchasePackage({
        package_key: packageKey,
        currency: userCurrency
      });
      
      // Show currency fallback notice if applicable
      if (result.currency_fallback_from) {
        console.log(`Note: ${result.currency_fallback_from} not available, using ${result.currency}`);
      }
      
      // Redirect to Stripe checkout
      window.location.href = result.checkout_url;
      
    } catch (error) {
      console.error('Purchase failed:', error);
      // Handle error
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <button onClick={handlePurchase} disabled={isLoading}>
      {isLoading ? 'Processing...' : 'Purchase'}
    </button>
  );
}
```

---

## 🆕 Expert-Recommended Features

### 1. Batch Operations Preflight Check

**Endpoint**: `POST /v1/billing/check-sufficient-batch`

```typescript
// 🆕 Batch balance checking to avoid multiple API calls
async function checkBatchOperations(
  userId: string,
  operations: BatchOperationRequest[]
): Promise<BatchOperationResult[]> {
  const response = await fetch('/v1/billing/check-sufficient-batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-HMAC-Signature': generateHMAC('POST', '/v1/billing/check-sufficient-batch', JSON.stringify({
        userId,
        operations
      }))
    },
    body: JSON.stringify({ userId, operations })
  });
  
  if (!response.ok) {
    throw new Error('Failed to check batch operations');
  }
  
  return response.json();
}

// React hook for batch operations
function useBatchOperationCheck(userId: string, operations: BatchOperationRequest[]) {
  return useQuery({
    queryKey: ['batch-check', userId, operations],
    queryFn: () => checkBatchOperations(userId, operations),
    enabled: operations.length > 0,
    staleTime: 30 * 1000 // 30 seconds
  });
}

// Example usage
function BatchOperationWarning({ userId }: { userId: string }) {
  const operations: BatchOperationRequest[] = [
    { operation: 'build', estimate_seconds: 120 },
    { operation: 'plan', estimate_seconds: 30 },
    { operation: 'export', estimate_seconds: 45 }
  ];
  
  const { data: batchCheck } = useBatchOperationCheck(userId, operations);
  
  const failedOperations = batchCheck?.filter(result => !result.ok) || [];
  
  if (failedOperations.length === 0) return null;
  
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
      <h3 className="text-amber-800 font-medium mb-2">
        ⚠️ Insufficient balance for {failedOperations.length} operations
      </h3>
      <ul className="text-amber-700 text-sm space-y-1">
        {failedOperations.map(op => (
          <li key={op.operation}>
            {op.operation}: Need {Math.ceil(op.deficit_seconds / 60)} more minutes
          </li>
        ))}
      </ul>
      <button className="mt-3 bg-amber-600 text-white px-4 py-2 rounded text-sm hover:bg-amber-700">
        Top Up Balance
      </button>
    </div>
  );
}
```

### 2. Resume Token Retry Logic

```typescript
// 🆕 Auto-retry with resume token after purchase
const RESUME_TOKEN_KEY = 'billing_resume_token';

// Store resume token when operation fails
function handleInsufficientFunds(error: InsufficientFundsError) {
  if (error.resume_token) {
    sessionStorage.setItem(RESUME_TOKEN_KEY, error.resume_token);
  }
  
  // Show upgrade modal
  showUpgradeModal({
    balance: error.breakdown_seconds,
    suggestions: error.suggestions,
    onPurchase: () => {
      // After purchase, user returns with ?purchased=true
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('purchased', 'true');
      window.location.href = currentUrl.toString();
    }
  });
}

// Auto-retry after purchase
useEffect(() => {
  const urlParams = new URLSearchParams(location.search);
  const resumeToken = sessionStorage.getItem(RESUME_TOKEN_KEY);
  
  if (urlParams.get('purchased') === 'true' && resumeToken) {
    // Auto-retry the blocked operation
    retryWithResumeToken(resumeToken);
    
    // Clean up
    sessionStorage.removeItem(RESUME_TOKEN_KEY);
    urlParams.delete('purchased');
    window.history.replaceState({}, '', `${location.pathname}?${urlParams}`);
  }
}, []);

async function retryWithResumeToken(token: string) {
  try {
    // Retry the original operation with resume token
    const result = await fetch('/v1/ai/build', {
      method: 'POST',
      headers: {
        'X-Resume-Token': token,
        'X-HMAC-Signature': generateHMAC('POST', '/v1/ai/build', requestBody)
      },
      body: requestBody
    });
    
    if (result.ok) {
      showSuccessNotification('Operation completed successfully!');
      // Continue with the result
    } else if (result.status === 402) {
      // Token expired or balance still insufficient
      showManualRetryButton();
    }
    
  } catch (error) {
    console.error('Resume failed:', error);
    showManualRetryButton();
  }
}

function showManualRetryButton() {
  // Show UI for manual retry
  toast.info(
    <div>
      Balance still insufficient. 
      <button onClick={() => window.location.reload()}>Try Again</button>
    </div>
  );
}
```

### 3. Currency-Aware UI Components

```typescript
// 🆕 Currency-aware pricing display
function PricingCard({ item, currency = 'USD' }: { 
  item: SubscriptionPlan | Package; 
  currency?: string;
}) {
  const { data: catalog } = usePricingCatalog(currency);
  
  return (
    <div className="border rounded-lg p-6">
      <h3 className="text-lg font-semibold">{item.name}</h3>
      <div className="text-2xl font-bold mt-2">
        ${item.price}
        {item.taxInclusive && (
          <span className="text-sm text-gray-500 ml-1">(incl. tax)</span>
        )}
      </div>
      <p className="text-gray-600 mt-1">{item.minutes} minutes</p>
      
      {catalog?.currency_fallback_from && (
        <div className="bg-blue-50 text-blue-700 text-sm p-2 rounded mt-3">
          💰 Charged in USD ({catalog.currency_fallback_from} not available)
        </div>
      )}
    </div>
  );
}

// 🆕 Catalog version change notification
function CatalogUpdateNotification() {
  const { data: catalog, isStale, refetch } = usePricingCatalog();
  
  if (!isStale) return null;
  
  return (
    <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
      💰 Prices updated - 
      <button 
        onClick={() => refetch()}
        className="text-blue-600 hover:text-blue-800 ml-1 underline"
      >
        Refresh
      </button>
    </div>
  );
}
```

### 4. Enhanced Error Handling

```typescript
// 🆕 Universal 402 error handler
export function handleBillingError(error: any): void {
  if (error.status === 402 && error.error === 'INSUFFICIENT_AI_TIME') {
    const billingError = error as InsufficientFundsError;
    
    // Store resume token
    if (billingError.resume_token) {
      sessionStorage.setItem(RESUME_TOKEN_KEY, billingError.resume_token);
    }
    
    // Show standardized upgrade modal
    showUpgradeModal({
      currentBalance: Math.floor(billingError.balance_seconds / 60),
      breakdown: {
        daily: Math.floor(billingError.breakdown_seconds.bonus_daily / 60),
        paid: Math.floor(billingError.breakdown_seconds.paid / 60)
      },
      suggestions: billingError.suggestions,
      catalogVersion: billingError.catalog_version
    });
  } else {
    // Handle other errors
    toast.error('An error occurred. Please try again.');
  }
}

// Use across all AI operations
async function performBuildOperation() {
  try {
    return await fetch('/v1/ai/build', { /* ... */ });
  } catch (error) {
    handleBillingError(error);
    throw error;
  }
}

async function performChatOperation() {
  try {
    return await fetch('/v1/ai/chat', { /* ... */ });
  } catch (error) {
    handleBillingError(error); // Same handler!
    throw error;
  }
}
```

---

## Best Practices (🆕 Updated with Expert Recommendations)

### 1. Error Handling
- ✅ **Universal 402 handler**: Use same error handling across all AI operations
- ✅ **Resume token storage**: Store tokens for post-purchase retry
- ✅ **Standardized suggestions**: Show consistent upgrade options
- ✅ **Graceful fallbacks**: Handle expired tokens and edge cases

### 2. Performance  
- ✅ **Currency-isolated ETag caching**: Cache per currency to prevent collisions
- ✅ **Batch preflight checks**: Use `/check-sufficient-batch` for bulk operations
- ✅ **Smart balance polling**: 30s stale time, 60s refetch interval
- ✅ **No user data caching**: `cacheTime: 0` for balance/usage (security)

### 3. User Experience
- ✅ **Catalog version notifications**: Light refresh banners (not intrusive)
- ✅ **Currency fallback handling**: Clear messaging when requested currency unavailable  
- ✅ **Tax inclusive display**: Show "(incl. tax)" when `taxInclusive: true`
- ✅ **Auto-retry after purchase**: Seamless experience with `?purchased=true` URL param
- ✅ **Batch operation warnings**: Warn users before starting insufficient operations

### 4. Security & Standards
- ✅ **No client-side FX conversion**: Server handles all currency resolution
- ✅ **HMAC signatures**: Required for all billing endpoints (except public catalog)
- ✅ **Resume token cleanup**: Auto-expire after 1 hour, clean on use
- ✅ **Session storage**: Use for tokens (not localStorage for security)

### 5. 🆕 Expert-Validated Patterns
- ✅ **Never migrate users automatically**: Let them upgrade when ready
- ✅ **Honor server price resolution**: Don't assume client-side pricing
- ✅ **UTC timestamps everywhere**: Client only handles display localization  
- ✅ **Plan metadata for gating**: Use `plan_key`, `subscription_status` from balance API

---

## Testing Integration

```typescript
// Mock functions for testing
export const mockBillingAPI = {
  getPricingCatalog: jest.fn(),
  getEnhancedBalance: jest.fn(),
  getUsageAnalytics: jest.fn(),
  getBillingEvents: jest.fn(),
  purchasePackage: jest.fn()
};

// Test helper
export function mockUserBalance(overrides: Partial<EnhancedBalance> = {}): EnhancedBalance {
  return {
    version: '2025-09-01',
    plan_key: 'free',
    subscription_status: 'active',
    totals: {
      total_seconds: 1800, // 30 minutes
      paid_seconds: 900,   // 15 minutes
      bonus_seconds: 900,  // 15 minutes
      next_expiry_at: '2025-09-02T00:00:00Z'
    },
    buckets: [
      {
        source: 'daily',
        seconds: 900,
        expires_at: '2025-09-02T00:00:00Z'
      },
      {
        source: 'subscription',
        seconds: 900,
        expires_at: '2025-10-01T00:00:00Z'
      }
    ],
    bonus: {
      daily_minutes: 15,
      used_this_month_minutes: 120,
      monthly_cap_minutes: 300
    },
    ...overrides
  };
}
```

---

## Migration from Legacy System

If migrating from an existing billing system:

```typescript
// Legacy balance structure
interface LegacyBalance {
  paid_seconds_remaining: number;
  welcome_bonus_seconds: number;
  daily_gift_used_today: number;
}

// Migration helper
function migrateLegacyBalance(legacy: LegacyBalance): EnhancedBalance {
  return {
    version: '2025-09-01',
    plan_key: 'free', // Default
    subscription_status: 'inactive',
    totals: {
      total_seconds: legacy.paid_seconds_remaining + legacy.welcome_bonus_seconds,
      paid_seconds: legacy.paid_seconds_remaining + legacy.welcome_bonus_seconds,
      bonus_seconds: Math.max(0, 900 - legacy.daily_gift_used_today),
      next_expiry_at: null
    },
    buckets: [
      ...(legacy.welcome_bonus_seconds > 0 ? [{
        source: 'welcome' as const,
        seconds: legacy.welcome_bonus_seconds,
        expires_at: null
      }] : []),
      ...(legacy.paid_seconds_remaining > 0 ? [{
        source: 'subscription' as const,
        seconds: legacy.paid_seconds_remaining,
        expires_at: null
      }] : [])
    ],
    bonus: {
      daily_minutes: 15,
      used_this_month_minutes: Math.floor(legacy.daily_gift_used_today / 60),
      monthly_cap_minutes: 300
    }
  };
}
```

---

This integration guide provides everything the frontend team needs to implement the expert-validated usage & billing system. The APIs are production-ready with comprehensive error handling, caching strategies, and user-friendly components.