# Bonus Usage System

## Overview
The bonus system provides additional usage quota beyond subscription limits, with expiry tracking and automatic consumption when base limits are exceeded.

## Database Schema

```sql
CREATE TABLE usage_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  metric VARCHAR(50) NOT NULL, -- 'ai_generations', 'exports', 'projects'
  amount INTEGER NOT NULL,
  reason VARCHAR(100) NOT NULL, -- 'signup', 'referral', 'social_share', 'profile_complete'
  expires_at TIMESTAMP NOT NULL,
  consumed INTEGER DEFAULT 0,
  redeemed_at TIMESTAMP, -- First time bonus was used
  expiry_notified BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_usage_bonuses_user ON usage_bonuses(user_id);
CREATE INDEX idx_usage_bonuses_expires ON usage_bonuses(expires_at) WHERE archived = false;
CREATE INDEX idx_usage_bonuses_active ON usage_bonuses(user_id, metric) 
  WHERE consumed < amount AND expires_at > NOW() AND archived = false;
```

## Bonus Service Implementation

### Core Bonus Logic
```typescript
// src/services/payment/bonus-service.ts
export class BonusService {
  /**
   * Grant bonus usage to a user
   */
  async grantBonusUsage(
    userId: string,
    metric: 'ai_generations' | 'exports' | 'projects',
    amount: number,
    reason: string,
    expiresInDays: number = 30
  ): Promise<void> {
    const expiresAt = addDays(new Date(), expiresInDays);
    
    await supabase.from('usage_bonuses').insert({
      user_id: userId,
      metric,
      amount,
      reason,
      expires_at: expiresAt.toISOString()
    });

    // Track event
    await this.trackBonusGrant(userId, metric, amount, reason);
  }

  /**
   * Get available bonus balance for a user
   */
  async getBonusBalance(
    userId: string,
    metric: string
  ): Promise<{
    total: number;
    available: number;
    expiringSoon: number;
    nextExpiry: Date | null;
  }> {
    const { data: bonuses } = await supabase
      .from('usage_bonuses')
      .select('*')
      .eq('user_id', userId)
      .eq('metric', metric)
      .gt('expires_at', new Date().toISOString())
      .eq('archived', false)
      .order('expires_at', { ascending: true });

    const total = bonuses?.reduce((sum, b) => sum + b.amount, 0) || 0;
    const consumed = bonuses?.reduce((sum, b) => sum + b.consumed, 0) || 0;
    const available = total - consumed;

    // Calculate expiring in next 7 days
    const weekFromNow = addDays(new Date(), 7);
    const expiringSoon = bonuses?.reduce((sum, b) => {
      if (new Date(b.expires_at) <= weekFromNow) {
        return sum + (b.amount - b.consumed);
      }
      return sum;
    }, 0) || 0;

    const nextExpiry = bonuses?.[0]?.expires_at 
      ? new Date(bonuses[0].expires_at) 
      : null;

    return { total, available, expiringSoon, nextExpiry };
  }

  /**
   * Consume bonus usage (FIFO - oldest first)
   */
  async consumeBonus(
    userId: string,
    metric: string,
    amount: number
  ): Promise<{
    consumed: number;
    remaining: number;
  }> {
    // Get active bonuses ordered by expiry (FIFO)
    const { data: bonuses } = await supabase
      .from('usage_bonuses')
      .select('*')
      .eq('user_id', userId)
      .eq('metric', metric)
      .gt('expires_at', new Date().toISOString())
      .eq('archived', false)
      .order('expires_at', { ascending: true });

    let remainingToConsume = amount;
    const consumptionLog = [];

    for (const bonus of bonuses || []) {
      if (remainingToConsume <= 0) break;

      const available = bonus.amount - bonus.consumed;
      if (available <= 0) continue;

      const toConsume = Math.min(available, remainingToConsume);
      
      // Update bonus consumption
      await supabase
        .from('usage_bonuses')
        .update({
          consumed: bonus.consumed + toConsume,
          redeemed_at: bonus.redeemed_at || new Date().toISOString()
        })
        .eq('id', bonus.id);

      consumptionLog.push({
        bonusId: bonus.id,
        consumed: toConsume,
        reason: bonus.reason
      });

      remainingToConsume -= toConsume;
    }

    const totalConsumed = amount - remainingToConsume;
    
    // Track consumption
    if (totalConsumed > 0) {
      await this.trackBonusConsumption(userId, metric, totalConsumed, consumptionLog);
    }

    return {
      consumed: totalConsumed,
      remaining: remainingToConsume
    };
  }

  /**
   * Process bonus expiry
   */
  async processBonusExpiry(): Promise<void> {
    // Notify users about expiring bonuses (3 days before)
    const notificationCutoff = addDays(new Date(), 3);
    
    const { data: expiringBonuses } = await supabase
      .from('usage_bonuses')
      .select(`
        user_id,
        metric,
        SUM(amount - consumed) as expiring_amount,
        MIN(expires_at) as earliest_expiry
      `)
      .gt('expires_at', new Date().toISOString())
      .lte('expires_at', notificationCutoff.toISOString())
      .eq('expiry_notified', false)
      .eq('archived', false)
      .gt('amount', 'consumed')
      .group('user_id', 'metric');

    // Send notifications
    for (const bonus of expiringBonuses || []) {
      await this.sendExpiryNotification(bonus);
      
      // Mark as notified
      await supabase
        .from('usage_bonuses')
        .update({ expiry_notified: true })
        .eq('user_id', bonus.user_id)
        .eq('metric', bonus.metric)
        .lte('expires_at', notificationCutoff.toISOString());
    }

    // Archive expired bonuses
    await supabase
      .from('usage_bonuses')
      .update({
        archived: true,
        archived_at: new Date().toISOString()
      })
      .lt('expires_at', new Date().toISOString())
      .eq('archived', false);
  }
}
```

