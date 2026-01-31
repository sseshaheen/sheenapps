# Monitoring & Analytics Integration

## Overview
Production monitoring setup for error tracking, performance monitoring, user behavior analytics, and revenue tracking across multiple services.

## Production-Only Architecture

### Conditional Initialization
```typescript
// src/lib/monitoring-init.ts
export async function initializeMonitoring() {
  // Only initialize in production
  if (process.env.NODE_ENV !== 'production') {
    console.log('Monitoring disabled in development');
    return;
  }

  // Initialize all monitoring services
  await Promise.all([
    initializeSentry(),
    initializeClarity(),
    initializePostHog(),
    // ChartMogul is initialized server-side only
  ]);
}

// Call in app initialization
if (typeof window !== 'undefined') {
  initializeMonitoring();
}
```

## Sentry Error Tracking

### Client-Side Configuration
```typescript
// src/lib/sentry-client.ts
import * as Sentry from '@sentry/nextjs';

export function initializeSentry() {
  if (process.env.NODE_ENV !== 'production') return;

  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    
    // Performance monitoring
    tracesSampleRate: 0.1, // 10% of transactions
    
    // Session replay for errors
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    // Integrations
    integrations: [
      new Sentry.BrowserTracing({
        routingInstrumentation: Sentry.nextRouterInstrumentation,
      }),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
        mask: ['.payment-form', '[data-sensitive]'],
      }),
    ],
    
    // Error filtering
    beforeSend(event, hint) {
      // Filter out non-critical errors
      const error = hint.originalException;
      const errorMessage = error?.message || '';
      
      // Business logic errors (not actual errors)
      const ignoredErrors = [
        'quota_exceeded',
        'trial_already_used',
        'subscription_exists',
        'payment_method_required'
      ];
      
      if (ignoredErrors.some(msg => errorMessage.includes(msg))) {
        return null;
      }
      
      // Tag payment errors for priority
      if (errorMessage.includes('payment') || errorMessage.includes('stripe')) {
        event.level = 'error';
        event.tags = { ...event.tags, category: 'payment' };
      }
      
      return event;
    },
  });
}
```

### Server-Side Configuration
```typescript
// src/lib/sentry-server.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  
  // Server-specific integrations
  integrations: [
    new Sentry.Integrations.ProfilingIntegration(),
  ],
  
  beforeSend(event, hint) {
    // Sanitize sensitive data
    if (event.request?.cookies) {
      event.request.cookies = '[Filtered]';
    }
    
    if (event.extra?.stripe_webhook) {
      event.extra.stripe_webhook = '[Filtered]';
    }
    
    return event;
  },
});
```

### Payment Error Helpers
```typescript
// src/lib/sentry-helpers.ts
export function capturePaymentError(
  error: Error,
  context: {
    userId?: string;
    gateway?: string;
    amount?: number;
    currency?: string;
    operation?: string;
  }
) {
  if (process.env.NODE_ENV !== 'production') {
    console.error('Payment error:', error, context);
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag('category', 'payment');
    scope.setLevel('error');
    scope.setContext('payment', context);
    scope.setUser({ id: context.userId });
    
    Sentry.captureException(error);
  });
}

export function trackPaymentPerformance(
  operation: string,
  duration: number,
  success: boolean
) {
  if (process.env.NODE_ENV !== 'production') return;

  const transaction = Sentry.getCurrentHub()
    .getScope()
    ?.getTransaction();
  
  if (transaction) {
    const span = transaction.startChild({
      op: `payment.${operation}`,
      description: `Payment ${operation}`,
    });
    
    span.setData('success', success);
    span.setData('duration_ms', duration);
    span.finish();
  }
}
```

## Microsoft Clarity Session Recording

### Clarity Integration
```typescript
// src/components/clarity-script.tsx
'use client';

import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function ClarityScript() {
  const pathname = usePathname();
  
  useEffect(() => {
    if (typeof window !== 'undefined' && window.clarity) {
      window.clarity('set', 'page', pathname);
    }
  }, [pathname]);
  
  if (process.env.NODE_ENV !== 'production') {
    return null;
  }
  
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  if (!clarityId) return null;
  
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
        `
      }}
    />
  );
}
```

### Privacy Configuration
```typescript
// src/lib/clarity-helpers.ts
export function initializeClarityPrivacy() {
  if (typeof window === 'undefined' || !window.clarity) return;
  
  // Mask sensitive elements
  window.clarity('mask', [
    'input[type="password"]',
    'input[type="credit-card"]',
    'input[name*="card"]',
    '[data-sensitive="true"]',
    '.payment-form',
    '.billing-details',
  ]);
  
  // Set user properties (no PII)
  const user = getCurrentUser();
  if (user) {
    window.clarity('identify', hashUserId(user.id));
    window.clarity('set', 'plan', user.subscription?.plan || 'free');
  }
}
```

## PostHog Product Analytics

### PostHog Client Setup
```typescript
// src/lib/posthog-client.ts
import posthog from 'posthog-js';

