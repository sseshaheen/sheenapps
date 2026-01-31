# Billing & Payments Architecture

## Overview
This document serves as the main index for the comprehensive billing and payments system in SheenApps. The architecture supports multiple payment gateways, usage tracking, trials, bonuses, referrals, and enterprise-grade monitoring.

## Architecture Components

### 1. [Stripe Implementation](./STRIPE_IMPLEMENTATION.md)
Core Stripe integration covering:
- Checkout session creation
- Webhook event handling
- Customer portal integration
- Tax configuration
- Idempotency and reliability

### 2. [Multi-Gateway Architecture](./MULTI_GATEWAY.md)
Unified payment processing across providers:
- Gateway abstraction layer
- Stripe, Cashier, and PayPal support
- Country-based gateway selection
- Currency mapping
- Transaction service

### 3. [Usage Tracking & Quotas](./USAGE_TRACKING.md)
Resource usage management:
- Real-time usage tracking
- Quota enforcement middleware
- Base + bonus limit system
- Usage analytics
- Background aggregation

### 4. [Trial System](./TRIALS.md)
Free trial management:
- 14-day trial periods
- Eligibility checking
- Trial extension via referrals
- Automated notifications
- Conversion tracking

### 5. [Bonus System](./BONUSES.md)
Additional usage rewards:
- Signup bonuses
- Referral rewards
- Social sharing incentives
- Expiry tracking
- FIFO consumption

### 6. [Referral Program](./REFERRALS.md)
User acquisition tracking:
- Referral code generation
- Attribution tracking
- Revenue attribution
- Fraud prevention
- Analytics

### 7. [Admin Dashboard](./ADMIN_DASHBOARD.md)
Internal monitoring tools:
- Revenue metrics (MRR, churn, LTV)
- Usage analytics
- Failed payment monitoring
- Webhook event logs
- Power user identification

### 8. [Monitoring & Analytics](./MONITORING.md)
Production monitoring setup:
- Sentry error tracking
- Microsoft Clarity sessions
- PostHog product analytics
- Feature flags
- Privacy compliance

### 9. [ChartMogul Integration](./CHARTMOGUL_INTEGRATION.md)
Revenue analytics platform:
- Custom data source setup
- Transaction synchronization
- Cohort analysis
- MRR tracking
- Segmentation

### 10. [Webhook Reliability](./WEBHOOK_RELIABILITY.md)
Zero-loss webhook processing:
- Dead letter queue
- Exponential backoff retry
- Manual intervention tools
- Health monitoring
- Recovery procedures

## Quick Start

### For New Developers
1. Read [Stripe Implementation](./STRIPE_IMPLEMENTATION.md) for core payment flow
2. Understand [Multi-Gateway Architecture](./MULTI_GATEWAY.md) for abstraction layer
3. Review [Usage Tracking](./USAGE_TRACKING.md) for quota system

### For Operations
1. Check [Admin Dashboard](./ADMIN_DASHBOARD.md) for monitoring tools
2. Review [Webhook Reliability](./WEBHOOK_RELIABILITY.md) for error handling
3. See [Monitoring](./MONITORING.md) for production alerts

### For Product Teams
1. Understand [Trial System](./TRIALS.md) for user onboarding
2. Review [Bonus System](./BONUSES.md) for engagement features
3. Check [Referral Program](./REFERRALS.md) for growth mechanics

## Database Schema Overview

### Core Tables
- `transactions` - Unified payment records
- `subscriptions` - Active subscription state
- `customers` - Payment provider mapping
- `usage_events` - Real-time usage tracking
- `usage_bonuses` - Bonus grant tracking
- `referrals` - Referral attribution
- `webhook_dead_letter` - Failed webhook queue

## Environment Variables

### Required for Production
```env
# Stripe
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx

# Admin
ADMIN_EMAILS=admin@company.com,billing@company.com

# Monitoring (Production Only)
SENTRY_DSN=https://xxx@sentry.io/xxx
NEXT_PUBLIC_CLARITY_PROJECT_ID=xxx
CHARTMOGUL_API_KEY=xxx
NEXT_PUBLIC_POSTHOG_KEY=xxx

# Cron Jobs
CRON_SECRET=xxx
```

## API Endpoints

### Customer-Facing
- `POST /api/stripe/create-checkout` - Start subscription
- `POST /api/billing/portal` - Manage subscription
- `GET /api/billing/check-quota` - Check usage limits
- `POST /api/billing/track-usage` - Track usage

### Internal/Admin
- `GET /api/admin/metrics/revenue` - Revenue dashboard
- `POST /api/admin/webhooks/retry` - Manual webhook retry
- `GET /api/cron/webhook-retry` - Automated retry job
- `GET /api/cron/chartmogul-sync` - Revenue sync

## Implementation Phases

### Phase 1: Core Billing ✅
- Stripe checkout integration
- Basic subscription management
- Webhook handling

### Phase 2: Multi-Gateway ✅
- Gateway abstraction layer
- Multiple currency support
- Unified transaction tracking

### Phase 3: Usage System ✅
- Quota tracking
- Usage enforcement
- Bonus system

### Phase 4: Growth Features ✅
- Trial periods
- Referral program
- Attribution tracking

### Phase 5: Operations ✅
- Admin dashboard
- Failed payment handling
- Webhook reliability

### Phase 6: Analytics ✅
- Production monitoring
- Revenue analytics
- User behavior tracking

## Best Practices

### Security
- Always verify webhook signatures
- Use idempotency keys for mutations
- Never expose API keys
- Implement rate limiting
- Audit all operations

### Reliability
- Use dead letter queues
- Implement exponential backoff
- Monitor system health
- Plan for gateway failures
- Test recovery procedures

### Performance
- Cache quota checks
- Batch usage updates
- Async webhook processing
- Optimize database queries
- Monitor response times

## Support & Maintenance

### Daily Tasks
- Monitor webhook health
- Check failed payments
- Review error alerts

### Weekly Tasks
- Analyze conversion metrics
- Review usage patterns
- Check sync accuracy

### Monthly Tasks
- Revenue reconciliation
- Performance optimization
- Documentation updates

---

*Last Updated: 27 June 2025*
*Version: 2.0 - Modular Architecture*