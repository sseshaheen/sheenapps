# Claude Worker API Reference for Next.js Team

**Date**: July 27, 2025  
**Version**: 2.1 (AI Time Billing + R2 Export Integration)  
**Base URL**: `https://worker.sheenapps.com` (production) | `http://localhost:3000` (local)

## 🚨 **CRITICAL SECURITY REQUIREMENTS**

### Authentication
All API calls **MUST** include HMAC SHA256 signature in the `x-sheen-signature` header:

```typescript
import crypto from 'crypto';

function generateSignature(body: string, path: string, secret: string): string {
  // Canonical string = body + path (prevents replay attacks)
  const canonical = body + path;
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

// Example usage for POST request
const body = JSON.stringify({ userId: 'user123', operationType: 'main_build' });
const path = '/v1/billing/check-sufficient';
const signature = generateSignature(body, path, process.env.WORKER_SHARED_SECRET);

const response = await fetch(`${WORKER_BASE_URL}${path}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': signature
  },
  body
});

// Example usage for GET request  
const getPath = '/v1/billing/balance/user123';
const getSignature = generateSignature('', getPath, process.env.WORKER_SHARED_SECRET);

const getResponse = await fetch(`${WORKER_BASE_URL}${getPath}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': getSignature
  }
});
```

### Environment Variables Required
```bash
WORKER_SHARED_SECRET=your-production-secret-here
WORKER_BASE_URL=https://worker.sheenapps.com
```

---

## 🆕 **AI Time Billing APIs**

### Overview
The worker provides read-only billing endpoints that Next.js uses to:
- Check user balance before operations  
- Display current balance in UI
- Provide purchase recommendations when insufficient

**Architecture**: Worker owns consumption, Next.js owns payments. Worker reads balance that Next.js credits.

### 1. **GET /v1/billing/balance/:userId**

Get user's current AI time balance and usage statistics.

#### Request
```typescript
const response = await fetch(`${WORKER_BASE_URL}/v1/billing/balance/${userId}`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateSignature('', WORKER_SHARED_SECRET) // Empty body for GET
  }
});
```

#### Response (200 OK)
```typescript
interface BalanceResponse {
  balance: {
    welcomeBonus: number;      // seconds remaining from 50-min welcome bonus
    dailyGift: number;         // seconds available today (15 min - used today)
    paid: number;              // seconds from purchases/subscriptions
    total: number;             // total seconds available (sum of above)
  };
  usage: {
    todayUsed: number;         // seconds used today (resets at midnight UTC)
    lifetimeUsed: number;      // total seconds ever consumed
  };
  dailyResetAt: string;        // Next reset time (ISO 8601)
}
```

#### Example Response
```json
{
  "balance": {
    "welcomeBonus": 3000,
    "dailyGift": 600,
    "paid": 7200,
    "total": 10800
  },
  "usage": {
    "todayUsed": 300,
    "lifetimeUsed": 14400
  },
  "dailyResetAt": "2025-07-28T00:00:00.000Z"
}
```

#### Use Cases
- Dashboard balance display
- Pre-build balance checks
- Purchase flow decision logic
- Usage analytics

---

### 2. **POST /v1/billing/check-sufficient**

Check if user has sufficient balance for an operation. Returns estimate and purchase recommendations.

#### Request
```typescript
interface SufficientCheckRequest {
  userId: string;
  operationType: 'main_build' | 'metadata_generation' | 'update';
  projectSize?: 'small' | 'medium' | 'large';  // Optional: improves estimates
  isUpdate?: boolean;                           // Optional: updates typically use less time
}

const body = JSON.stringify({
  userId: 'user123',
  operationType: 'main_build',
  projectSize: 'medium',
  isUpdate: false
});

const response = await fetch(`${WORKER_BASE_URL}/v1/billing/check-sufficient`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-sheen-signature': generateSignature(body, WORKER_SHARED_SECRET)
  },
  body
});
```

#### Response (200 OK)
```typescript
interface SufficientCheckResponse {
  sufficient: boolean;
  estimate: {
    estimatedSeconds: number;
    estimatedMinutes: number;  // Rounded up from seconds
    confidence: 'high' | 'medium' | 'low';
    basedOnSamples: number;    // Number of historical builds used for estimate
  } | null;
  balance: {
    welcomeBonus: number;
    dailyGift: number;
    paid: number;
    total: number;
  };
  recommendation?: {           // Only present if insufficient
    suggestedPackage: string;  // 'mini' | 'booster' | 'mega' | 'max'
    costToComplete: number;    // Estimated minutes needed to complete
    purchaseUrl: string;       // '/purchase' - handled by Next.js
  };
}
```

#### Example Responses

**Sufficient Balance:**
```json
{
  "sufficient": true,
  "estimate": {
    "estimatedSeconds": 180,
    "estimatedMinutes": 3,
    "confidence": "high",
    "basedOnSamples": 25
  },
  "balance": {
    "welcomeBonus": 3000,
    "dailyGift": 900,
    "paid": 0,
    "total": 3900
  }
}
```

**Insufficient Balance:**
```json
{
  "sufficient": false,
  "estimate": {
    "estimatedSeconds": 600,
    "estimatedMinutes": 10,
    "confidence": "medium",
    "basedOnSamples": 15
  },
  "balance": {
    "welcomeBonus": 0,
    "dailyGift": 300,
    "paid": 0,
    "total": 300
  },
  "recommendation": {
    "suggestedPackage": "booster",
    "costToComplete": 10,
    "purchaseUrl": "/purchase"
  }
}
```

#### Use Cases
- Pre-build validation
- Purchase flow triggers
- Build button state management
- Cost estimation display

---

## 📦 **Project Export & Download APIs**

### Overview
Download project versions as ZIP files with secure, time-limited signed URLs. Perfect for user data portability, backups, and version management.

**Key Features:**
- Secure signed URLs (24-hour expiry)  
- Artifact integrity verification via SHA256 checksums
- Size limits for safe downloads (2GB max)
- Ownership verification and access control

### 1. **GET /v1/projects/:projectId/export**

Export the latest version of a project as a downloadable ZIP file.

#### Request
```typescript
const path = `/v1/projects/${projectId}/export`;
const signature = generateSignature('', path, WORKER_SHARED_SECRET);

const response = await fetch(`${WORKER_BASE_URL}${path}?userId=${userId}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': signature
  }
});
```

#### Response (200 OK)
```typescript
{
  "success": true,
  "downloadUrl": "https://pub-xxxx.r2.dev/signed-url-with-auth-token",
  "expiresAt": "2025-07-28T15:30:00.000Z", // 24 hours from now
  "filename": "my-project-latest.zip",
  "size": 15728640, // Size in bytes
  "version": {
    "id": "01J3EXAMPLE123",
    "prompt": "Add dark mode toggle",
    "createdAt": "2025-07-27T15:30:00.000Z"
  }
}
```

#### Error Responses
- **404**: No artifact available for this project
- **413**: Artifact too large for download (>2GB) - *Note: Large projects can still rebuild (R2 upload limit 5GB)*
- **401**: Invalid signature or unauthorized access

#### Example Integration
```typescript
async function downloadLatestProject(projectId: string) {
  try {
    const response = await fetch(`/api/worker/projects/${projectId}/export`);
    const data = await response.json();
    
    if (response.ok) {
      // Redirect user to signed download URL
      window.open(data.downloadUrl, '_blank');
      
      // Show success message with expiry info
      toast.success(`Download ready! Link expires at ${new Date(data.expiresAt).toLocaleTimeString()}`);
    } else if (response.status === 413) {
      toast.error(`Project too large: ${data.message}`);
    }
  } catch (error) {
    toast.error('Failed to generate download link');
  }
}
```

### 2. **GET /v1/versions/:versionId/download**

Download a specific project version by version ID.

#### Request
```typescript
const path = `/v1/versions/${versionId}/download`;
const signature = generateSignature('', path, WORKER_SHARED_SECRET);

