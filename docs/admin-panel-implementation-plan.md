# Admin Panel Implementation Plan

**Date:** January 8, 2026
**Status:** Implementation In Progress

---

## Implementation Progress

**Last Updated:** January 9, 2026

### Backend Implementation Status

| Component | Status | Files Created |
|-----------|--------|---------------|
| **Foundation: Metrics Layer** | ✅ Complete | |
| - Migration (tables + cardinality guards) | ✅ | `migrations/097_admin_panel_foundation_metrics.sql` |
| - Route normalization utility | ✅ | `src/utils/routeNormalization.ts` |
| - API metrics middleware | ✅ | `src/middleware/apiMetricsMiddleware.ts` |
| - Admin Metrics Service | ✅ | `src/services/admin/AdminMetricsService.ts` |
| **Phase 1.1: System Health Dashboard** | ✅ Complete | |
| - Worker API endpoints | ✅ | `src/routes/adminSystemHealth.ts` |
| - Frontend page | ✅ | `sheenappsai/src/app/admin/system-health/page.tsx` |
| - Frontend component | ✅ | `sheenappsai/src/components/admin/SystemHealthDashboard.tsx` |
| - Frontend API routes | ✅ | `sheenappsai/src/app/api/admin/system-health/` |
| **Phase 1.2: Incident Management** | ✅ Complete | |
| - Migration (incidents + timeline + postmortems) | ✅ | `migrations/098_admin_panel_incidents_alerts.sql` |
| - Incident Management Service | ✅ | `src/services/admin/IncidentManagementService.ts` |
| - Worker API endpoints | ✅ | `src/routes/adminIncidents.ts` |
| - Frontend page | ✅ | `sheenappsai/src/app/admin/incidents/page.tsx` |
| - Frontend component | ✅ | `sheenappsai/src/components/admin/IncidentManagementDashboard.tsx` |
| - Frontend API routes | ✅ | `sheenappsai/src/app/api/admin/incidents/` |
| **Phase 1.3: Alert Rules & Evaluator** | ✅ Complete | |
| - Migration (alert_rules + alerts_fired) | ✅ | (included in 098) |
| - Alert Service | ✅ | `src/services/admin/AlertService.ts` |
| - Alert Evaluator Worker | ✅ | `src/workers/alertEvaluatorWorker.ts` |
| - Worker API endpoints | ✅ | `src/routes/adminAlerts.ts` |
| - Frontend page | ✅ | `sheenappsai/src/app/admin/alerts/page.tsx` |
| - Frontend component | ✅ | `sheenappsai/src/components/admin/AlertManagementDashboard.tsx` |
| - Frontend API routes | ✅ | `sheenappsai/src/app/api/admin/alerts/` |
| - Routes registered in server.ts | ✅ | Import + register + start worker |
| **Phase 2.1: Customer Health Score** | ✅ Complete | |
| - Migration (health scores + notes + tags + contacts) | ✅ | `migrations/099_customer_health_scores.sql` |
| - CustomerHealthService | ✅ | `src/services/admin/CustomerHealthService.ts` |
| - Health Score Worker (nightly) | ✅ | `src/workers/healthScoreWorker.ts` |
| - Worker API endpoints | ✅ | `src/routes/adminCustomerHealth.ts` |
| - Frontend page | ✅ | `sheenappsai/src/app/admin/customer-health/page.tsx` |
| - Frontend component | ✅ | `sheenappsai/src/components/admin/CustomerHealthDashboard.tsx` |
| - Frontend API routes | ✅ | `sheenappsai/src/app/api/admin/customer-health/` |
| - Routes registered in server.ts | ✅ | Import + register + start worker |
| **Phase 2.2: Customer 360 View** | ✅ Complete | |
| - Customer360Service (data aggregation) | ✅ | `src/services/admin/Customer360Service.ts` |
| - Worker API endpoints | ✅ | `src/routes/adminCustomer360.ts` |
| - Frontend page | ✅ | `sheenappsai/src/app/admin/users/[userId]/360/page.tsx` |
| - Frontend component | ✅ | `sheenappsai/src/components/admin/Customer360Dashboard.tsx` |
| - Frontend API routes | ✅ | `sheenappsai/src/app/api/admin/customer-360/` |
| - Routes registered in server.ts | ✅ | Import + register |
| **Phase 3.2: Feature Flags** | ✅ Complete | |
| - Migration (flags + audit tables) | ✅ | `migrations/100_feature_flags.sql` |
| - FeatureFlagService with caching | ✅ | `src/services/admin/FeatureFlagService.ts` |
| - Worker API endpoints | ✅ | `src/routes/adminFeatureFlags.ts` |
| - Frontend page | ✅ | `sheenappsai/src/app/admin/feature-flags/page.tsx` |
| - Frontend component | ✅ | `sheenappsai/src/components/admin/FeatureFlagsManagement.tsx` |
| - Frontend API routes | ✅ | `sheenappsai/src/app/api/admin/feature-flags/` |
| - Routes registered in server.ts | ✅ | Import + register |

### Route Registration ✅ Complete

The following has been added to `src/server.ts`:
- Imported: `adminSystemHealthRoutes`, `adminIncidentRoutes`, `adminAlertRoutes`, `adminCustomerHealthRoutes`, `adminCustomer360Routes`, `adminFeatureFlagsRoutes`
- Imported workers: `startAlertEvaluator`, `stopAlertEvaluator`, `startHealthScoreWorker`, `stopHealthScoreWorker`
- Registered routes with `app.register()`
- Alert evaluator worker started in both `stream` and `modular` architecture modes
- Health score worker started in both `stream` and `modular` architecture modes
- Graceful shutdown calls `stopAlertEvaluator()` and `stopHealthScoreWorker()`

### Database Migrations Required

Run in order:
1. `097_admin_panel_foundation_metrics.sql` - Metrics tables + cardinality guards
2. `098_admin_panel_incidents_alerts.sql` - Incidents + Alerts tables
3. `099_customer_health_scores.sql` - Customer health scores + notes + tags + contacts
4. `100_feature_flags.sql` - Feature flags + audit log tables

