# AI Time Billing - Phase 2 Implementation Plan
**Worker Microservice Integration & Operations**

## Executive Summary

Phase 2 focuses on completing the worker microservice billing integration with API endpoints for the Next.js frontend, automated maintenance jobs, and robust operational monitoring. This phase makes the billing system production-ready from the worker side.

## Current State Assessment

### ✅ What's Working (Phase 1)
- Core billing logic with atomic transactions
- AI time tracking for all operations (builds, updates, metadata)
- Pre-flight balance checking in workers
- Consumption recording with detailed breakdown
- Welcome bonus (50 min) + daily gift (15 min) management
- Historical data for accurate estimates

### 🚀 **IMPLEMENTATION PROGRESS - PHASE 2 COMPLETED**

#### ✅ Core Worker APIs (P0) - COMPLETED
- **✅ `/v1/billing/balance/:userId`** - Pure SELECT endpoint implemented with proper error handling
- **✅ `/v1/billing/check-sufficient`** - Pre-flight balance check API with package recommendations  
- **✅ Enhanced HTTP endpoints** - Added balance checks to both `/create-preview-for-new-project` and `/update-project`
- **✅ PostgreSQL Advisory Locks** - Daily reset job implemented with exactly-once execution guarantee
- **✅ Route Registration** - All billing APIs properly registered and versioned

#### ✅ Operational Tasks (P1) - COMPLETED
- **✅ Daily Reset Job** - Automated daily gift reset with PostgreSQL advisory locks
- **✅ Ghost Build Detection** - Timeout-based detection with automatic refunds
- **✅ Database Constraints** - Simple uniqueness constraints for payment_id and idempotency_key
- **✅ Job Scheduling** - All background jobs properly registered and managed

#### 📋 Implementation Details Completed:

**API Layer:**
- Created `src/routes/billing.ts` with versioned APIs (`/v1/billing/*`)
- Added HMAC signature verification for security
- Integrated balance checks in `createPreview.ts` and `updateProject.ts` 
- Added proper error responses (402 Payment Required for insufficient balance)
- Included comprehensive request/response schemas with Fastify validation

**Background Jobs:**
- Implemented `src/jobs/dailyResetJob.ts` with PostgreSQL advisory locks (lock ID: 12345)
- Enhanced daily reset to include both `daily_gift_used_today` and `total_seconds_used_today`
- Created `src/jobs/ghostBuildDetectionJob.ts` with 2-hour timeout detection
- Added automatic refund logic for hung builds with zero-consumption records
- Included metrics emission and operational alerting infrastructure

**Database Enhancements:**
- Created migration `020_add_payment_id_constraint.sql` for uniqueness constraints
- Added `UNIQUE (payment_id)` constraint to prevent duplicate webhook processing
- Added `UNIQUE (idempotency_key)` constraint to prevent duplicate billing
- Enhanced job scheduling in `server.ts` with proper startup/shutdown lifecycle

**Security & Reliability:**
- HMAC signature verification on all billing endpoints
- Exactly-once execution guarantee for daily reset using PostgreSQL advisory locks
- Automatic ghost build detection every 30 minutes with safety limits (max 50 refunds/run)
- Comprehensive error handling and operational alerting placeholders

**Code Quality & Deployment:**
- ✅ All TypeScript type errors resolved
- ✅ Clean compilation with `npm run build`
- ✅ All compiled JavaScript files syntax validated
- ✅ Updated Postman collection with new billing endpoints
- ✅ Comprehensive API reference documentation for Next.js team

### 🎯 **NEXT STEPS FOR PRODUCTION DEPLOYMENT**

#### ✅ WORKER IMPLEMENTATION - COMPLETE
All core worker-side billing functionality has been implemented:
- ✅ Read-only API endpoints (`/v1/billing/*`)
- ✅ Pre-flight balance checks in HTTP endpoints  
- ✅ Daily reset automation with PostgreSQL advisory locks
- ✅ Ghost build detection with automatic refunds
- ✅ Database constraints and operational safeguards