const response = await fetch(`${WORKER_BASE_URL}${path}?userId=${userId}`, {
  method: 'GET',
  headers: {
    'x-sheen-signature': signature
  }
});
```

#### Response (200 OK)
```typescript
{
  "success": true,
  "downloadUrl": "https://pub-xxxx.r2.dev/signed-url-with-auth-token",
  "expiresAt": "2025-07-28T15:30:00.000Z",
  "filename": "my-project-01J3EXAMPLE123.zip",
  "size": 15728640,
  "version": {
    "id": "01J3EXAMPLE123",
    "prompt": "Add dark mode toggle",
    "createdAt": "2025-07-27T15:30:00.000Z",
    "projectId": "my-project"
  }
}
```

#### Special Error Response (404 with rebuild option)
```typescript
{
  "error": "Artifact not available",
  "message": "This version has no downloadable artifact",
  "canRebuild": true,
  "rebuildUrl": "/v1/versions/01J3EXAMPLE123/rebuild"
}
```

#### Version History Integration
```typescript
function VersionRow({ version }: { version: ProjectVersion }) {
  const handleDownload = async () => {
    const response = await fetch(`/api/worker/versions/${version.id}/download`);
    
    if (response.status === 404) {
      const error = await response.json();
      if (error.canRebuild) {
        // Offer rebuild option
        const rebuild = confirm('This version has no download available. Rebuild it now?');
        if (rebuild) {
          await fetch(error.rebuildUrl, { method: 'POST' });
        }
      }
    } else {
      const data = await response.json();
      window.open(data.downloadUrl, '_blank');
    }
  };
  
  return (
    <tr>
      <td>{version.prompt}</td>
      <td>{version.createdAt}</td>
      <td>
        <button onClick={handleDownload}>
          📥 Download
        </button>
      </td>
    </tr>
  );
}
```

### 3. **Security & Best Practices**

#### Rate Limiting & Headers
```typescript
// Implement client-side rate limiting to prevent abuse
const downloadCache = new Map<string, { url: string; expiresAt: string }>();

