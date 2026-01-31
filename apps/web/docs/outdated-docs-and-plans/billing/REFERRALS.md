# Referral Attribution System

## Overview
The referral system tracks user acquisition sources, rewards successful referrals, and provides revenue attribution for growth analytics.

## Database Schema

```sql
-- Referral tracking table
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID REFERENCES auth.users,
  referred_user_id UUID REFERENCES auth.users,
  referral_code VARCHAR(50) UNIQUE,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'converted', 'expired'
  converted_at TIMESTAMP,
  conversion_plan VARCHAR(50), -- Which plan they subscribed to
  referrer_bonus_granted BOOLEAN DEFAULT FALSE,
  referred_bonus_granted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX idx_referrals_code ON referrals(referral_code);
CREATE INDEX idx_referrals_status ON referrals(status, created_at);
CREATE INDEX idx_referrals_referrer ON referrals(referrer_user_id);

-- User referral codes
CREATE TABLE user_referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users UNIQUE,
  referral_code VARCHAR(50) UNIQUE NOT NULL,
  share_url VARCHAR(255),
  total_referrals INTEGER DEFAULT 0,
  successful_referrals INTEGER DEFAULT 0,
  total_revenue_attributed DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Attribution tracking for all users
CREATE TABLE user_attribution (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  referral_code VARCHAR(50),
  referrer_user_id UUID REFERENCES auth.users,
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_content VARCHAR(255),
  utm_term VARCHAR(255),
  landing_page VARCHAR(500),
  first_touch_date TIMESTAMP DEFAULT NOW(),
  attribution_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Referral Service Implementation

### Core Referral Logic
```typescript
// src/services/payment/referral-service.ts
export class ReferralService {
  /**
   * Generate unique referral code for user
   */
  async generateReferralCode(userId: string): Promise<string> {
    // Check if user already has a code
    const existing = await supabase
      .from('user_referral_codes')
      .select('referral_code')
      .eq('user_id', userId)
      .single();

    if (existing.data) {
      return existing.data.referral_code;
    }

    // Generate unique code
    const user = await getUserProfile(userId);
    const baseCode = user.name
      ? user.name.split(' ')[0].toLowerCase()
      : 'user';
    
    let code = `${baseCode}${Math.random().toString(36).substr(2, 6)}`;
    let attempts = 0;

    // Ensure uniqueness
    while (attempts < 10) {
      const exists = await supabase
        .from('user_referral_codes')
        .select('id')
        .eq('referral_code', code)
        .single();

      if (!exists.data) break;
      
      code = `${baseCode}${Math.random().toString(36).substr(2, 6)}`;
      attempts++;
    }

    // Save code
    await supabase.from('user_referral_codes').insert({
      user_id: userId,
      referral_code: code,
      share_url: `${process.env.NEXT_PUBLIC_BASE_URL}?ref=${code}`
    });

    return code;
  }

  /**
   * Capture referral attribution at signup
   */
  async captureAttribution(request: Request, userId: string): Promise<void> {
    const url = new URL(request.url);
    const referralCode = url.searchParams.get('ref') || url.searchParams.get('referral');
    const utmSource = url.searchParams.get('utm_source');
    const utmMedium = url.searchParams.get('utm_medium');
    const utmCampaign = url.searchParams.get('utm_campaign');
    const utmContent = url.searchParams.get('utm_content');
    const utmTerm = url.searchParams.get('utm_term');

    let referrerUserId = null;

    // Match referral code to referrer
    if (referralCode) {
      const referrer = await supabase
        .from('user_referral_codes')
        .select('user_id')
        .eq('referral_code', referralCode)
        .single();

      if (referrer.data) {
        referrerUserId = referrer.data.user_id;

        // Create pending referral record
        await supabase.from('referrals').insert({
          referrer_user_id: referrerUserId,
          referred_user_id: userId,
          referral_code: referralCode,
          status: 'pending'
        });
      }
    }

    // Store attribution data
    await supabase.from('user_attribution').insert({
      user_id: userId,
      referral_code: referralCode,
      referrer_user_id: referrerUserId,
      utm_source: utmSource,
      utm_medium: utmMedium,
      utm_campaign: utmCampaign,
      utm_content: utmContent,
      utm_term: utmTerm,
      landing_page: url.pathname,
      first_touch_date: new Date().toISOString()
    });
  }