### Files Created Summary

**Worker (sheenapps-claude-worker):**
```
migrations/
├── 097_admin_panel_foundation_metrics.sql    # Metrics tables + cardinality guards
├── 098_admin_panel_incidents_alerts.sql      # Incidents + Alerts tables
├── 099_customer_health_scores.sql            # Customer health scores + admin tools
└── 100_feature_flags.sql                     # Feature flags + audit log tables

src/utils/
└── routeNormalization.ts                     # Route normalization for metrics

src/middleware/
└── apiMetricsMiddleware.ts                   # API request metrics collection

src/services/admin/
├── AdminMetricsService.ts                    # Metrics aggregation + SLO queries
├── IncidentManagementService.ts              # Incident lifecycle management
├── AlertService.ts                           # Alert rules + evaluation
├── CustomerHealthService.ts                  # Customer health scoring
├── Customer360Service.ts                     # Customer 360 data aggregation
└── FeatureFlagService.ts                     # Feature flags with caching + audit

src/workers/
├── alertEvaluatorWorker.ts                   # Scheduled alert evaluation
└── healthScoreWorker.ts                      # Nightly health score calculation

src/routes/
├── adminSystemHealth.ts                      # System health API endpoints
├── adminIncidents.ts                         # Incident management API endpoints
├── adminAlerts.ts                            # Alert management API endpoints
├── adminCustomerHealth.ts                    # Customer health API endpoints
├── adminCustomer360.ts                       # Customer 360 API endpoints
└── adminFeatureFlags.ts                      # Feature flags API endpoints
```

**Frontend (sheenappsai):**
```
src/app/admin/
├── system-health/page.tsx                    # System health dashboard page
├── incidents/page.tsx                        # Incident management page
├── alerts/page.tsx                           # Alert management page
├── customer-health/page.tsx                  # Customer health dashboard page
├── users/[userId]/360/page.tsx               # Customer 360 view page
└── feature-flags/page.tsx                    # Feature flags management page

src/components/admin/
├── SystemHealthDashboard.tsx                 # System health UI component
├── IncidentManagementDashboard.tsx          # Incident management UI component
├── AlertManagementDashboard.tsx             # Alert management UI component
├── CustomerHealthDashboard.tsx              # Customer health UI component
├── Customer360Dashboard.tsx                 # Customer 360 UI component
└── FeatureFlagsManagement.tsx               # Feature flags UI component

src/app/api/admin/
├── system-health/
│   ├── route.ts                              # Main system health API
│   ├── sparkline/[metricName]/route.ts       # Sparkline data API
│   └── degradation/[serviceName]/route.ts    # Degradation analysis API
├── incidents/
│   ├── route.ts                              # List/create incidents
│   ├── [id]/route.ts                         # Get/update incident
│   ├── [id]/timeline/route.ts                # Timeline entries
│   ├── [id]/postmortem/route.ts              # Post-mortem management
│   ├── [id]/resolve/route.ts                 # Resolve incident
│   └── stats/mttr/route.ts                   # MTTR statistics
├── alerts/
│   ├── rules/route.ts                        # List/create alert rules
│   ├── rules/[id]/route.ts                   # Get/update/delete alert rule
│   ├── rules/[id]/toggle/route.ts            # Toggle rule enabled/disabled
│   ├── active/route.ts                       # Get active (firing) alerts
│   ├── history/route.ts                      # Alert history
│   ├── [id]/acknowledge/route.ts             # Acknowledge alert
│   ├── [id]/resolve/route.ts                 # Resolve alert
│   ├── [id]/create-incident/route.ts         # Create incident from alert
│   └── evaluator/
│       ├── status/route.ts                   # Get evaluator status
│       └── force-run/route.ts                # Force evaluation run
├── customer-health/
│   ├── summary/route.ts                      # Health summary counts
│   ├── at-risk/route.ts                      # At-risk customer list
│   ├── changes/route.ts                      # Score changes (dropped/recovered)
│   ├── export/route.ts                       # Export to CSV
│   ├── user/[userId]/notes/route.ts          # Customer notes
│   ├── user/[userId]/tags/route.ts           # Customer tags
│   ├── user/[userId]/contacts/route.ts       # Contact log
│   └── worker/
│       ├── status/route.ts                   # Worker status
│       └── force-run/route.ts                # Force calculation
├── customer-360/
│   ├── search/route.ts                       # Search customers
│   └── [userId]/
│       ├── route.ts                          # Get Customer 360 data
│       ├── notes/route.ts                    # Customer notes
│       ├── contacts/route.ts                 # Contact log
│       └── tags/
│           ├── route.ts                      # Get/add tags
│           └── [tag]/route.ts                # Delete tag
└── feature-flags/
    ├── route.ts                              # List/create flags
    ├── audit/recent/route.ts                 # Recent audit logs (all flags)
    └── [id]/
        ├── route.ts                          # Get/update/delete flag
        ├── toggle/route.ts                   # Quick toggle on/off
        └── audit/route.ts                    # Flag-specific audit log
```

### Remaining Work

**Phase 1 Complete!** All operational reliability features implemented:
- ✅ System Health Dashboard
- ✅ Incident Management
- ✅ Alert Rules & Evaluator

**Phase 2 Complete!** All customer operations features implemented:
- ✅ Customer Health Score (heuristic-based, 100-point formula)
- ✅ Customer 360 View (single-page customer context)

**Phase 3 In Progress!** Compliance & Safety features:
- ⏳ GDPR/Privacy Tools (not started)
- ✅ Feature Flags (kill switches + targeted releases, no percentage rollouts)

**Next Steps:**
1. **Testing**: Run migrations and verify functionality
2. **Phase 3.1**: GDPR/Privacy Tools
3. **Phase 4**: Customer Segmentation, Report Builder

### Discoveries & Notes

1. **OpenTelemetry Already Configured**: The codebase has extensive OTel metrics in `src/observability/metrics.ts`. The new AdminMetricsService complements this by storing hourly aggregates for dashboard queries.

2. **Existing Admin Auth**: Leveraged `requireAdminAuth` and `requireReadOnlyAccess` from existing middleware.