## Bonus Triggers

### Signup Bonus
```typescript
// Automatically grant on first subscription
export async function grantSignupBonus(userId: string): Promise<void> {
  const bonusService = new BonusService();
  
  // Check if already granted
  const existing = await supabase
    .from('usage_bonuses')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', 'signup')
    .single();

  if (!existing.data) {
    await bonusService.grantBonusUsage(
      userId,
      'ai_generations',
      10,
      'signup',
      30 // 30 days to use
    );
  }
}
```

### Referral Bonus
```typescript
// Grant when referral converts to paid
export async function grantReferralBonus(
  referrerUserId: string,
  referredUserId: string
): Promise<void> {
  const bonusService = new BonusService();
  
  // Bonus for referrer
  await bonusService.grantBonusUsage(
    referrerUserId,
    'ai_generations',
    25,
    'referral_success',
    60 // 60 days for referral bonuses
  );
  
  // Bonus for referred user
  await bonusService.grantBonusUsage(
    referredUserId,
    'ai_generations',
    10,
    'referred_signup',
    30
  );
}
```

### Social Share Bonus
```typescript
// Grant when user shares on social media
export async function grantSocialShareBonus(
  userId: string,
  platform: 'twitter' | 'linkedin' | 'facebook'
): Promise<void> {
  const bonusService = new BonusService();
  
  // Check if already granted for this platform
  const existing = await supabase
    .from('usage_bonuses')
    .select('id')
    .eq('user_id', userId)
    .eq('reason', `social_share_${platform}`)
    .single();

  if (!existing.data) {
    await bonusService.grantBonusUsage(
      userId,
      'ai_generations',
      5,
      `social_share_${platform}`,
      14 // 14 days to use
    );
  }
}
```

### Profile Completion Bonus
```typescript
// Grant when user completes profile
export async function grantProfileCompletionBonus(userId: string): Promise<void> {
  const bonusService = new BonusService();
  
  // Check profile completion
  const profile = await getUserProfile(userId);
  const isComplete = profile.name && 
                     profile.company && 
                     profile.avatar_url &&
                     profile.bio;

  if (isComplete) {
    const existing = await supabase
      .from('usage_bonuses')
      .select('id')
      .eq('user_id', userId)
      .eq('reason', 'profile_complete')
      .single();

    if (!existing.data) {
      await bonusService.grantBonusUsage(
        userId,
        'ai_generations',
        5,
        'profile_complete',
        30
      );
    }
  }
}
```

## Integration with Quota System

### Combined Quota Check
```typescript
export async function checkUserQuota(
  userId: string,
  metric: string
): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
  baseRemaining: number;
  bonusRemaining: number;
}> {
  // Get base subscription limits
  const subscription = await getUserSubscription(userId);
  const plan = PRICING_PLANS[subscription?.plan_name || 'free'];
  const baseLimit = plan.limits[metric] || 0;

  // Get current usage
  const { usage } = await getCurrentUsage(userId, metric);
  const baseRemaining = Math.max(0, baseLimit - usage);

  // Get bonus balance
  const bonusService = new BonusService();
  const bonusBalance = await bonusService.getBonusBalance(userId, metric);
  const bonusRemaining = bonusBalance.available;

  // Total remaining
  const totalRemaining = baseRemaining + bonusRemaining;

  return {
    allowed: totalRemaining > 0,
    remaining: totalRemaining,
    limit: baseLimit,
    baseRemaining,
    bonusRemaining
  };
}
```