  /**
   * Process referral conversion after payment
   */
  async processReferralConversion(
    referredUserId: string,
    subscriptionPlan: string,
    transactionId: string
  ): Promise<void> {
    // Find pending referral
    const { data: referral } = await supabase
      .from('referrals')
      .select('*')
      .eq('referred_user_id', referredUserId)
      .eq('status', 'pending')
      .single();

    if (!referral) return;

    // Update referral status
    await supabase
      .from('referrals')
      .update({
        status: 'converted',
        converted_at: new Date().toISOString(),
        conversion_plan: subscriptionPlan
      })
      .eq('id', referral.id);

    // Grant bonuses
    const bonusService = new BonusService();
    
    // Referrer gets 25 AI generations
    if (!referral.referrer_bonus_granted) {
      await bonusService.grantBonusUsage(
        referral.referrer_user_id,
        'ai_generations',
        25,
        'referral_success',
        60 // 60 days to use
      );

      await supabase
        .from('referrals')
        .update({ referrer_bonus_granted: true })
        .eq('id', referral.id);
    }

    // Referred user gets 10 AI generations
    if (!referral.referred_bonus_granted) {
      await bonusService.grantBonusUsage(
        referredUserId,
        'ai_generations',
        10,
        'referred_signup',
        30
      );

      await supabase
        .from('referrals')
        .update({ referred_bonus_granted: true })
        .eq('id', referral.id);
    }

    // Update referrer stats
    await this.updateReferrerStats(referral.referrer_user_id);

    // Track revenue attribution
    await this.trackRevenueAttribution(transactionId, referral.referrer_user_id);

    // Send notifications
    await this.sendConversionNotifications(referral);
  }

  /**
   * Update referrer statistics
   */
  async updateReferrerStats(referrerUserId: string): Promise<void> {
    const stats = await supabase
      .from('referrals')
      .select('status')
      .eq('referrer_user_id', referrerUserId);

    const total = stats.data?.length || 0;
    const successful = stats.data?.filter(r => r.status === 'converted').length || 0;

    await supabase
      .from('user_referral_codes')
      .update({
        total_referrals: total,
        successful_referrals: successful
      })
      .eq('user_id', referrerUserId);
  }