#### 🔄 REMAINING FOR FULL PRODUCTION (Next.js Team)
- **Analytics view creation** - Next.js team creates `vw_user_ai_time_purchases_stats`
- **Webhook integration** - Next.js Stripe webhooks credit worker balance tables
- **Purchase UI flows** - Frontend purchase screens using worker APIs for balance checks
- **Database permissions** - Grant worker read-only access to analytics view

#### 🔄 OPERATIONAL SETUP (DevOps Team)
- **Migration deployment** - Run migrations 019 and 020 in production
- **Monitoring setup** - Configure alerts for daily reset failures and ghost builds
- **Metrics integration** - Connect job metrics to actual monitoring system (DataDog/CloudWatch)
- **Alerting integration** - Connect operational alerts to PagerDuty/Slack

## ✅ **Feedback Integration & Architecture Revision**

### **🎯 Adopted Improvements (Lean Focus)**
- **API Versioning**: Core endpoints use `/v1/billing/...` for future deprecation safety
- **Clean Separation**: Next.js owns payments/webhooks, Worker owns consumption tracking
- **Numeric Precision**: Store seconds as INT consistently, convert to minutes only in responses
- **Exactly-Once Daily Reset**: Use PostgreSQL advisory locks for guaranteed single execution
- **Minimal Constraints**: Simple `UNIQUE (payment_id)` constraint, complex validation in Phase 3+
- **Analytics via Views**: Worker reads `vw_user_ai_time_purchases_stats` (maintained by Next.js)
- **No Pub-Sub Initially**: Simple UI polling after checkout, add real-time later if needed

### **🏗️ Revised Architecture: Clean Separation**
**Next.js**: Owns all payment flows, balance credits, Stripe webhooks
**Worker**: Owns only balance reads, usage debits, consumption tracking

This eliminates race conditions and keeps the worker stateless.

## Phase 2 Implementation Plan (Lean & Consistent)

### **Part A: Core Worker APIs (Week 1 - P0)**
*Essential read-only endpoints for Next.js integration*

#### 1. Balance & Usage APIs (Minimal Set)
```typescript
// Add to src/routes/billing.ts - versioned and auth-protected
GET  /v1/billing/balance/:userId           // Current balance breakdown (pure SELECT)
POST /v1/billing/check-sufficient          // Pre-flight balance check
GET  /v1/billing/usage/:userId/:period     // Usage analytics (from consumption table only)
GET  /v1/billing/estimates                 // Time estimates (marked as beta/best-effort)
```

#### 2. Enhanced Existing HTTP Endpoints
```typescript
// Update existing worker endpoints with pre-flight checks
POST /api/create-preview-for-new-project   // Add balance check before queue
POST /api/update-project                   // Add balance check before queue

// Response now includes balance info:
{
  success: boolean,
  buildId?: string,
  balanceCheck?: {
    sufficient: boolean,
    required: number,
    available: number,
    estimate: EstimateResult
  }
}
```

#### 3. Enhanced Event System
```typescript
// Existing events enhanced with billing data
// Events sent to Next.js via existing webhook system
'build_queued'              // Now includes balance check result
'ai_time_tracking_started'  // New event type
'ai_time_consumed'          // New event type  
'insufficient_balance'      // New event type
```

### **Part B: Operational Tasks (Week 2 - P1)**
*Worker-only responsibilities: consumption tracking & daily operations*

#### 4. Balance Read Helpers (No Payment Access)
```typescript
// Enhanced aiTimeBillingService.ts - worker only reads balances
async getUserBalance(userId: string): Promise<UserBalance> {
  // Pure SELECT from user_ai_time_balance only
  // Automatically sees minutes credited by Next.js
  // welcome_bonus_seconds + (900-daily_gift_used_today) + paid_seconds_remaining
}
```

