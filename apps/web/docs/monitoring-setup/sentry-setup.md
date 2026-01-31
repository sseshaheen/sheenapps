# Sentry Setup Guide

## Overview
Sentry provides error tracking and performance monitoring for the SheenApps payment system. This guide covers production setup with payment-specific configurations.

## Account Setup

### 1. Create Sentry Account
1. Go to [sentry.io](https://sentry.io)
2. Sign up for a Team plan (or start with Developer)
3. Create an organization: `sheenapps`

### 2. Create Project
1. Click "Create Project"
2. Select platform: **Next.js**
3. Set project name: `sheenapps-production`
4. Note your DSN: `https://xxx@xxx.sentry.io/xxx`

### 3. Configure Project Settings
Navigate to Project Settings:
- **General**:
  - Set project slug: `sheenapps`
  - Enable "Resolve in Commit"
- **Client Keys (DSN)**:
  - Copy your DSN for environment setup
- **Security & Privacy**:
  - Enable "Require Authentication"
  - Set allowed domains: `sheenapps.com`

## Integration Setup

### 1. Install Sentry Packages
```bash
npm install --save @sentry/nextjs
```

### 2. Initialize Sentry Configuration

#### Configuration Files Overview
- **sentry.client.config.ts**: Runs in the browser for client-side error tracking
- **sentry.server.config.ts**: Runs on the server for API routes and server-side rendering
- **sentry.edge.config.ts**: Runs in edge runtime for middleware and edge API routes

Create `sentry.client.config.ts`:
```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',

  // Performance Monitoring with env variable support
  tracesSampleRate: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE 
    ? parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE)
    : process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Error sampling for quota control
  sampleRate: process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE
    ? parseFloat(process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE)
    : 1.0,

  // Session Replay
  replaysSessionSampleRate: 0.1, // 10% of sessions
  replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

  // Global tags configuration
  initialScope: {
    tags: {
      env: process.env.NODE_ENV,
      region: process.env.NEXT_PUBLIC_REGION || 'default',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    },
  },

  // Integrations
  integrations: [
    new Sentry.BrowserTracing({
      routingInstrumentation: Sentry.nextRouterInstrumentation,
    }),
    new Sentry.Replay({
      maskAllText: true,
      blockAllMedia: true,
      // Mask sensitive selectors
      mask: ['.payment-form', '[data-sensitive]'],
    }),
  ],

  // Filtering
  ignoreErrors: [
    // Browser errors
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
    // Expected errors
    'Quota exceeded',
    'User denied permission',
  ],

  // Filter noisy breadcrumbs
  beforeBreadcrumb(breadcrumb, hint) {
    // Filter out console logs
    if (breadcrumb.category === 'console') {
      return null
    }

    // Filter out noisy click events
    if (breadcrumb.category === 'ui.click' && !breadcrumb.message?.includes('button')) {
      return null
    }

    // Filter out frequent navigation events
    if (breadcrumb.category === 'navigation' && breadcrumb.data?.from === breadcrumb.data?.to) {
      return null
    }

    return breadcrumb
  },

  beforeSend(event, hint) {
    // Filter bot/crawler traffic
    const userAgent = window.navigator?.userAgent || ''
    const botPatterns = [
      /bot/i, /crawler/i, /spider/i, /crawling/i,
      /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
      /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
      /twitterbot/i, /linkedinbot/i, /whatsapp/i,
      /slackbot/i, /telegram/i, /applebot/i,
      /pingdom/i, /uptimerobot/i, /lighthouse/i, /pagespeed/i,
    ]

    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      return null
    }

    // Filter out non-critical errors
    if (event.exception?.values?.[0]?.value?.includes('quota_exceeded')) {
      return null
    }

    // Sanitize sensitive data
    if (event.request?.cookies) {
      event.request.cookies = '[Filtered]'
    }

    // Add payment context
    if (event.tags?.transaction_type === 'payment') {
      event.level = 'error'
      event.fingerprint = ['payment-error', event.exception?.values?.[0]?.type]
    }

    return event
  },
})
```

Create `sentry.server.config.ts`:
```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  
  // Use environment variable for flexibility
  tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE 
    ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Error sampling for quota control
  sampleRate: process.env.SENTRY_SAMPLE_RATE
    ? parseFloat(process.env.SENTRY_SAMPLE_RATE)
    : 1.0,

  // Note: Replays are client-only, not meaningful server-side

  integrations: [
    // Profiling
    new Sentry.Integrations.ProfilingIntegration(),
  ],

  // Capture unhandled promise rejections
  captureUnhandledRejections: true,

  // Global tags configuration
  initialScope: {
    tags: {
      env: process.env.NODE_ENV,
      region: process.env.REGION || 'default',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
    },
  },

  beforeSend(event, hint) {
    // Filter bot/crawler traffic
    const userAgent = hint.request?.headers?.['user-agent'] || ''
    const botPatterns = [
      /bot/i, /crawler/i, /spider/i, /crawling/i,
      /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
      /baiduspider/i, /yandexbot/i, /facebookexternalhit/i,
      /twitterbot/i, /linkedinbot/i, /whatsapp/i,
      /slackbot/i, /telegram/i, /applebot/i,
      /pingdom/i, /uptimerobot/i, /lighthouse/i, /pagespeed/i,
    ]

    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      return null
    }

    // Sanitize server-side data
    if (event.extra?.stripe_webhook) {
      event.extra.stripe_webhook = '[Filtered]'
    }

    // Tag payment-related errors
    const error = hint.originalException
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = String(error.message)
      if (errorMessage.includes('payment')) {
        event.tags = { ...event.tags, category: 'payment' }
      }
    }

    return event
  },
})
```

Create `sentry.edge.config.ts`:
```typescript
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_APP_VERSION || 'dev',
  
  // Use environment variable for flexibility
  tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE 
    ? parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE)
    : 0.1,

  // Error sampling for quota control
  sampleRate: process.env.SENTRY_SAMPLE_RATE
    ? parseFloat(process.env.SENTRY_SAMPLE_RATE)
    : 1.0,

  // Global tags configuration
  initialScope: {
    tags: {
      env: process.env.NODE_ENV,
      region: process.env.REGION || 'default',
      version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
      runtime: 'edge',
    },
  },

  // Edge-specific configuration
  transportOptions: {
    headers: {
      'X-Sentry-Auth': `Sentry sentry_key=${process.env.SENTRY_DSN}`,
    },
  },
})
```

### 3. Next.js Configuration

Update `next.config.ts`:
```typescript
import type { NextConfig } from "next";

// Bundle analyzer for optimization
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

// Sentry configuration (conditionally applied)
let withSentryConfig: any = (config: NextConfig) => config;
if (process.env.NODE_ENV !== 'development') {
  try {
    const { withSentryConfig: sentryPlugin } = require('@sentry/nextjs');
    const sentryWebpackPluginOptions = {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    };
    withSentryConfig = (config: NextConfig) => sentryPlugin(config, sentryWebpackPluginOptions);
  } catch (e) {
    console.warn('Sentry plugin not found, skipping Sentry configuration');
  }
}

const nextConfig: NextConfig = {
  // Your existing Next.js config
};

export default withSentryConfig(withBundleAnalyzer(nextConfig));
```

**Note**: The webpack plugin automatically handles source map uploads during the build process. Ensure your CI/CD pipeline includes the `SENTRY_AUTH_TOKEN` environment variable for uploading source maps securely.

### 4. Payment-Specific Error Tracking

Create `src/lib/sentry-helpers.ts`:
```typescript
import * as Sentry from '@sentry/nextjs'

export function capturePaymentError(
  error: Error,
  context: {
    userId?: string
    gateway?: string
    amount?: number
    currency?: string
    operation?: string
  }
) {
  Sentry.withScope((scope) => {
    scope.setTag('category', 'payment')
    scope.setLevel('error')
    scope.setContext('payment', {
      gateway: context.gateway,
      amount: context.amount,
      currency: context.currency,
      operation: context.operation,
    })
    scope.setUser({ id: context.userId })

    Sentry.captureException(error)
  })
}

export function trackPaymentPerformance(
  operation: string,
  duration: number,
  success: boolean
) {
  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction()

  if (transaction) {
    const span = transaction.startChild({
      op: `payment.${operation}`,
      description: `Payment ${operation}`,
    })

    span.setData('success', success)
    span.setData('duration_ms', duration)

    span.finish()
  }
}

export function captureWebhookError(
  error: Error,
  webhookData: {
    gateway: string
    eventType: string
    eventId: string
  }
) {
  Sentry.withScope((scope) => {
    scope.setTag('category', 'webhook')
    scope.setTag('gateway', webhookData.gateway)
    scope.setLevel('warning')
    scope.setContext('webhook', webhookData)

    Sentry.captureException(error)
  })
}
```

### 5. User Context Setup

Set user context once at login/auth time:
```typescript
// In your auth handler or _app.tsx
import * as Sentry from '@sentry/nextjs'

// After successful authentication
Sentry.setUser({
  id: user.id,
  email: user.email,
  username: user.username,
  // Add any other non-sensitive user attributes
})

// On logout
Sentry.setUser(null)
```

## Monitoring Configuration

### 1. Performance Monitoring

Set up custom transactions:
```typescript
// In your API routes
import * as Sentry from '@sentry/nextjs'

export async function POST(request: NextRequest) {
  const transaction = Sentry.startTransaction({
    op: 'payment.checkout',
    name: 'Create Checkout Session',
  })

  Sentry.getCurrentHub().configureScope(scope => scope.setSpan(transaction))

  try {
    const span = transaction.startChild({
      op: 'db.query',
      description: 'Check user quota',
    })

    // Your logic here

    span.finish()

    transaction.setStatus('ok')
    return NextResponse.json({ success: true })
  } catch (error) {
    transaction.setStatus('internal_error')
    capturePaymentError(error, { operation: 'checkout' })
    throw error
  } finally {
    transaction.finish()
  }
}
```

### 2. Alert Rules

Configure alerts in Sentry dashboard:

1. **Payment Errors Alert**
   - When: Error count > 10 in 5 minutes
   - Filter: `tags.category:payment`
   - Action: Email + Slack

2. **High Error Rate Alert**
   - When: Error rate > 1%
   - Window: 5 minutes
   - Action: Page on-call

3. **Unhandled Promise Rejections Alert**
   - When: Count > 20 in 10 minutes
   - Filter: `mechanism.type:onunhandledrejection`
   - Action: Email + Slack

4. **Repeated Errors Alert**
   - When: Same fingerprint > 50 occurrences in 30 minutes
   - Action: Create issue + notify team

5. **Performance Degradation**
   - When: p95 response time > 1s
   - Filter: `transaction.op:payment.*`
   - Action: Email engineering

6. **Webhook Failures**
   - When: Error count > 5
   - Filter: `tags.category:webhook`
   - Action: Email + create issue

### 3. Dashboard Setup

Create custom dashboards:

1. **Payment Health Dashboard**
   - Error rate by gateway
   - Top payment errors
   - Transaction success rate
   - Performance by operation

2. **User Impact Dashboard**
   - Errors by user segment
   - Most affected users
   - Error patterns by country

## Testing

### 1. Test Error Capture
```typescript
// Test in development
Sentry.captureException(new Error('Test payment error'))

// Test with context
capturePaymentError(new Error('Test checkout failure'), {
  userId: 'test-user',
  gateway: 'stripe',
  amount: 1000,
  currency: 'USD',
  operation: 'checkout.create'
})

// Test webhook error with mock
captureWebhookError(new Error('Test webhook failure'), {
  gateway: 'stripe',
  eventType: 'test.webhook',
  eventId: 'test-123'
})

// Run full test suite
import { testSentryIntegration } from '@/lib/sentry-helpers'
testSentryIntegration()
```

Note: In development, console.warn statements will confirm event capture locally before checking the Sentry dashboard.

### 2. Verify in Dashboard
1. Go to sentry.io dashboard
2. Check Issues tab for test errors
3. Verify context and tags
4. Check Performance tab

### 3. Test Alerts
1. Generate multiple errors quickly
2. Verify alert triggers
3. Check notification delivery

## Environment Variables

```bash
# Required
SENTRY_DSN=https://xxx@xxx.sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.sentry.io/xxx
SENTRY_ORG=sheenapps
SENTRY_PROJECT=sheenapps-production
SENTRY_AUTH_TOKEN=xxx  # Required in CI/CD for source map uploads

# Optional (with defaults)
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_SAMPLE_RATE=1.0
NEXT_PUBLIC_SENTRY_SAMPLE_RATE=1.0
REGION=us-east-1
NEXT_PUBLIC_REGION=us-east-1
NEXT_PUBLIC_APP_VERSION=1.0.0
```

## Production Checklist

- [ ] DSN configured in production env
- [ ] Source maps uploaded (handled by webpack plugin)
- [ ] Alerts configured (including unhandled rejections)
- [ ] Team members added
- [ ] Integrations connected (Slack, etc.)
- [ ] Performance monitoring enabled
- [ ] Session replay configured
- [ ] Privacy settings reviewed
- [ ] Retention policies set
- [ ] Bot/crawler filtering active
- [ ] Breadcrumb filtering configured
- [ ] Global tags set (env, version, region)

## Best Practices

### Do's
- Use descriptive error messages
- Add context to all payment errors
- Set appropriate error levels
- Use fingerprinting for grouping
- Monitor performance of critical paths
- Regularly review and triage errors

### Don'ts
- Don't log sensitive payment data
- Don't capture personal information
- Don't ignore error spikes
- Don't use Sentry for logging
- Don't disable in production
- Don't forget to filter noise

## Cost Management

### Optimize Usage
1. Set appropriate sample rates
2. Use inbound filters
3. Configure data retention
4. Monitor quota usage
5. Archive resolved issues

### Recommended Quotas
- Errors: 50K/month
- Transactions: 100K/month
- Replays: 1K/month
- Attachments: 1GB/month

---

*Last Updated: 27 June 2025*
*Version: 1.0*