async function getCachedDownloadUrl(versionId: string) {
  const cached = downloadCache.get(versionId);
  
  // Return cached URL if still valid (with 5min buffer)
  if (cached && new Date(cached.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) {
    return cached.url;
  }
  
  // Generate new signed URL with rate limit awareness
  const response = await fetch(`/api/worker/versions/${versionId}/download`);
  
  // Check rate limit headers for intelligent backoff
  const remaining = response.headers.get('x-ratelimit-remaining');
  const resetTime = response.headers.get('x-ratelimit-reset');
  
  if (remaining && parseInt(remaining) < 5) {
    console.warn(`Rate limit approaching: ${remaining} requests remaining`);
    // Consider delaying next request or showing user notice
  }
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after') || resetTime;
    throw new Error(`Rate limited. Retry after ${retryAfter} seconds`);
  }
  
  const data = await response.json();
  downloadCache.set(versionId, { url: data.downloadUrl, expiresAt: data.expiresAt });
  return data.downloadUrl;
}
```

#### Error Handling
```typescript
async function handleDownloadError(response: Response) {
  const error = await response.json();
  
  switch (response.status) {
    case 404:
      if (error.canRebuild) {
        return { type: 'missing', canRebuild: true, rebuildUrl: error.rebuildUrl };
      }
      return { type: 'not_found' };
      
    case 413:
      return { 
        type: 'too_large', 
        size: error.size, 
        suggestion: error.suggestion 
      };
      
    case 401:
      return { type: 'unauthorized' };
      
    default:
      return { type: 'unknown', message: error.message };
  }
}
```

---

## 🔥 **Enhanced Build APIs with Billing Integration**

### Modified Behavior
Build endpoints now return **402 Payment Required** if user has insufficient balance.

### 1. **POST /v1/create-preview-for-new-project**

#### New Error Response (402)
```json
{
  "error": "insufficient_ai_time",
  "message": "Insufficient AI time balance to start build",
  "balance": {
    "welcomeBonus": 0,
    "dailyGift": 300,
    "paid": 0,
    "total": 300
  },
  "estimate": {
    "estimatedSeconds": 180
  },
  "required": 180
}
```

**⚠️ CDN Compatibility Note**: Some CDNs may strip response bodies for 402 status codes. Always check both `response.json()` and fallback to the `error` field:

```typescript
if (response.status === 402) {
  let errorData;
  try {
    errorData = await response.json();
  } catch {
    // CDN stripped body - use generic fallback
    errorData = { 
      error: 'insufficient_ai_time', 
      message: 'Please add AI time credits to continue building' 
    };
  }
  handleInsufficientBalance(errorData);
}
```

#### Frontend Handling
```typescript
try {
  const response = await createPreview(userData);
  // Handle success
} catch (error) {
  if (error.status === 402) {
    // Redirect to purchase flow
    router.push(`/purchase?required=${error.required}&available=${error.balance.total}`);
  }
}
```

### 2. **POST /v1/update-project**

Same 402 error handling as create-preview.

#### Important Notes
- **Updates typically use less AI time** than full builds (30-45s vs 90-120s)
- Use `operationType: 'update'` and `isUpdate: true` for better estimates
- Worker automatically tracks and bills for actual time used

---

## 📊 **Integration Patterns for Next.js**

### 1. **Dashboard Balance Display**

```typescript
// components/BalanceDisplay.tsx
import { useEffect, useState } from 'react';

