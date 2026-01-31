# Incident Response Playbook

## Quick Reference

### Severity Levels
- **SEV-1**: Service down, all payments failing (Response: Immediate)
- **SEV-2**: Degraded service, >10% failures (Response: 30 min)
- **SEV-3**: Minor issues, <10% impact (Response: 2 hours)

### On-Call Contacts
- Primary: oncall@sheenapps.com
- Escalation: cto@sheenapps.com
- Stripe Support: [Enterprise Dashboard](https://dashboard.stripe.com/support)

## Incident Types & Responses

### 1. Payment Processing Failure

#### Symptoms
- Multiple failed payment notifications
- Customer complaints about checkout
- Abnormal failure rate in admin dashboard

#### Immediate Actions
1. **Verify Gateway Status**
   ```bash
   # Check Stripe
   curl https://status.stripe.com/api/v2/status.json
   
   # Check our endpoint
   curl -X POST https://app.sheenapps.com/api/health/payment
   ```

2. **Check Recent Changes**
   ```bash
   # Recent deployments
   vercel list --prod --limit 5
   
   # Recent migrations
   SELECT * FROM schema_migrations 
   ORDER BY executed_at DESC 
   LIMIT 5;
   ```

3. **Isolate the Issue**
   - Test with test card: 4242 4242 4242 4242
   - Check specific gateway (Stripe vs Cashier)
   - Verify by country/currency

#### Resolution Steps
1. **For API Key Issues**:
   ```bash
   # Verify environment variables
   vercel env pull
   grep STRIPE .env
   
   # Test key validity
   stripe charges list --limit 1 --api-key $STRIPE_SECRET_KEY
   ```

2. **For Code Issues**:
   ```bash
   # Quick rollback
   vercel rollback --prod
   
   # Or specific commit
   git revert <commit-hash>
   vercel --prod
   ```

3. **For Database Issues**:
   ```sql
   -- Check connection pool
   SELECT count(*) FROM pg_stat_activity;
   
   -- Kill stuck queries
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle in transaction' 
   AND state_change < NOW() - INTERVAL '10 minutes';
   ```

### 2. Webhook Processing Failure

#### Symptoms
- Subscriptions not updating after payment
- Dead letter queue growing
- Webhook endpoint returning errors

#### Immediate Actions
1. **Check Webhook Health**
   ```sql
   -- Recent webhook failures
   SELECT 
     COUNT(*) as failed_count,
     MAX(created_at) as latest_failure,
     error_message
   FROM webhook_dead_letter
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY error_message
   ORDER BY failed_count DESC;
   ```

2. **Verify Webhook Secret**
   ```bash
   # Compare secrets
   echo $STRIPE_WEBHOOK_SECRET
   
   # Test with Stripe CLI
   stripe listen --print-secret
   ```

3. **Check Endpoint**
   ```bash
   # Test webhook endpoint
   curl -X POST https://app.sheenapps.com/api/stripe-webhook \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

#### Resolution Steps
1. **Process Dead Letter Queue**:
   ```bash
   # Trigger manual retry
   curl -X GET https://app.sheenapps.com/api/cron/webhook-retry \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

2. **Fix Webhook Processing**:
   - Check for timeout issues
   - Verify idempotency logic
   - Review recent code changes

3. **Replay Events from Stripe**:
   ```bash
   # List recent events
   stripe events list --type customer.subscription.updated --limit 10
   
   # Replay specific event
   stripe events resend evt_xxx
   ```

### 3. Database Performance Crisis

#### Symptoms
- Slow API responses
- Timeout errors
- Connection pool exhausted

#### Immediate Actions
1. **Check Database Stats**
   ```sql
   -- Active connections
   SELECT count(*) FROM pg_stat_activity;
   
   -- Long running queries
   SELECT 
     pid,
     now() - pg_stat_activity.query_start AS duration,
     query
   FROM pg_stat_activity
   WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
   ORDER BY duration DESC;
   ```

2. **Kill Problematic Queries**
   ```sql
   -- Kill specific query
   SELECT pg_terminate_backend(pid);
   
   -- Kill all idle connections
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE state = 'idle'
   AND state_change < NOW() - INTERVAL '10 minutes';
   ```

3. **Emergency Optimizations**
   ```sql
   -- Update statistics
   ANALYZE;
   
   -- Check missing indexes
   SELECT schemaname, tablename, indexname, idx_scan
   FROM pg_stat_user_indexes
   WHERE idx_scan = 0
   ORDER BY schemaname, tablename;
   ```

### 4. Rate Limiting Issues

#### Symptoms
- Legitimate users getting 429 errors
- Spike in rate limit hits
- Customer complaints about access

#### Immediate Actions
1. **Check Rate Limit Stats**
   ```typescript
   // In application logs
   grep "rate limit" /var/log/app.log | tail -100
   ```

2. **Identify Patterns**
   ```sql
   -- If logging IPs
   SELECT 
     ip_address,
     COUNT(*) as requests,
     COUNT(DISTINCT user_id) as users
   FROM request_logs
   WHERE created_at > NOW() - INTERVAL '1 hour'
   GROUP BY ip_address
   HAVING COUNT(*) > 100
   ORDER BY requests DESC;
   ```

3. **Temporary Adjustments**
   ```typescript
   // Increase limits temporarily
   export const rateLimiters = {
     generation: new RateLimiter({
       windowMs: 60 * 1000,
       max: 30, // Increased from 10
     }),
   }
   ```

### 5. Subscription State Inconsistency

#### Symptoms
- User has paid but no access
- Subscription status mismatch
- Duplicate subscriptions

#### Immediate Actions
1. **Verify Payment State**
   ```bash
   # Check Stripe
   stripe customers retrieve cus_xxx --expand subscriptions
   
   # Check database
   SELECT * FROM subscriptions WHERE customer_id = 'xxx';
   ```

2. **Sync Subscription State**
   ```sql
   -- Manual update (careful!)
   UPDATE subscriptions
   SET status = 'active',
       updated_at = NOW()
   WHERE stripe_subscription_id = 'sub_xxx'
   AND status != 'active';
   ```

3. **Trigger Webhook Replay**
   ```bash
   # Find relevant event
   stripe events list --type customer.subscription.updated \
     --created.gte $(date -d '24 hours ago' +%s)
   
   # Replay it
   stripe events resend evt_xxx
   ```

## Communication Templates

### Status Page Update (SEV-1)
```
Title: Payment Processing Issues
Status: Investigating

We are currently investigating issues with payment processing. 
Some customers may experience failures during checkout.

Impact: 
- New subscriptions may fail
- Existing subscriptions are not affected

We are working on a resolution and will update in 30 minutes.
```

### Customer Communication (Payment Failed)
```
Subject: Action Required: Payment Update Needed

Hi [Name],

We were unable to process your recent payment for your [Plan] subscription.

Error: [Error Message]
Amount: $[Amount]

Please update your payment method within 7 days to avoid service interruption:
[Customer Portal Link]

If you need assistance, please reply to this email.

Best regards,
SheenApps Billing Team
```

### Internal Escalation (SEV-2)
```
Subject: [SEV-2] High Payment Failure Rate Detected

Team,

We're seeing elevated payment failures:
- Current rate: 15% (normal: 2%)
- Affected: ~50 customers
- Started: 2:30 PM UTC
- Pattern: Mostly EU cards

Investigating:
- [ ] Gateway status
- [ ] Recent deployments
- [ ] Regional issues

Join incident channel: #incident-2025-06-27

[Your Name]
```

## Post-Incident Procedures

### Incident Report Template
```markdown
# Incident Report: [Brief Description]

**Date**: [Date]
**Duration**: [Start] - [End]
**Severity**: SEV-[1/2/3]
**Impact**: [X customers, $Y revenue]

## Summary
[1-2 sentences describing what happened]

## Timeline
- HH:MM - Issue detected
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Issue resolved

## Root Cause
[Technical explanation of why it happened]

## Resolution
[What was done to fix it]

## Impact
- Customers affected: X
- Revenue impact: $Y
- Failed transactions: Z

## Lessons Learned
1. What went well
2. What went poorly
3. Where we got lucky

## Action Items
- [ ] [Preventive measure 1]
- [ ] [Monitoring improvement]
- [ ] [Process update]
```

### Recovery Checklist
- [ ] Verify all systems operational
- [ ] Process failed payments queue
- [ ] Retry failed webhooks
- [ ] Reconcile subscription states
- [ ] Send customer communications
- [ ] Update status page
- [ ] Schedule retrospective
- [ ] Create preventive tickets

## Monitoring Commands

### Real-time Monitoring
```bash
# Payment success rate (last hour)
watch -n 30 'psql $DATABASE_URL -c "
SELECT 
  COUNT(*) FILTER (WHERE status = '\''completed'\'') * 100.0 / COUNT(*) as success_rate
FROM transactions 
WHERE created_at > NOW() - INTERVAL '\''1 hour'\''"'

# Webhook queue depth
watch -n 10 'psql $DATABASE_URL -c "
SELECT COUNT(*) as pending 
FROM webhook_dead_letter 
WHERE retry_count < max_retries"'

# Active subscriptions by status
watch -n 60 'psql $DATABASE_URL -c "
SELECT status, COUNT(*) 
FROM subscriptions 
GROUP BY status"'
```

### Quick Diagnostics
```sql
-- Payment failures by error
SELECT 
  error_message,
  COUNT(*) as count,
  MAX(created_at) as latest
FROM transactions
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY error_message
ORDER BY count DESC;

-- Webhook processing time
SELECT 
  event_type,
  AVG(processing_time_ms) as avg_ms,
  MAX(processing_time_ms) as max_ms
FROM webhook_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type
ORDER BY avg_ms DESC;
```

---

*Last Updated: 27 June 2025*
*Version: 1.0*