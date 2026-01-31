# Usage Quota Feature - Implementation & Design Highlights

## 🎯 Overview

The SheenApps Usage Quota System is a comprehensive, enterprise-grade solution for managing resource consumption across AI generations, project creation, and exports. Built with security, scalability, and user experience at its core.

## 🏗️ Architecture Highlights

### 1. **Atomic Database Operations**
- **PostgreSQL RPC Function**: `check_and_consume_quota`
- **SERIALIZABLE Isolation**: Prevents race conditions
- **Idempotency Support**: SHA256-based deduplication
- **Bonus Quota Handling**: Automatic fallback to bonus credits

```sql
-- Single atomic operation for quota consumption
SELECT * FROM check_and_consume_quota(
  p_user_id := 'user-123',
  p_metric := 'ai_generations',
  p_amount := 1,
  p_idempotency_key := 'unique-key'
);
```

### 2. **Middleware Pattern**
- **Unified Enforcement**: Single middleware for all protected endpoints
- **Automatic Context Enrichment**: Quota info passed to handlers
- **Smart Error Responses**: Includes upgrade URLs and remaining quotas

```typescript
// Simple API protection
export const POST = withQuotaCheck(
  async (request, context) => {
    // Handler code - quota already consumed
    console.log(`Remaining: ${context.quota.remaining}`)
  },
  { metric: 'ai_generations' }
)
```

### 3. **Real-time Monitoring**
- **Supabase Realtime**: Live quota event streaming
- **Abuse Detection**: Automatic pattern recognition
- **Multi-channel Alerts**: Slack, Discord, Database
- **Admin Dashboard**: Live activity feed with charts

## 🚀 Key Features

### 1. **Three-Tier Quota System**
```
┌─────────────────┬──────────────┬─────────────┬──────────────┐
│ Metric          │ Free Plan    │ Starter     │ Growth       │
├─────────────────┼──────────────┼─────────────┼──────────────┤
│ AI Generations  │ 10/month     │ 100/month   │ 500/month    │
│ Projects        │ 3 total      │ 10 total    │ 50 total     │
│ Exports         │ 1/month      │ 10/month    │ 50/month     │
└─────────────────┴──────────────┴─────────────┴──────────────┘
```

### 2. **User Experience Components**

#### **Usage Warning Banner**
- Progressive severity (80% warning, 95% critical)
- Smart dismissal with localStorage
- Contextual upgrade CTAs
- Mobile-responsive design

#### **Smart Upgrade Modal**
- Intelligent plan recommendations
- Visual quota consumption bars
- Side-by-side plan comparisons
- Urgency indicators

#### **Usage Analytics Dashboard**
- 30-day trend visualization
- Predictive usage forecasting
- Optimization suggestions
- Real-time updates

## 🔒 Security Features

### 1. **Comprehensive Audit Logging**
```typescript
// Every quota event is logged
{
  user_id: 'uuid',
  metric: 'ai_generations',
  attempted_amount: 5,
  success: false,
  reason: 'quota_exceeded',
  context: {
    plan_limit: 10,
    current_usage: 8,
    remaining: 2
  }
}
```

### 2. **Abuse Prevention**
- **Denial Tracking**: 5 denials/minute triggers alerts
- **Concurrent Request Detection**: Identifies race attempts
- **Bypass Detection**: Monitors for direct API calls
- **Risk Scoring**: Automated user behavior analysis

### 3. **Idempotency Protection**
- Client-provided keys via `X-Idempotency-Key` header
- Automatic key generation for GET/DELETE
- 5-second time windows for POST/PUT
- Scoped to user + metric for security

## 📊 Monitoring & Analytics

### 1. **Real-time Dashboards**
```
┌─────────────────────────────────────┐
│ 📊 Quota Monitoring Dashboard       │
├─────────────────────────────────────┤
│ • Live Activity Feed                │
│ • Users Near Limits (80%+)          │
│ • Denial Rate Charts                │
│ • Usage Distribution                │
│ • Alert Rule Status                 │
└─────────────────────────────────────┘
```