interface BalanceInfo {
  balance: { total: number; welcomeBonus: number; dailyGift: number; paid: number };
  usage: { todayUsed: number; lifetimeUsed: number };
}

export function BalanceDisplay({ userId }: { userId: string }) {
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchBalance() {
      try {
        const response = await fetch(`/api/worker/billing/balance/${userId}`);
        const data = await response.json();
        setBalance(data);
      } catch (error) {
        console.error('Failed to fetch balance:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchBalance();
    // Refresh every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  if (loading) return <div>Loading balance...</div>;
  if (!balance) return <div>Unable to load balance</div>;

  const totalMinutes = Math.floor(balance.balance.total / 60);

  return (
    <div className="balance-display">
      <h3>AI Time Remaining: {totalMinutes} minutes</h3>
      <div className="balance-breakdown">
        <div>Welcome Bonus: {Math.floor(balance.balance.welcomeBonus / 60)}m</div>
        <div>Daily Gift: {Math.floor(balance.balance.dailyGift / 60)}m</div>
        <div>Purchased: {Math.floor(balance.balance.paid / 60)}m</div>
      </div>
      <div className="usage-stats">
        Used today: {Math.floor(balance.usage.todayUsed / 60)}m
      </div>
    </div>
  );
}
```

### 2. **Pre-Build Validation**

```typescript
// hooks/usePreBuildCheck.ts
import { useState } from 'react';

interface BuildCheckResult {
  canBuild: boolean;
  estimate?: { estimatedMinutes: number; confidence: string };
  recommendation?: { suggestedPackage: string; costToComplete: number };
}

export function usePreBuildCheck() {
  const [checking, setChecking] = useState(false);

  const checkBuildability = async (
    userId: string, 
    operationType: 'main_build' | 'update',
    projectSize?: 'small' | 'medium' | 'large'
  ): Promise<BuildCheckResult> => {
    setChecking(true);
    try {
      const response = await fetch('/api/worker/billing/check-sufficient', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, operationType, projectSize })
      });

      const data = await response.json();
      
      return {
        canBuild: data.sufficient,
        estimate: data.estimate ? {
          estimatedMinutes: data.estimate.estimatedMinutes,
          confidence: data.estimate.confidence
        } : undefined,
        recommendation: data.recommendation
      };
    } finally {
      setChecking(false);
    }
  };

  return { checkBuildability, checking };
}
```

### 3. **Build Button with Balance Check**

```typescript
// components/BuildButton.tsx
import { useState } from 'react';
import { usePreBuildCheck } from '../hooks/usePreBuildCheck';

interface BuildButtonProps {
  userId: string;
  projectId: string;
  operationType: 'main_build' | 'update';
  onInsufficientBalance: (recommendation: any) => void;
}

export function BuildButton({ userId, projectId, operationType, onInsufficientBalance }: BuildButtonProps) {
  const [building, setBuilding] = useState(false);
  const { checkBuildability, checking } = usePreBuildCheck();

  const handleBuild = async () => {
    // Pre-flight balance check
    const buildCheck = await checkBuildability(userId, operationType);
    
    if (!buildCheck.canBuild) {
      onInsufficientBalance(buildCheck.recommendation);
      return;
    }

    setBuilding(true);
    try {
      // Proceed with build - worker will do final balance check
      const response = await fetch('/api/worker/v1/create-preview-for-new-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, projectId, prompt: '...' })
      });

      if (response.status === 402) {
        // Handle edge case where balance changed between checks
        const errorData = await response.json();
        onInsufficientBalance(errorData);
        return;
      }

      // Handle successful build
      const result = await response.json();
      // ...
    } catch (error) {
      console.error('Build failed:', error);
    } finally {
      setBuilding(false);
    }
  };

  return (
    <button 
      onClick={handleBuild} 
      disabled={building || checking}
      className="build-button"
    >
      {checking ? 'Checking balance...' : building ? 'Building...' : 'Start Build'}
      {buildCheck?.estimate && (
        <span className="estimate">
          ~{buildCheck.estimate.estimatedMinutes}m
        </span>
      )}
    </button>
  );
}
```

### 4. **Purchase Flow Integration**

```typescript
// pages/purchase.tsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