3. **ServerLoggingService Pattern**: Used existing logging service pattern for consistency.

4. **Supabase Admin Context**: Used `makeAdminCtx()` pattern for bypassing RLS in admin operations.

5. **Next.js 15 Params Pattern**: Frontend API routes use `{ params }: { params: Promise<{ id: string }> }` pattern with await.

6. **Two Health Score Formulas**:
   - `AdminBillingService` has a billing-focused formula (usage_trend, payment_risk, minutes_runway, last_activity, support_friction)
   - `CustomerHealthService` has a product-engagement formula (usage recency, activation, build health, billing risk, support load, recent success bonus)
   - Both serve different purposes: AdminBillingService focuses on revenue risk, CustomerHealthService focuses on product engagement/churn risk.

7. **Customer 360 Data Aggregation**: The Customer360Service aggregates data from 8+ sources in parallel for performance: profile, health score, billing (subscriptions, payments), usage (projects, builds), support (tickets), admin notes, contact log, and tags.

8. **Shared Admin Tables**: The `user_admin_notes`, `user_admin_tags`, and `user_contact_log` tables created in migration 099 are shared between CustomerHealthService and Customer360Service.

9. **Feature Flags - Simplified Implementation**: Implemented kill switches and targeted releases only (no percentage rollouts). This aligns with immediate needs:
   - **Kill switches**: Instant on/off toggles for critical features (builds, payments, signups)
   - **Targeted releases**: Enable features for specific user IDs or subscription plans
   - **Audit trail**: All changes require a reason and are logged with who/when/why
   - **In-memory caching**: 5-minute TTL with instant invalidation on changes
   - **Helper function**: `isFeatureEnabled(supabase, flagName, userId?, userPlan?)` for easy use throughout codebase

---

## What You Already Have (Strong Foundation)

Your admin panel is better than most SaaS platforms at this stage:

- **68+ API endpoints**, 37 UI components, 20+ sections
- **Excellent security**: JWT auth, 30+ permission types, correlation IDs, two-person approval
- **Solid ops**: Unified logs with SSE streaming, build logs, usage spike detection
- **Domain-specific strength**: Advisor matching system with health monitoring
- **Ahead of curve**: Promotions with scenario tester, pricing A/B testing with rollback

**You're not starting from zero on monitoring.** You have unified logs, build logs, and spike alerts. The gap is consolidation and structure, not raw capability.

---

## Foundation: Metrics Layer (Do Before Everything)

**The expert's critical insight:** Logs are evidence. Metrics are truth.

Deriving p95 response times from unified logs works, but it gets messy (sampling bias, missing spans, inconsistent status mapping). Before building dashboards on log soup, add a thin metrics layer.

### F.1 Metrics Collection

**Effort:** Low-Medium
**Why:** Everything in Phase 1 depends on stable, queryable metrics.

**Instrumentation Strategy:**
- **Default:** Instrument directly in API/build runner (counters + latency histograms)
- **Fallback:** Derive from logs only where you can't instrument (e.g., third-party webhooks)

Direct instrumentation gives accurate p95/p99. Log-derived metrics have sampling bias and miss requests that error before logging.

```typescript
// Instrument directly in your API middleware
import { metrics } from './metrics';

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = normalizeRoute(req.route?.path || req.path); // IMPORTANT: normalize!

    metrics.increment('api_requests_total', {
      route,  // '/api/users/:id' not '/api/users/123'
      status_code: String(res.statusCode)
    });
    metrics.histogram('api_request_duration_ms', duration, { route });
  });
  next();
});

// Route normalization prevents cardinality explosion
function normalizeRoute(path: string): string {
  return path
    .replace(/\/[0-9a-f-]{36}/g, '/:id')     // UUIDs
    .replace(/\/\d+/g, '/:id')                // Numeric IDs
    .replace(/\/[^\/]+@[^\/]+/g, '/:email');  // Emails
}
```

**Key metrics to track:**

| Metric | Dimensions | Source |
|--------|------------|--------|
| `api_requests_total` | route, status_code | Direct instrumentation |
| `api_request_duration_ms` | route | Direct instrumentation |
| `builds_total` | status (success/failed/timeout) | Direct instrumentation |
| `build_duration_seconds` | - | Direct instrumentation |
| `webhook_events_total` | provider, status | Log-derived (external events) |
| `payment_events_total` | type (success/failed/retry) | Log-derived (Stripe webhooks) |
| `active_users_hourly` | - | Log-derived (aggregate) |

### F.2 Metrics Storage

**Cardinality Guards (critical):**

Without these, `dimensions` JSONB becomes a slow-motion DoS against your own database.

```sql
CREATE TABLE system_metrics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour TIMESTAMPTZ NOT NULL,
  metric_name TEXT NOT NULL,
  dimensions JSONB DEFAULT '{}',
  value NUMERIC NOT NULL,

  UNIQUE(hour, metric_name, dimensions)
);

CREATE INDEX idx_metrics_lookup ON system_metrics_hourly(metric_name, hour DESC);

-- Cardinality guard: only allow whitelisted dimension keys
CREATE OR REPLACE FUNCTION check_metric_dimensions()
RETURNS TRIGGER AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY['route', 'status_code', 'provider', 'queue', 'plan', 'status', 'type'];
  actual_keys TEXT[];
BEGIN
  SELECT array_agg(key) INTO actual_keys FROM jsonb_object_keys(NEW.dimensions) AS key;

  IF actual_keys IS NOT NULL AND NOT (actual_keys <@ allowed_keys) THEN
    RAISE EXCEPTION 'Invalid dimension key. Allowed: %', allowed_keys;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_dimension_keys
  BEFORE INSERT ON system_metrics_hourly
  FOR EACH ROW EXECUTE FUNCTION check_metric_dimensions();
```

**Don't need yet:** Full TSDB (Prometheus/InfluxDB). This table is enough until you have serious cardinality.

---

## Phase 1: Operational Reliability

These reduce existential risk - when something breaks, you need to know immediately and respond systematically.

---

### 1.1 System Health Dashboard

