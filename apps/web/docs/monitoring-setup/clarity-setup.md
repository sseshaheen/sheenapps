# Microsoft Clarity Setup Guide

## Overview
Microsoft Clarity provides free session recordings and heatmaps to understand user behavior in the SheenApps payment flows. This guide covers privacy-conscious setup for payment systems.

## Account Setup

### 1. Create Clarity Account
1. Go to [clarity.microsoft.com](https://clarity.microsoft.com)
2. Sign in with Microsoft account
3. Click "New project"

### 2. Project Configuration
1. **Project name**: `SheenApps Production`
2. **Website URL**: `https://sheenapps.com`
3. **Category**: Software/Technology
4. Click "Create"

### 3. Get Tracking Code
1. Go to Settings → Setup
2. Copy your Project ID (looks like: `abcdef1234`)
3. Save for environment configuration

## Integration Setup

### 1. Install Clarity Script

Create `src/components/clarity-script.tsx`:
```typescript
'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

declare global {
  interface Window {
    clarity: (action: string, ...args: any[]) => void
  }
}

export function ClarityScript() {
  const pathname = usePathname()
  
  useEffect(() => {
    // Track page views
    if (typeof window !== 'undefined' && window.clarity) {
      window.clarity('set', 'page', pathname)
    }
  }, [pathname])
  
  if (process.env.NODE_ENV !== 'production') {
    return null
  }
  
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
  
  if (!clarityId) {
    console.warn('Clarity project ID not configured')
    return null
  }
  
  return (
    <Script
      id="ms-clarity"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{
        __html: `
          (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "${clarityId}");
          
          // Set custom user properties
          window.clarity = window.clarity || function() {
            (window.clarity.q = window.clarity.q || []).push(arguments);
          };
        `
      }}
    />
  )
}
```

### 2. Add to Layout

Update `src/app/layout.tsx`:
```typescript
import { ClarityScript } from '@/components/clarity-script'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body>
        {children}
        <ClarityScript />
      </body>
    </html>
  )
}
```

### 3. Privacy Configuration

Create `src/lib/clarity-helpers.ts`:
```typescript
// Helper functions for Clarity privacy

export function initializeClarityPrivacy() {
  if (typeof window === 'undefined' || !window.clarity) {
    return
  }
  
  // Mask sensitive elements
  window.clarity('mask', [
    'input[type="password"]',
    'input[type="credit-card"]',
    'input[name*="card"]',
    'input[name*="cvv"]',
    'input[name*="cvc"]',
    '[data-sensitive="true"]',
    '.payment-form',
    '.billing-details',
  ])
  
  // Set content groups for better organization
  window.clarity('set', 'content_group', getContentGroup())
}

function getContentGroup(): string {
  const path = window.location.pathname
  
  if (path.includes('/pricing')) return 'pricing'
  if (path.includes('/dashboard/billing')) return 'billing'
  if (path.includes('/checkout')) return 'checkout'
  if (path.includes('/dashboard')) return 'dashboard'
  if (path.includes('/builder')) return 'builder'
  
  return 'other'
}

// Track custom events
export function trackClarityEvent(eventName: string, data?: Record<string, any>) {
  if (typeof window === 'undefined' || !window.clarity) {
    return
  }
  
  // Clarity custom events
  window.clarity('event', eventName, data)
}

// Set user properties (no PII)
export function setClarityUserProperties(properties: {
  plan?: string
  userType?: string
  cohort?: string
}) {
  if (typeof window === 'undefined' || !window.clarity) {
    return
  }
  
  Object.entries(properties).forEach(([key, value]) => {
    window.clarity('set', key, value)
  })
}

// Identify user (hashed ID only)
export function identifyClarityUser(hashedUserId: string) {
  if (typeof window === 'undefined' || !window.clarity) {
    return
  }
  
  window.clarity('identify', hashedUserId)
}
```

### 4. Payment Flow Tracking

Create `src/hooks/use-clarity-tracking.ts`:
```typescript
import { useEffect } from 'react'
import { trackClarityEvent, setClarityUserProperties } from '@/lib/clarity-helpers'

export function useClarityTracking() {
  // Track pricing page events
  const trackPricingView = (plan: string) => {
    trackClarityEvent('pricing_view', { plan })
  }
  
  const trackPricingClick = (plan: string, action: string) => {
    trackClarityEvent('pricing_click', { plan, action })
  }
  
  // Track checkout flow
  const trackCheckoutStart = (plan: string, price: number) => {
    trackClarityEvent('checkout_start', { plan, price })
  }
  
  const trackCheckoutComplete = (plan: string) => {
    trackClarityEvent('checkout_complete', { plan })
  }
  
  const trackCheckoutError = (error: string) => {
    trackClarityEvent('checkout_error', { error })
  }
  
  // Track billing dashboard
  const trackBillingAction = (action: string) => {
    trackClarityEvent('billing_action', { action })
  }
  
  // Track upgrade flow
  const trackUpgradeStart = (fromPlan: string, toPlan: string) => {
    trackClarityEvent('upgrade_start', { fromPlan, toPlan })
  }
  
  return {
    trackPricingView,
    trackPricingClick,
    trackCheckoutStart,
    trackCheckoutComplete,
    trackCheckoutError,
    trackBillingAction,
    trackUpgradeStart,
  }
}
```

## Privacy & Compliance

### 1. Masking Configuration

In Clarity dashboard:
1. Go to **Settings** → **Masking**
2. Set masking mode: **Strict**
3. Add CSS selectors:
   ```
   input[type="password"]
   input[type="credit-card"]
   [data-sensitive]
   .payment-form
   .billing-info
   ```

### 2. IP Anonymization
1. Go to **Settings** → **Privacy**
2. Enable **IP Anonymization**
3. Set **Data Retention**: 30 days

### 3. Cookie Consent

Implement consent check:
```typescript
export function shouldLoadClarity(): boolean {
  // Check if user has consented to analytics cookies
  const consent = getCookieConsent()
  return consent?.analytics === true
}

// In ClarityScript component
if (!shouldLoadClarity()) {
  return null
}
```

### 4. Exclude Sensitive Pages
```typescript
// Pages to exclude from recording
const EXCLUDED_PATHS = [
  '/api',
  '/admin',
  '/auth/reset-password',
]

// In ClarityScript
if (EXCLUDED_PATHS.some(path => pathname.startsWith(path))) {
  return null
}
```

## Custom Events & Insights

### 1. Conversion Funnel

Track key events:
```typescript
// Homepage → Pricing
trackClarityEvent('funnel_pricing_view')

// Pricing → Checkout
trackClarityEvent('funnel_checkout_start')

// Checkout → Success
trackClarityEvent('funnel_payment_success')

// Checkout → Failure
trackClarityEvent('funnel_payment_failure')
```

### 2. Error Tracking

Track UI errors:
```typescript
window.addEventListener('error', (event) => {
  if (event.error?.message?.includes('payment')) {
    trackClarityEvent('payment_ui_error', {
      message: event.error.message,
      source: event.filename,
      line: event.lineno,
    })
  }
})
```

### 3. Performance Metrics

Track slow interactions:
```typescript
// Track slow page loads
if (window.performance) {
  const loadTime = window.performance.timing.loadEventEnd - 
                   window.performance.timing.navigationStart
  
  if (loadTime > 3000) {
    trackClarityEvent('slow_page_load', {
      duration: loadTime,
      page: window.location.pathname,
    })
  }
}
```

## Dashboard Configuration

### 1. Create Segments

In Clarity dashboard:
1. Go to **Filters**
2. Create segments:
   - **Paying Users**: Custom tag `plan != free`
   - **Trial Users**: Custom tag `plan = trial`
   - **High Value**: Custom tag `plan = scale`
   - **Mobile Users**: Device type = Mobile

### 2. Set Up Heatmaps

Focus on key pages:
1. **Pricing Page**: Click patterns on plan selection
2. **Checkout Page**: Form abandonment points
3. **Dashboard**: Feature discovery
4. **Landing Page**: Scroll depth and CTA clicks

### 3. Configure Dashboards

Create custom dashboards:
1. **Conversion Dashboard**
   - Funnel visualization
   - Drop-off points
   - Error correlations

2. **User Behavior Dashboard**
   - Session duration by plan
   - Feature usage patterns
   - Mobile vs desktop behavior

## Testing & Validation

### 1. Test Recording
```javascript
// In browser console
window.clarity('event', 'test_event', { test: true })
```

### 2. Verify Masking
1. Navigate to payment pages
2. Enter test data in forms
3. Check recordings for masked content
4. Ensure no sensitive data visible

### 3. Check Data Flow
1. Go to Clarity dashboard
2. View recent sessions
3. Verify custom events appear
4. Check heatmap generation

## Insights & Analysis

### 1. Payment Flow Analysis
- Identify drop-off points in checkout
- Analyze form field interactions
- Find error patterns
- Optimize based on user behavior

### 2. A/B Testing Support
```typescript
// Track variant views
trackClarityEvent('ab_test_view', {
  test: 'pricing_layout',
  variant: 'A',
})

// Analyze in Clarity
// Filter by custom event and variant
```

### 3. User Journey Mapping
1. Use session recordings to understand paths
2. Identify common patterns
3. Find unexpected behaviors
4. Optimize critical flows

## Best Practices

### Do's
- Mask all sensitive data
- Use descriptive event names
- Segment users meaningfully
- Review recordings regularly
- Act on insights quickly
- Document custom events

### Don'ts
- Don't record password fields
- Don't capture payment details
- Don't store PII in events
- Don't ignore user privacy
- Don't overwhelm with events
- Don't neglect mobile users

## Integration Checklist

- [ ] Project created in Clarity
- [ ] Project ID added to env
- [ ] Script component created
- [ ] Privacy masking configured
- [ ] Custom events implemented
- [ ] Consent check added
- [ ] Sensitive pages excluded
- [ ] Testing completed
- [ ] Team access granted
- [ ] Dashboards configured

---

*Last Updated: 27 June 2025*
*Version: 1.0*