#### 5. Daily Reset Job (Critical P1)
```typescript
// Location: src/jobs/dailyResetJob.ts
// PostgreSQL advisory lock ensures exactly-once execution
async function dailyResetWithAdvisoryLock() {
  const lockAcquired = await pool.query('SELECT pg_try_advisory_lock(12345)');
  
  if (!lockAcquired.rows[0].pg_try_advisory_lock) {
    console.log('Daily reset already running in another instance');
    return;
  }
  
  try {
    // Enhanced reset: age-off both daily counters to prevent chart double-counting
    const result = await pool.query(`
      UPDATE user_ai_time_balance
      SET
        daily_gift_used_today = 0,
        total_seconds_used_today = 0   -- Prevents chart double-counting at midnight
      WHERE daily_gift_used_today > 0
         OR total_seconds_used_today > 0
      RETURNING user_id
    `);
    
    console.log(`Daily reset completed: ${result.rowCount} users reset`);
    
    // Emit metrics for monitoring
    await emitMetric('daily_reset.users_reset', result.rowCount);
    await emitMetric('daily_reset.timestamp', Date.now());
    
    return { usersReset: result.rowCount };
  } finally {
    await pool.query('SELECT pg_advisory_unlock(12345)');
  }
}
```

#### 6. Ghost Build Detection (Basic P1)
```typescript
// Simple timeout-based detection
async function detectGhostBuilds() {
  // Find builds started >2 hours ago with no consumption record
  const ghosts = await pool.query(`
    SELECT build_id, user_id, started_at 
    FROM (SELECT tracking sessions without consumption records)
    WHERE started_at < NOW() - INTERVAL '2 hours'
  `);
  
  // Refund and mark as failed
  for (const ghost of ghosts.rows) {
    await this.refundGhostBuild(ghost.build_id, ghost.user_id);
  }
}
```

### **Part C: Analytics & Testing (Week 3 - P2)**
*Analytics view integration and production testing*

#### 7. Analytics View Integration (Coordinate with Next.js)
```sql
-- Next.js team creates this view for worker to read
CREATE VIEW vw_user_ai_time_purchases_stats AS 
SELECT 
  user_id,
  SUM(minutes_purchased) as total_minutes_purchased,
  SUM(price) as total_revenue,
  COUNT(*) as purchase_count,
  MAX(purchased_at) as last_purchase_at
FROM user_ai_time_purchases 
WHERE payment_status = 'completed'
GROUP BY user_id;

-- Worker gets read-only access to this view only
GRANT SELECT ON vw_user_ai_time_purchases_stats TO worker_role;
```

#### 8. Enhanced Analytics APIs
```typescript
// Add to src/routes/billing.ts (read-only from analytics view)
GET  /v1/billing/analytics/:userId/revenue     // From vw_user_ai_time_purchases_stats
GET  /v1/billing/analytics/:userId/efficiency  // From user_ai_time_consumption
GET  /v1/billing/export/:userId               // CSV export (consumption data only)
```

#### 9. Integration Testing & Load Testing
```typescript
// Test scenarios for Phase 2
export class BillingIntegrationTests {
  async testBalanceReadAfterCredit() {
    // 1. Next.js credits user balance
    // 2. Worker immediately reads fresh balance
    // 3. Verify consistency without pub-sub
  }
  
  async testGhostBuildRefund() {
    // 1. Start tracking session
    // 2. Simulate build hang (no consumption record)
    // 3. Verify ghost detection refunds correctly
  }
  
  async testDailyResetAdvisoryLock() {
    // 1. Simulate multiple worker instances
    // 2. Verify only one executes daily reset
    // 3. Verify all users reset correctly
  }
}
```

### **Part D: Production Readiness (Week 4 - P2)**
*Simplified monitoring and production deployment*

#### 10. Basic Database Constraints (Lean Approach)
```sql
-- Simple constraints following our lean approach
ALTER TABLE user_ai_time_purchases
ADD CONSTRAINT uniq_payment_id UNIQUE (payment_id);

-- Optional: Add simple uniqueness for idempotency 
ALTER TABLE user_ai_time_consumption
ADD CONSTRAINT uniq_idempotency_key UNIQUE (idempotency_key);

-- Future: Complex constraints in Phase 3+ based on real usage patterns
```