### Usage Tracking with Bonus Consumption
```typescript
export async function trackUsage(
  userId: string,
  metric: string,
  amount: number = 1
): Promise<void> {
  // Record usage event
  await supabase.from('usage_events').insert({
    user_id: userId,
    event_type: metric,
    event_data: { amount },
    created_at: new Date().toISOString()
  });

  // Update usage summary
  const { usage } = await getCurrentUsage(userId, metric);
  const subscription = await getUserSubscription(userId);
  const baseLimit = PRICING_PLANS[subscription?.plan_name || 'free'].limits[metric];

  // If exceeding base limit, consume bonus
  if (usage >= baseLimit) {
    const bonusService = new BonusService();
    await bonusService.consumeBonus(userId, metric, amount);
  }
}
```

## Notification System

### Bonus Expiry Notifications
```typescript
// src/app/api/cron/bonus-notifications/route.ts
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const bonusService = new BonusService();
  await bonusService.processBonusExpiry();

  return NextResponse.json({ success: true });
}
```

### Email Templates
```typescript
// Bonus expiry reminder
const expiryTemplate = {
  subject: 'Your bonus credits are expiring soon!',
  html: `
    <p>Hi {{name}},</p>
    <p>You have <strong>{{expiring_amount}} bonus {{metric}}</strong> expiring on <strong>{{expiry_date}}</strong>.</p>
    <p>Don't let them go to waste! <a href="{{app_url}}">Use them now</a></p>
  `
};

// Bonus granted notification
const grantedTemplate = {
  subject: 'You've earned bonus credits!',
  html: `
    <p>Hi {{name}},</p>
    <p>Great news! You've earned <strong>{{amount}} bonus {{metric}}</strong> for {{reason_friendly}}.</p>
    <p>These credits expire on {{expiry_date}}, so be sure to use them!</p>
    <p><a href="{{app_url}}">Start using your bonus</a></p>
  `
};
```

## Frontend Display

### Bonus Balance Component
```typescript
export function BonusBalance({ metric }: { metric: string }) {
  const { data: balance } = useQuery({
    queryKey: ['bonus-balance', metric],
    queryFn: () => fetchBonusBalance(metric)
  });

  if (!balance?.available) return null;

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-green-800">
            Bonus {metric}: {balance.available}
          </p>
          {balance.expiringSoon > 0 && (
            <p className="text-xs text-green-600 mt-1">
              {balance.expiringSoon} expiring soon
            </p>
          )}
        </div>
        <Tooltip content={`Expires ${formatDate(balance.nextExpiry)}`}>
          <Clock className="w-4 h-4 text-green-600" />
        </Tooltip>
      </div>
    </div>
  );
}
```

## Best Practices

### Do's
- Use FIFO consumption (oldest bonuses first)
- Send expiry notifications in advance
- Track bonus effectiveness metrics
- Set reasonable expiry periods
- Show bonus balance clearly in UI

### Don'ts
- Don't allow bonus stacking abuse
- Don't forget to archive expired bonuses
- Don't grant duplicate bonuses
- Don't make expiry too short
- Don't hide bonus terms

## Analytics Queries

### Bonus Effectiveness
```sql
-- Bonus redemption rate by type
SELECT 
  reason,
  COUNT(DISTINCT user_id) as users_granted,
  COUNT(DISTINCT CASE WHEN redeemed_at IS NOT NULL THEN user_id END) as users_redeemed,
  SUM(amount) as total_granted,
  SUM(consumed) as total_consumed,
  ROUND(AVG(consumed::float / NULLIF(amount, 0) * 100), 2) as avg_consumption_rate
FROM usage_bonuses
GROUP BY reason
ORDER BY users_granted DESC;

-- Bonus impact on conversion
SELECT 
  b.reason,
  COUNT(DISTINCT b.user_id) as bonus_users,
  COUNT(DISTINCT s.customer_id) as converted_users,
  ROUND(COUNT(DISTINCT s.customer_id)::float / COUNT(DISTINCT b.user_id) * 100, 2) as conversion_rate
FROM usage_bonuses b
LEFT JOIN subscriptions s ON b.user_id = s.customer_id 
  AND s.created_at > b.created_at
  AND s.created_at < b.expires_at
GROUP BY b.reason;
```

---

*Last Updated: 27 June 2025*