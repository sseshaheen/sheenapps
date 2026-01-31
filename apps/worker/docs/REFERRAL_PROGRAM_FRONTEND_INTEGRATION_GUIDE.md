# SheenApps Friends Referral Program - Frontend Integration Guide

**Date**: September 8, 2025  
**Status**: Production Ready  
**Base URLs**: `/v1/referrals/*` (Partner APIs) | `/v1/admin/referrals/*` (Admin APIs)  
**Authentication**: HMAC signature required  

## 🚀 **Quick Start**

### Prerequisites
- HMAC signature implementation (reuse existing from other features)
- User authentication system integration
- Cookie/localStorage management for referral tracking

### Basic Authentication
```typescript
// Reuse your existing HMAC implementation
import { generateHmacSignature } from '@/lib/hmac';

const getAuthHeaders = (userId: string, requestData?: any) => ({
  'Content-Type': 'application/json',
  'X-HMAC-Signature': generateHmacSignature(requestData || {}),
  // Note: userId passed in request body/query, not headers (per codebase pattern)
});
```

### Quick Integration Example
```typescript
// Partner signup
const createPartner = async (userId: string, partnerData: CreatePartnerRequest) => {
  const payload = { userId, ...partnerData };
  const response = await fetch('/v1/referrals/partners', {
    method: 'POST',
    headers: getAuthHeaders(userId, payload),
    body: JSON.stringify(payload)
  });
  
  if (response.ok) {
    const result: CreatePartnerResponse = await response.json();
    console.log(`Referral link: ${result.referral_link}`);
    return result;
  }
};
```

---

## 🎯 **User Flows & UI Components**

### 1. Partner Onboarding Flow

**Step 1: Eligibility Check & CTA**
```tsx
// Display on user dashboard or dedicated page
const ReferralProgramCTA = ({ user }: { user: User }) => {
  const [hasPartnerAccount, setHasPartnerAccount] = useState<boolean>(false);
  
  useEffect(() => {
    checkPartnerStatus(user.id).then(setHasPartnerAccount);
  }, [user.id]);

  if (hasPartnerAccount) {
    return <ReferralDashboardWidget userId={user.id} />;
  }

  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-6 rounded-lg text-white">
      <h3 className="text-xl font-bold">Earn 15% Commission with SheenApps Friends</h3>
      <p className="mt-2">Refer customers and earn recurring commissions for 12 months</p>
      <button 
        onClick={() => setShowSignupModal(true)}
        className="mt-4 bg-white text-blue-600 px-4 py-2 rounded font-medium"
      >
        Join SheenApps Friends
      </button>
    </div>
  );
};
```