#### 11. Monitoring & Health Checks (Essential Only)
```typescript
// Basic monitoring endpoints for operations
GET  /v1/admin/billing/health               // Simple health check
GET  /v1/admin/billing/stats                // Basic system stats
POST /v1/admin/billing/manual-reset         // Manual daily reset trigger (emergency)

// Health check implementation
export async function billingHealthCheck(): Promise<HealthStatus> {
  return {
    dailyResetStatus: await checkLastResetTime(),
    balanceConsistency: await checkBasicConsistency(),
    ghostBuildsDetected: await countGhostBuilds(),
    status: 'healthy' | 'warning' | 'error'
  };
}
```

#### 12. Deployment & Rollback Plan
```typescript
// Phase 2 deployment checklist
export const deploymentChecklist = {
  database: [
    'Run migration 019 (billing tables)',
    'Add payment_id uniqueness constraint',
    'Create analytics view (coordinate with Next.js)',
    'Grant worker read access to view only'
  ],
  worker: [
    'Deploy new /v1/billing/* endpoints',
    'Update existing endpoints with balance checks',
    'Deploy daily reset job with advisory locks',
    'Deploy ghost build detection job'
  ],
  monitoring: [
    'Set up basic health check alerts',
    'Monitor daily reset execution',
    'Track ghost build detection rates',
    'Monitor API response times'
  ]
};
```

## Detailed Implementation Specifications

### **Worker API Endpoint Specifications**

#### 1. `/api/billing/balance/:userId` (GET)
```typescript
interface BalanceResponse {
  balance: {
    welcomeBonus: number;      // seconds remaining
    dailyGift: number;         // seconds available today
    paid: number;              // seconds from purchases/subs
    total: number;             // total seconds available
  };
  usage: {
    todayUsed: number;         // seconds used today
    monthUsed: number;         // seconds used this month
    lifetimeUsed: number;      // total seconds ever used
  };
  subscription: {
    tier: string;              // 'free', 'starter', etc.
    renewsAt: string;          // ISO date
    minutesIncluded: number;   // monthly allocation
    rolloverMinutes: number;   // carried over from last month
  };
  dailyResetAt: string;        // Next reset time in user's timezone
  estimatedDaysRemaining: number; // Based on recent usage
}
```

#### 2. `/api/billing/check-sufficient` (POST)
```typescript
interface SufficientCheckRequest {
  operationType: 'main_build' | 'metadata_generation' | 'update';
  projectSize?: 'small' | 'medium' | 'large';
  isUpdate?: boolean;
}

interface SufficientCheckResponse {
  sufficient: boolean;
  estimate: {
    estimatedSeconds: number;
    estimatedMinutes: number;
    confidence: 'high' | 'medium' | 'low';
    basedOnSamples: number;
  };
  balance: BalanceResponse['balance'];
  recommendation?: {
    suggestedPackage?: string;
    costToComplete: number;
    purchaseUrl: string;
  };
}
```

#### 3. `/api/billing/purchase` (POST)
```typescript
interface PurchaseRequest {
  packageName: 'mini' | 'booster' | 'mega' | 'max';
  paymentMethodId: string;    // Stripe payment method
  billingAddress: Address;
  taxCalculation: TaxInfo;
}

interface PurchaseResponse {
  success: boolean;
  purchaseId: string;
  minutesAdded: number;
  totalCost: number;
  tax: {
    rate: number;
    amount: number;
    jurisdiction: string;
  };
  newBalance: BalanceResponse['balance'];
  receiptUrl: string;
}
```

## 🏗️ **Recommended Purchase Flow Architecture**

### **Clean Separation: Next.js = Payments, Worker = Consumption**

| Step | Component | Responsibility |
|------|-----------|----------------|
| 1. Start Checkout | Next.js | Validate session, create Stripe PaymentIntent, return to browser |
| 2. User Pays | Stripe/Paddle | Handles 3-DS, VAT calculation, etc. |
| 3. Webhook → Next.js | Next.js `/api/webhooks/stripe` | Verify signature, insert purchase with `pending` status |
| 4. Atomic Credit | Next.js (same txn) | Update `paid_seconds_remaining += seconds` and mark purchase `completed` |
| 5. Emit Event | Next.js | Push `balance_updated` event to worker/UI |
| 6. Worker Usage | Worker | Reads fresh balance, never touches payment tables |

