# PostHog Setup Guide

## Overview
PostHog provides product analytics, feature flags, and A/B testing for SheenApps. This guide covers setup with a focus on payment flow optimization and user journey tracking.

## Account Setup

### 1. Create PostHog Account
1. Go to [posthog.com](https://posthog.com)
2. Choose cloud hosting (recommended) or self-host
3. Create organization: `SheenApps`

### 2. Create Project
1. Project name: `SheenApps Production`
2. Timezone: Your business timezone
3. Copy Project API Key

### 3. Initial Configuration
1. Go to **Project Settings**
2. Set data retention (90 days recommended)
3. Enable session recording (with privacy settings)
4. Configure team members

## Integration Setup

### 1. Install PostHog
```bash
npm install --save posthog-js
```

### 2. Initialize PostHog

Create `src/lib/posthog-client.ts`:
```typescript
import posthog from 'posthog-js'
import { PostHogConfig } from 'posthog-js'

let posthogClient: typeof posthog | null = null

export function initializePostHog() {
  if (typeof window === 'undefined') return
  if (process.env.NODE_ENV !== 'production') return
  if (posthogClient) return posthogClient

  const config: Partial<PostHogConfig> = {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    
    // Privacy settings
    autocapture: false, // Disable automatic event capture
    capture_pageview: false, // Manual pageview tracking
    capture_pageleave: true,
    disable_session_recording: false,
    mask_all_text: false, // We'll mask selectively
    mask_all_element_attributes: false,
    
    // Performance settings
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') {
        posthog.opt_out_capturing()
      }
    },
    
    // Session recording settings
    session_recording: {
      maskTextSelector: '[data-sensitive="true"], .payment-form input, input[type="password"]',
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
        email: false, // We want to track email field interactions
      },
    },
    
    // Feature flags
    bootstrap: {
      featureFlags: {
        // Pre-load critical flags
      },
    },
  }

  posthog.init(
    process.env.NEXT_PUBLIC_POSTHOG_KEY!,
    config
  )

  posthogClient = posthog
  return posthogClient
}

export function getPostHog() {
  return posthogClient
}
```

### 3. PostHog Provider

Create `src/components/providers/posthog-provider.tsx`:
```typescript
'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { initializePostHog, getPostHog } from '@/lib/posthog-client'
import { useAuth } from '@/hooks/use-auth'

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, subscription } = useAuth()

  // Initialize PostHog
  useEffect(() => {
    initializePostHog()
  }, [])

  // Track page views
  useEffect(() => {
    const posthog = getPostHog()
    if (!posthog) return

    const url = pathname + (searchParams?.toString() ? `?${searchParams.toString()}` : '')
    
    posthog.capture('$pageview', {
      $current_url: url,
      $pathname: pathname,
    })
  }, [pathname, searchParams])

  // Identify user
  useEffect(() => {
    const posthog = getPostHog()
    if (!posthog) return

    if (user) {
      // Identify user with properties
      posthog.identify(user.id, {
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        
        // Subscription properties
        subscription_status: subscription?.status || 'free',
        subscription_plan: subscription?.plan_name || 'free',
        is_trial: subscription?.is_trial || false,
        trial_end: subscription?.trial_end,
        
        // Custom properties
        referrer: user.metadata?.referrer,
        utm_source: user.metadata?.utm_source,
        utm_medium: user.metadata?.utm_medium,
        
        // Set groups
        $groups: {
          organization: user.organization_id,
          subscription_plan: subscription?.plan_name || 'free',
        },
      })
    } else {
      // Reset when user logs out
      posthog.reset()
    }
  }, [user, subscription])

  return <>{children}</>
}
```

### 4. Event Tracking Helpers

Create `src/lib/posthog-events.ts`:
```typescript
import { getPostHog } from './posthog-client'

// Event names as constants for consistency
export const EVENTS = {
  // Onboarding
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  ONBOARDING_STEP: 'onboarding_step_completed',
  
  // Pricing & Checkout
  PRICING_VIEWED: 'pricing_page_viewed',
  PLAN_SELECTED: 'plan_selected',
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  CHECKOUT_FAILED: 'checkout_failed',
  
  // Subscription Management
  SUBSCRIPTION_UPGRADED: 'subscription_upgraded',
  SUBSCRIPTION_DOWNGRADED: 'subscription_downgraded',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  SUBSCRIPTION_REACTIVATED: 'subscription_reactivated',
  
  // Feature Usage
  AI_GENERATION_STARTED: 'ai_generation_started',
  AI_GENERATION_COMPLETED: 'ai_generation_completed',
  PROJECT_CREATED: 'project_created',
  PROJECT_EXPORTED: 'project_exported',
  
  // Builder Events
  BUILDER_OPENED: 'builder_opened',
  SECTION_ADDED: 'section_added',
  TEMPLATE_SELECTED: 'template_selected',
  PREVIEW_TOGGLED: 'preview_toggled',
  
  // Billing Events
  PAYMENT_METHOD_UPDATED: 'payment_method_updated',
  INVOICE_DOWNLOADED: 'invoice_downloaded',
  BILLING_PORTAL_ACCESSED: 'billing_portal_accessed',
  
  // Engagement
  FEATURE_DISCOVERED: 'feature_discovered',
  HELP_ACCESSED: 'help_accessed',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
} as const

// Type-safe event tracking
export function trackEvent(
  eventName: keyof typeof EVENTS | string,
  properties?: Record<string, any>
) {
  const posthog = getPostHog()
  if (!posthog) return

  const event = typeof eventName === 'string' && eventName in EVENTS 
    ? EVENTS[eventName as keyof typeof EVENTS]
    : eventName

  posthog.capture(event, {
    ...properties,
    timestamp: new Date().toISOString(),
  })
}

// Specialized tracking functions
export const tracking = {
  // Pricing events
  trackPricingView(source: string) {
    trackEvent(EVENTS.PRICING_VIEWED, {
      source,
      viewed_at: new Date().toISOString(),
    })
  },

  trackPlanSelection(plan: string, interval: 'monthly' | 'yearly') {
    trackEvent(EVENTS.PLAN_SELECTED, {
      plan_name: plan,
      billing_interval: interval,
      price: getPlanPrice(plan, interval),
    })
  },

  // Checkout flow
  trackCheckoutStart(plan: string, price: number, currency: string) {
    trackEvent(EVENTS.CHECKOUT_STARTED, {
      plan_name: plan,
      price,
      currency,
      checkout_type: 'new_subscription',
    })
  },

  trackCheckoutComplete(plan: string, orderId: string) {
    trackEvent(EVENTS.CHECKOUT_COMPLETED, {
      plan_name: plan,
      order_id: orderId,
      revenue: getPlanPrice(plan),
    })
  },

  trackCheckoutError(error: string, plan: string) {
    trackEvent(EVENTS.CHECKOUT_FAILED, {
      error_message: error,
      plan_name: plan,
      failure_point: getFailurePoint(error),
    })
  },

  // Feature usage
  trackAIGeneration(prompt: string, success: boolean, duration: number) {
    trackEvent(EVENTS.AI_GENERATION_COMPLETED, {
      success,
      duration_ms: duration,
      prompt_length: prompt.length,
      prompt_type: categorizePrompt(prompt),
    })
  },

  // Builder events
  trackBuilderAction(action: string, metadata?: Record<string, any>) {
    trackEvent(`builder_${action}`, {
      action,
      ...metadata,
    })
  },

  // Conversion tracking
  trackConversion(type: 'trial_to_paid' | 'free_to_paid' | 'upgrade', details: any) {
    trackEvent(`conversion_${type}`, {
      ...details,
      conversion_value: calculateConversionValue(type, details),
    })
  },
}

// Helper functions
function getPlanPrice(plan: string, interval?: string): number {
  // Return plan price based on your pricing
  const prices: Record<string, Record<string, number>> = {
    starter: { monthly: 9, yearly: 90 },
    growth: { monthly: 29, yearly: 290 },
    scale: { monthly: 59, yearly: 590 },
  }
  return prices[plan]?.[interval || 'monthly'] || 0
}

function categorizePrompt(prompt: string): string {
  // Categorize prompts for analysis
  if (prompt.includes('landing')) return 'landing_page'
  if (prompt.includes('blog')) return 'blog'
  if (prompt.includes('product')) return 'product'
  return 'other'
}

function getFailurePoint(error: string): string {
  // Determine where in checkout the failure occurred
  if (error.includes('card')) return 'payment_method'
  if (error.includes('3D')) return '3d_secure'
  if (error.includes('network')) return 'network'
  return 'unknown'
}

function calculateConversionValue(type: string, details: any): number {
  // Calculate revenue impact of conversion
  // Implementation depends on your pricing
  return 0
}
```

### 5. Feature Flags

Create `src/lib/posthog-flags.ts`:
```typescript
import { getPostHog } from './posthog-client'

export const FLAGS = {
  // Payment features
  NEW_CHECKOUT_FLOW: 'new-checkout-flow',
  TRIAL_EXTENSION: 'trial-extension-enabled',
  VOLUME_DISCOUNTS: 'volume-discounts',
  
  // UI experiments
  PRICING_PAGE_V2: 'pricing-page-v2',
  ONBOARDING_V2: 'onboarding-v2',
  
  // Feature rollouts
  AI_IMPROVEMENTS: 'ai-improvements',
  ADVANCED_BUILDER: 'advanced-builder',
} as const

export type FeatureFlag = typeof FLAGS[keyof typeof FLAGS]

export function useFeatureFlag(flag: FeatureFlag): boolean {
  const [enabled, setEnabled] = useState(false)
  
  useEffect(() => {
    const posthog = getPostHog()
    if (!posthog) return

    // Check flag value
    const isEnabled = posthog.isFeatureEnabled(flag)
    setEnabled(isEnabled)

    // Listen for flag changes
    posthog.onFeatureFlags((flags) => {
      setEnabled(flags[flag] || false)
    })
  }, [flag])

  return enabled
}

export async function getFeatureFlag(flag: FeatureFlag): Promise<boolean> {
  const posthog = getPostHog()
  if (!posthog) return false
  
  return posthog.isFeatureEnabled(flag)
}

// A/B test helper
export function useABTest(
  testName: string,
  variants: string[]
): string | null {
  const [variant, setVariant] = useState<string | null>(null)
  
  useEffect(() => {
    const posthog = getPostHog()
    if (!posthog) return

    const assignedVariant = posthog.getFeatureFlag(testName) as string
    setVariant(assignedVariant)
    
    // Track exposure
    if (assignedVariant) {
      trackEvent('$feature_flag_called', {
        $feature_flag: testName,
        $feature_flag_variant: assignedVariant,
      })
    }
  }, [testName])

  return variant
}
```

## Dashboard Configuration

### 1. Key Dashboards

Create these dashboards in PostHog:

#### Conversion Funnel Dashboard
1. **Signup → Trial → Paid Funnel**
   - Track conversion at each step
   - Identify drop-off points
   - Segment by source

2. **Checkout Abandonment**
   - Checkout started vs completed
   - Error analysis
   - Time to conversion

#### Product Usage Dashboard
1. **Feature Adoption**
   - AI usage by plan
   - Builder engagement
   - Export frequency

2. **User Retention**
   - Daily/weekly/monthly active users
   - Feature stickiness
   - Churn prediction

#### Revenue Analytics Dashboard
1. **Revenue Metrics**
   - MRR by cohort
   - Upgrade/downgrade flows
   - LTV analysis

2. **Pricing Optimization**
   - Plan selection patterns
   - Price sensitivity
   - Discount effectiveness

### 2. Insights Setup

#### Funnels
1. **Trial Conversion Funnel**
   ```
   Step 1: Trial Started
   Step 2: First AI Generation
   Step 3: Second Project Created
   Step 4: Subscription Started
   ```

2. **Upgrade Funnel**
   ```
   Step 1: Limit Hit
   Step 2: Pricing Page Viewed
   Step 3: Upgrade Started
   Step 4: Upgrade Completed
   ```

#### Retention Analysis
1. Set up retention for:
   - Overall user retention
   - Feature-specific retention
   - Plan-based retention

#### Path Analysis
1. Common paths to conversion
2. Feature discovery paths
3. Churn prediction paths

### 3. Cohorts

Create cohorts for:
1. **High-Value Users**
   - Filter: >10 AI generations per week
   - Use: Target for upgrades

2. **At-Risk Users**
   - Filter: Decreased usage last 7 days
   - Use: Retention campaigns

3. **Power Users**
   - Filter: Top 10% by usage
   - Use: Feature beta testing

## Session Recording

### 1. Privacy Configuration

```typescript
// Configure recording privacy
posthog.startSessionRecording({
  maskTextSelector: '.sensitive, [data-private]',
  maskAllInputs: false,
  maskInputOptions: {
    color: false,
    date: false,
    'datetime-local': false,
    email: true,
    month: false,
    number: false,
    range: false,
    search: false,
    tel: false,
    text: true,
    time: false,
    url: false,
    week: false,
    textarea: true,
    select: false,
    password: true,
  },
})
```

### 2. Recording Triggers

Set up recording for:
1. Checkout failures
2. High-value user sessions
3. Feature discovery
4. Error scenarios

## A/B Testing

### 1. Pricing Tests

```typescript
// Example: Test new pricing page
const pricingVariant = useABTest('pricing-page-test', ['control', 'variant-a'])

return (
  <>
    {pricingVariant === 'control' && <PricingPageV1 />}
    {pricingVariant === 'variant-a' && <PricingPageV2 />}
  </>
)
```

### 2. Feature Rollouts

```typescript
// Gradual feature rollout
if (useFeatureFlag(FLAGS.NEW_CHECKOUT_FLOW)) {
  return <NewCheckoutFlow />
}
return <LegacyCheckoutFlow />
```

## Monitoring & Alerts

### 1. Set Up Alerts

In PostHog:
1. **Conversion Drop Alert**
   - When: Trial conversion < 20%
   - Action: Email + Slack

2. **Usage Spike Alert**
   - When: AI usage > 200% normal
   - Action: Check infrastructure

3. **Error Rate Alert**
   - When: Checkout errors > 5%
   - Action: Page on-call

### 2. Weekly Reports

Configure automated reports:
1. Conversion metrics
2. Feature adoption
3. User engagement
4. Revenue impact

## Best Practices

### Do's
- Track meaningful events
- Use consistent naming
- Add relevant properties
- Segment user groups
- Monitor data quality
- Act on insights

### Don'ts
- Don't track PII
- Don't over-track
- Don't ignore data
- Don't break privacy laws
- Don't slow down the app
- Don't forget mobile users

## Production Checklist

- [ ] PostHog account created
- [ ] API key added to env
- [ ] Client initialization code deployed
- [ ] User identification implemented
- [ ] Key events tracked
- [ ] Feature flags configured
- [ ] Dashboards created
- [ ] Alerts set up
- [ ] Team trained
- [ ] Privacy compliance verified

---

*Last Updated: 27 June 2025*
*Version: 1.0*