**Step 2: Partner Signup Modal**
```tsx
interface CreatePartnerRequest {
  userId: string;
  company_name?: string;
  website_url?: string;
  marketing_channels?: string[];
  payout_method?: 'stripe' | 'paypal' | 'wire' | 'wise';
  terms_accepted: boolean;
}

const PartnerSignupModal = ({ userId, onSuccess }: PartnerSignupModalProps) => {
  const [formData, setFormData] = useState<Partial<CreatePartnerRequest>>({
    userId,
    terms_accepted: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.terms_accepted) {
      alert('Please accept the Terms & Conditions');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = { ...formData, userId };
      const response = await fetch('/v1/referrals/partners', {
        method: 'POST',
        headers: getAuthHeaders(userId, payload),
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result: CreatePartnerResponse = await response.json();
        onSuccess(result);
        // Copy referral link to clipboard
        await navigator.clipboard.writeText(result.referral_link);
        toast.success('Partner account created! Referral link copied to clipboard.');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to create partner account');
      }
    } catch (error) {
      console.error('Partner signup error:', error);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal>
      <form onSubmit={handleSubmit} className="space-y-4">
        <h2 className="text-2xl font-bold">Join SheenApps Friends</h2>
        
        <div>
          <label className="block text-sm font-medium mb-1">Company Name (Optional)</label>
          <input
            type="text"
            value={formData.company_name || ''}
            onChange={(e) => setFormData({...formData, company_name: e.target.value})}
            className="w-full border rounded px-3 py-2"
            placeholder="Your company or personal brand"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Website/Portfolio (Optional)</label>
          <input
            type="url"
            value={formData.website_url || ''}
            onChange={(e) => setFormData({...formData, website_url: e.target.value})}
            className="w-full border rounded px-3 py-2"
            placeholder="https://yoursite.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Marketing Channels</label>
          <div className="grid grid-cols-2 gap-2">
            {['blog', 'youtube', 'twitter', 'linkedin', 'newsletter', 'other'].map(channel => (
              <label key={channel} className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.marketing_channels?.includes(channel) || false}
                  onChange={(e) => {
                    const channels = formData.marketing_channels || [];
                    if (e.target.checked) {
                      setFormData({...formData, marketing_channels: [...channels, channel]});
                    } else {
                      setFormData({...formData, marketing_channels: channels.filter(c => c !== channel)});
                    }
                  }}
                  className="mr-2"
                />
                <span className="capitalize">{channel}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Preferred Payout Method</label>
          <select
            value={formData.payout_method || ''}
            onChange={(e) => setFormData({...formData, payout_method: e.target.value as any})}
            className="w-full border rounded px-3 py-2"
          >
            <option value="">Select payout method</option>
            <option value="stripe">Stripe (Bank Transfer)</option>
            <option value="paypal">PayPal</option>
            <option value="wire">Wire Transfer</option>
            <option value="wise">Wise (International)</option>
          </select>
        </div>

        <div className="flex items-start space-x-2">
          <input
            type="checkbox"
            id="terms"
            checked={formData.terms_accepted}
            onChange={(e) => setFormData({...formData, terms_accepted: e.target.checked})}
            className="mt-1"
            required
          />
          <label htmlFor="terms" className="text-sm">
            I accept the <a href="/legal/referral-terms" target="_blank" className="text-blue-600 underline">
              SheenApps Friends Terms & Conditions
            </a> and agree to receive commission payments.
          </label>
        </div>

        <div className="flex space-x-4">
          <button type="button" onClick={onCancel} className="flex-1 border border-gray-300 rounded py-2">
            Cancel
          </button>
          <button 
            type="submit" 
            disabled={isSubmitting || !formData.terms_accepted}
            className="flex-1 bg-blue-600 text-white rounded py-2 disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create Partner Account'}
          </button>
        </div>
      </form>
    </Modal>
  );
};
```

### 2. Referral Link Tracking & Landing Page

**Referral Link Detection (Landing Page)**
```tsx
// pages/index.tsx or app/page.tsx
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const LandingPage = () => {
  const router = useRouter();
  
  useEffect(() => {
    const handleReferralTracking = async () => {
      const { ref } = router.query;
      
      if (ref && typeof ref === 'string') {
        // Store referral code in localStorage and cookie for attribution
        localStorage.setItem('referral_code', ref);
        document.cookie = `referral_code=${ref}; max-age=${90 * 24 * 60 * 60}; path=/`; // 90 days
        
        // Track the click (no authentication required)
        try {
          await fetch('/v1/referrals/track-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              partner_code: ref,
              ip_address: await getUserIP(), // Your IP detection method
              user_agent: navigator.userAgent
            })
          });
        } catch (error) {
          console.warn('Failed to track referral click:', error);
          // Non-blocking - continue with normal flow
        }
      }
    };

    handleReferralTracking();
  }, [router.query]);

  return (
    <div>
      {router.query.ref && (
        <div className="bg-green-100 border-l-4 border-green-500 p-4 mb-4">
          <p className="text-green-700">
            🎉 You've been referred by a SheenApps Friend! 
            Get started and they'll earn commission when you subscribe.
          </p>
        </div>
      )}
      
      {/* Your normal landing page content */}
    </div>
  );
};
```

