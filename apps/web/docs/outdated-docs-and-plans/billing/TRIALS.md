# Trial Period System

## Overview
The trial system provides new users with a 14-day free trial of paid features, with eligibility checks to prevent abuse and automated notifications to maximize conversion.

## Database Schema

```sql
-- Trial fields in subscriptions table
ALTER TABLE subscriptions
  ADD COLUMN trial_start TIMESTAMP,
  ADD COLUMN trial_end TIMESTAMP,
  ADD COLUMN is_trial BOOLEAN DEFAULT FALSE,
  ADD COLUMN trial_notification_sent BOOLEAN DEFAULT FALSE;

-- Trial history tracking (prevent multiple trials)
CREATE TABLE trial_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  email VARCHAR(255),
  trial_start TIMESTAMP,
  trial_end TIMESTAMP,
  converted BOOLEAN DEFAULT FALSE,
  conversion_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_trial_history_user ON trial_history(user_id);
CREATE INDEX idx_trial_history_email ON trial_history(email);
```

## Trial Service Implementation

### Core Trial Logic
```typescript
// src/services/payment/trial-service.ts
export class TrialService {
  private readonly TRIAL_DURATION_DAYS = 14;
  
  /**
   * Start a trial for a new user
   */
  async startTrial(userId: string, planName: string): Promise<{
    success: boolean;
    subscription?: any;
    error?: string;
  }> {
    // Check eligibility
    const eligible = await this.checkTrialEligibility(userId);
    if (!eligible.canStartTrial) {
      return { success: false, error: eligible.reason };
    }

    // Create subscription with trial
    const subscription = await this.createTrialSubscription({
      userId,
      planName,
      trialStart: new Date(),
      trialEnd: addDays(new Date(), this.TRIAL_DURATION_DAYS),
      isTrial: true
    });

    // Record trial history
    await this.recordTrialStart(userId, subscription);

    return { success: true, subscription };
  }

  /**
   * Check if user is eligible for a trial
   */
  async checkTrialEligibility(userId: string): Promise<{
    canStartTrial: boolean;
    reason?: string;
  }> {
    // Check by user ID
    const previousTrialByUser = await supabase
      .from('trial_history')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (previousTrialByUser.data) {
      return { 
        canStartTrial: false, 
        reason: 'You have already used your free trial' 
      };
    }

    // Check by email (prevent creating new accounts)
    const user = await supabase.auth.getUser();
    const previousTrialByEmail = await supabase
      .from('trial_history')
      .select('id')
      .eq('email', user.data.user?.email)
      .single();

    if (previousTrialByEmail.data) {
      return { 
        canStartTrial: false, 
        reason: 'A trial has already been used with this email' 
      };
    }

    // Check for existing active subscription
    const activeSubscription = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .single();

    if (activeSubscription.data) {
      return { 
        canStartTrial: false, 
        reason: 'You already have an active subscription' 
      };
    }

    return { canStartTrial: true };
  }

  /**
   * Extend trial period (e.g., via referral)
   */
  async extendTrial(userId: string, additionalDays: number, reason: string): Promise<{
    success: boolean;
    newEndDate?: Date;
    error?: string;
  }> {
    const subscription = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_trial', true)
      .eq('status', 'trialing')
      .single();

    if (!subscription.data) {
      return { success: false, error: 'No active trial found' };
    }

    const currentEnd = new Date(subscription.data.trial_end);
    const newEnd = addDays(currentEnd, additionalDays);

    // Update subscription
    await supabase
      .from('subscriptions')
      .update({ 
        trial_end: newEnd.toISOString(),
        metadata: {
          ...subscription.data.metadata,
          trial_extensions: [
            ...(subscription.data.metadata?.trial_extensions || []),
            { days: additionalDays, reason, date: new Date().toISOString() }
          ]
        }
      })
      .eq('id', subscription.data.id);

    // Update Stripe if using Stripe
    if (subscription.data.stripe_subscription_id) {
      await stripe.subscriptions.update(subscription.data.stripe_subscription_id, {
        trial_end: Math.floor(newEnd.getTime() / 1000)
      });
    }

    return { success: true, newEndDate: newEnd };
  }

  /**
   * Get trial analytics
   */
  async getTrialAnalytics(dateRange?: { start: Date; end: Date }): Promise<{
    totalTrials: number;
    activeTrials: number;
    conversions: number;
    conversionRate: number;
    avgDaysToConvert: number;
    trialsByPlan: Record<string, number>;
  }> {
    // Implementation in trial-service.ts
  }
}
```

## Trial Notification System

