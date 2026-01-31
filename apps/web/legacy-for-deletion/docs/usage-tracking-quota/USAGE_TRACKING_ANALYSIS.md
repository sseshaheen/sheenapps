# Usage Tracking and Enforcement Analysis - SheenApps

## Overview
This analysis examines the robustness of usage tracking and quota enforcement mechanisms in the SheenApps codebase, identifying strengths, gaps, and potential race conditions.

## Key Components

### 1. Quota Checking (`/api/billing/check-quota`)
**Strengths:**
- ✅ Proper authentication using `withApiAuth` middleware
- ✅ Checks both base plan limits and bonus usage
- ✅ Returns detailed quota information (used, remaining, bonus)
- ✅ Handles unlimited plans (-1 value)
- ✅ Uses service role key for secure database access

**Gaps:**
- ❌ No atomic check-and-decrement operation
- ❌ Race condition between checking quota and consuming it
- ❌ No request idempotency handling

### 2. Usage Tracking (`/api/billing/track-usage`)
**Strengths:**
- ✅ Authentication required
- ✅ Handles existing records with updates
- ✅ Automatically consumes bonus usage when base limit exceeded
- ✅ Proper period tracking (monthly)

**Gaps:**
- ❌ Not using atomic database operations
- ❌ No transaction wrapping for bonus consumption
- ❌ Could allow over-consumption in concurrent scenarios

### 3. AI Chat Endpoint (`/api/ai/chat`)
**Pattern:**
```typescript
// 1. Check quota
const quotaResponse = await fetch('/api/billing/check-quota')
if (!quotaData.allowed) return error

// 2. Perform AI operation
const response = generateContextualResponse(message)

// 3. Track usage
await fetch('/api/billing/track-usage')
```

**Critical Issue:** Non-atomic check-then-act pattern creates race condition window

### 4. Project Creation (`/api/projects`)
**Major Gap:** 
- ❌ NO quota checking implemented
- ❌ NO usage tracking for project creation
- ❌ Users can create unlimited projects regardless of plan

### 5. Export Functionality
**Major Gap:**
- ❌ NO API endpoint for exports found
- ❌ Frontend shows export button but no backend enforcement
- ❌ Only client-side permission check via `canPerformAction('export')`

## Database Schema Analysis

### Strengths:
1. **Unique Constraint**: `UNIQUE(user_id, metric_name, period_start)` prevents duplicate tracking records
2. **Atomic Increment Function**: `increment_user_usage` uses `ON CONFLICT DO UPDATE`
3. **Row Level Security**: Enabled on all billing tables

### Gaps:
1. **Not Using Atomic Function**: API routes use manual INSERT/UPDATE instead of `increment_user_usage`
2. **No Quota Enforcement at DB Level**: No CHECK constraints or triggers to prevent over-usage

## Race Condition Scenarios

### Scenario 1: Concurrent AI Requests
```
Time | Request A              | Request B              | Result
-----|------------------------|------------------------|--------
T1   | Check quota (10 left)  |                        |
T2   |                        | Check quota (10 left)  |
T3   | Generate AI response   | Generate AI response   |
T4   | Track usage (+1)       |                        |
T5   |                        | Track usage (+1)       | Both succeed!
```

### Scenario 2: Bonus Consumption Race
```typescript
// Current implementation in track-usage:
if (newValue > baseLimit) {
  const bonusToConsume = Math.min(amount, newValue - baseLimit)
  await bonusService.consumeBonus(user.id, metric, bonusToConsume)
}
```
Multiple requests could consume the same bonus credits.

## Security & Enforcement Gaps

### 1. Missing Enforcement Points:
- Project creation has NO quota checks
- Export functionality has NO backend implementation
- No middleware for automatic quota enforcement

### 2. Client-Side Only Protections:
```typescript
// From enhanced-workspace-page.tsx
const handleExport = () => {
  if (!canPerformAction('export')) {
    requestUpgrade('export code')
    return
  }
  // No actual export happens!
}
```

### 3. No Audit Trail:
- No logging of quota violations
- No tracking of failed attempts
- No abuse detection mechanisms

## Recommended Fixes

### 1. Implement Atomic Quota Checking
```sql
CREATE OR REPLACE FUNCTION check_and_consume_quota(
  p_user_id UUID,
  p_metric TEXT,
  p_amount INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  v_allowed BOOLEAN;
BEGIN
  -- Atomic check and update in single transaction
  WITH quota_check AS (
    SELECT 
      CASE 
        WHEN pl.max_limit = -1 THEN true
        WHEN ut.metric_value + p_amount <= pl.max_limit THEN true
        ELSE false
      END as allowed
    FROM plan_limits pl
    JOIN user_subscription us ON us.plan_name = pl.plan_name
    LEFT JOIN usage_tracking ut ON ut.user_id = p_user_id
    WHERE us.user_id = p_user_id
  )
  SELECT allowed INTO v_allowed FROM quota_check;
  
  IF v_allowed THEN
    PERFORM increment_user_usage(p_user_id, p_metric, p_amount);
  END IF;
  
  RETURN v_allowed;
END;
$$ LANGUAGE plpgsql;
```

### 2. Add Quota Enforcement Middleware
```typescript
export function withQuotaCheck(
  metric: 'ai_generations' | 'exports' | 'projects_created',
  amount: number = 1
) {
  return function(handler: Function) {
    return withApiAuth(async (req, ctx) => {
      // Atomic check and consume
      const allowed = await supabase.rpc('check_and_consume_quota', {
        p_user_id: ctx.user.id,
        p_metric: metric,
        p_amount: amount
      })
      
      if (!allowed) {
        return NextResponse.json({ 
          error: 'Quota exceeded',
          code: 'QUOTA_EXCEEDED' 
        }, { status: 403 })
      }
      
      return handler(req, ctx)
    }, { requireAuth: true })
  }
}
```

### 3. Implement Missing Enforcements
- Add quota checking to project creation endpoint
- Implement actual export API with quota enforcement
- Add rate limiting to prevent rapid quota consumption

### 4. Add Monitoring & Alerts
- Log all quota violations
- Track usage patterns for abuse detection
- Implement usage webhooks for real-time monitoring

## Conclusion

While the codebase has basic quota checking infrastructure, it suffers from:
1. **Race conditions** due to non-atomic operations
2. **Missing enforcement** on key features (projects, exports)
3. **Client-side only** protections for some features
4. **No abuse prevention** mechanisms

The system is vulnerable to quota bypass through concurrent requests and completely lacks enforcement for project creation and exports.