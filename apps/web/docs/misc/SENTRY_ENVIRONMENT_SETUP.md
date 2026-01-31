# Sentry Environment Separation Guide

## Best Practice: Separate Projects per Environment

### Option 1: Multiple Sentry Projects (Recommended)

Create separate projects in Sentry for each environment:

1. **Production Project**: `sheenapps-production`
   - Real user errors only
   - Lower sample rates to control costs
   - Strict alerting rules

2. **Development Project**: `sheenapps-development`
   - Developer testing errors
   - Higher sample rates for debugging
   - No critical alerts

3. **Staging Project**: `sheenapps-staging` (optional)
   - Pre-production testing
   - Same config as production

### Setting Up Multiple Projects

1. In Sentry dashboard, create separate projects:
   - sheenapps-production
   - sheenapps-development
   - sheenapps-staging (optional)

2. Use different DSNs for each environment:

**.env.local (Development)**
```bash
SENTRY_DSN=https://dev-key@org.ingest.sentry.io/dev-project-id
NEXT_PUBLIC_SENTRY_DSN=https://dev-key@org.ingest.sentry.io/dev-project-id
SENTRY_ORG=your-org
SENTRY_PROJECT=sheenapps-development
SENTRY_AUTH_TOKEN=your-auth-token
```

**.env.production (Production)**
```bash
SENTRY_DSN=https://prod-key@org.ingest.sentry.io/prod-project-id
NEXT_PUBLIC_SENTRY_DSN=https://prod-key@org.ingest.sentry.io/prod-project-id
SENTRY_ORG=your-org
SENTRY_PROJECT=sheenapps-production
SENTRY_AUTH_TOKEN=your-auth-token
```

### Option 2: Single Project with Environment Filtering

If you must use a single project, use the `environment` tag:

```typescript
// Already implemented in your configs:
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV, // 'development', 'production', 'staging'
  // ... rest of config
})
```

Then filter in Sentry dashboard:
- Use the environment dropdown to filter events
- Create saved searches for each environment
- Set up environment-specific alerts

### Option 3: Disable Sentry in Development

The simplest approach - only enable Sentry in production:

**Update sentry.client.config.ts:**
```typescript
import * as Sentry from '@sentry/nextjs'

// Only initialize in production
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    // ... your config
  })
}
```

**Update sentry.server.config.ts:**
```typescript
import * as Sentry from '@sentry/nextjs'

// Only initialize in production
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    // ... your config
  })
}
```

**Update sentry.edge.config.ts:**
```typescript
import * as Sentry from '@sentry/nextjs'

// Only initialize in production
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    // ... your config
  })
}
```

## Recommended Approach

For SheenApps, I recommend **Option 1** (Multiple Projects):

1. **Development Project**:
   - Use for local development
   - Test new Sentry features
   - No alerts configured
   - Higher sampling rates

2. **Production Project**:
   - Real user errors only
   - Critical alerts configured
   - Lower sampling rates
   - Linked to your incident response

## Environment Variables by Deployment

### Local Development (.env.local)
```bash
# Development Sentry Project
SENTRY_DSN=https://dev-key@org.ingest.sentry.io/dev-project
NEXT_PUBLIC_SENTRY_DSN=https://dev-key@org.ingest.sentry.io/dev-project
SENTRY_ENVIRONMENT=development
```

### Vercel Production (Environment Variables)
```bash
# Production Sentry Project
SENTRY_DSN=https://prod-key@org.ingest.sentry.io/prod-project
NEXT_PUBLIC_SENTRY_DSN=https://prod-key@org.ingest.sentry.io/prod-project
SENTRY_ENVIRONMENT=production
```

### Vercel Preview (Environment Variables)
```bash
# Staging/Preview Sentry Project
SENTRY_DSN=https://staging-key@org.ingest.sentry.io/staging-project
NEXT_PUBLIC_SENTRY_DSN=https://staging-key@org.ingest.sentry.io/staging-project
SENTRY_ENVIRONMENT=preview
```

## Quick Setup Decision

If you want the simplest approach right now:

1. **For immediate setup**: Use Option 3 - Only enable Sentry in production
2. **For long-term**: Set up Option 1 - Create separate projects

This way, your local development won't pollute your production error tracking!