**Effort:** Low (metrics layer does the hard work)
**Why:** One "is the platform healthy right now?" view.

**Build:**

```
/admin/system-health
├── Overall Status Banner
│   └── "All Systems Operational" or "Degraded: API latency elevated"
│
├── SLO Cards (the "are we meeting promises?" view)
│   ├── API Availability: 99.92% (target: 99.9%) ✓ [7-day window]
│   ├── Build Success Rate: 94.1% (target: 95%) ⚠ [-0.9% from target]
│   └── Webhook Delivery: 99.8% (target: 99.5%) ✓
│
├── Service Status Grid
│   ├── API Worker: Green | p95: 145ms | Error rate: 0.08%
│   ├── Database: Green | Connections: 12/100 | Query p95: 23ms
│   ├── Build Runner: Yellow | Queue depth: 47 | Success: 94%
│   ├── Stripe: Green | Last webhook: 2m ago
│   ├── Supabase: Green | Last healthcheck: 1m ago
│   └── Sanity: Green | Last sync: 5m ago
│
├── "Why Is It Yellow/Red?" Panel (key insight)
│   └── When any service is degraded, show:
│       ├── Top contributing routes: "/api/build (67% of errors)"
│       ├── Error spike started: "14:32 UTC"
│       └── Sample error: "Connection timeout to build-runner"
│
├── 24-Hour Sparklines
│   ├── Request volume
│   ├── Error rate
│   └── p95 latency
│
└── Recent Alerts (last 24h)
    └── Links to Alert History
```

**Key principle:** Red/yellow/green is vibes. SLO + "why is it broken" is action.

**Definition of Done:**
- [ ] Status grid pulls from `system_metrics_hourly`, not raw logs
- [ ] Clicking a service opens filtered unified logs + related incidents
- [ ] Shows 24h sparkline for error rate + latency
- [ ] "Why is it red?" panel auto-populates from top error dimensions
- [ ] Overall status derived from SLO breach (any SLO red = overall yellow/red)

---

### 1.2 Incident Management

**Effort:** Medium
**Why:** When things break, you need a record of what happened, who did what, and what you learned.

**Build:**

```
/admin/incidents
├── Create Incident
│   ├── Title
│   ├── Severity: SEV1 | SEV2 | SEV3 | SEV4 (with definitions visible)
│   ├── Status: Investigating | Identified | Monitoring | Resolved
│   ├── Affected systems (checkboxes)
│   ├── Status page message (even if no status page yet - comms seed)
│   └── Initial description
│
├── Incident Timeline (APPEND-ONLY - no edits, only new entries)
│   ├── Timestamped entries: "Identified root cause: X"
│   ├── Who added each entry
│   ├── Auto-logged: "Status changed to resolved by @admin"
│   └── Auto-logged: "Alert rule 'high_error_rate' triggered this incident"
│
├── Post-Mortem (required for SEV1-2)
│   ├── What happened
│   ├── Impact (users affected, duration, revenue impact)
│   ├── Root cause (5 whys)
│   ├── What we'll do differently
│   └── Action items: [{title, owner, due_date, status}]
│
└── Incident History
    ├── Search by severity, status, affected system, date range
    ├── MTTR by severity (auto-calculated)
    └── Frequency trends
```

**SEV Level Definitions (define once, reference everywhere):**

| Level | Criteria | Response | Examples |
|-------|----------|----------|----------|
| SEV1 | Full outage, all users affected | All hands, 15min updates | API down, database unreachable |
| SEV2 | Major feature broken, many users affected | On-call + backup, 30min updates | Builds failing, payments broken |
| SEV3 | Partial degradation, some users affected | On-call, hourly updates | Slow responses, intermittent errors |
| SEV4 | Minor issue, few users, workaround exists | Next business day | UI glitch, non-critical feature broken |

**Permissions:**
- `incidents.create`: All admins
- `incidents.create_sev1`: Elevated admins only (prevents false alarms)
- `incidents.resolve`: Creator or elevated admins
- `incidents.edit_postmortem`: Creator + super_admin

**Schema:**

```sql
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key TEXT UNIQUE,  -- Dedupe: "api_high_error_rate_2026-01-08"
  title TEXT NOT NULL,
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'investigating',
  affected_systems TEXT[] DEFAULT '{}',
  status_page_message TEXT,  -- Comms seed for future status page
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES admin_users(id),
  resolved_by UUID REFERENCES admin_users(id),

  -- Auto-calculated
  duration_minutes INT GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at)) / 60
  ) STORED
);

-- APPEND-ONLY timeline: no UPDATE, no DELETE (audit-grade)
CREATE TABLE incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  entry_type TEXT DEFAULT 'manual', -- manual | status_change | alert_trigger | correction
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admin_users(id)
);

-- Enforce append-only: deny UPDATE and DELETE
CREATE OR REPLACE FUNCTION deny_timeline_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'incident_timeline is append-only. To correct an entry, add a new entry with type=correction.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_timeline_update
  BEFORE UPDATE ON incident_timeline
  FOR EACH ROW EXECUTE FUNCTION deny_timeline_mutation();

CREATE TRIGGER prevent_timeline_delete
  BEFORE DELETE ON incident_timeline
  FOR EACH ROW EXECUTE FUNCTION deny_timeline_mutation();

-- Corrections are new entries, not edits:
-- INSERT INTO incident_timeline (incident_id, message, entry_type, created_by)
-- VALUES (?, 'Correction: earlier entry said X, actual was Y', 'correction', ?);

CREATE TABLE incident_postmortems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) UNIQUE,
  what_happened TEXT,
  impact TEXT,
  root_cause TEXT,
  lessons_learned TEXT,
  action_items JSONB DEFAULT '[]', -- [{title, owner, due_date, status}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dedupe index for incident_key
CREATE UNIQUE INDEX idx_incident_key ON incidents(incident_key) WHERE incident_key IS NOT NULL;
```

**Definition of Done:**
- [ ] Create → timeline entries → resolve → postmortem flow works
- [ ] MTTR automatically computed and displayed
- [ ] SEV1-2 resolution blocked until postmortem exists
- [ ] Append-only timeline enforced (no edit/delete)
- [ ] Duplicate incidents prevented by `incident_key`