export default function PurchasePage() {
  const router = useRouter();
  const { required, available, userId } = router.query;
  const [selectedPackage, setSelectedPackage] = useState<string>('');

  // After successful payment, balance will be automatically available
  // Next.js webhook handler should credit the user_ai_time_balance table
  const handlePaymentSuccess = async (paymentId: string) => {
    // Next.js handles the payment and credits balance
    // Worker will see the updated balance immediately
    
    // Redirect back to build flow
    router.push('/dashboard?payment=success');
  };

  return (
    <div className="purchase-flow">
      <h2>Add AI Time</h2>
      <div className="balance-info">
        <p>You need {Math.ceil(Number(required) / 60)} minutes</p>
        <p>You have {Math.floor(Number(available) / 60)} minutes</p>
      </div>
      
      {/* Package selection and Stripe integration */}
      <PackageSelector onSelect={setSelectedPackage} />
      <StripeCheckout 
        package={selectedPackage}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
```

---

## 🔄 **Webhook Integration Pattern**

### Architecture Flow
1. **User purchases** → Stripe processes payment
2. **Stripe webhook** → Next.js `/api/webhooks/stripe`
3. **Next.js handler** → Credits `user_ai_time_balance.paid_seconds_remaining`
4. **Worker reads** → Updated balance immediately available

### Critical Implementation Notes

#### Next.js Webhook Handler
```typescript
// pages/api/webhooks/stripe.ts
import { stripe } from '../../lib/stripe';
import { db } from '../../lib/database';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const payload = req.body;

  try {
    // Verify Stripe signature
    const event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET);

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      
      // Extract purchase details from metadata
      const { userId, packageName, minutesPurchased } = paymentIntent.metadata;
      const secondsPurchased = parseInt(minutesPurchased) * 60;

      // ATOMIC TRANSACTION: Insert purchase + credit balance
      await db.transaction(async (trx) => {
        // Insert purchase record
        await trx('user_ai_time_purchases').insert({
          user_id: userId,
          purchase_type: 'package',
          package_name: packageName,
          minutes_purchased: minutesPurchased,
          price: paymentIntent.amount / 100, // Convert from cents
          payment_id: paymentIntent.id,
          payment_status: 'completed',
          purchased_at: new Date()
        });

        // Credit user balance - Worker will see this immediately
        await trx('user_ai_time_balance').insert({
          user_id: userId,
          paid_seconds_remaining: secondsPurchased
        }).onConflict('user_id').merge({
          paid_seconds_remaining: trx.raw('paid_seconds_remaining + ?', [secondsPurchased]),
          updated_at: new Date()
        });
      });

      console.log(`Credited ${minutesPurchased} minutes to user ${userId}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
}
```

---

## ⚠️ **Error Handling Guide**

### HTTP Status Codes

| Code | Meaning | Action |
|------|---------|---------|
| `200` | Success | Process response |
| `400` | Bad Request | Fix request parameters |
| `401` | Unauthorized | Check HMAC signature |
| `402` | Payment Required | Redirect to purchase flow |
| `404` | Not Found | Check user exists |
| `429` | Rate Limited | Implement retry with backoff |
| `500` | Server Error | Retry once, then alert |

### Common Error Scenarios

#### 1. **Insufficient Balance (402)**
```typescript
if (response.status === 402) {
  const error = await response.json();
  
  // Show purchase modal/redirect
  showPurchaseModal({
    required: error.required,
    available: error.balance.total,
    estimate: error.estimate
  });
}
```

#### 2. **Invalid Signature (401)**
```typescript
if (response.status === 401) {
  // Check HMAC signature generation
  console.error('Invalid signature - check WORKER_SHARED_SECRET');
  
  // In development, log the expected signature
  if (process.env.NODE_ENV === 'development') {
    console.log('Expected signature for body:', generateSignature(body, secret));
  }
}
```

#### 3. **Rate Limiting (429)**
```typescript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || '60';
  
  // Exponential backoff
  await new Promise(resolve => setTimeout(resolve, parseInt(retryAfter) * 1000));
  return retryRequest();
}
```

---

## 🚀 **Performance & Optimization**

### 1. **Caching Strategy**
- **Balance data**: Cache for 30-60 seconds (balances don't change frequently)
- **Estimates**: Cache for 5 minutes per operation type
- **User context**: Cache user preferences for better estimates

### 2. **Polling Patterns**
```typescript
// Efficient balance polling after payment
const pollBalanceAfterPayment = async (userId: string, expectedMinimum: number) => {
  const maxAttempts = 12; // 60 seconds total
  let attempts = 0;

  while (attempts < maxAttempts) {
    const balance = await fetchBalance(userId);
    
    if (balance.total >= expectedMinimum) {
      return balance; // Payment processed
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
    attempts++;
  }

  throw new Error('Payment not reflected in balance after 60 seconds');
};
```

### 3. **Batch Operations**
```typescript
// Check multiple users' balances efficiently
const checkMultipleBalances = async (userIds: string[]) => {
  const promises = userIds.map(userId => 
    fetch(`/api/worker/billing/balance/${userId}`)
      .then(r => r.json())
      .catch(e => ({ userId, error: e.message }))
  );
  
  return Promise.all(promises);
};
```

---

## 🔧 **Development & Testing**

### Environment Setup
```bash
# .env.local
WORKER_BASE_URL=http://localhost:3000
WORKER_SHARED_SECRET=dev-secret-123

# .env.production
WORKER_BASE_URL=https://worker.sheenapps.com
WORKER_SHARED_SECRET=prod-secret-xyz
```

### Testing Endpoints
```typescript
// Test balance endpoint
const testBalance = async () => {
  const response = await fetch('/api/worker/billing/balance/test-user-123');
  console.log('Balance:', await response.json());
};

// Test insufficient balance scenario
const testInsufficientBalance = async () => {
  const response = await fetch('/api/worker/billing/check-sufficient', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'user-with-no-balance',
      operationType: 'main_build',
      projectSize: 'large'
    })
  });
  console.log('Check result:', await response.json());
};
```

### Postman Collection
Import the updated collection: `docs/POSTMAN_SheenApps-Claude_Worker_API.postman_collection-22-July-2025.json`

- Set `sharedSecret` variable to your actual secret
- Test "AI Time Billing" folder for new endpoints
- Use "Error Examples" to test edge cases

---

## 📋 **Production Checklist**

### Before Going Live
- [ ] **Database migrations** - Run migrations 019 and 020
- [ ] **Secrets rotation** - Update `WORKER_SHARED_SECRET` in both apps
- [ ] **Webhook testing** - Verify Stripe webhooks credit balance correctly
- [ ] **Rate limit testing** - Verify 402 responses don't break UI
- [ ] **Balance polling** - Test post-payment balance updates
- [ ] **Error handling** - Test all 4xx/5xx scenarios
- [ ] **Performance testing** - Load test billing endpoints
- [ ] **Monitoring setup** - Alert on daily reset failures

### Monitoring Endpoints
- `GET /myhealthz` - Overall health
- `GET /claude-executor/health` - Claude executor health  
- Daily reset job logs for billing system health

---

## 💡 **Best Practices**

### 1. **User Experience**
- **Always check balance** before showing build buttons
- **Show estimates** to set user expectations
- **Graceful degradation** when billing APIs are down
- **Clear error messages** for insufficient balance

### 2. **Performance**
- **Cache balance data** appropriately (30-60s)
- **Debounce balance checks** on rapid user actions
- **Batch API calls** when possible
- **Use estimates** to avoid unnecessary API calls

### 3. **Security**
- **Never expose** `WORKER_SHARED_SECRET` to frontend
- **Validate signatures** on all worker API calls
- **Sanitize user inputs** before worker API calls
- **Rate limit** your API routes that call worker
- ⚠️ **Critical: No request logging** - Proxy routes must NOT log signed request bodies (would leak secret)

### 4. **Reliability**
- **Implement retries** with exponential backoff
- **Handle partial failures** gracefully
- **Monitor billing endpoints** separately from core APIs
- **Have fallback flows** when billing is unavailable

---

## 📞 **Support & Contact**

For questions about this API reference:
- **Technical questions**: Create issue in worker repository
- **Integration help**: Review Postman collection examples
- **Production issues**: Check monitoring dashboards first

This reference covers all billing integration patterns. The worker APIs are production-ready and the Next.js team can now implement the frontend purchase flows and balance management.