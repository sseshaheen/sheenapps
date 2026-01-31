# Monitoring Services Setup Guide

This guide provides step-by-step instructions for setting up production monitoring services for the SheenApps payment system.

## Overview

### Services to Configure
1. **Sentry** - Error tracking and performance monitoring
2. **Microsoft Clarity** - Session recording and heatmaps
3. **ChartMogul** - Revenue analytics and subscription metrics
4. **PostHog** - Product analytics and feature tracking

### Prerequisites
- Production environment access
- Admin accounts for each service
- Environment variables configured
- Production deployment pipeline

## Quick Start Checklist

- [ ] Set up Sentry project and get DSN
- [ ] Configure Clarity project and get ID
- [ ] Create ChartMogul custom data source
- [ ] Set up PostHog project
- [ ] Update environment variables
- [ ] Deploy monitoring initialization code
- [ ] Verify data flow
- [ ] Set up alerts and dashboards

## Service Setup Guides

### 1. [Sentry Setup](./sentry-setup.md)
- Error tracking configuration
- Performance monitoring
- Custom error filtering
- Alert rules setup
- Integration with payment events

### 2. [Clarity Setup](./clarity-setup.md)
- Session recording configuration
- Privacy settings for payment data
- Custom events tracking
- Heatmap configuration
- User segment filtering

### 3. [ChartMogul Setup](./chartmogul-setup.md)
- Custom data source creation
- API integration
- Sync worker implementation
- Metric configuration
- Revenue reporting setup

### 4. [PostHog Setup](./posthog-setup.md)
- Product analytics configuration
- Feature flag setup
- Funnel analysis
- User journey tracking
- A/B testing framework

## Integration Code

### Initialize All Services
```typescript
// src/lib/monitoring.ts
import { initializeMonitoring } from '@/lib/monitoring-init'

// Call this in your app initialization
export async function setupMonitoring() {
  if (process.env.NODE_ENV === 'production') {
    await initializeMonitoring({
      sentry: {
        dsn: process.env.SENTRY_DSN,
        environment: 'production',
        tracesSampleRate: 0.1
      },
      clarity: {
        projectId: process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID
      },
      chartmogul: {
        apiKey: process.env.CHARTMOGUL_API_KEY,
        dataSourceId: process.env.CHARTMOGUL_DATA_SOURCE_ID
      },
      posthog: {
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        apiHost: process.env.NEXT_PUBLIC_POSTHOG_HOST
      }
    })
  }
}
```

## Environment Variables

Add to your production environment:

```env
# Sentry
SENTRY_DSN=https://xxx@xxx.sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project

# Microsoft Clarity
NEXT_PUBLIC_CLARITY_PROJECT_ID=xxx

# ChartMogul
CHARTMOGUL_API_KEY=xxx
CHARTMOGUL_DATA_SOURCE_ID=xxx

# PostHog
NEXT_PUBLIC_POSTHOG_KEY=xxx
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com

# Monitoring Control
ENABLE_MONITORING=true
MONITORING_SAMPLE_RATE=0.1
```

## Deployment Steps

1. **Configure Services**
   - Follow individual setup guides
   - Obtain API keys and project IDs

2. **Update Environment**
   ```bash
   # Add to production environment
   vercel env add SENTRY_DSN production
   vercel env add NEXT_PUBLIC_CLARITY_PROJECT_ID production
   # ... etc
   ```

3. **Deploy Monitoring Code**
   ```bash
   # Deploy with monitoring enabled
   git add .
   git commit -m "feat: add production monitoring"
   git push origin main
   ```

4. **Verify Integration**
   - Check each service dashboard
   - Trigger test errors
   - Verify data flow

## Privacy & Compliance

### Data Sanitization
- Never log payment card numbers
- Mask sensitive user data
- Exclude password fields
- Anonymize IP addresses where required

### GDPR Compliance
- Implement user consent for tracking
- Provide opt-out mechanisms
- Handle data deletion requests
- Document data retention policies

## Monitoring Dashboard

### Key Metrics to Track
1. **Error Rate** - Target: <0.1%
2. **Payment Success Rate** - Target: >98%
3. **API Response Time** - Target: <200ms
4. **User Conversion Funnel** - Monitor drop-offs
5. **Revenue Metrics** - MRR, churn, LTV

### Alert Configuration
- Critical errors: Immediate
- Payment failures >10%: High priority
- Performance degradation: Medium priority
- Usage anomalies: Low priority

## Troubleshooting

### Common Issues

1. **No data in dashboards**
   - Verify environment variables
   - Check browser console for errors
   - Ensure production environment
   - Verify API keys

2. **Performance impact**
   - Adjust sampling rates
   - Use async initialization
   - Implement lazy loading
   - Monitor bundle size

3. **Data discrepancies**
   - Check timezone settings
   - Verify event deduplication
   - Review data retention settings
   - Audit tracking implementation

## Maintenance

### Weekly Tasks
- Review error trends
- Check monitoring costs
- Update alert thresholds
- Archive old data

### Monthly Tasks
- Audit data accuracy
- Review privacy settings
- Update documentation
- Plan improvements

---

*Last Updated: 27 June 2025*
*Version: 1.0*