---

### 1.3 Alert Rules

**Effort:** Medium
**Why:** Usage spike alerts are good, but you need configurable thresholds with delivery.

**Architecture (this is what makes the UI useful):**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  alert_rules    │────▶│  Alert Evaluator │────▶│  alerts_fired   │
│  (config)       │     │  Worker (1/min)  │     │  (history)      │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │ Notify: Slack,   │
                        │ Email, Webhook   │
                        └──────────────────┘
```

**Schema:**

```sql
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  metric_name TEXT NOT NULL,           -- 'api_error_rate', 'build_success_rate'
  dimensions JSONB DEFAULT '{}',       -- {route: '/api/build'} or {} for all
  condition TEXT NOT NULL,             -- 'gt', 'lt', 'eq'
  threshold NUMERIC NOT NULL,
  duration_minutes INT DEFAULT 5,      -- Must breach for X minutes
  severity TEXT NOT NULL,              -- 'warning', 'critical'
  channels JSONB NOT NULL,             -- [{type: 'slack', webhook: '...'}, {type: 'email', to: [...]}]
  enabled BOOLEAN DEFAULT true,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alerts_fired (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES alert_rules(id),
  -- Fingerprint = hash(rule_id + dimensions) for per-dimension uniqueness
  -- Allows same rule to fire for /api/build AND /api/auth independently
  fingerprint TEXT NOT NULL,
  firing_dimensions JSONB DEFAULT '{}',  -- The specific dimensions that triggered
  status TEXT NOT NULL DEFAULT 'firing', -- firing | acknowledged | resolved
  fired_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES admin_users(id),
  resolved_at TIMESTAMPTZ,
  metric_value NUMERIC,                  -- Value that triggered the alert
  incident_id UUID REFERENCES incidents(id), -- Optional link to incident

  -- Notification tracking
  notifications_sent JSONB DEFAULT '[]'  -- [{channel, sent_at, status}]
);

-- Per-dimension uniqueness: one rule can fire for multiple dimension combinations
-- e.g., "high_error_rate" can fire for route=/api/build AND route=/api/auth
CREATE UNIQUE INDEX idx_active_alert ON alerts_fired(rule_id, fingerprint)
  WHERE status = 'firing';
```

**Alert Evaluator Worker (runs every minute):**

```typescript
import { createHash } from 'crypto';

// Generate fingerprint for per-dimension alert uniqueness
function getAlertFingerprint(ruleId: string, dimensions: Record<string, string>): string {
  const sorted = Object.keys(dimensions).sort().map(k => `${k}=${dimensions[k]}`).join('|');
  return createHash('sha256').update(`${ruleId}:${sorted}`).digest('hex').substring(0, 16);
}

async function evaluateAlerts() {
  const rules = await getEnabledAlertRules();

  for (const rule of rules) {
    // Get all dimension combinations that match the rule
    const metricResults = await getMetricValues(
      rule.metric_name,
      rule.dimensions,  // May be partial filter, e.g., {status_code: '5xx'}
      rule.duration_minutes
    );

    for (const result of metricResults) {
      const fingerprint = getAlertFingerprint(rule.id, result.dimensions);
      const isBreaching = evaluateCondition(result.value, rule.condition, rule.threshold);
      const existingAlert = await getActiveAlert(rule.id, fingerprint);

      if (isBreaching && !existingAlert) {
        // New alert - fire it
        await createAlert(rule, result.value, fingerprint, result.dimensions);
        await sendNotifications(rule.channels, rule, result.value, result.dimensions);
      } else if (!isBreaching && existingAlert) {
        // Hysteresis: only resolve if below threshold - delta for duration
        const resolveThreshold = rule.threshold * 0.9; // 10% buffer
        if (evaluateCondition(result.value, 'lt', resolveThreshold)) {
          await resolveAlert(existingAlert.id);
          await sendResolutionNotification(rule.channels, rule, result.dimensions);
        }
      }
    }
  }
}
```

**UI:**

```
/admin/alerts
├── Rules
│   ├── Rule list with status, last fired, enabled toggle
│   └── Create/Edit Rule
│       ├── Name, Description
│       ├── Metric picker (dropdown from available metrics)
│       ├── Dimension filter (optional - e.g., route='/api/build')
│       ├── Condition: > | < | ==
│       ├── Threshold value
│       ├── Duration: "for X minutes"
│       ├── Severity: Warning | Critical
│       └── Channels: Slack webhook | Email list
│
├── Active Alerts
│   ├── Currently firing alerts
│   ├── Acknowledge button (stops repeat notifications for 1 hour)
│   ├── Create Incident button (pre-fills from alert)
│   └── Link to relevant logs/metrics
│
└── History
    ├── All alerts with status, duration, resolution
    └── Filter by rule, severity, date range