### **Why This Split Works**
- **Least Privilege**: Worker never needs Stripe secrets or payment logic
- **Single Writer**: Next.js is only component mutating purchase+balance (eliminates double-credit risk)
- **Strong Consistency**: Same DB → once txn commits, worker sees new balance immediately
- **Simpler Rollbacks**: Failed webhook stays pending, retry in Next.js, no partial state

### **Worker Integration Strategy** 

#### Enhanced Pre-flight Checks
```typescript
// Update src/routes/createPreview.ts and src/routes/updateProject.ts
async function checkBalanceBeforeQueue(userId: string, operationType: string) {
  try {
    // Get estimate for operation
    const estimate = await metricsService.estimateAITime(operationType, context);
    
    // Check if user has sufficient balance (worker reads balance Next.js credited)
    const balanceCheck = await metricsService.checkSufficientAITimeBalance(
      userId, 
      estimate?.estimatedSeconds
    );
    
    if (!balanceCheck.sufficient) {
      return {
        error: 'insufficient_ai_time',
        required: estimate?.estimatedSeconds || 180,
        available: balanceCheck.balance?.total || 0,
        estimate,
        balance: balanceCheck.balance,
        // Next.js will handle purchase flow
        needsPurchase: true
      };
    }
    
    return { sufficient: true };
  } catch (error) {
    console.error('Balance check failed:', error);
    // Allow operation to proceed with warning
    return { sufficient: true, warning: 'Balance check failed' };
  }
}
```

### **Daily Reset Job Implementation**

#### Location: `src/jobs/dailyResetJob.ts`
```typescript
import { schedule } from 'node-cron';
import { aiTimeBillingService } from '../services/aiTimeBillingService';

// Run at midnight UTC daily
schedule.scheduleJob('0 0 * * *', async () => {
  console.log('[Daily Reset] Starting daily gift reset');
  
  try {
    const result = await aiTimeBillingService.resetDailyAllocation();
    
    console.log(`[Daily Reset] Reset completed: ${result.usersReset} users`);
    
    // Emit metrics
    await emitMetric('daily_reset.users_reset', result.usersReset);
    await emitMetric('daily_reset.timestamp', Date.now());
    
    // Health check - verify reset worked
    setTimeout(async () => {
      const unresetCount = await checkUnresetUsers();
      if (unresetCount > 0) {
        await alertOps(`Daily reset incomplete: ${unresetCount} users not reset`);
      }
    }, 300000); // Check after 5 minutes
    
  } catch (error) {
    console.error('[Daily Reset] Failed:', error);
    await alertOps('Daily reset failed', { error: error.message });
  }
});

// Health check function
async function checkUnresetUsers(): Promise<number> {
  const result = await pool.query(`
    SELECT COUNT(*) as count
    FROM user_ai_time_balance
    WHERE daily_gift_used_today > 0 
      OR total_seconds_used_today > 0
  `);
  
  return parseInt(result.rows[0].count) || 0;
}
```

### **Real-time Updates Integration**

#### WebSocket Event Enhancement
```typescript
// In streamWorker.ts - enhance existing events
await emitBuildEvent(buildId, 'ai_time_balance_updated', {
  userId,
  projectId,
  versionId,
  balanceBefore: aiTimeConsumption.balanceBefore,
  balanceAfter: aiTimeConsumption.balanceAfter,
  consumption: aiTimeConsumption.consumption,
  message: `Consumed ${Math.ceil(aiTimeConsumption.billableSeconds / 60)} minutes`
});

// New dedicated balance events
await emitUserEvent(userId, 'balance_updated', {
  balance: aiTimeConsumption.balanceAfter,
  lastOperation: {
    type: operationType,
    consumed: aiTimeConsumption.billableSeconds,
    timestamp: new Date()
  }
});
```

### **Error Handling & Recovery**

