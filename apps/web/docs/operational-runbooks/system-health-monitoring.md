# System Health Monitoring Guide

## Overview
This guide provides comprehensive monitoring strategies for the SheenApps payment system, including what to monitor, thresholds, and response procedures.

## Key Performance Indicators (KPIs)

### Business KPIs
| Metric | Target | Warning | Critical | Check Frequency |
|--------|--------|---------|----------|-----------------|
| Payment Success Rate | >98% | <95% | <90% | 5 min |
| MRR Growth | >5% | <2% | <0% | Daily |
| Churn Rate | <5% | >8% | >10% | Daily |
| Trial Conversion | >25% | <20% | <15% | Weekly |
| Cart Abandonment | <70% | >80% | >85% | Hourly |

### Technical KPIs
| Metric | Target | Warning | Critical | Check Frequency |
|--------|--------|---------|----------|-----------------|
| API Response Time | <200ms | >500ms | >1000ms | 1 min |
| Webhook Success Rate | >99% | <97% | <95% | 5 min |
| Database Connections | <50 | >70 | >90 | 1 min |
| Error Rate | <0.1% | >1% | >5% | 1 min |
| Rate Limit Hits | <10/hr | >50/hr | >100/hr | 15 min |

## Monitoring Stack

### 1. Application Monitoring

#### Sentry Configuration
```javascript
// Monitoring specific payment errors
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
  ],
  tracesSampleRate: 0.1,
  beforeSend(event) {
    // Tag payment-related errors
    if (event.exception?.values?.[0]?.value?.includes('payment')) {
      event.tags = { ...event.tags, category: 'payment' }
      event.level = 'error'
    }
    return event
  },
})
```

#### Custom Metrics
```typescript
// Track payment performance
export async function trackPaymentMetric(
  metric: string, 
  value: number, 
  tags: Record<string, string>
) {
  // Send to monitoring service
  if (process.env.NODE_ENV === 'production') {
    await fetch(`${process.env.METRICS_ENDPOINT}/api/v1/metrics`, {
      method: 'POST',
      body: JSON.stringify({
        metric,
        value,
        tags,
        timestamp: Date.now()
      })
    })
  }
}

// Usage
await trackPaymentMetric('payment.success_rate', 0.98, {
  gateway: 'stripe',
  country: 'US'
})
```

### 2. Infrastructure Monitoring

#### Database Health Queries
```sql
-- Connection pool status
CREATE OR REPLACE VIEW db_health AS
SELECT 
  (SELECT count(*) FROM pg_stat_activity) as total_connections,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction,
  (SELECT avg(EXTRACT(epoch FROM (NOW() - query_start))) 
   FROM pg_stat_activity 
   WHERE state = 'active') as avg_query_duration_seconds;

-- Table sizes and bloat
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  n_live_tup as live_rows,
  n_dead_tup as dead_rows,
  ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_percent
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

#### Webhook Processing Health
```sql
-- Webhook processing dashboard
CREATE OR REPLACE VIEW webhook_health AS
WITH hourly_stats AS (
  SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as total_webhooks,
    COUNT(*) FILTER (WHERE retry_count = 0) as first_attempt_success,
    COUNT(*) FILTER (WHERE retry_count > 0) as required_retry,
    COUNT(*) FILTER (WHERE retry_count >= max_retries) as failed_permanently,
    AVG(retry_count) as avg_retries
  FROM webhook_dead_letter
  WHERE created_at > NOW() - INTERVAL '24 hours'
  GROUP BY hour
)
SELECT 
  hour,
  total_webhooks,
  ROUND(100.0 * first_attempt_success / NULLIF(total_webhooks, 0), 2) as success_rate,
  required_retry,
  failed_permanently,
  avg_retries
FROM hourly_stats
ORDER BY hour DESC;
```

### 3. Custom Dashboards

#### Admin Dashboard Queries

**Real-time Payment Flow**
```sql
-- Last 15 minutes payment flow
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as total_attempts,
  COUNT(*) FILTER (WHERE status = 'completed') as successful,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  SUM(amount_cents) FILTER (WHERE status = 'completed') / 100.0 as revenue,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2) as success_rate
FROM transactions
WHERE created_at > NOW() - INTERVAL '15 minutes'
GROUP BY minute
ORDER BY minute DESC;
```

**Subscription Health**
```sql
-- Active subscription distribution
SELECT 
  plan_name,
  COUNT(*) FILTER (WHERE status = 'active') as active,
  COUNT(*) FILTER (WHERE status = 'past_due') as past_due,
  COUNT(*) FILTER (WHERE status = 'canceled' AND updated_at > NOW() - INTERVAL '30 days') as recently_canceled,
  COUNT(*) FILTER (WHERE is_trial = true) as trials
FROM subscriptions
GROUP BY plan_name
ORDER BY active DESC;
```

## Alert Configuration

### Critical Alerts (Page immediately)

#### 1. Payment System Down
```yaml
alert: PaymentSystemDown
expr: payment_success_rate < 0.5
for: 2m
labels:
  severity: critical
annotations:
  summary: "Payment system is down"
  description: "Success rate is {{ $value }}% - immediate action required"
```

#### 2. Database Connection Exhausted
```yaml
alert: DatabaseConnectionPoolExhausted
expr: db_connections_used / db_connections_max > 0.9
for: 1m
labels:
  severity: critical