```

**Definition of Done:**
- [ ] Evaluator worker runs every minute
- [ ] Alerts fire only after sustained breach (duration_minutes)
- [ ] Hysteresis prevents flapping (10% buffer for resolution)
- [ ] Slack notifications include metric value, threshold, link to dashboard
- [ ] Acknowledge stops repeat notifications for 1 hour
- [ ] "Create Incident" pre-fills from alert context

---

## Phase 2: Customer Operations

Once you can see platform health, focus on customer health.

---

### 2.1 Customer 360 View

**Effort:** Medium
**Why:** Your #1 operational pain during support. Currently requires opening 5 tabs.

**Build:**

```
/admin/users/[id]/360
├── Header
│   ├── Avatar, Name, Email
│   ├── Health Score: 72 ▼ (was 85 last week) [Yellow badge]
│   ├── Tags: [VIP] [High-touch] [Enterprise pilot]  <-- Admin-added tags
│   ├── Quick actions: Refund | Extend Trial | Suspend | Contact
│   └── Subscription: Pro ($49/mo) | Renews in 23 days
│
├── Internal Notes (support-native feature)
│   ├── "Sensitive about build times - escalate quickly" - @sarah, Jan 5
│   ├── "Considering enterprise upgrade" - @mike, Dec 28
│   └── Add note button
│
├── Contact Log (even if manual)
│   ├── "Emailed re: build failures" - @sarah, Jan 8
│   ├── "Called, no answer" - @sarah, Jan 7
│   └── Log contact button
│
├── Overview Cards
│   ├── Account: Created Oct 15, 2025 | Last login: 2 hours ago
│   ├── Billing: MRR $49 | LTV $294 | 1 failed payment (recovered)
│   ├── Usage: 12 projects | 47 builds this month | Last build: 1h ago
│   └── Support: 1 open ticket | Avg response: 2.3h | CSAT: 4/5
│
├── Last 3 Errors (churn fertilizer insight)
│   ├── Build #4521: "Memory limit exceeded" - 2 days ago
│   ├── Build #4519: "Timeout after 300s" - 3 days ago
│   └── Build #4515: "Dependency resolution failed" - 5 days ago
│
├── Health Score Breakdown
│   ├── Usage Recency: 30/30 (active today)
│   ├── Activation: 20/20 (first build completed)
│   ├── Build Health: 12/20 (78% success rate ⚠)
│   ├── Billing Risk: 20/20 (no failures)
│   └── Support Load: 7/10 (1 open ticket)
│   └── "Score dropped due to: Build success rate declined 15%"
│
├── Activity Timeline (unified, chronological)
│   ├── [Build] Build #4522 succeeded - 1 hour ago
│   ├── [Support] Opened ticket "Build timeouts" - 2 days ago
│   ├── [Build] Build #4521 failed: memory limit - 2 days ago
│   ├── [Billing] Invoice paid $49 - 5 days ago
│   └── Source icons for quick scanning
│
└── Tabs
    ├── Projects & Builds (existing)
    ├── Billing History (existing)
    ├── Support Tickets (existing)
    └── Admin Audit Log (actions taken on this user)
```

**Schema additions:**

```sql
CREATE TABLE user_admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,  -- The customer
  note TEXT NOT NULL,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_admin_tags (
  user_id UUID NOT NULL,
  tag TEXT NOT NULL,
  added_by UUID REFERENCES admin_users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tag)
);

CREATE TABLE user_contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  contact_type TEXT NOT NULL, -- 'email', 'call', 'meeting', 'chat'
  summary TEXT NOT NULL,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Definition of Done:**
- [ ] Single page loads all customer context in < 2 seconds
- [ ] Admin can add notes and tags without leaving page
- [ ] Contact log captures manual outreach
- [ ] Last 3 errors shown prominently for builder products
- [ ] Health score breakdown shows each signal + reason for changes
- [ ] Activity timeline pulls from builds, billing, support, auth events

---

### 2.2 Customer Health Score (Heuristic-Based)

**Effort:** Medium
**Why:** Know which customers need attention before they churn.

**Important:** Don't start with ML. Start with transparent heuristics your team can argue about.

**Formula (100-point scale):**

| Signal | Points | Logic |
|--------|--------|-------|
| **Usage Recency** | 0-30 | Last active: today=30, 7d=25, 14d=20, 30d=10, 60d+=0 |
| **Activation** | 0-20 | First build success completed: yes=20, no=0 |
| **Build Health** | 0-20 | Success rate last 30d: >90%=20, >70%=15, >50%=10, else=5 |
| **Billing Risk** | 0-20 | Payment failures last 90d: 0=20, 1=10, 2+=0 |
| **Support Load** | 0-10 | Open tickets: 0=10, 1=7, 2=4, 3+=0 |
| **Recent Success** | +5 bonus | Successful build in last 7 days (positive signal) |

**Score Interpretation:**

| Score | Status | Color | Action |
|-------|--------|-------|--------|
| 80-100 | Healthy | Green | Nurture, upsell opportunities |
| 60-79 | Monitor | Yellow | Check in proactively |
| 40-59 | At Risk | Orange | Immediate outreach |
| 0-39 | Critical | Red | Escalate, save attempt |
| N/A | Onboarding | Blue | Account < 14 days old |

**Tenure-Aware Handling (prevents false panic):**

```typescript
function getHealthStatus(user: User, score: number): HealthStatus {
  const accountAgeDays = daysSince(user.created_at);

  // New accounts get grace period
  if (accountAgeDays < 14) {
    return {
      status: 'onboarding',
      color: 'blue',
      message: 'New account - onboarding period'
    };
  }

  // Normal scoring after 14 days
  if (score >= 80) return { status: 'healthy', color: 'green' };
  if (score >= 60) return { status: 'monitor', color: 'yellow' };
  if (score >= 40) return { status: 'at_risk', color: 'orange' };
  return { status: 'critical', color: 'red' };
}
```

**Storage (store breakdown for explainability):**