export function initializePostHog() {
  if (process.env.NODE_ENV !== 'production') return;
  
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
    
    // Privacy settings
    autocapture: false,
    capture_pageview: false,
    disable_session_recording: false,
    
    // Session recording privacy
    session_recording: {
      maskTextSelector: '[data-sensitive="true"]',
      maskAllInputs: false,
      maskInputOptions: {
        password: true,
        email: false,
      },
    },
    
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') {
        posthog.opt_out_capturing();
      }
    },
  });
}
```

### Event Tracking
```typescript
// src/lib/analytics-events.ts
export const BILLING_EVENTS = {
  // Subscription events
  CHECKOUT_STARTED: 'billing.checkout_started',
  CHECKOUT_COMPLETED: 'billing.checkout_completed',
  CHECKOUT_FAILED: 'billing.checkout_failed',
  SUBSCRIPTION_UPGRADED: 'billing.subscription_upgraded',
  SUBSCRIPTION_DOWNGRADED: 'billing.subscription_downgraded',
  SUBSCRIPTION_CANCELLED: 'billing.subscription_cancelled',
  
  // Usage events
  QUOTA_EXCEEDED: 'billing.quota_exceeded',
  BONUS_GRANTED: 'billing.bonus_granted',
  BONUS_CONSUMED: 'billing.bonus_consumed',
  
  // Payment events
  PAYMENT_METHOD_UPDATED: 'billing.payment_method_updated',
  PAYMENT_FAILED: 'billing.payment_failed',
  PAYMENT_RETRY_SUCCESS: 'billing.payment_retry_success',
  
  // Webhook events
  WEBHOOK_RECEIVED: 'billing.webhook_received',
  WEBHOOK_FAILED: 'billing.webhook_failed',
  WEBHOOK_RETRY: 'billing.webhook_retry',
};

export function trackBillingEvent(
  event: keyof typeof BILLING_EVENTS | string,
  properties?: Record<string, any>
) {
  if (process.env.NODE_ENV !== 'production') return;
  
  const eventName = typeof event === 'string' && event in BILLING_EVENTS
    ? BILLING_EVENTS[event as keyof typeof BILLING_EVENTS]
    : event;
  
  // PostHog
  if (typeof posthog !== 'undefined') {
    posthog.capture(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
    });
  }
  
  // Clarity custom events
  if (typeof window !== 'undefined' && window.clarity) {
    window.clarity('event', eventName, properties);
  }
  
  // Sentry breadcrumb
  if (typeof Sentry !== 'undefined') {
    Sentry.addBreadcrumb({
      category: 'billing',
      message: eventName,
      level: 'info',
      data: properties,
    });
  }
}
```

## Unified Event Wrapper

### Cross-Service Event Tracking
```typescript
// src/lib/monitoring-events.ts
export class MonitoringService {
  static trackEvent(
    category: 'billing' | 'usage' | 'feature' | 'error',
    action: string,
    properties?: Record<string, any>
  ) {
    if (process.env.NODE_ENV !== 'production') return;
    
    const eventName = `${category}.${action}`;
    const enrichedProperties = {
      ...properties,
      category,
      action,
      timestamp: new Date().toISOString(),
      session_id: getSessionId(),
      user_id: getCurrentUserId(),
    };
    
    // Send to all services
    this.sendToPostHog(eventName, enrichedProperties);
    this.sendToClarity(eventName, enrichedProperties);
    this.addSentryBreadcrumb(eventName, enrichedProperties);
    
    // Queue for server-side processing (ChartMogul)
    if (category === 'billing') {
      this.queueForChartMogul(eventName, enrichedProperties);
    }
  }
  
  static trackError(
    error: Error,
    context?: Record<string, any>
  ) {
    if (process.env.NODE_ENV !== 'production') return;
    
    // Sentry
    Sentry.captureException(error, {
      contexts: { custom: context },
    });
    
    // PostHog
    posthog?.capture('error_occurred', {
      error_message: error.message,
      error_stack: error.stack,
      ...context,
    });
  }
  
  private static queueForChartMogul(
    event: string,
    properties: Record<string, any>
  ) {
    // Store in queue for batch processing
    fetch('/api/analytics/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, properties }),
    }).catch(console.error);
  }
}
```

## Feature Flags (PostHog)

### Feature Flag Integration
```typescript
// src/hooks/use-feature-flag.ts
import { useEffect, useState } from 'react';
import posthog from 'posthog-js';