annotations:
  summary: "Database connection pool nearly exhausted"
  description: "{{ $value }}% of connections in use"
```

### Warning Alerts (Notify on-call)

#### 1. High Payment Failure Rate
```yaml
alert: HighPaymentFailureRate
expr: payment_success_rate < 0.95
for: 5m
labels:
  severity: warning
annotations:
  summary: "Elevated payment failures"
  description: "Success rate dropped to {{ $value }}%"
```

#### 2. Webhook Backlog Growing
```yaml
alert: WebhookBacklogGrowing
expr: webhook_dead_letter_count > 100
for: 10m
labels:
  severity: warning
annotations:
  summary: "Webhook processing backlog"
  description: "{{ $value }} webhooks pending retry"
```

## Monitoring Automation

### Health Check Endpoints

```typescript
// /api/health/payment
export async function GET() {
  const checks = {
    stripe: await checkStripeConnection(),
    database: await checkDatabaseConnection(),
    webhooks: await checkWebhookQueue(),
    redis: await checkRedisConnection() // if using Redis
  }

  const healthy = Object.values(checks).every(check => check.healthy)
  
  return NextResponse.json({
    status: healthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    checks
  }, {
    status: healthy ? 200 : 503
  })
}

async function checkStripeConnection() {
  try {
    const start = Date.now()
    await stripe.balance.retrieve()
    return {
      healthy: true,
      latency: Date.now() - start
    }
  } catch (error) {
    return {
      healthy: false,
      error: error.message
    }
  }
}
```

### Automated Reports

#### Daily Revenue Report
```typescript
// Scheduled for 9 AM daily
export async function generateDailyReport() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  
  const metrics = await calculateDailyMetrics(yesterday)
  
  const report = {
    date: yesterday.toISOString().split('T')[0],
    revenue: {
      total: metrics.revenue,
      byPlan: metrics.revenueByPlan,
      byGateway: metrics.revenueByGateway
    },
    subscriptions: {
      new: metrics.newSubscriptions,
      canceled: metrics.canceledSubscriptions,
      netChange: metrics.newSubscriptions - metrics.canceledSubscriptions
    },
    payments: {
      total: metrics.totalPayments,
      successful: metrics.successfulPayments,
      failed: metrics.failedPayments,
      successRate: (metrics.successfulPayments / metrics.totalPayments * 100).toFixed(2)
    },
    trials: {
      started: metrics.trialsStarted,
      converted: metrics.trialsConverted,
      conversionRate: (metrics.trialsConverted / metrics.trialsStarted * 100).toFixed(2)
    }
  }
  
  // Send to admin team
  await sendReportEmail(report)
  
  // Store for historical analysis
  await storeReport(report)
}
```

## Performance Optimization

### Query Performance Monitoring

```sql
-- Slow query log
CREATE TABLE IF NOT EXISTS slow_query_log (
  id SERIAL PRIMARY KEY,
  query TEXT,
  duration_ms INTEGER,
  called_by TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Log slow queries (>1000ms)
CREATE OR REPLACE FUNCTION log_slow_queries() RETURNS void AS $$
DECLARE
  query_record RECORD;
BEGIN
  FOR query_record IN 
    SELECT 
      query,
      EXTRACT(MILLISECONDS FROM (NOW() - query_start)) as duration_ms,
      application_name
    FROM pg_stat_activity
    WHERE state = 'active'
      AND NOW() - query_start > INTERVAL '1 second'
      AND query NOT LIKE '%pg_stat_activity%'
  LOOP
    INSERT INTO slow_query_log (query, duration_ms, called_by)
    VALUES (query_record.query, query_record.duration_ms, query_record.application_name);
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### Index Health

```sql
-- Missing indexes detector
SELECT 
  schemaname,
  tablename,
  attname,
  n_distinct,
  most_common_vals
FROM pg_stats
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
  AND n_distinct > 100
  AND tablename NOT IN (
    SELECT tablename 
    FROM pg_indexes 
    WHERE schemaname = pg_stats.schemaname
  )
ORDER BY n_distinct DESC;

-- Unused indexes
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexrelname NOT LIKE '%_pkey'
ORDER BY pg_relation_size(indexrelid) DESC;
```

## Troubleshooting Guides

### High Database CPU
1. Check for missing indexes
2. Look for table bloat
3. Review connection pool settings
4. Check for long-running queries
5. Analyze query plans

### Memory Leaks
1. Monitor Node.js heap usage
2. Check for unclosed database connections
3. Review webhook retry queue size
4. Look for large in-memory caches
5. Profile memory allocation

### Slow API Response
1. Enable query logging
2. Check database connection latency
3. Review third-party API calls
4. Analyze request queuing
5. Check for N+1 queries

## Maintenance Windows

### Weekly Maintenance Tasks
- **Sunday 2 AM UTC**: Database vacuum and analyze
- **Tuesday 3 AM UTC**: Clear old webhook logs
- **Thursday 3 AM UTC**: Archive old transactions
- **Saturday 2 AM UTC**: Update monitoring dashboards

### Monthly Tasks
- First Sunday: Full database backup test
- Second Sunday: Disaster recovery drill
- Third Sunday: Performance baseline update
- Fourth Sunday: Security audit

---

*Last Updated: 27 June 2025*
*Version: 1.0*