```sql
CREATE TABLE user_health_scores (
  user_id UUID PRIMARY KEY,
  score INT NOT NULL,
  status TEXT NOT NULL,  -- 'healthy', 'monitor', 'at_risk', 'critical', 'onboarding'

  -- Breakdown (for explainability)
  usage_recency_score INT,
  activation_score INT,
  build_health_score INT,
  billing_risk_score INT,
  support_load_score INT,
  recent_success_bonus INT,

  -- Reasons (human-readable)
  score_reasons TEXT[],  -- ['Build success rate dropped to 72%', 'Active today']

  -- Trend
  score_7d_ago INT,
  score_30d_ago INT,
  trend TEXT,  -- 'up', 'down', 'stable'

  calculated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**UI:**

```
/admin/customer-health
├── Summary Cards
│   ├── Healthy: 1,234 (72%)
│   ├── Monitor: 312 (18%)
│   ├── At Risk: 89 (5%)
│   ├── Critical: 23 (1%)
│   └── Onboarding: 67 (4%)
│
├── At-Risk List (score < 60, excluding onboarding)
│   ├── Sorted by: days until renewal (ascending)
│   ├── Columns: User | Score | Trend | Renewal | Top Reason
│   ├── "John Doe | 45 ▼ | 12 days | Build success dropped to 68%"
│   └── Quick actions: View 360 | Log Contact | Add Note
│
├── Score Changes (last 7 days)
│   ├── "Dropped 20+ points": List with reasons
│   └── "Recovered 20+ points": List (celebrate wins)
│
├── Filters
│   ├── Plan: Free | Starter | Pro | Enterprise
│   ├── Renewal window: 7 days | 30 days | 90 days
│   └── Tag: VIP | High-touch | etc
│
└── Export: CSV of filtered list
```

**Definition of Done:**
- [ ] Health score calculated nightly for all users
- [ ] Onboarding bucket for accounts < 14 days (no false alarms)
- [ ] Score breakdown stored and displayed (fully explainable)
- [ ] Trend calculated (vs 7d and 30d ago)
- [ ] At-risk list sorted by renewal date
- [ ] "Score dropped > 20 points" list for proactive outreach

---

## Phase 3: Compliance & Safety

Legal requirements and deployment safety.

---

### 3.1 GDPR/Privacy Tools

**Effort:** Medium
**Why:** Legal requirement. Users will ask for data export/deletion.

**Key nuance:** Many systems should **anonymize** instead of hard delete (billing/invoices, fraud logs, audit trails). You can meet "right to erasure" while keeping required records if you remove personal identifiers.

**Build:**

```
/admin/privacy
├── Data Requests Queue
│   ├── Columns: Type | User | Requested | Deadline | Status
│   ├── Status: Pending | Verifying | Processing | Completed | Rejected
│   └── Request type: Export | Deletion | Both
│
├── Request Detail
│   ├── Request verification status (did user confirm via email?)
│   ├── User identity confirmed by: [admin] on [date]
│   └── Processing actions
│
├── Export Workflow
│   ├── Data categories to include (with checkboxes):
│   │   ├── Profile data ✓
│   │   ├── Projects & builds ✓
│   │   ├── Billing history ✓
│   │   ├── Support tickets ✓
│   │   └── Activity logs ✓
│   ├── Generate JSON/ZIP
│   ├── Secure download link (expires 7 days, one-time use)
│   └── Notify user when ready
│
├── Deletion Workflow
│   ├── Data categories with action per category:
│   │   ├── Profile: DELETE
│   │   ├── Projects/builds: DELETE
│   │   ├── Billing records: ANONYMIZE (legal requirement)
│   │   ├── Support tickets: ANONYMIZE
│   │   ├── Audit logs: ANONYMIZE (compliance requirement)
│   │   └── Fraud/abuse logs: RETAIN (legal basis: legitimate interest)
│   ├── Preview: what will be deleted vs anonymized
│   ├── Confirmation with admin reason (permanent action)
│   └── Generate deletion certificate
│
└── Retention Policy (reference)
    ├── By data category: what, how long, legal basis
    └── Configured in: /admin/settings/data-retention
```

**Anonymization approach:**

```typescript
// Anonymize instead of delete for legally required records
async function anonymizeUser(userId: string) {
  const anonymousId = `deleted_${hash(userId).substring(0, 8)}`;

  // Billing records: keep for tax/legal, remove PII
  await db.billing_records.update({
    where: { user_id: userId },
    data: {
      customer_name: 'Deleted User',
      customer_email: `${anonymousId}@deleted.local`,
      // Keep: amount, date, invoice_number (legal requirement)
    }
  });

  // Audit logs: keep for compliance, remove PII
  await db.audit_logs.update({
    where: { user_id: userId },
    data: {
      user_email: anonymousId,
      user_name: 'Deleted User',
      // Keep: action, timestamp, correlation_id
    }
  });

  // Actually delete: profile, projects, builds, preferences
  await db.users.delete({ where: { id: userId } });
  await db.projects.deleteMany({ where: { user_id: userId } });
  // ...
}
```

**Deletion Certificate (internal record, not legal proof):**

Generate on completion for audit trail. This is an internal record of what was done, not a legally formatted document.

```typescript
interface DeletionCertificate {
  certificate_id: string;          // UUID
  request_id: string;              // Links to original GDPR request
  user_id_hash: string;            // Anonymized reference to deleted user
  processed_at: Date;
  processed_by: string;            // Admin user ID
  actions_taken: Array<{
    data_category: string;         // 'profile', 'billing', 'audit_logs', etc.
    action: 'deleted' | 'anonymized' | 'retained';
    legal_basis?: string;          // e.g., 'Tax law requires 7-year retention'
    record_count: number;
  }>;
  verification_method: string;     // How user identity was confirmed
  notes?: string;                  // Any relevant context
}

// Store permanently in gdpr_deletion_certificates table
```

**Definition of Done:**
- [ ] Request queue with 30-day deadline tracking
- [ ] Email verification before processing deletion (prevent misuse)
- [ ] Export generates complete data package with manifest
- [ ] Deletion workflow shows delete vs anonymize per category
- [ ] Admin reason required for all deletions
- [ ] Audit log entry for all GDPR actions (permanent)

---

### 3.2 Feature Flags UI

**Effort:** Low
**Why:** Kill switches save you during bad deploys. Gradual rollouts reduce blast radius.

**Architecture (stage-appropriate):**
- Store flags in DB, read server-side with caching (simple)
- Don't need edge config or client-side evaluation yet
- Log all changes (who, when, why)

**Build:**

```
/admin/feature-flags
├── Flag List
│   ├── Name | Status | Rollout | Last Modified
│   ├── Quick toggle (with reason modal)
│   └── "new-build-runner | On | 25% of users | @sarah, 2h ago"
│
├── Flag Detail
│   ├── Name, Description, Created by
│   ├── Status: On | Off | Percentage
│   ├── Targeting:
│   │   ├── All users
│   │   ├── Percentage: [slider 0-100%]
│   │   ├── Specific users: [user picker]
│   │   └── Plan-based: Free | Starter | Pro | Enterprise
│   ├── Enable/Disable with reason (required)
│   └── Audit history: all changes with who/when/why
│
└── Kill Switches (separate section, red styling)
    ├── Critical flags that can be toggled instantly
    ├── No confirmation delay
    └── Immediate cache invalidation
