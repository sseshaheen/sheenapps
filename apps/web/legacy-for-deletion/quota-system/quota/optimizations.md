# Quota System Performance Optimizations

## 1. Supabase Client Caching

Instead of creating new Supabase clients on every request, implement a singleton pattern:

```typescript
// src/lib/supabase-singleton.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

let serverClient: any = null

export function getServerSupabaseClient() {
  if (!serverClient || process.env.NODE_ENV === 'development') {
    const cookieStore = cookies()

    serverClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )
  }
  
  return serverClient
}
```

## 2. Query Optimization for Monitoring

Add composite indexes:

```sql
-- Optimize quota status queries
CREATE INDEX idx_usage_tracking_composite 
ON usage_tracking(user_id, metric_name, period_start DESC);

-- Optimize audit log queries
CREATE INDEX idx_audit_log_user_time 
ON quota_audit_log(user_id, created_at DESC);

-- Optimize realtime monitoring queries
CREATE INDEX idx_audit_log_success_time 
ON quota_audit_log(success, created_at DESC) 
WHERE success = false;
```

## 3. Rate Limiting Implementation

```typescript
// src/middleware/rate-limit.ts
import { LRUCache } from 'lru-cache'

const rateLimitCache = new LRUCache<string, number[]>({
  max: 10000, // Max 10k users tracked
  ttl: 60 * 1000, // 1 minute TTL
})

export function rateLimit(
  maxRequests: number = 100,
  windowMs: number = 60 * 1000
) {
  return async (req: Request, userId: string) => {
    const key = `${userId}:${req.url}`
    const now = Date.now()
    const windowStart = now - windowMs
    
    // Get existing timestamps
    const timestamps = rateLimitCache.get(key) || []
    
    // Filter to current window
    const recentTimestamps = timestamps.filter(t => t > windowStart)
    
    if (recentTimestamps.length >= maxRequests) {
      throw new Error('Rate limit exceeded')
    }
    
    // Add current timestamp
    recentTimestamps.push(now)
    rateLimitCache.set(key, recentTimestamps)
  }
}
```

## 4. Circuit Breaker for External Services

```typescript
// src/services/circuit-breaker.ts
export class CircuitBreaker {
  private failures = 0
  private lastFailureTime = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'
  private readonly threshold = 5
  private readonly timeout = 60000 // 1 minute
  
  async execute<T>(
    fn: () => Promise<T>,
    fallback?: () => T
  ): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open'
      } else if (fallback) {
        return fallback()
      } else {
        throw new Error('Circuit breaker is open')
      }
    }
    
    try {
      const result = await fn()
      if (this.state === 'half-open') {
        this.state = 'closed'
        this.failures = 0
      }
      return result
    } catch (error) {
      this.failures++
      this.lastFailureTime = Date.now()
      
      if (this.failures >= this.threshold) {
        this.state = 'open'
      }
      
      if (fallback) {
        return fallback()
      }
      throw error
    }
  }
}
```

## 5. Batch Processing for Monitoring Queries

```typescript
// src/services/quota/batch-processor.ts
export class BatchProcessor {
  private queue: Map<string, Promise<any>> = new Map()
  private batchTimeout: NodeJS.Timeout | null = null
  
  async getUsersNearLimit(threshold: number): Promise<any[]> {
    const key = `near-limit-${threshold}`
    
    // Check if we already have a pending request
    if (this.queue.has(key)) {
      return this.queue.get(key)!
    }
    
    // Create batch promise
    const promise = this.processBatch(key, threshold)
    this.queue.set(key, promise)
    
    // Clean up after completion
    promise.finally(() => {
      this.queue.delete(key)
    })
    
    return promise
  }
  
  private async processBatch(key: string, threshold: number) {
    // Wait a bit to collect more requests
    await new Promise(resolve => setTimeout(resolve, 10))
    
    // Process the batch
    return QuotaMonitoring.getUsersNearLimit(threshold)
  }
}
```

## 6. Implement Request Deduplication

```typescript
// src/services/quota/request-dedup.ts
const pendingRequests = new Map<string, Promise<any>>()

export async function deduplicatedRequest<T>(
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check if request is already in flight
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!
  }
  
  // Create new request
  const promise = fn().finally(() => {
    // Clean up after completion
    pendingRequests.delete(key)
  })
  
  pendingRequests.set(key, promise)
  return promise
}
```

## 7. Add Monitoring Metrics

```typescript
// src/services/quota/metrics.ts
export class QuotaMetrics {
  private static metrics = {
    quotaChecks: 0,
    quotaDenials: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgResponseTime: 0,
    p95ResponseTime: 0,
  }
  
  static increment(metric: keyof typeof QuotaMetrics.metrics) {
    this.metrics[metric]++
  }
  
  static recordResponseTime(ms: number) {
    // Simple moving average
    this.metrics.avgResponseTime = 
      (this.metrics.avgResponseTime * 0.95) + (ms * 0.05)
  }
  
  static getMetrics() {
    return { ...this.metrics }
  }
}
```

## Implementation Priority

1. **Immediate**: Fix idempotency and memory leaks (DONE ✅)
2. **High**: Add missing database indexes and RPC functions (DONE ✅)
3. **Medium**: Implement rate limiting and circuit breakers
4. **Low**: Add monitoring metrics and batch processing

These optimizations will significantly improve the performance and reliability of the quota system.