**User Signup Attribution**
```tsx
// After successful user registration/signup
const trackReferralSignup = async (userId: string) => {
  const referralCode = localStorage.getItem('referral_code') || 
                      getCookie('referral_code');
  
  if (referralCode) {
    try {
      const payload = {
        userId,
        partner_code: referralCode,
        attribution_method: 'cookie', // or 'email_match', 'referral_code'
        utm_source: new URLSearchParams(window.location.search).get('utm_source'),
        utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
        utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
        ip_address: await getUserIP(),
        user_agent: navigator.userAgent
      };

      const response = await fetch('/v1/referrals/signup', {
        method: 'POST',
        headers: getAuthHeaders(userId, payload),
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Referral tracked:', result);
        
        // Clean up stored referral data
        localStorage.removeItem('referral_code');
        document.cookie = 'referral_code=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        
        // Show success message to user
        if (result.fraud_check !== 'flagged') {
          toast.success('Welcome! Your referrer will earn commission from your subscription.');
        }
      }
    } catch (error) {
      console.warn('Failed to track referral signup:', error);
      // Non-blocking - user signup should still succeed
    }
  }
};
```

### 3. Partner Dashboard

**Main Dashboard Component**
```tsx
interface PartnerDashboardResponse {
  partner: ReferralPartner;
  stats: {
    total_clicks: number;
    total_signups: number;
    conversion_rate: number;
    pending_commissions_cents: number;
    approved_commissions_cents: number;
    estimated_monthly_payout_cents: number;
  };
  recent_referrals: Referral[];
  recent_commissions: Commission[];
}

const ReferralDashboard = ({ userId }: { userId: string }) => {
  const [data, setData] = useState<PartnerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDashboard = async () => {
    try {
      setRefreshing(true);
      const response = await fetch(`/v1/referrals/dashboard?userId=${userId}`, {
        headers: getAuthHeaders(userId)
      });

      if (response.ok) {
        const dashboardData = await response.json();
        setData(dashboardData);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to load dashboard');
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      toast.error('Network error loading dashboard');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboard, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  const copyReferralLink = async () => {
    const link = `${window.location.origin}/?ref=${data?.partner.partner_code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Referral link copied to clipboard!');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Referral link copied!');
    }
  };

  if (loading && !data) {
    return <div className="flex justify-center py-8"><LoadingSpinner /></div>;
  }

  if (!data) {
    return <div className="text-center py-8 text-gray-500">Failed to load dashboard</div>;
  }

  const { partner, stats, recent_referrals, recent_commissions } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">SheenApps Friends Dashboard</h1>
          <p className="text-gray-600">Partner Code: {partner.partner_code} • Tier: {partner.tier.toUpperCase()}</p>
        </div>
        <div className="space-x-2">
          <button onClick={fetchDashboard} disabled={refreshing} className="px-4 py-2 border rounded">
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button onClick={copyReferralLink} className="px-4 py-2 bg-blue-600 text-white rounded">
            Copy Referral Link
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard 
          title="Total Clicks" 
          value={stats.total_clicks} 
          subtitle="Link visits"
        />
        <StatsCard 
          title="Signups" 
          value={stats.total_signups} 
          subtitle={`${stats.conversion_rate}% conversion`}
        />
        <StatsCard 
          title="Pending Earnings" 
          value={`$${(stats.pending_commissions_cents / 100).toFixed(2)}`} 
          subtitle="Awaiting approval"
        />
        <StatsCard 
          title="Estimated Monthly Payout" 
          value={`$${(stats.estimated_monthly_payout_cents / 100).toFixed(2)}`} 
          subtitle="Current month projection"
          highlight
        />
      </div>

      {/* Tier Progress */}
      <TierProgressCard partner={partner} />

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Recent Referrals</h3>
          <div className="space-y-2">
            {recent_referrals.length > 0 ? (
              recent_referrals.map(referral => (
                <div key={referral.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <span className="font-medium">User signup</span>
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                      referral.status === 'confirmed' ? 'bg-green-100 text-green-800' : 
                      referral.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'
                    }`}>
                      {referral.status}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(referral.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No referrals yet</p>
            )}
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Recent Commissions</h3>
          <div className="space-y-2">
            {recent_commissions.length > 0 ? (
              recent_commissions.map(commission => (
                <div key={commission.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <span className="font-medium">
                      ${(commission.commission_amount_cents / 100).toFixed(2)}
                    </span>
                    {commission.is_activation_bonus && (
                      <span className="ml-2 px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs">
                        Bonus
                      </span>
                    )}
                    <span className={`ml-2 px-2 py-1 rounded-full text-xs ${
                      commission.status === 'paid' ? 'bg-green-100 text-green-800' : 
                      commission.status === 'approved' ? 'bg-blue-100 text-blue-800' : 
                      commission.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                      'bg-red-100 text-red-800'
                    }`}>
                      {commission.status}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">
                    {new Date(commission.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No commissions yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const StatsCard = ({ title, value, subtitle, highlight = false }: {
  title: string;
  value: string | number;
  subtitle: string;
  highlight?: boolean;
}) => (
  <div className={`p-4 rounded-lg border ${highlight ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
    <h3 className="text-sm font-medium text-gray-600">{title}</h3>
    <p className={`text-2xl font-bold ${highlight ? 'text-blue-600' : ''}`}>{value}</p>
    <p className="text-xs text-gray-500">{subtitle}</p>
  </div>
);

const TierProgressCard = ({ partner }: { partner: ReferralPartner }) => {
  const tierThresholds = { bronze: 9, silver: 24, gold: Infinity };
  const currentTier = partner.tier;
  const nextThreshold = currentTier === 'bronze' ? 10 : currentTier === 'silver' ? 25 : null;
  const progress = nextThreshold ? Math.min((partner.successful_referrals / nextThreshold) * 100, 100) : 100;

  return (
    <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-4 rounded-lg text-white">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold">Partner Tier: {currentTier.toUpperCase()}</h3>
          <p className="text-sm opacity-90">
            {partner.successful_referrals} successful referrals • {
              currentTier === 'bronze' ? '15%' : 
              currentTier === 'silver' ? '20%' : '25%'
            } commission rate
          </p>
        </div>
        {nextThreshold && (
          <div className="text-right">
            <p className="text-sm opacity-90">Next tier in</p>
            <p className="font-semibold">{nextThreshold - partner.successful_referrals} referrals</p>
          </div>
        )}
      </div>
      {nextThreshold && (
        <div className="mt-3">
          <div className="bg-white bg-opacity-20 rounded-full h-2">
            <div 
              className="bg-white rounded-full h-2 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
```

---

## 📚 **Complete API Reference**

### Partner APIs

#### 1. Create Partner Account
```typescript
POST /v1/referrals/partners

interface CreatePartnerRequest {
  userId: string;
  company_name?: string;
  website_url?: string;
  marketing_channels?: string[];
  payout_method?: 'stripe' | 'paypal' | 'wire' | 'wise';
  terms_accepted: boolean; // Required: must be true
}

interface CreatePartnerResponse {
  success: boolean;
  partner: ReferralPartner;
  referral_link: string; // Full URL: https://app.sheenapps.com/?ref=ABC123
}

// Error Responses
400 - Terms not accepted, user already has partner account
500 - Internal server error
```

#### 2. Get Partner Dashboard
```typescript
GET /v1/referrals/dashboard?userId={uuid}

interface PartnerDashboardResponse {
  partner: ReferralPartner;
  stats: {
    total_clicks: number;
    total_signups: number;
    conversion_rate: number; // 0-100 percentage
    pending_commissions_cents: number;
    approved_commissions_cents: number;
    estimated_monthly_payout_cents: number; // Predictive metric
  };
  recent_referrals: Referral[]; // Last 10 referrals
  recent_commissions: Commission[]; // Last 10 commissions
}

// Error Responses
404 - Partner not found
500 - Internal server error
```

#### 3. Track Referral Click (No Auth Required)
```typescript
POST /v1/referrals/track-click

interface TrackClickRequest {
  partner_code: string; // e.g., "ABC123"
  ip_address: string;
  user_agent?: string;
}

interface TrackClickResponse {
  success: boolean;
  tracked: boolean;
}

// Error Responses
404 - Invalid referral code
500 - Internal server error
```

#### 4. Track Referral Signup
```typescript
POST /v1/referrals/signup

interface TrackReferralRequest {
  userId: string;
  partner_code: string;
  attribution_method: 'cookie' | 'email_match' | 'referral_code';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ip_address: string;
  user_agent?: string;
}

interface TrackReferralResponse {
  success: boolean;
  referral_id: string;
  fraud_check: 'clean' | 'flagged';
}

// Error Responses
400 - Self-referral not allowed, invalid partner code
403 - Referral blocked due to suspicious activity
500 - Internal server error
```

---

## 🔧 **Advanced Implementation Patterns**

### 1. Error Handling & User Feedback

```tsx
// Comprehensive error handling wrapper
const withErrorHandling = <T extends any[]>(
  apiCall: (...args: T) => Promise<any>
) => {
  return async (...args: T) => {
    try {
      return await apiCall(...args);
    } catch (error: any) {
      if (error.status === 409) {
        toast.error('You already have a partner account');
      } else if (error.status === 403) {
        toast.error('Action blocked due to suspicious activity. Contact support if this seems wrong.');
      } else if (error.status === 404) {
        toast.error('Invalid referral code or partner not found');
      } else if (error.status >= 500) {
        toast.error('Server error. Please try again later.');
      } else {
        toast.error(error.message || 'Something went wrong');
      }
      throw error;
    }
  };
};

// Usage
const createPartnerWithErrorHandling = withErrorHandling(createPartner);
```

### 2. Optimistic UI Updates

```tsx
// Optimistic dashboard updates
const useOptimisticDashboard = (userId: string) => {
  const [data, setData] = useState<PartnerDashboardResponse | null>(null);
  
  const updateCommissionOptimistically = (commissionId: string, newStatus: string) => {
    if (!data) return;
    
    setData({
      ...data,
      recent_commissions: data.recent_commissions.map(c => 
        c.id === commissionId ? { ...c, status: newStatus } : c
      ),
      stats: {
        ...data.stats,
        pending_commissions_cents: newStatus === 'approved' 
          ? Math.max(0, data.stats.pending_commissions_cents - getCommissionAmount(commissionId))
          : data.stats.pending_commissions_cents
      }
    });
  };
  
  return { data, setData, updateCommissionOptimistically };
};
```

### 3. Real-time Updates (Optional)

```tsx
// WebSocket or polling for real-time dashboard updates
const useRealTimeDashboard = (userId: string) => {
  const [data, setData] = useState<PartnerDashboardResponse | null>(null);
  
  useEffect(() => {
    // Option 1: Polling every 30 seconds
    const interval = setInterval(() => {
      fetchDashboard(userId).then(setData);
    }, 30000);

    // Option 2: WebSocket (if you implement it later)
    // const ws = new WebSocket(`wss://api.sheenapps.com/ws/referrals/${userId}`);
    // ws.onmessage = (event) => {
    //   const update = JSON.parse(event.data);
    //   setData(current => ({ ...current, ...update }));
    // };

    return () => {
      clearInterval(interval);
      // ws?.close();
    };
  }, [userId]);

  return data;
};
```

---

## 🚨 **Testing Guide**

### 1. Partner Flow Testing

```typescript
// Test data for development
export const TEST_PARTNER_DATA = {
  company_name: 'Test Marketing Co',
  website_url: 'https://testmarketing.example.com',
  marketing_channels: ['blog', 'youtube'],
  payout_method: 'stripe' as const,
  terms_accepted: true
};

// Testing utilities
export const referralTestUtils = {
  createTestPartner: async (userId: string) => {
    return createPartner(userId, TEST_PARTNER_DATA);
  },
  
  generateTestReferralURL: (partnerCode: string) => {
    return `http://localhost:3000/?ref=${partnerCode}&utm_source=test&utm_campaign=dev_testing`;
  },
  
  simulateReferralFlow: async (partnerCode: string, testUserId: string) => {
    // 1. Track click
    await fetch('/v1/referrals/track-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partner_code: partnerCode,
        ip_address: '127.0.0.1',
        user_agent: 'Test Browser'
      })
    });
    
    // 2. Track signup
    return await fetch('/v1/referrals/signup', {
      method: 'POST',
      headers: getAuthHeaders(testUserId, { 
        userId: testUserId,
        partner_code: partnerCode,
        attribution_method: 'cookie',
        ip_address: '127.0.0.1',
        user_agent: 'Test Browser'
      }),
      body: JSON.stringify({
        userId: testUserId,
        partner_code: partnerCode,
        attribution_method: 'cookie',
        ip_address: '127.0.0.1',
        user_agent: 'Test Browser'
      })
    });
  }
};
```

### 2. E2E Testing Scenarios

```typescript
// Cypress/Playwright test scenarios
describe('Referral Program E2E', () => {
  it('should complete full referral flow', async () => {
    // 1. Partner creates account
    await page.goto('/dashboard');
    await page.click('[data-testid="join-referral-program"]');
    await page.fill('[data-testid="company-name"]', 'Test Company');
    await page.check('[data-testid="terms-checkbox"]');
    await page.click('[data-testid="create-partner-btn"]');
    
    // 2. Verify partner dashboard
    await expect(page.locator('[data-testid="partner-code"]')).toBeVisible();
    const referralLink = await page.locator('[data-testid="referral-link"]').textContent();
    
    // 3. Simulate referral visit
    await page.goto(`${referralLink}&utm_campaign=test`);
    await expect(page.locator('.referral-banner')).toBeVisible();
    
    // 4. Sign up new user
    await page.click('[data-testid="signup-btn"]');
    // ... complete signup flow
    
    // 5. Verify tracking
    await page.goto('/partner-dashboard');
    await expect(page.locator('[data-testid="total-signups"]')).toContainText('1');
  });
});
```

---

## 🎨 **UI/UX Best Practices**

### 1. Loading States & Skeletons

```tsx
const DashboardSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-8 bg-gray-200 rounded w-1/3"></div>
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-24 bg-gray-200 rounded"></div>
      ))}
    </div>
    <div className="h-32 bg-gray-200 rounded"></div>
  </div>
);
```

### 2. Success States & Celebrations

```tsx
const SuccessStates = {
  PartnerCreated: ({ referralLink }: { referralLink: string }) => (
    <div className="text-center p-8">
      <div className="text-6xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold text-green-600 mb-2">Welcome to SheenApps Friends!</h2>
      <p className="text-gray-600 mb-4">Your referral account has been created successfully.</p>
      <div className="bg-gray-100 p-4 rounded-lg mb-4">
        <p className="text-sm font-medium mb-2">Your referral link:</p>
        <div className="flex items-center space-x-2">
          <code className="bg-white px-3 py-1 rounded text-sm flex-1">{referralLink}</code>
          <button onClick={() => navigator.clipboard.writeText(referralLink)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">
            Copy
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500">Start sharing your link to earn 15% commission on all referrals!</p>
    </div>
  ),
  
  FirstCommission: ({ amount }: { amount: number }) => (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
      <div className="flex items-center">
        <div className="text-2xl mr-3">💰</div>
        <div>
          <h3 className="font-semibold text-green-800">First Commission Earned!</h3>
          <p className="text-sm text-green-600">
            You've earned your first ${(amount / 100).toFixed(2)} commission! 
            Payment will be processed at the end of this month.
          </p>
        </div>
      </div>
    </div>
  )
};
```

### 3. Empty States

```tsx
const EmptyStates = {
  NoReferrals: () => (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">📬</div>
      <h3 className="text-lg font-semibold text-gray-600 mb-2">No referrals yet</h3>
      <p className="text-gray-500 mb-4">Start sharing your referral link to see activity here.</p>
      <button className="px-4 py-2 bg-blue-600 text-white rounded">
        Copy Referral Link
      </button>
    </div>
  ),
  
  NoCommissions: () => (
    <div className="text-center py-12">
      <div className="text-4xl mb-4">💳</div>
      <h3 className="text-lg font-semibold text-gray-600 mb-2">No commissions earned yet</h3>
      <p className="text-gray-500">When your referrals make their first payment, you'll see commissions here.</p>
    </div>
  )
};
```

---

## 🔒 **Security Considerations**

### 1. HMAC Implementation Security
```typescript
// Ensure proper HMAC implementation
const generateHmacSignature = (data: any): string => {
  // Use your existing HMAC implementation
  // Make sure to:
  // 1. Stringify data consistently (JSON.stringify with sorted keys)
  // 2. Use proper timing-safe comparison for validation
  // 3. Include timestamp to prevent replay attacks
  const payload = JSON.stringify(data, Object.keys(data).sort());
  return crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
};
```

### 2. Client-Side Data Sanitization
```typescript
// Sanitize user input before sending to API
const sanitizePartnerData = (data: CreatePartnerRequest): CreatePartnerRequest => ({
  ...data,
  company_name: data.company_name?.trim().slice(0, 255),
  website_url: data.website_url && isValidURL(data.website_url) ? data.website_url : undefined,
  marketing_channels: data.marketing_channels?.filter(c => 
    ['blog', 'youtube', 'twitter', 'linkedin', 'newsletter', 'other'].includes(c)
  )
});
```

### 3. Referral Code Validation
```typescript
// Validate referral codes on frontend
const isValidReferralCode = (code: string): boolean => {
  return /^[A-Z0-9]{6,20}$/.test(code);
};

// Use in referral link detection
if (ref && isValidReferralCode(ref)) {
  // Process referral
}
```

---

## 📱 **Mobile Considerations**

### 1. Responsive Dashboard
```tsx
// Mobile-first dashboard design
const MobileReferralDashboard = ({ userId }: { userId: string }) => {
  return (
    <div className="px-4 py-6 space-y-6">
      {/* Mobile header */}
      <div className="text-center">
        <h1 className="text-xl font-bold">SheenApps Friends</h1>
        <p className="text-sm text-gray-600">Partner: {partner.partner_code}</p>
      </div>

      {/* Mobile stats - stacked */}
      <div className="space-y-3">
        <StatsCard title="Clicks" value={stats.total_clicks} subtitle="This month" />
        <StatsCard title="Signups" value={stats.total_signups} subtitle={`${stats.conversion_rate}%`} />
        <StatsCard 
          title="Est. Payout" 
          value={`$${(stats.estimated_monthly_payout_cents / 100).toFixed(2)}`} 
          subtitle="This month"
          highlight 
        />
      </div>

      {/* Mobile-optimized referral link sharing */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h3 className="font-semibold mb-2">Share Your Link</h3>
        <div className="flex space-x-2">
          <button onClick={copyReferralLink} className="flex-1 bg-blue-600 text-white py-2 rounded text-sm">
            Copy Link
          </button>
          <button onClick={shareViaWebShare} className="flex-1 border border-blue-600 text-blue-600 py-2 rounded text-sm">
            Share
          </button>
        </div>
      </div>
    </div>
  );
};

// Native sharing on mobile
const shareViaWebShare = async (referralLink: string) => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: 'Join SheenApps with my referral link',
        text: 'Get started with SheenApps using my referral link and I\'ll earn commission!',
        url: referralLink,
      });
    } catch (error) {
      // Fallback to copy
      copyReferralLink();
    }
  } else {
    copyReferralLink();
  }
};
```

---

## 🎯 **Performance Optimization**

### 1. Data Fetching Strategies
```typescript
// SWR/React Query integration for caching
import useSWR from 'swr';

