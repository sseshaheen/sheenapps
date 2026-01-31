# Usage Tracking & Quota System

## Overview
The usage tracking system monitors resource consumption, enforces plan limits, and integrates with the bonus system to provide a seamless user experience.

## Database Schema

```sql
-- Real-time usage events
CREATE TABLE usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- 'ai_generation', 'export', 'api_call'
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_usage_events_user_date ON usage_events(user_id, created_at DESC);
CREATE INDEX idx_usage_events_type ON usage_events(event_type, created_at DESC);

-- Aggregated usage summary (updated periodically)
CREATE TABLE usage_summary (
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  metric_name VARCHAR(50) NOT NULL,
  usage_count INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, period_start, metric_name)
);

CREATE INDEX idx_usage_summary_user ON usage_summary(user_id);
CREATE INDEX idx_usage_summary_period ON usage_summary(period_start, period_end);

-- Usage limits cache
CREATE TABLE usage_limits (
  plan_name VARCHAR(50) PRIMARY KEY,
  limits JSONB NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Usage Tracking Service

### Core Implementation
```typescript
// src/services/usage/usage-tracking-service.ts
export class UsageTrackingService {
  /**
   * Track a usage event
   */
  async trackUsage(
    userId: string,
    eventType: 'ai_generation' | 'export' | 'project_created',
    eventData?: Record<string, any>
  ): Promise<void> {
    // Record raw event
    await supabase.from('usage_events').insert({
      user_id: userId,
      event_type: eventType,
      event_data: eventData || {}
    });

    // Update aggregated summary
    await this.updateUsageSummary(userId, eventType);

    // Check if user hit any limits
    await this.checkUsageLimits(userId, eventType);
  }

  /**
   * Update usage summary (batched)
   */
  private async updateUsageSummary(
    userId: string,
    metric: string
  ): Promise<void> {
    const now = new Date();
    const periodStart = startOfMonth(now);
    const periodEnd = endOfMonth(now);

    // Upsert usage summary
    await supabase.rpc('increment_usage_summary', {
      p_user_id: userId,
      p_period_start: periodStart.toISOString(),
      p_period_end: periodEnd.toISOString(),
      p_metric_name: metric,
      p_increment: 1
    });
  }

  /**
   * Get current usage for a metric
   */
  async getCurrentUsage(
    userId: string,
    metric: string,
    period?: { start: Date; end: Date }
  ): Promise<{
    usage: number;
    period: { start: Date; end: Date };
  }> {
    const now = new Date();
    const periodStart = period?.start || startOfMonth(now);
    const periodEnd = period?.end || endOfMonth(now);

    // Try summary first (faster)
    const { data: summary } = await supabase
      .from('usage_summary')
      .select('usage_count')
      .eq('user_id', userId)
      .eq('metric_name', metric)
      .eq('period_start', periodStart.toISOString())
      .single();

    if (summary) {
      return {
        usage: summary.usage_count,
        period: { start: periodStart, end: periodEnd }
      };
    }

    // Fall back to counting events
    const { count } = await supabase
      .from('usage_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', metric)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    return {
      usage: count || 0,
      period: { start: periodStart, end: periodEnd }
    };
  }

  /**
   * Check if user has quota available
   */
  async checkUserQuota(
    userId: string,
    metric: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
    baseRemaining: number;
    bonusRemaining: number;
    resetDate: Date;
  }> {
    // Get user subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan_name, status')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .single();

    const planName = subscription?.plan_name || 'free';
    
    // Get plan limits
    const limits = await this.getPlanLimits(planName);
    const baseLimit = limits[metric] || 0;

    // Get current usage
    const { usage } = await this.getCurrentUsage(userId, metric);
    const baseUsed = Math.min(usage, baseLimit);
    const baseRemaining = Math.max(0, baseLimit - usage);

    // Get bonus balance
    const bonusService = new BonusService();
    const bonusBalance = await bonusService.getBonusBalance(userId, metric);
    const bonusRemaining = bonusBalance.available;

    // Calculate totals
    const totalRemaining = baseRemaining + bonusRemaining;
    const resetDate = endOfMonth(new Date());

    return {
      allowed: totalRemaining > 0,
      remaining: totalRemaining,
      limit: baseLimit,
      baseRemaining,
      bonusRemaining,
      resetDate
    };
  }