```

**Schema:**

```sql
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'off', -- 'on', 'off', 'percentage'
  percentage INT DEFAULT 0,           -- 0-100
  target_user_ids UUID[] DEFAULT '{}',
  target_plans TEXT[] DEFAULT '{}',
  is_kill_switch BOOLEAN DEFAULT false,
  created_by UUID REFERENCES admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE feature_flag_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id UUID REFERENCES feature_flags(id),
  action TEXT NOT NULL,        -- 'created', 'enabled', 'disabled', 'percentage_changed'
  old_value JSONB,
  new_value JSONB,
  reason TEXT NOT NULL,
  changed_by UUID REFERENCES admin_users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Consistent Hashing Warning:**

If you run multiple services, ensure **every service uses the same hashing seed + algorithm**, or users will fall in/out of flags inconsistently across services (chaos).

```typescript
// Shared module: use the SAME implementation everywhere
import { createHash } from 'crypto';

const FLAG_HASH_SEED = 'your-stable-seed-do-not-change'; // Set once, never change

export function isUserInRollout(userId: string, flagName: string, percentage: number): boolean {
  const hash = createHash('sha256')
    .update(`${FLAG_HASH_SEED}:${flagName}:${userId}`)
    .digest('hex');
  const hashInt = parseInt(hash.substring(0, 8), 16);
  const bucket = hashInt % 100;
  return bucket < percentage;
}
```

**Definition of Done:**
- [ ] Flags stored in DB, cached server-side (5min TTL, instant invalidate on change)
- [ ] Percentage rollout uses consistent hashing (same users always in/out)
- [ ] Hashing uses shared seed + algorithm across all services
- [ ] All changes require reason and are audit logged
- [ ] Kill switches section for critical flags
- [ ] `isFeatureEnabled(flagName, userId)` helper available to all services

---

## Phase 4: Growth Sophistication

Once operations are solid, add sophisticated analytics.

---

### 4.1 Customer Segmentation

**Effort:** Medium

- Segment builder: filters on attributes + behavior
- Saved segments with auto-refresh counts
- Segment comparison: retention, revenue, feature usage
- Bulk actions on segments

### 4.2 Self-Service Report Builder

**Effort:** High

**Consider:** Third-party tool (Metabase, Superset) may be faster than building.

---

## Quick Wins (This Week)

### 1. Health Indicator in User List
Add colored dot to existing user management table:
- Green: Last active < 7 days, no open tickets, no payment failures
- Yellow: Last active 7-30 days OR 1 open ticket OR 1 payment failure
- Red: Last active > 30 days OR 2+ open tickets OR 2+ payment failures

### 2. Daily Digest Page + Email
**Email for notification, page for investigation.**

```
/admin/daily-digest (also sent as email at 9am)
├── Platform Health
│   ├── Error rate: 0.12% (normal)
│   ├── p95 latency: 234ms (elevated ⚠)
│   └── Build success: 94% (below target)
│
├── Alerts Fired (last 24h)
│   ├── [Critical] API error rate > 1% (resolved after 12 min)
│   └── Link to alert history
│
├── Customer Health Changes
│   ├── Score dropped > 20 points: 5 users [View list]
│   └── Moved to Critical: 2 users [View list]
│
├── Renewals at Risk
│   ├── "Jane Doe (Pro) renews in 5 days, score: 42 (Critical)"
│   └── "Acme Corp (Enterprise) renews in 12 days, score: 58 (At Risk)"
│
├── Failed Payments
│   └── 3 failed, 2 recovered, 1 needs attention
│
└── Top Errors (user-impacting)
    ├── "Memory limit exceeded" - 23 occurrences, 12 users
    └── "Build timeout" - 15 occurrences, 8 users
```

### 3. "View 360" Link
Add link in user management that opens full customer context (even before building the full 360 page, just opens the relevant tabs).

### 4. Export on All Tables
"Export filtered results as CSV" button on user list, ticket list, alert history.

---

## What NOT to Build (Yet)

- **ML-based churn prediction** - Need 6+ months of labeled churn data first
- **AI-powered insights** - "Confident nonsense with charts" without clean data loops
- **Escalation chains / on-call rotation** - Need dedicated on-call first
- **PagerDuty/OpsGenie integration** - Slack is enough for now
- **Full TSDB** - `system_metrics_hourly` table is enough until you have cardinality issues
- **SSO/SAML admin** - Enterprise feature, build when you have enterprise customers
- **Edge config for feature flags** - Server-side with caching is fine for now

---

## Success Metrics

After implementing Foundation + Phase 1-2:

| Metric | Current | Target | How Measured |
|--------|---------|--------|--------------|
| Time to detect outage | Unknown (reactive) | < 5 min | Alert `fired_at` → `acknowledged_at` (requires Acknowledge button in UI) |
| Time to understand customer | 5+ tabs, 10 min | 1 page, 30 sec | Support feedback |
| MTTR | Unknown | Tracked, trending down | Incident `created_at` → `resolved_at` |
| At-risk identified before churn | 0% | 50%+ | Health score at churn vs 30 days prior |
| Post-mortems completed | Ad-hoc | 100% of SEV1-2 | Incident data |
| SLO compliance | Unknown | Visible, > 99.5% | SLO dashboard |

**Note:** "Alert fire → ack time" requires the Acknowledge action in the Alerts UI (Phase 1.3). Track this once alerts are live.

---

## References

- [Google SRE Book - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)
- [Google SRE Workbook - Alerting on SLOs](https://sre.google/workbook/alerting-on-slos/)
- [Atlassian - Incident Management Handbook](https://www.atlassian.com/incident-management)
- [GDPR.eu - Right of Access Explainer](https://gdpr.eu/right-of-access/) (note: explainer, not official regulation)
- [ICO UK - Right to Erasure](https://ico.org.uk/for-organisations/guide-to-data-protection/guide-to-the-general-data-protection-regulation-gdpr/individual-rights/right-to-erasure/)
- [Stripe Docs - Webhooks Best Practices](https://stripe.com/docs/webhooks/best-practices)