const usePartnerDashboard = (userId: string) => {
  const { data, error, mutate } = useSWR(
    userId ? `/v1/referrals/dashboard?userId=${userId}` : null,
    (url) => fetch(url, { headers: getAuthHeaders(userId) }).then(r => r.json()),
    {
      refreshInterval: 30000, // Refresh every 30 seconds
      revalidateOnFocus: true,
      dedupingInterval: 5000, // Prevent duplicate requests
    }
  );

  return {
    data,
    loading: !error && !data,
    error,
    refresh: mutate
  };
};
```

### 2. Lazy Loading Components
```typescript
// Code splitting for dashboard components
const ReferralDashboard = lazy(() => import('./ReferralDashboard'));
const PartnerSignupModal = lazy(() => import('./PartnerSignupModal'));

// Usage with suspense
<Suspense fallback={<DashboardSkeleton />}>
  <ReferralDashboard userId={userId} />
</Suspense>
```

---

## 🆘 **Common Issues & Solutions**

### Issue 1: HMAC Signature Mismatch
**Problem**: API returns 401 with signature validation error
**Solution**: 
```typescript
// Ensure consistent JSON stringification
const payload = { userId, ...data };
const sortedPayload = JSON.stringify(payload, Object.keys(payload).sort());
const signature = generateHmacSignature(sortedPayload);
```

### Issue 2: Referral Attribution Not Working
**Problem**: Referrals not being tracked after signup
**Solution**:
```typescript
// Check multiple attribution methods
const trackReferral = async (userId: string) => {
  let referralCode = localStorage.getItem('referral_code') || 
                    getCookie('referral_code') ||
                    new URLSearchParams(window.location.search).get('ref');
  
  if (referralCode && isValidReferralCode(referralCode)) {
    // Track with appropriate method
    await trackReferralSignup(userId, referralCode);
  }
};
```

### Issue 3: Dashboard Loading Slowly
**Problem**: Dashboard takes long to load with many referrals
**Solution**:
```typescript
// Implement pagination for large datasets
const usePaginatedReferrals = (userId: string, page = 1) => {
  return useSWR(
    `dashboard-${userId}-${page}`,
    () => fetchDashboard(userId, { page, limit: 10 })
  );
};
```

---

## 💡 **Advanced Features (Future Enhancements)**

### 1. Referral Analytics Dashboard
```typescript
// Advanced analytics component
const ReferralAnalytics = ({ partnerId }: { partnerId: string }) => {
  // Implementation for:
  // - Conversion funnel visualization
  // - Geographic distribution of referrals  
  // - UTM campaign performance
  // - Time-based performance charts
};
```

### 2. Social Media Integration
```typescript
// Social sharing helpers
const SocialSharing = {
  twitter: (referralLink: string) => {
    const text = "Just discovered SheenApps for building web apps with AI! Check it out:";
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(referralLink)}`;
  },
  
  linkedin: (referralLink: string) => {
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`;
  },
  
  facebook: (referralLink: string) => {
    return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`;
  }
};
```

---

## 🎉 **Congratulations!**

You now have everything needed to integrate the SheenApps Friends Referral Program into your Next.js frontend. The backend APIs are production-ready with comprehensive fraud prevention, commission tracking, and admin management capabilities.

**Next Steps:**
1. Review and adapt the code examples to your existing codebase
2. Implement the partner onboarding flow first
3. Add referral link tracking to your landing pages
4. Build the partner dashboard
5. Test the complete referral flow
6. Deploy and start onboarding beta partners!

**Need Help?** 
- Check the API responses for detailed error messages
- All endpoints include comprehensive validation and error handling
- The backend is designed to be forgiving - failed tracking won't break user flows

🚀 **Happy coding, and welcome to the SheenApps Friends program!**