#### Billing Failure Recovery
```typescript
// Handle billing system failures gracefully
class BillingFailureHandler {
  async handleTrackingFailure(buildId: string, error: Error) {
    // Log failure details
    await logBillingFailure(buildId, 'tracking_start', error);
    
    // Decide whether to proceed or block
    if (error.name === 'InsufficientAITimeError') {
      // Block the operation
      throw error;
    } else {
      // Allow operation with warning
      console.warn(`[Billing] Tracking failed for ${buildId}, allowing operation to proceed`);
      return null;
    }
  }
  
  async handleConsumptionFailure(buildId: string, error: Error) {
    // Always log consumption failures
    await logBillingFailure(buildId, 'consumption_record', error);
    
    // Queue for retry
    await queueBillingRetry(buildId, 'consumption', { 
      error: error.message,
      timestamp: new Date(),
      retryCount: 0 
    });
    
    // Don't block operation completion
    return null;
  }
}
```

## Implementation Timeline

### **Week 1: Core APIs**
- Day 1-2: Balance and usage APIs
- Day 3-4: Pre-flight checks in HTTP endpoints  
- Day 5: Real-time balance updates via WebSocket

### **Week 2: Purchase System**
- Day 1-3: Purchase management APIs
- Day 4-5: Subscription management APIs
- Weekend: Auto top-up implementation

### **Week 3: Operations & Jobs**
- Day 1-2: Daily reset job with monitoring
- Day 3-4: Subscription reset coordination
- Day 5: Health monitoring and alerts

### **Week 4: Analytics & Polish**
- Day 1-3: Advanced analytics APIs
- Day 4-5: Billing history and invoicing
- Weekend: Usage optimization recommendations

## Testing Strategy

### **Unit Tests**
- API endpoint response formats
- Balance calculation logic
- Edge cases (negative balances, timezone issues)
- Error handling paths

### **Integration Tests**
- End-to-end purchase flow
- Daily reset job execution
- Real-time event delivery
- Webhook coordination

### **Load Tests**
- Concurrent balance checks
- High-frequency consumption recording
- Daily reset performance with 100k+ users

## Success Metrics

### **Technical Metrics**
- API response times < 200ms (95th percentile)
- Billing operation success rate > 99.9%
- Daily reset completion time < 5 minutes
- Zero balance reconciliation discrepancies

### **User Experience Metrics**
- Balance check accuracy rate > 99%
- Real-time update delivery < 2 seconds
- Purchase completion rate > 95%
- User-reported billing issues < 0.1%

### **Business Metrics**
- Revenue tracking accuracy: 100%
- Subscription churn due to billing issues < 1%
- Support tickets related to billing < 2%

## Risk Mitigation

### **High-Risk Areas**
1. **Daily Reset Failures** - Implement redundant checks and manual override
2. **Balance Calculation Bugs** - Comprehensive reconciliation and audit logs
3. **Payment Processing Issues** - Multiple retry mechanisms and fallbacks
4. **Real-time Update Lag** - Alternative polling mechanism for critical updates

### **Monitoring & Alerts**
- Real-time balance reconciliation monitoring
- Daily reset success/failure alerts
- Unusual consumption pattern detection
- Payment processing failure alerts

## Phase 3 Preparation

### **What Phase 3 Will Add**
- Advanced subscription features (rollover optimization)
- International payment support
- Enterprise billing features
- Advanced analytics and reporting
- Cost optimization recommendations
- Fraud detection and prevention

## 🎯 **Pragmatic Simplification (Adopted)**

### **1. Worker vs Payment Tables - Smart Middle Ground**
```typescript
// ✅ ADOPTED: Worker reads from analytics view (maintained by Next.js)
// Worker reads user_ai_time_balance only for metering/debits
// Analytics via read-only view: vw_user_ai_time_purchases_stats

// Next.js maintains this view:
CREATE VIEW vw_user_ai_time_purchases_stats AS 
SELECT 
  user_id,
  SUM(minutes_purchased) as total_minutes_purchased,
  SUM(price) as total_revenue,
  COUNT(*) as purchase_count,
  MAX(purchased_at) as last_purchase_at
FROM user_ai_time_purchases 
WHERE payment_status = 'completed'
GROUP BY user_id;

// Worker can read this for analytics, never touches raw purchase table
```

### **2. Pub-Sub Simplification - Start Simple**
```typescript
// ✅ ADOPTED: No Redis pub-sub initially
// Flow:
// 1. Next.js credits balance in same tx as purchase → commit
// 2. UI polls /v1/billing/balance after checkout success
// 3. Worker reads updated balance on next job (DB is single source of truth)

// Phase 3+: Add pub-sub when near-real-time UX becomes important
```

