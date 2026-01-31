# Voice Feature Rollout Strategy (Corrected)

## **CRITICAL CORRECTION**

The original plan suggested:
```
Enable for 10% → 50% → 100% using env var
```

**This is IMPOSSIBLE with `NEXT_PUBLIC_*` env vars.** They're build-time constants, not runtime buckets.

---

## **Reality Check: What We Actually Have**

```typescript
// src/config/features.ts
export const FEATURES = {
  VOICE_INPUT: process.env.NEXT_PUBLIC_ENABLE_VOICE_INPUT === 'true'
}
```

This is a **global on/off switch**, not percentage-based rollout.

---

## **Viable Options (Pick One)**

### **Option 1: Simple On/Off (Recommended for MVP)**

**What it is:** Feature is either on for everyone or off for everyone.

**Implementation:** Already done via env var.

**Rollout:**
```bash
# Week 1: Deploy code with feature OFF
NEXT_PUBLIC_ENABLE_VOICE_INPUT=false

# Week 2: Monitor, then enable for everyone
NEXT_PUBLIC_ENABLE_VOICE_INPUT=true

# If issues: instant rollback via env var
NEXT_PUBLIC_ENABLE_VOICE_INPUT=false
```

**Pros:**
- ✅ Already implemented
- ✅ Zero code changes needed
- ✅ Instant rollback (just redeploy)
- ✅ Simple to understand

**Cons:**
- ❌ No gradual rollout
- ❌ No A/B testing capability

**Verdict:** ✅ Use this unless you need A/B testing

---

### **Option 2: Server-Side Bucketing** (If You Need Percentage Rollout)

**What it is:** Server decides per-user whether feature is enabled.

**Implementation:**
```typescript
// src/lib/feature-bucketing.ts
export function isVoiceEnabledForUser(userId: string): boolean {
  const rolloutPercent = Number(process.env.VOICE_ROLLOUT_PERCENT || '0')

  // Stable hash of userId to bucket
  const bucket = hashUserId(userId) % 100
  return bucket < rolloutPercent
}

function hashUserId(userId: string): number {
  // Simple stable hash (same user always gets same bucket)
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash)
}
```

**Usage:**
```typescript
// Server component or API route
const voiceEnabled = isVoiceEnabledForUser(user.id)

// Pass to client
<IdeaCaptureInput voiceEnabled={voiceEnabled} />
```

**Rollout:**
```bash
# Week 1: 10% of users
VOICE_ROLLOUT_PERCENT=10

# Week 2: 50% of users
VOICE_ROLLOUT_PERCENT=50

# Week 3: 100% of users
VOICE_ROLLOUT_PERCENT=100
```

**Pros:**
- ✅ Gradual rollout
- ✅ Stable per user (same user always sees same state)
- ✅ Can collect A/B metrics

**Cons:**
- ❌ Requires code changes
- ❌ Only works for authenticated users
- ❌ Requires redeploy to change percentage

**Verdict:** ⚠️ Only if you need true A/B testing

---

### **Option 3: Remote Config** (Enterprise)

**What it is:** Feature flags controlled by external service (LaunchDarkly, PostHog, GrowthBook).

**Example with PostHog:**
```typescript
// src/lib/feature-flags.ts
import { usePostHog } from 'posthog-js/react'

export function useVoiceFeature() {
  const posthog = usePostHog()
  return posthog.isFeatureEnabled('voice-input')
}
```

**Pros:**
- ✅ Change rollout % without redeploy
- ✅ Advanced targeting (country, device, etc.)
- ✅ Built-in A/B testing
- ✅ Real-time changes

**Cons:**
- ❌ External dependency
- ❌ Monthly cost ($0-200/month depending on service)
- ❌ More complex setup

**Verdict:** ⚠️ Overkill for single feature, good for product-wide flags

---

## **RECOMMENDED APPROACH**

**Start with Option 1 (Simple On/Off):**

```bash
# Phase 1: Deploy with voice OFF (safe deployment)
NEXT_PUBLIC_ENABLE_VOICE_INPUT=false
npm run build && deploy

# Phase 2: Internal testing (enable for staging)
NEXT_PUBLIC_ENABLE_VOICE_INPUT=true # on staging only
# Test for 3 days

# Phase 3: Production rollout (all or nothing)
NEXT_PUBLIC_ENABLE_VOICE_INPUT=true # on production
# Monitor metrics for 7 days

# If issues detected:
NEXT_PUBLIC_ENABLE_VOICE_INPUT=false # instant rollback
```

**Upgrade to Option 2 later IF:**
- You want to A/B test voice vs no-voice conversion rates
- You want to reduce blast radius of bugs
- You have >10k daily active users (worth the effort)

---

## **Metrics to Track (Regardless of Option)**

```typescript
// Track when voice button is visible
logger.info('voice-feature-shown', {
  page: 'hero' | 'builder-new',
  userId,
  locale
})

// Track when voice is actually used
logger.info('voice-recording-started', {
  page: 'hero' | 'builder-new',
  userId,
  locale
})

// Track successful transcription
logger.info('voice-transcription-complete', {
  page: 'hero' | 'builder-new',
  textLength,
  locale
})

// Track conversion (did they submit after using voice?)
logger.info('idea-submitted', {
  page: 'hero' | 'builder-new',
  usedVoice: boolean,
  userId,
  locale
})
```

**Key Questions to Answer:**
- What % of users see voice button? (should be 100% when enabled)
- What % of users who see it actually use it? (engagement rate)
- What % of voice users submit vs non-voice users? (conversion rate)
- Are there more errors in one locale vs another? (quality check)

---

## **Security Note**

Voice transcription likely hits your API and costs money/tokens.

**Server-side enforcement:**
```typescript
// API route: /api/voice/transcribe
export async function POST(req: Request) {
  const user = await getUser()

  // Don't rely on NEXT_PUBLIC_* for cost enforcement
  if (!isVoiceEnabledForUser(user.id)) {
    return json({ error: 'Feature not enabled' }, 403)
  }

  // Proceed with transcription...
}
```

Never trust client-side feature flags for cost/security decisions.

---

## **Updated Migration Plan**

**Original plan said:**
> Enable for 10% → 50% → 100% of users

**Corrected plan:**

**Week 1: Code deployment (feature OFF)**
```bash
NEXT_PUBLIC_ENABLE_VOICE_INPUT=false
```
- Deploy unified component
- Voice button hidden
- Zero risk

**Week 2: Staging validation (feature ON)**
```bash
NEXT_PUBLIC_ENABLE_VOICE_INPUT=true # staging only
```
- Internal team tests
- Check all 9 locales
- Verify metrics tracking

**Week 3: Production launch (feature ON for everyone)**
```bash
NEXT_PUBLIC_ENABLE_VOICE_INPUT=true # production
```
- Monitor error rates
- Check usage metrics
- Watch support tickets

**Rollback if needed:**
```bash
NEXT_PUBLIC_ENABLE_VOICE_INPUT=false
```
- Takes effect on next deployment (5-10 minutes)
- Or use Vercel env var instant rollback

---

## **Bottom Line**

1. ✅ **Use simple on/off env var** (already implemented)
2. ❌ **Don't claim it's percentage rollout** (that was wrong)
3. ✅ **Track metrics to validate the feature**
4. ⚠️ **Upgrade to bucketing only if you need A/B testing**

The original plan was overpromising on what an env var can do. This corrected version is honest about capabilities and still gives you safe rollout with instant rollback.