export function useFeatureFlag(flagName: string): boolean {
  const [enabled, setEnabled] = useState(false);
  
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // Default to true in development
      setEnabled(true);
      return;
    }
    
    const checkFlag = () => {
      const isEnabled = posthog.isFeatureEnabled(flagName);
      setEnabled(isEnabled);
    };
    
    // Initial check
    checkFlag();
    
    // Listen for flag changes
    posthog.onFeatureFlags(checkFlag);
  }, [flagName]);
  
  return enabled;
}
```

## Monitoring Alerts Configuration

### Sentry Alerts
```javascript
// Sentry Dashboard Configuration
const sentryAlerts = [
  {
    name: 'Payment Failures Spike',
    conditions: [
      'An event is seen',
      'The event is tagged with category:payment',
      'The event level is error',
    ],
    filters: [
      'The issue is older than 1 minute',
      'The issue has happened at least 10 times',
    ],
    actions: [
      'Send an email to billing-team@company.com',
      'Send a Slack notification to #alerts-billing',
    ],
  },
  {
    name: 'High Error Rate',
    conditions: [
      'Error rate is greater than 1%',
      'For more than 5 minutes',
    ],
    actions: [
      'Page on-call engineer',
    ],
  },
];
```

### PostHog Alerts
```javascript
// PostHog Dashboard Configuration
const posthogAlerts = [
  {
    name: 'Checkout Abandonment Rate',
    metric: 'Funnel conversion rate',
    threshold: '< 60%',
    action: 'Email product team',
  },
  {
    name: 'Usage Spike Detection',
    metric: 'AI generations per hour',
    threshold: '> 200% of rolling average',
    action: 'Check infrastructure scaling',
  },
];
```

## Privacy & Compliance

### Data Sanitization
```typescript
// src/lib/monitoring-privacy.ts
export function sanitizeUserData(data: any): any {
  const sensitiveFields = [
    'password',
    'creditCard',
    'cvv',
    'ssn',
    'taxId',
    'bankAccount',
  ];
  
  const sanitized = { ...data };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  // Sanitize nested objects
  for (const key in sanitized) {
    if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeUserData(sanitized[key]);
    }
  }
  
  return sanitized;
}
```

### User Consent
```typescript
// src/hooks/use-analytics-consent.ts
export function useAnalyticsConsent() {
  const [consent, setConsent] = useState<{
    analytics: boolean;
    marketing: boolean;
  }>(() => {
    const stored = localStorage.getItem('analytics_consent');
    return stored ? JSON.parse(stored) : { analytics: false, marketing: false };
  });
  
  const updateConsent = (newConsent: Partial<typeof consent>) => {
    const updated = { ...consent, ...newConsent };
    setConsent(updated);
    localStorage.setItem('analytics_consent', JSON.stringify(updated));
    
    // Update monitoring services
    if (updated.analytics) {
      posthog?.opt_in_capturing();
      window.clarity?.('start');
    } else {
      posthog?.opt_out_capturing();
      window.clarity?.('stop');
    }
  };
  
  return { consent, updateConsent };
}
```

## Environment Variables

```env
# Production monitoring services
SENTRY_DSN=https://xxx@xxx.sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project

NEXT_PUBLIC_CLARITY_PROJECT_ID=xxx

NEXT_PUBLIC_POSTHOG_KEY=xxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Feature control
ENABLE_MONITORING=true
MONITORING_SAMPLE_RATE=0.1
```

## Testing & Validation

### Development Testing
```typescript
// src/lib/monitoring-test.ts
export function testMonitoringSetup() {
  console.log('Testing monitoring setup...');
  
  // Test Sentry
  try {
    throw new Error('Test Sentry error');
  } catch (error) {
    capturePaymentError(error as Error, {
      operation: 'test',
      gateway: 'test',
    });
  }
  
  // Test PostHog
  trackBillingEvent('CHECKOUT_STARTED', {
    test: true,
    plan: 'test',
  });
  
  // Test Clarity
  if (window.clarity) {
    window.clarity('event', 'test_event');
  }
  
  console.log('Monitoring test complete');
}
```

## Best Practices

### Do's
- Initialize only in production
- Sanitize all sensitive data
- Use consistent event naming
- Monitor performance impact
- Respect user privacy choices

### Don'ts
- Don't track PII
- Don't enable in development
- Don't ignore error budgets
- Don't over-track events
- Don't forget GDPR compliance

---

*Last Updated: 27 June 2025*