  /**
   * Consume quota (with bonus fallback)
   */
  async consumeQuota(
    userId: string,
    metric: string,
    amount: number = 1
  ): Promise<{
    success: boolean;
    consumed: { base: number; bonus: number };
    remaining: number;
  }> {
    const quota = await this.checkUserQuota(userId, metric);
    
    if (!quota.allowed) {
      return {
        success: false,
        consumed: { base: 0, bonus: 0 },
        remaining: 0
      };
    }

    // Track usage
    await this.trackUsage(userId, metric);

    // Determine consumption source
    let baseConsumed = 0;
    let bonusConsumed = 0;

    if (quota.baseRemaining >= amount) {
      // Consume from base quota
      baseConsumed = amount;
    } else {
      // Consume remaining base + bonus
      baseConsumed = quota.baseRemaining;
      bonusConsumed = amount - baseConsumed;

      if (bonusConsumed > 0) {
        const bonusService = new BonusService();
        await bonusService.consumeBonus(userId, metric, bonusConsumed);
      }
    }

    return {
      success: true,
      consumed: { base: baseConsumed, bonus: bonusConsumed },
      remaining: quota.remaining - amount
    };
  }

  /**
   * Get plan limits with caching
   */
  private async getPlanLimits(planName: string): Promise<Record<string, number>> {
    // Check cache first
    const { data: cached } = await supabase
      .from('usage_limits')
      .select('limits')
      .eq('plan_name', planName)
      .single();

    if (cached && isWithinLastHour(cached.updated_at)) {
      return cached.limits;
    }

    // Get from pricing config
    const plan = PRICING_PLANS[planName];
    const limits = {
      ai_generations: plan.ai_generations,
      exports: plan.exports || 999999,
      projects: plan.projects || 999999,
      api_calls: plan.api_calls || 0
    };

    // Update cache
    await supabase
      .from('usage_limits')
      .upsert({
        plan_name: planName,
        limits,
        updated_at: new Date().toISOString()
      });

    return limits;
  }
}
```

## Quota Enforcement Middleware

### API Route Protection
```typescript
// src/middleware/quota-check.ts
export function withQuotaCheck(
  metric: string,
  amount: number = 1
) {
  return async function quotaMiddleware(
    request: NextRequest,
    params: any,
    next: () => Promise<Response>
  ): Promise<Response> {
    const userId = await requireAuth(request);
    const usageService = new UsageTrackingService();
    
    // Check quota
    const quota = await usageService.checkUserQuota(userId, metric);
    
    if (!quota.allowed) {
      return NextResponse.json({
        error: 'Quota exceeded',
        code: 'QUOTA_EXCEEDED',
        limit: quota.limit,
        usage: quota.limit - quota.baseRemaining,
        resetDate: quota.resetDate,
        upgradeUrl: '/pricing'
      }, { status: 429 });
    }

    // Add quota info to request
    (request as any).quota = quota;

    // Execute the handler
    const response = await next();

    // Track usage if successful
    if (response.ok) {
      await usageService.consumeQuota(userId, metric, amount);
    }

    return response;
  };
}
```

### Usage in API Routes
```typescript
// /api/ai/generate
export const POST = withQuotaCheck('ai_generations')(
  async (request: NextRequest) => {
    // Your generation logic here
    const result = await generateContent(request);
    
    // Include remaining quota in response
    const quota = (request as any).quota;
    return NextResponse.json({
      ...result,
      usage: {
        remaining: quota.remaining - 1,
        limit: quota.limit
      }
    });
  }
);
```

## API Endpoints

### Check Quota
```typescript
// /api/billing/check-quota
export async function GET(request: NextRequest) {
  const userId = await requireAuth(request);
  const { searchParams } = new URL(request.url);
  const metric = searchParams.get('metric') || 'ai_generations';
  
  const usageService = new UsageTrackingService();
  const quota = await usageService.checkUserQuota(userId, metric);
  
  return NextResponse.json({
    allowed: quota.allowed,
    remaining: quota.remaining,
    limit: quota.limit,
    usage: quota.limit - quota.baseRemaining,
    bonusRemaining: quota.bonusRemaining,
    resetDate: quota.resetDate
  });
}
```

### Track Usage
```typescript
// /api/billing/track-usage
export async function POST(request: NextRequest) {
  const userId = await requireAuth(request);
  const { metric, amount = 1, metadata } = await request.json();
  
  const usageService = new UsageTrackingService();
  const result = await usageService.consumeQuota(userId, metric, amount);
  
  if (!result.success) {
    return NextResponse.json({
      error: 'Quota exceeded',
      allowed: false
    }, { status: 429 });
  }
  
  return NextResponse.json({
    success: true,
    consumed: result.consumed,
    remaining: result.remaining
  });
}
```

### Usage Analytics
```typescript
// /api/billing/usage-analytics
export async function GET(request: NextRequest) {
  const userId = await requireAuth(request);
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'current';
  
  const usageService = new UsageTrackingService();
  const analytics = await usageService.getUsageAnalytics(userId, period);
  
  return NextResponse.json(analytics);
}
```

## Frontend Integration

### Usage Display Component
```typescript
export function UsageDisplay({ metric }: { metric: string }) {
  const { data: quota, loading } = useQuery({
    queryKey: ['quota', metric],
    queryFn: () => fetchQuota(metric),
    staleTime: 30000 // 30 seconds
  });

  if (loading) return <Skeleton />;

  const percentUsed = ((quota.limit - quota.baseRemaining) / quota.limit) * 100;
  const hasBonus = quota.bonusRemaining > 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{metric.replace(/_/g, ' ')}</span>
        <span>
          {quota.limit - quota.baseRemaining} / {quota.limit}
          {hasBonus && (
            <span className="text-green-600 ml-1">
              (+{quota.bonusRemaining})
            </span>
          )}
        </span>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${
            percentUsed > 90 ? 'bg-red-500' : 
            percentUsed > 75 ? 'bg-yellow-500' : 
            'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>
      
      {percentUsed >= 100 && !hasBonus && (
        <p className="text-xs text-red-600">
          Limit reached. <Link href="/pricing">Upgrade for more</Link>
        </p>
      )}
      
      <p className="text-xs text-gray-500">
        Resets {formatRelative(quota.resetDate, new Date())}
      </p>
    </div>
  );
}
```

### Quota Check Hook
```typescript
export function useQuotaCheck(metric: string) {
  const checkQuota = async () => {
    const response = await fetch(`/api/billing/check-quota?metric=${metric}`);
    const data = await response.json();
    return data;
  };

  const consumeQuota = async (amount = 1) => {
    const response = await fetch('/api/billing/track-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ metric, amount })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Quota exceeded');
    }
    
    return response.json();
  };

  return { checkQuota, consumeQuota };
}
```

## Background Jobs

### Usage Summary Aggregation
```typescript
// Run every 5 minutes
export async function aggregateUsageSummary(): Promise<void> {
  const cutoff = subMinutes(new Date(), 5);
  
  // Get unaggregated events
  const { data: events } = await supabase
    .from('usage_events')
    .select('user_id, event_type, COUNT(*)')
    .lt('created_at', cutoff.toISOString())
    .gt('created_at', subMinutes(cutoff, 5).toISOString())
    .group('user_id', 'event_type');

  // Update summaries
  for (const group of events || []) {
    await supabase.rpc('increment_usage_summary', {
      p_user_id: group.user_id,
      p_period_start: startOfMonth(cutoff).toISOString(),
      p_period_end: endOfMonth(cutoff).toISOString(),
      p_metric_name: group.event_type,
      p_increment: group.count
    });
  }
}
```

### Usage Alerts
```typescript
// Check for users approaching limits
export async function checkUsageAlerts(): Promise<void> {
  const alerts = await supabase.rpc('get_users_near_limit', {
    threshold_percentage: 90
  });

  for (const alert of alerts.data || []) {
    await sendUsageAlert(alert.user_id, alert.metric, alert.percentage_used);
  }
}
```

## Analytics Queries

### Usage Patterns
```sql
-- Daily usage trends
SELECT 
  DATE(created_at) as date,
  event_type,
  COUNT(*) as events,
  COUNT(DISTINCT user_id) as unique_users