### **3. Progressive Hardening - Minimal Constraints**
```sql
-- ✅ ADOPTED: Start with simple uniqueness guard
ALTER TABLE user_ai_time_purchases
ADD CONSTRAINT uniq_payment_id UNIQUE (payment_id);

-- Phase 3+: Add complex CHECK constraints, triggers after volume grows
```

### **4. Lean Phase 2 Checklist** 
| Task | Owner | Priority | Notes |
|------|--------|----------|-------|
| Webhook → balance credit tx | Next.js | P0 | Include basic uniqueness constraint |
| Worker consumption logic | Worker | P0 | Reads balance; writes consumption row |
| Balance/usage APIs | Worker | P0 | Pure SELECTs; no writes |
| Daily gift reset job | Worker cron | P1 | Single UPDATE with advisory lock |
| Analytics view | Next.js | P1 | CREATE VIEW for worker analytics access |
| Purchase/Subscription APIs | Next.js | P2 | Worker not involved |

## 💭 **Areas Where I Still Disagree**

### **Ghost Build Detection Priority**
**Feedback**: Implied as Phase 3+ feature
**My View**: This should be P1 in Phase 2 because:
- Failed builds that hang will drain user balances unfairly
- Creates immediate customer support issues
- Simple to implement with existing infrastructure

**Compromise**: Implement basic ghost build detection in Phase 2, enhance monitoring in Phase 3.

### **API Versioning Timing**
**Feedback**: Not explicitly mentioned in lean checklist
**My View**: `/v1/billing/...` should be P0 because:
- No overhead to implement from start
- Major pain to retrofit later
- Industry best practice for APIs

**Compromise**: Add versioning to core APIs only, not internal endpoints.

### **Fully Agreed Improvements** ✅
- API versioning with `/v1/` prefix
- PostgreSQL advisory locks for daily reset
- Numeric precision (INT seconds everywhere)
- GDPR compliance and retention policies
- Database partitioning from day 1
- Ghost build detection and refunds
- Webhook idempotency protection
- Auto top-up loop protection

## 📋 **Revised Lean Implementation Timeline**

### **Week 1: Core APIs (P0)**
- **Day 1-2**: Create `/v1/billing/balance/:userId` (pure SELECT)
- **Day 3**: Add `/v1/billing/check-sufficient` (pre-flight)  
- **Day 4-5**: Update existing endpoints with balance checks

### **Week 2: Operations (P1)**
- **Day 1-2**: Implement daily reset job with advisory locks
- **Day 3**: Basic ghost build detection (simple timeout check)
- **Day 4-5**: Analytics view creation (coordinate with Next.js team)

### **Week 3: Polish & Testing**
- **Day 1-2**: Load testing and performance optimization
- **Day 3-4**: Integration testing with Next.js payment flows
- **Day 5**: Documentation and deployment preparation

### **Week 4: Production Readiness**
- **Day 1-2**: Monitoring and alerting setup
- **Day 3-4**: Security review and penetration testing
- **Day 5**: Go-live preparation and rollback procedures

## 🎯 **Success Criteria (Simplified)**

### **Must Have (P0)**
- ✅ Balance checks prevent builds when insufficient funds
- ✅ Consumption tracking works accurately 
- ✅ Daily reset executes exactly once
- ✅ Worker APIs respond < 200ms

### **Should Have (P1)**
- ✅ Ghost builds detected and refunded within 2 hours
- ✅ Analytics view provides revenue insights
- ✅ Zero balance reconciliation discrepancies

### **Nice to Have (P2-3)**
- Real-time balance updates via pub-sub
- Advanced monitoring and anomaly detection
- Complex database constraints and validation

## ✅ **Go-Live Rollout Checklist**