### 2. **Alert Rules Engine**
- High denial rate detection
- Usage spike identification
- Concurrent attempt patterns
- Bypass attempt tracking
- Configurable thresholds

### 3. **Predictive Analytics**
- 7-day average calculations
- Trend analysis (increasing/decreasing/stable)
- Days until limit projection
- Recommended daily budgets

## 🎨 Technical Implementation

### 1. **Database Schema**
```sql
-- Core tables
usage_tracking        -- Current period usage
usage_events         -- Individual consumption events
user_bonuses         -- Bonus quota allocations
quota_audit_log      -- Complete audit trail
plan_limits          -- Plan configurations

-- Monitoring views
quota_failures_realtime   -- Live failure analytics
quota_usage_spikes       -- Spike detection
```

### 2. **Service Architecture**
```
┌─────────────────┐     ┌──────────────────┐
│ API Endpoints   │────▶│ Quota Middleware │
└─────────────────┘     └────────┬─────────┘
                                 │
                    ┌────────────▼──────────┐
                    │ check_and_consume RPC │
                    └────────────┬──────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            ▼                    ▼                    ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │ Usage Track  │    │ Audit Log    │    │ Real-time    │
    └──────────────┘    └──────────────┘    └──────────────┘
```

### 3. **Event-Driven Architecture**
```typescript
// Event types emitted
'quota-consumed'      // Successful usage
'quota-denied'        // Limit exceeded
'quota-warning'       // 80% threshold
'abuse-detected'      // Suspicious pattern
'spike-detected'      // Unusual activity
```

## 💡 Design Principles

### 1. **Developer Experience**
- Single middleware to protect any endpoint
- Automatic quota handling - no manual tracking
- Rich error messages with actionable next steps
- TypeScript support throughout

### 2. **User Experience**
- Proactive warnings before limits
- Clear visualization of usage
- Smart upgrade recommendations
- Predictive insights

### 3. **Operations**
- Zero-downtime deployments
- Graceful degradation
- Comprehensive monitoring
- Self-healing capabilities

## 🚦 Performance Optimizations

### 1. **Database Level**
- Atomic operations (no SELECT then UPDATE)
- Proper indexes on hot paths
- Materialized views for analytics
- Connection pooling ready

### 2. **Application Level**
- 5-minute memory cleanup cycles
- Event deduplication
- Batch processing ready
- Circuit breaker patterns

### 3. **Caching Strategy**
- 30-second quota status cache (planned)
- Idempotency key caching
- Plan limit caching
- User bonus caching

## 📈 Success Metrics

### 1. **Technical KPIs**
- **Quota check latency**: < 50ms p95
- **Zero quota bypasses**: Atomic enforcement
- **99.9% accuracy**: No false denials
- **Real-time monitoring**: < 1s event delay

### 2. **Business Impact**
- **Reduced support tickets**: Clear UX prevents confusion
- **Increased upgrades**: Smart recommendations at right time
- **Better resource allocation**: Predictive insights
- **Fraud prevention**: Automated abuse detection

## 🔮 Future Enhancements

### 1. **Planned Features**
- Quota reservation system for long operations
- Admin override capabilities
- Quota gifting between users
- Usage-based dynamic limits

### 2. **Architecture Evolution**
- GraphQL API for efficient queries
- Event sourcing for complete history
- Machine learning for abuse detection
- Microservice extraction

## 🎯 Key Takeaways

1. **Security First**: Atomic operations prevent all race conditions
2. **User Centric**: Proactive warnings and smart recommendations
3. **Scalable Design**: Ready for millions of quota checks
4. **Observable**: Complete visibility into system behavior
5. **Maintainable**: Clean architecture with separation of concerns

The SheenApps quota system represents a best-in-class implementation that balances security, performance, and user experience while maintaining flexibility for future growth.