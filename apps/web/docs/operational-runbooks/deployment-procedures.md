# Deployment Procedures

## Pre-Deployment Checklist

### Code Review
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] ESLint warnings reviewed
- [ ] Database migrations tested
- [ ] Environment variables documented
- [ ] Feature flags configured

### Payment System Specific
- [ ] Webhook handlers are idempotent
- [ ] Rate limiting tested
- [ ] Error handling comprehensive
- [ ] Monitoring alerts configured
- [ ] Rollback plan prepared

## Deployment Process

### 1. Pre-Production Verification

#### Run Full Test Suite
```bash
# Local tests
npm run test
npm run test:e2e

# Type checking
npm run type-check

# Lint check
npm run lint:critical

# Build verification
npm run build
```

#### Database Migration Testing
```bash
# Test migration locally
npm run db:migrate:test

# Verify rollback
npm run db:migrate:rollback

# Check migration SQL
cat migrations/[latest].sql
```

### 2. Staging Deployment

#### Deploy to Staging
```bash
# Deploy to staging branch
git checkout staging
git merge main
git push origin staging

# Or via Vercel
vercel --env preview
```

#### Staging Verification
1. Test payment flow with test cards
2. Verify webhook processing
3. Check subscription management
4. Test admin dashboard
5. Monitor error rates

### 3. Production Deployment

#### Blue-Green Deployment
```bash
# Step 1: Deploy to green environment
vercel --prod --alias green.sheenapps.com

# Step 2: Run smoke tests
npm run test:smoke:production

# Step 3: Switch traffic
vercel alias green.sheenapps.com sheenapps.com

# Step 4: Monitor metrics
# (Keep blue environment for quick rollback)
```

#### Feature Flag Deployment
```typescript
// For risky changes, use feature flags
if (FEATURE_FLAGS.NEW_PAYMENT_FLOW) {
  // New implementation
} else {
  // Existing implementation
}

// Gradual rollout
if (shouldEnableFeature(userId, 'NEW_PAYMENT_FLOW', 0.1)) {
  // 10% of users get new feature
}
```

### 4. Post-Deployment Verification

#### Critical Paths Testing
```bash
# Test payment flow
curl -X POST https://app.sheenapps.com/api/health/payment

# Test webhook endpoint
curl -X POST https://app.sheenapps.com/api/stripe-webhook \
  -H "Stripe-Signature: test"

# Check admin dashboard
curl https://app.sheenapps.com/admin/metrics
```

#### Monitor Key Metrics
```sql
-- Payment success rate (last 5 minutes)
SELECT 
  COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as success_rate,
  COUNT(*) as total_attempts
FROM transactions
WHERE created_at > NOW() - INTERVAL '5 minutes';

-- Active issues
SELECT COUNT(*) FROM webhook_dead_letter WHERE retry_count >= max_retries;
```

## Rollback Procedures

### Immediate Rollback (< 5 minutes)
```bash
# Via Vercel
vercel rollback --prod

# Or switch alias back
vercel alias blue.sheenapps.com sheenapps.com
```

### Database Rollback
```bash
# If migration was applied
npm run db:migrate:rollback

# Or manual rollback
psql $DATABASE_URL < rollback_scripts/[version].sql
```

### Emergency Procedures
1. Enable maintenance mode
2. Stop background jobs
3. Rollback application
4. Rollback database if needed
5. Clear caches
6. Verify system health
7. Disable maintenance mode

## Deployment Types

### 1. Hotfix Deployment
For critical production issues:

```bash
# Create hotfix branch
git checkout -b hotfix/payment-issue main

# Make fix and test
# ...

# Deploy directly to production
git checkout main
git merge --no-ff hotfix/payment-issue
git push origin main

# Tag the release
git tag -a hotfix-v1.2.3 -m "Fix payment processing issue"
git push origin hotfix-v1.2.3
```

### 2. Feature Deployment
For new features:

```bash
# Ensure feature flag exists
export ENABLE_NEW_CHECKOUT=false

# Deploy code (inactive)
git checkout main
git merge feature/new-checkout
git push origin main

# Enable progressively
# 1. Internal testing (via admin panel)
# 2. 1% rollout
# 3. 10% rollout
# 4. 50% rollout
# 5. 100% rollout
```

### 3. Database Migration Deployment
For schema changes:

```bash
# Step 1: Make code backward compatible
# Deploy code that works with both schemas

# Step 2: Run migration
npm run db:migrate:production

# Step 3: Deploy code that uses new schema
# Remove backward compatibility

# Step 4: Clean up old columns/tables
npm run db:cleanup
```

## Monitoring During Deployment

### Real-time Dashboards
```bash
# Terminal 1: Error rates
watch -n 5 'curl -s https://app.sheenapps.com/api/metrics/errors | jq .'

# Terminal 2: Payment success
watch -n 5 'psql $DATABASE_URL -c "
SELECT COUNT(*) FILTER (WHERE status = '\''completed'\'') * 100.0 / COUNT(*) as rate
FROM transactions WHERE created_at > NOW() - INTERVAL '\''5 minutes'\''"'

# Terminal 3: Response times
watch -n 5 'curl -w "%{time_total}\n" -o /dev/null -s https://app.sheenapps.com/api/health'
```

### Alert Thresholds
- Error rate > 5%: Investigate
- Error rate > 10%: Consider rollback
- Payment failures > 10%: Rollback immediately
- Response time > 2s: Check performance

## Communication Plan

### Pre-Deployment
```
Subject: Scheduled Deployment - [Date] [Time] UTC

Team,

We'll be deploying the following changes:
- [Feature 1]
- [Bug fix 2]
- [Performance improvement 3]

Expected duration: 15 minutes
Risk level: Low/Medium/High
Rollback plan: Prepared

[Your Name]
```

### During Issues
```
Subject: [URGENT] Deployment Issue - Investigating

Team,

We're seeing issues with the current deployment:
- Issue: [Description]
- Impact: [User impact]
- Action: Investigating / Rolling back

Join #deployment-[date] for updates.

[Your Name]
```

### Post-Deployment
```
Subject: Deployment Complete - [Version]

Team,

Deployment completed successfully:
- Version: [x.y.z]
- Duration: [time]
- Issues: None / [List]

All systems operational.

[Your Name]
```

## Best Practices

### Do's
- Always run migrations in a transaction
- Test rollback procedures
- Monitor for 30 minutes post-deployment
- Keep previous version running (blue-green)
- Use feature flags for risky changes
- Document all environment changes

### Don'ts
- Don't deploy on Fridays
- Don't skip staging verification
- Don't deploy during high traffic
- Don't make multiple big changes at once
- Don't ignore warning signs
- Don't skip the checklist

## Deployment Schedule

### Regular Deployments
- **Tuesday & Thursday**: 2 PM UTC
- **Hotfixes**: As needed
- **Major releases**: First Tuesday of month

### Blackout Periods
- Black Friday week
- December 20-31
- Major marketing campaigns
- During payment gateway maintenance

---

*Last Updated: 27 June 2025*
*Version: 1.0*