### **Database Migrations & Setup**
| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Create billing tables (migration 019) | Next.js | ⬜ | user_ai_time_balance, user_ai_time_consumption, etc. |
| Add `UNIQUE (payment_id)` constraint | Next.js | ⬜ | Prevents double-credit on duplicate webhooks |
| Create `vw_user_ai_time_purchases_stats` view | Next.js | ⬜ | Analytics view for worker read access |
| Grant worker SELECT on view only | Next.js | ⬜ | `GRANT SELECT ON vw_user_ai_time_purchases_stats TO worker_role` |
| Test database permissions | DevOps | ⬜ | Verify worker cannot write to payment tables |

### **Worker Deployment**
| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Deploy `/v1/billing/*` routes (read-only) | Worker | ⬜ | balance, check-sufficient, usage, estimates |
| Add balance checks to create/update handlers | Worker | ⬜ | Pre-flight checks before queueing jobs |
| Deploy daily reset cron with advisory lock | Worker | ⬜ | Runs at midnight UTC, resets both daily counters |
| Deploy ghost build detector | Worker | ⬜ | Detects hung builds >2 hours, refunds time |
| Test API versioning and auth | Worker | ⬜ | Verify `/v1/billing/*` endpoints work correctly |

### **Next.js Integration**
| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Stripe webhook → balance credit (single txn) | Next.js | ⬜ | Atomic: insert purchase + update balance |
| UI polling after checkout success | Next.js | ⬜ | Poll `/v1/billing/balance` after payment |
| Purchase screens → use packages from config | Next.js | ⬜ | mini, booster, mega, max packages |
| Test payment flow end-to-end | Next.js | ⬜ | Stripe → webhook → balance update → worker reads |

### **Monitoring & Alerting**
| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Health check monitoring | DevOps | ⬜ | Ping `/v1/admin/billing/health` every 60s |
| Daily reset monitoring | DevOps | ⬜ | Alert if daily reset not seen by 01:00 UTC |
| Ghost build alerts | DevOps | ⬜ | Alert if ghost builds detected >10/hour |
| API response time monitoring | DevOps | ⬜ | Alert if billing APIs >500ms (95th percentile) |

### **Security & Secrets**
| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Rotate Stripe secrets (prod/staging separation) | SecOps | ⬜ | Ensure prod Stripe keys not in staging |
| Verify worker DB permissions | SecOps | ⬜ | Worker has SELECT-only on analytics view |
| Test JWT/HMAC protection on billing APIs | SecOps | ⬜ | Verify unauthorized access blocked |
| Review billing code for PII/secrets exposure | SecOps | ⬜ | Ensure no payment details logged |

### **Documentation & Communications**
| Task | Owner | Status | Notes |
|------|-------|--------|-------|
| Update public docs (daily gift, billing units) | PM/Docs | ⬜ | Explain 15min daily, 10-second billing increments |
| In-app FAQ updates | PM/Docs | ⬜ | Welcome bonus, subscription tiers, purchase flow |
| Internal runbook for billing operations | DevOps | ⬜ | Daily reset procedures, ghost build handling |
| Customer support training | Support | ⬜ | Common billing questions, refund procedures |

### **Final Pre-Launch Tests**
| Test Scenario | Owner | Status | Expected Result |
|---------------|-------|--------|-----------------|
| User with insufficient balance starts build | QA | ⬜ | Build blocked, clear error message |
| User purchases package, immediately starts build | QA | ⬜ | Balance updated, build proceeds |
| Daily reset execution (multiple worker instances) | QA | ⬜ | Exactly one reset, all users updated |
| Ghost build detection and refund | QA | ⬜ | Hung build detected, time refunded |
| Analytics view data consistency | QA | ⬜ | Worker analytics match Next.js data |

### **Rollback Plan**
| Scenario | Action | Owner | Recovery Time |
|----------|--------|-------|---------------|
| Worker billing APIs failing | Disable balance checks temporarily | DevOps | <15 minutes |
| Daily reset job failing | Manual reset via admin endpoint | DevOps | <30 minutes |
| Database constraint violations | Disable uniqueness constraints | DevOps | <10 minutes |
| Next.js payment webhook issues | Rollback webhook handler | Next.js | <20 minutes |

This lean approach delivers a production-ready billing system in 3-4 weeks with comprehensive safeguards and clear accountability for each component.