  /**
   * Get referral analytics
   */
  async getReferralAnalytics(userId?: string): Promise<{
    totalReferrals: number;
    successfulReferrals: number;
    conversionRate: number;
    revenueAttributed: number;
    topReferrers: Array<{
      userId: string;
      name: string;
      referrals: number;
      revenue: number;
    }>;
  }> {
    if (userId) {
      // Individual user analytics
      const { data: stats } = await supabase
        .from('user_referral_codes')
        .select('*')
        .eq('user_id', userId)
        .single();

      return {
        totalReferrals: stats?.total_referrals || 0,
        successfulReferrals: stats?.successful_referrals || 0,
        conversionRate: stats?.total_referrals 
          ? (stats.successful_referrals / stats.total_referrals * 100) 
          : 0,
        revenueAttributed: stats?.total_revenue_attributed || 0,
        topReferrers: []
      };
    }

    // Global analytics
    // Implementation details...
  }
}
```

## API Endpoints

### Get Referral Code
```typescript
// /api/referrals/code
export async function GET(request: NextRequest) {
  const userId = await requireAuth(request);
  const referralService = new ReferralService();
  
  const code = await referralService.generateReferralCode(userId);
  const stats = await referralService.getReferralAnalytics(userId);
  
  return NextResponse.json({
    referralCode: code,
    shareUrl: `${process.env.NEXT_PUBLIC_BASE_URL}?ref=${code}`,
    stats
  });
}
```

### Track Referral Click
```typescript
// /api/referrals/track
export async function POST(request: NextRequest) {
  const { referralCode } = await request.json();
  
  // Validate referral code
  const { data: referrer } = await supabase
    .from('user_referral_codes')
    .select('user_id')
    .eq('referral_code', referralCode)
    .single();

  if (!referrer) {
    return NextResponse.json({ valid: false });
  }

  // Track click (optional)
  await supabase.from('referral_clicks').insert({
    referral_code: referralCode,
    ip_address: request.headers.get('x-forwarded-for'),
    user_agent: request.headers.get('user-agent'),
    clicked_at: new Date().toISOString()
  });

  return NextResponse.json({ 
    valid: true,
    referralCode 
  });
}
```

## Frontend Integration

### Referral Link Component
```typescript
export function ReferralLink() {
  const { data, loading } = useQuery({
    queryKey: ['referral-code'],
    queryFn: fetchReferralCode
  });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(data.shareUrl);
    toast.success('Referral link copied!');
  };

  if (loading) return <Skeleton />;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">Invite Friends & Earn</h3>
      
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">Your referral link:</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={data.shareUrl}
            readOnly
            className="flex-1 px-3 py-2 border rounded-md bg-gray-50"
          />
          <Button onClick={copyToClipboard}>
            <Copy className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold">{data.stats.totalReferrals}</p>
          <p className="text-sm text-gray-600">Total Referrals</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{data.stats.successfulReferrals}</p>
          <p className="text-sm text-gray-600">Successful</p>
        </div>
      </div>

      <div className="space-y-2">
        <ShareButton platform="twitter" url={data.shareUrl} />
        <ShareButton platform="linkedin" url={data.shareUrl} />
        <ShareButton platform="facebook" url={data.shareUrl} />
      </div>
    </div>
  );
}
```

### Referral Attribution Capture
```typescript
// In signup flow
export function SignupPage() {
  useEffect(() => {
    // Capture attribution data
    const params = new URLSearchParams(window.location.search);
    const attribution = {
      referralCode: params.get('ref'),
      utmSource: params.get('utm_source'),
      utmMedium: params.get('utm_medium'),
      utmCampaign: params.get('utm_campaign'),
      utmContent: params.get('utm_content'),
      utmTerm: params.get('utm_term'),
      landingPage: window.location.pathname
    };

    // Store in session/cookie for later use
    sessionStorage.setItem('attribution', JSON.stringify(attribution));
  }, []);

  // ... rest of signup logic
}
```

## Revenue Attribution

### Track Revenue to Referrer
```typescript
export async function trackRevenueAttribution(
  transactionId: string,
  referrerUserId: string
): Promise<void> {
  // Update transaction with attribution
  const { data: transaction } = await supabase
    .from('transactions')
    .select('amount_cents, currency')
    .eq('id', transactionId)
    .single();

  if (transaction) {
    // Update transaction metadata
    await supabase
      .from('transactions')
      .update({
        metadata: {
          referrer_user_id: referrerUserId,
          attribution_type: 'referral'
        }
      })
      .eq('id', transactionId);

    // Update referrer revenue stats
    const amount = transaction.amount_cents / 100;
    await supabase.rpc('increment_referral_revenue', {
      user_id: referrerUserId,
      amount: amount
    });
  }
}
```

### Analytics Queries
```sql
-- Top referrers by revenue
SELECT 
  r.referrer_user_id,
  u.name,
  u.email,
  COUNT(DISTINCT r.referred_user_id) as total_referrals,
  COUNT(DISTINCT CASE WHEN r.status = 'converted' THEN r.referred_user_id END) as conversions,
  COALESCE(SUM(t.amount_cents) / 100, 0) as revenue_attributed
FROM referrals r
JOIN auth.users u ON r.referrer_user_id = u.id
LEFT JOIN transactions t ON t.metadata->>'referrer_user_id' = r.referrer_user_id::text
WHERE r.created_at >= NOW() - INTERVAL '30 days'
GROUP BY r.referrer_user_id, u.name, u.email
ORDER BY revenue_attributed DESC
LIMIT 20;

-- Referral conversion funnel
SELECT 
  DATE_TRUNC('week', r.created_at) as week,
  COUNT(*) as referrals_created,
  COUNT(CASE WHEN r.status = 'converted' THEN 1 END) as conversions,
  AVG(EXTRACT(EPOCH FROM (r.converted_at - r.created_at)) / 86400) as avg_days_to_convert
FROM referrals r
GROUP BY week
ORDER BY week DESC;
```

## Best Practices

### Do's
- Generate unique, memorable referral codes
- Track attribution throughout user journey
- Reward both referrer and referred
- Show clear referral stats to users
- Set reasonable expiry periods

### Don'ts
- Don't allow self-referrals
- Don't grant rewards before payment
- Don't ignore referral fraud patterns
- Don't make sharing difficult
- Don't forget attribution in analytics

## Fraud Prevention

### Detection Rules
```typescript
// Check for suspicious referral patterns
export async function detectReferralFraud(referrerUserId: string): Promise<boolean> {
  // Too many referrals in short time
  const recentReferrals = await supabase
    .from('referrals')
    .select('created_at')
    .eq('referrer_user_id', referrerUserId)
    .gte('created_at', new Date(Date.now() - 3600000).toISOString()); // Last hour

  if (recentReferrals.data?.length > 10) {
    return true; // Flag for review
  }

  // Same IP patterns
  // Similar email patterns
  // Immediate conversions
  
  return false;
}
```

---

*Last Updated: 27 June 2025*