### Automated Reminders
```typescript
// src/services/payment/trial-notifications.ts
export class TrialNotificationService {
  /**
   * Send trial ending reminders
   */
  async sendTrialEndingReminders(): Promise<void> {
    // 7 days before end
    await this.sendReminder(7, 'trial_ending_7_days');
    
    // 3 days before end
    await this.sendReminder(3, 'trial_ending_3_days');
    
    // 1 day before end
    await this.sendReminder(1, 'trial_ending_1_day');
    
    // Day of expiry
    await this.sendExpiryNotice();
  }

  private async sendReminder(daysBeforeEnd: number, templateId: string): Promise<void> {
    const trials = await supabase
      .from('subscriptions')
      .select(`
        *,
        users!inner(email, name)
      `)
      .eq('is_trial', true)
      .eq('status', 'trialing')
      .gte('trial_end', addDays(new Date(), daysBeforeEnd - 1).toISOString())
      .lt('trial_end', addDays(new Date(), daysBeforeEnd).toISOString())
      .is(`metadata->notifications->${templateId}`, null);

    for (const trial of trials.data || []) {
      await this.notificationService.send({
        to: trial.users.email,
        template: templateId,
        data: {
          name: trial.users.name,
          trialEndDate: trial.trial_end,
          daysRemaining: daysBeforeEnd,
          upgradeUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/pricing`
        }
      });

      // Mark as sent
      await supabase
        .from('subscriptions')
        .update({
          metadata: {
            ...trial.metadata,
            notifications: {
              ...trial.metadata?.notifications,
              [templateId]: new Date().toISOString()
            }
          }
        })
        .eq('id', trial.id);
    }
  }
}
```

## API Endpoints

### Check Trial Eligibility
```typescript
// /api/trials/check-eligibility
export async function GET(request: NextRequest) {
  const userId = await requireAuth(request);
  const trialService = new TrialService();
  
  const eligibility = await trialService.checkTrialEligibility(userId);
  
  return NextResponse.json(eligibility);
}
```

### Start Trial
```typescript
// /api/trials/start
export async function POST(request: NextRequest) {
  const userId = await requireAuth(request);
  const { planName } = await request.json();
  
  const trialService = new TrialService();
  const result = await trialService.startTrial(userId, planName);
  
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  
  return NextResponse.json({
    success: true,
    subscription: result.subscription,
    trialEndDate: result.subscription.trial_end
  });
}
```

### Extend Trial (Referral)
```typescript
// /api/trials/extend
export async function POST(request: NextRequest) {
  const userId = await requireAuth(request);
  const { referralCode } = await request.json();
  
  // Verify referral code
  const referral = await verifyReferralCode(referralCode, userId);
  if (!referral.valid) {
    return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
  }
  
  // Extend trial by 7 days for valid referral
  const trialService = new TrialService();
  const result = await trialService.extendTrial(userId, 7, 'referral_bonus');
  
  return NextResponse.json(result);
}
```

### Trial Analytics
```typescript
// /api/trials/analytics
export async function GET(request: NextRequest) {
  await requireAdmin(request);
  
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  
  const trialService = new TrialService();
  const analytics = await trialService.getTrialAnalytics({
    start: start ? new Date(start) : undefined,
    end: end ? new Date(end) : undefined
  });
  
  return NextResponse.json(analytics);
}
```

## Cron Jobs

### Trial Notification Cron
```typescript
// /api/cron/trial-notifications
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const notificationService = new TrialNotificationService();
  await notificationService.sendTrialEndingReminders();
  
  return NextResponse.json({ success: true });
}
```

### Trial Conversion Tracking
```typescript
// Run daily to update conversion metrics
export async function trackTrialConversions(): Promise<void> {
  // Find trials that ended in the last 30 days
  const endedTrials = await supabase
    .from('subscriptions')
    .select('*')
    .eq('is_trial', true)
    .lte('trial_end', new Date().toISOString())
    .gte('trial_end', subDays(new Date(), 30).toISOString());

  for (const trial of endedTrials.data || []) {
    // Check if converted to paid
    const paidSubscription = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', trial.user_id)
      .eq('is_trial', false)
      .in('status', ['active'])
      .single();

    if (paidSubscription.data) {
      // Update trial history
      await supabase
        .from('trial_history')
        .update({
          converted: true,
          conversion_date: paidSubscription.data.created_at
        })
        .eq('user_id', trial.user_id);
    }
  }
}
```

## Frontend Integration

### Trial Banner Component
```typescript
export function TrialBanner({ subscription }: { subscription: any }) {
  if (!subscription?.is_trial) return null;
  
  const daysRemaining = differenceInDays(
    new Date(subscription.trial_end),
    new Date()
  );
  
  if (daysRemaining <= 0) return null;
  
  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-blue-700">
            Your trial ends in <strong>{daysRemaining} days</strong>
          </p>
        </div>
        <Button
          onClick={() => router.push('/pricing')}
          size="sm"
        >
          Upgrade Now
        </Button>
      </div>
    </div>
  );
}
```

## Best Practices

### Do's
- Always check eligibility before starting trials
- Send timely reminders to maximize conversion
- Track trial analytics for optimization
- Allow trial extensions for engagement (referrals)
- Show clear trial status in UI

### Don'ts
- Don't allow multiple trials per user/email
- Don't auto-charge without clear communication
- Don't hide trial limitations
- Don't forget to sync with payment gateway
- Don't extend trials indefinitely

## Testing

### Test Scenarios
1. **New User Trial Start**
   - Verify eligibility check passes
   - Confirm trial dates are set correctly
   - Check trial history is recorded

2. **Duplicate Trial Prevention**
   - Test with same user ID
   - Test with same email, different account
   - Verify appropriate error messages

3. **Trial Extension**
   - Test referral code validation
   - Verify extension adds to current end date
   - Check maximum extension limits

4. **Trial Notifications**
   - Test each reminder interval
   - Verify no duplicate sends
   - Check email content accuracy

---

*Last Updated: 27 June 2025*