FROM usage_events
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY date, event_type
ORDER BY date DESC;

-- Power users
SELECT 
  u.user_id,
  u.email,
  u.plan_name,
  SUM(us.usage_count) as total_usage,
  COUNT(DISTINCT us.metric_name) as metrics_used
FROM usage_summary us
JOIN users u ON us.user_id = u.id
WHERE us.period_start = DATE_TRUNC('month', NOW())
GROUP BY u.user_id, u.email, u.plan_name
ORDER BY total_usage DESC
LIMIT 100;

-- Feature adoption by plan
SELECT 
  s.plan_name,
  us.metric_name,
  COUNT(DISTINCT us.user_id) as users,
  AVG(us.usage_count) as avg_usage,
  MAX(us.usage_count) as max_usage
FROM usage_summary us
JOIN subscriptions s ON us.user_id = s.user_id
WHERE us.period_start = DATE_TRUNC('month', NOW())
  AND s.status = 'active'
GROUP BY s.plan_name, us.metric_name
ORDER BY s.plan_name, users DESC;
```

## Best Practices

### Do's
- Track usage in real-time
- Aggregate for performance
- Cache plan limits
- Show clear usage feedback
- Provide usage history

### Don'ts
- Don't block without clear limits
- Don't lose usage events
- Don't forget timezone handling
- Don't ignore bonus quotas
- Don't surprise users

## Performance Optimization

### Caching Strategy
```typescript
// Cache quota checks
const quotaCache = new Map<string, { data: any; expiry: number }>();

export async function getCachedQuota(userId: string, metric: string) {
  const key = `${userId}:${metric}`;
  const cached = quotaCache.get(key);
  
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }
  
  const quota = await checkUserQuota(userId, metric);
  quotaCache.set(key, {
    data: quota,
    expiry: Date.now() + 30000 // 30 seconds
  });
  
  return quota;
}
```

---

*Last Updated: 27 June 2025*