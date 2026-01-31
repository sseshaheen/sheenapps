# Run Hub Future Enhancements Plan

**Created:** 2026-01-27
**Updated:** 2026-01-29
**Status:** In Progress (Phases 1-3 complete, Phase 4 modals complete, frontend + worker code review fixes applied)

---

## Implementation Progress

| Phase | Item | Status | Notes |
|-------|------|--------|-------|
| 1 | Build State on Project Cards | ✅ Complete | Added BuildStatusIndicator component showing queued/building/failed/deployed states |
| 1 | Data Freshness Indicator | ✅ Complete | API returns lastEventAt, UI shows stale warning if no events >24h |
| 1 | Real Action Handlers - Navigate | ✅ Complete | Declarative action-handlers.ts registry, handleAction callback in run-overview-content.tsx |
| 2 | Basic Rule-Based Alerts | ✅ Complete | Created alert-rules.ts engine, computes lead_drop/revenue_drop/conversion_drop/stale_tracking/checkout_issues/payment_failures; displays with action buttons |
| 2 | KPI Comparisons | ✅ Complete | API returns previousKpis (7 days ago), KPI cards show delta indicator with up/down arrows and percentage change |
| 2 | Extended Date Ranges | ✅ Complete | Worker: getRange() aggregates KPIs over date range, getTrend() returns 7-day arrays; API: /range and /trend endpoints added |
| 3 | Load More Pagination | ✅ Complete | Worker: cursor-based pagination (id < cursor), returns nextCursor/hasMore; Frontend: RunLeadsContent uses "Load More" button with showing count. Translations added to all 9 locales |
| 3 | Chart Visualizations | ✅ Complete | Worker: getTrend() returns 7-day data; Frontend: Sparkline SVG component with color coding |
| 4 | Action Handlers - Modal | ✅ Complete | Created SendPromoModal (3-step wizard) and PostUpdateModal components in src/components/run/actions/. Updated handleAction to open modals. Translations in all 9 locales. Modals show "Coming Soon" until backend is ready. |
| 4 | Action Handlers - Workflow | ⏳ Pending | Requires backend: workflow_runs table, endpoints like /recover-abandoned, idempotency handling |
| 4 | Actions → Outcomes Loop | ⏳ Pending | |
| 4 | Proactive Digests | ⏳ Pending | |
| — | Code Review Fixes | ✅ Complete | See "Code Review Improvements" section below |

**Prerequisite:** Phase 3.5 (UX Polish) Complete

---

## Code Review Improvements (2026-01-27 / 2026-01-29)

Expert code review identified several issues across frontend and worker. All fixes implemented and verified.

### Frontend Code Review Fixes (2026-01-27)

### 1. API: Cursor vs Offset Validation (business-events)
**File:** `src/app/api/inhouse/projects/[id]/business-events/route.ts`
- Now rejects requests with both `cursor` AND `offset` params (ambiguous)
- Added YYYY-MM-DD validation for `startDate`/`endDate` params
- Returns 400 with clear error message if validation fails

### 2. API: Parallelized Worker Calls (run/overview)
**File:** `src/app/api/projects/[id]/run/overview/route.ts`
- Changed 5 sequential worker calls to parallel using `Promise.allSettled()`
- Major latency improvement (5x → 1x network round trips)
- Gracefully handles optional data (trends, previousKpis, lastEventAt) failures

### 3. API: Fire-and-Forget Settings Migration
**File:** `src/app/api/projects/[id]/run/overview/route.ts`
- GET endpoint was blocking on a write (run_settings migration)
- Changed to fire-and-forget with `.then()` error logging
- GET is now pure read with no blocking side-effects

### 4. Frontend: Fixed user.id Null Crash
**File:** `src/components/dashboard/project-grid.tsx`
- `handleRename` catch block accessed `user.id` without null check
- Added guard: `if (user) { ... }` before emitting error event

### 5. UX: SendPromoModal Subject Field
**File:** `src/components/run/actions/send-promo-modal.tsx`
- `value={subject || getDefaultSubject()}` prevented clearing the field
- Now sets default subject via useEffect when entering preview step
- Users can now clear/edit subject freely

### 6. Frontend: AbortController for Race Conditions
**Files:** `src/components/run/run-leads-content.tsx`, `src/components/run/run-orders-content.tsx`
- Fast filter changes could cause stale data overwrites
- Added AbortController ref to cancel in-flight requests
- Cleanup on unmount prevents memory leaks

### Worker Code Review Fixes (2026-01-29)

### 7. Worker: Safer Cursor Parsing
**File:** `src/routes/inhouseBusinessEvents.ts`
- Changed from `parseInt()` to `Number()` for cursor parsing
- `parseInt("12abc")` returns `12` (tolerates garbage); `Number("12abc")` returns `NaN`
- Added `Number.isFinite()` check to reject invalid cursors

### 8. Worker: Date Normalization to ISO Ranges
**File:** `src/routes/inhouseBusinessEvents.ts`
- YYYY-MM-DD dates now converted to full ISO ranges
- `startDate: "2026-01-15"` → `"2026-01-15T00:00:00.000Z"`
- `endDate: "2026-01-20"` → `"2026-01-20T23:59:59.999Z"`
- Prevents off-by-one filtering at day boundaries

### 9. Worker: includeTotal Optimization
**Files:** `src/routes/inhouseBusinessEvents.ts`, `src/services/businessEventsService.ts`
- Added `includeTotal` option to skip expensive `COUNT(*)` on pagination
- Only computes total on first page (when cursor is undefined)
- Significant performance improvement for "Load More" pattern

### 10. Worker: Idempotency Key Validation
**File:** `src/routes/inhouseBusinessEvents.ts`
- Added 8-128 character length validation
- Prevents abuse (too short = collision risk, too long = storage abuse)
- Returns 400 with clear error message

### 11. Worker: eventType Length Validation
**File:** `src/routes/inhouseBusinessEvents.ts`
- Added max 80 character limit
- Matches typical database column constraints
- Returns 400 with clear error message

### 12. Worker: Payload Size Guard
**File:** `src/routes/inhouseBusinessEvents.ts`
- Added 32KB payload size limit
- Uses `Buffer.byteLength()` for accurate UTF-8 byte counting
- Returns 413 (Payload Too Large) with clear error message

### 13. Worker: KPI Daily Date Validation
**File:** `src/routes/inhouseBusinessKpis.ts`
- Added YYYY-MM-DD format validation to `/daily` endpoint
- Matches validation already present on `/range` endpoint
- Returns 400 with clear error message

### 14. Worker: Trend Off-by-One Fix
**File:** `src/services/businessKpiService.ts`
- Fixed `getTrend()` query: `days=7` was returning 8 days
- Changed `CURRENT_DATE - $2::int` → `CURRENT_DATE - ($2::int - 1)`
- Now `days=7` correctly returns exactly 7 days of data

### Deferred (Lower Priority)
- **Action availability wiring:** Infrastructure exists (`getActionAvailability`) but not wired to UI. The "Coming Soon" badge already handles unavailable actions. Will revisit when backend workflows are ready.
- **Alert rules fallback actions:** Design decision, lower impact if availability is gated later
- **Cursor renaming:** Expert suggested `cursorId` instead of `cursor` - deferred as it would break frontend compatibility
- **Keyset pagination:** More robust than cursor but requires larger refactor - deferred
- **Logger injection to service:** Minor improvement, deferred

---

## Overview

This document outlines implementation plans for Run Hub enhancements beyond the MVP. Features are prioritized by business value and technical complexity, with concrete implementation details tailored to our codebase.

**Key Principle:** Each enhancement should move Run Hub from "monitoring dashboard" to "decision assistant" - insights should lead directly to actions.

**Strategic Vision:** The ultimate goal is for Run Hub to be the place where users:
1. See what's happening → 2. Decide what to do → 3. Take action → 4. See if it worked

This "closed loop" is what separates a decision assistant from a passive dashboard.

**North Star Metrics:**
- Weekly active Run Hub users (engagement)
- % of users who take actions (activation)
- Tracked outcomes from actions (value delivered)

**Guardrails:**
- Spam rate / unsubscribes / complaints for email workflows (protect user reputation)
- Workflow failure rate (reliability)
- Time from action click to visible result (responsiveness)

---

## Priority 1: Real Action Handlers (High)

### Current State
- Next Actions show industry-specific suggestions (Send Promo, Follow Up Leads, etc.)
- All buttons show "Coming Soon" toast on click
- Actions defined in `/src/config/vertical-packs.ts`

### Goal
Transform stub buttons into functional workflows that either:
1. Open a focused action modal/drawer
2. Navigate to the relevant tool
3. Trigger an automated workflow

### Implementation Plan

#### Phase A: Action Router Architecture (Declarative)

Use discriminated union types so handlers carry their own destination/config. This eliminates `if(actionId===...)` sprawl and scales cleanly across vertical packs:

```typescript
// src/lib/run/action-handlers.ts
// Base fields shared by all handlers
type ActionBase = {
  id: string
  requires?: ActionRequirement[]  // Conditions that must be met
  disabledReasonKey?: string      // i18n key explaining why unavailable
}

// Requirements that can disable an action
export type ActionRequirement =
  | { type: 'hasEvents'; minCount?: number }           // Has tracking data
  | { type: 'hasIntegration'; integration: string }    // e.g., 'payments', 'email'
  | { type: 'hasRecipients'; source: string }          // Has leads/customers to target
  | { type: 'hasPermission'; role: 'owner' | 'admin' } // Role-based access

export type ActionHandler =
  | ActionBase & { type: 'navigate'; to: string; query?: Record<string, string> }
  | ActionBase & { type: 'modal'; modal: 'send_promo' | 'post_update' }
  | ActionBase & { type: 'workflow'; endpoint: string; confirmRequired?: boolean }
  | ActionBase & { type: 'external'; href: string }

export const ACTION_HANDLERS: Record<string, ActionHandler> = {
  follow_up_leads: {
    id: 'follow_up_leads',
    type: 'navigate',
    to: 'run',
    query: { tab: 'leads', filter: 'recent' },
    requires: [{ type: 'hasRecipients', source: 'leads_7d' }],
    disabledReasonKey: 'actions.disabled.noLeads',
  },
  follow_up_orders: {
    id: 'follow_up_orders',
    type: 'navigate',
    to: 'run',
    query: { tab: 'transactions', filter: 'pending' },
  },
  confirm_bookings: {
    id: 'confirm_bookings',
    type: 'navigate',
    to: 'run',
    query: { tab: 'leads', filter: 'booking_requested' },
  },
  ship_update: {
    id: 'ship_update',
    type: 'navigate',
    to: 'builder',
    query: { focus: 'deploy' },
  },
  send_promo: {
    id: 'send_promo',
    type: 'modal',
    modal: 'send_promo',
    requires: [
      { type: 'hasIntegration', integration: 'email' },
      { type: 'hasRecipients', source: 'customers_30d' },
    ],
    disabledReasonKey: 'actions.disabled.noRecipients',
  },
  post_update: {
    id: 'post_update',
    type: 'modal',
    modal: 'post_update',
  },
  recover_abandoned: {
    id: 'recover_abandoned',
    type: 'workflow',
    endpoint: '/v1/inhouse/projects/:projectId/run/actions/recover-abandoned',
    confirmRequired: true,  // Shows confirmation before executing
    requires: [
      { type: 'hasIntegration', integration: 'payments' },
      { type: 'hasEvents', minCount: 1 },
    ],
    disabledReasonKey: 'actions.disabled.noAbandonedCarts',
  },
}

// Check if action is available
// Always returns reasonKey + reasonParams for consistent i18n across 9 locales
export function getActionAvailability(
  handler: ActionHandler,
  context: ActionContext
): { available: boolean; reasonKey?: string; reasonParams?: Record<string, unknown> } {
  if (!handler.requires) return { available: true }

  for (const req of handler.requires) {
    switch (req.type) {
      case 'hasEvents':
        if (context.eventCount < (req.minCount ?? 1)) {
          return {
            available: false,
            reasonKey: handler.disabledReasonKey ?? 'actions.disabled.noEvents',
            reasonParams: { minCount: req.minCount ?? 1 },
          }
        }
        break
      case 'hasIntegration':
        if (!context.integrations.includes(req.integration)) {
          return {
            available: false,
            reasonKey: 'actions.disabled.needsIntegration',
            reasonParams: { integration: req.integration },
          }
        }
        break
      case 'hasRecipients':
        if (context.recipientCounts[req.source] === 0) {
          return {
            available: false,
            reasonKey: handler.disabledReasonKey ?? 'actions.disabled.noRecipients',
            reasonParams: { source: req.source },
          }
        }
        break
      case 'hasPermission':
        if (!context.userRoles.includes(req.role)) {
          return {
            available: false,
            reasonKey: 'actions.disabled.insufficientPermissions',
            reasonParams: { requiredRole: req.role },
          }
        }
        break
    }
  }
  return { available: true }
}
```

#### Phase B: Unified Action Handler

The click handler becomes simple and boring (boring = good):

```typescript
// src/lib/run/action-executor.ts
import { routing } from '@/i18n/routing'
import { track } from '@/lib/analytics'

export function handleRunAction(
  actionId: string,
  projectId: string,
  openModal: (modal: string) => void
) {
  const handler = ACTION_HANDLERS[actionId]
  if (!handler) {
    toast.error(t('run.actions.unknown'))
    return
  }

  track('run_action_clicked', { projectId, actionId, type: handler.type })

  switch (handler.type) {
    case 'navigate':
      return routing.push({
        pathname: `/project/${projectId}/${handler.to}`,
        query: handler.query,
      })
    case 'modal':
      return openModal(handler.modal)
    case 'workflow':
      return triggerWorkflow(handler.endpoint, projectId)
    case 'external':
      return window.open(handler.href, '_blank', 'noopener,noreferrer')
  }
}
```

**Why this matters:** Actions can later be A/B tested, feature-flagged, or permission-gated without touching UI logic.

#### Phase C: Modal Actions (Send Promo, Post Update)
Create lightweight action modals that integrate with existing services:

**Send Promo Modal:**
- Uses existing `InhouseEmailService` for delivery
- Pre-populated templates by industry
- Recipient list from recent leads/customers

**Files to create:**
- `src/components/run/actions/send-promo-modal.tsx`
- `src/components/run/actions/post-update-modal.tsx`

#### Phase D: Workflow Actions (Recover Abandoned)
Trigger background jobs for automated sequences.

**Workflow Runs as First-Class Objects:**

Users need to know: did it run? how many affected? failures? Treat workflows as "jobs" with visible status:

```typescript
// Worker: workflow_runs table
interface WorkflowRun {
  id: string
  project_id: string
  action_id: string              // 'recover_abandoned', 'send_promo', etc.
  status: 'queued' | 'running' | 'succeeded' | 'failed'

  // Timing
  requested_at: string           // When user clicked (client timestamp)
  started_at?: string            // When worker began processing
  completed_at?: string          // When worker finished

  // Idempotency (for safe retries + double-click dedup)
  idempotency_key: string        // UUID from client, persisted for debugging

  result?: {
    total_recipients: number
    successful: number
    failed: number
    error_summary?: string       // "2 emails bounced"
  }
  triggered_by: string           // user_id
}
```

**Why `idempotency_key` + `requested_at`:**
- Retries are safe (same key = same run)
- Double-clicks map to existing run instead of creating duplicates
- Support can debug "why did this send twice?" by checking keys

**Workflow Executor with Confirmation + Status:**

```typescript
// src/lib/run/workflow-executor.ts
async function triggerWorkflow(
  handler: ActionHandler & { type: 'workflow' },
  projectId: string,
  options: { skipConfirm?: boolean } = {}
) {
  // 1. Confirmation step for dangerous actions
  if (handler.confirmRequired && !options.skipConfirm) {
    const preview = await fetchWorkflowPreview(handler.endpoint, projectId)
    const confirmed = await showConfirmDialog({
      title: t('workflows.confirmTitle'),
      message: t('workflows.confirmMessage', { count: preview.recipientCount }),
      // "You're about to email 42 people"
    })
    if (!confirmed) return
  }

  // 2. Create workflow run (returns run ID for tracking)
  const endpoint = handler.endpoint.replace(':projectId', projectId)
  const idempotencyKey = crypto.randomUUID()

  track('run_workflow_started', { projectId, actionId: handler.id })

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
    })

    if (!res.ok) {
      track('run_workflow_failed', { projectId, actionId: handler.id })
      toast.error(t('workflows.failed'))
      return
    }

    const { runId } = await res.json()
    track('run_workflow_queued', { projectId, actionId: handler.id, runId })

    // Show toast with link to see status
    toast.success(t('workflows.started'), {
      action: { label: t('workflows.viewStatus'), onClick: () => openWorkflowRun(runId) }
    })
  } catch (err) {
    track('run_workflow_error', { projectId, actionId: handler.id })
    toast.error(t('workflows.failed'))
  }
}
```

**Last Run Status in UI:**

Show the most recent workflow result directly in the action card:

```tsx
// In action button area
{lastRun && (
  <span className="text-xs text-muted-foreground">
    {lastRun.status === 'succeeded'
      ? t('workflows.lastRun', { count: lastRun.result.successful, time: formatDistanceToNow(lastRun.completed_at) })
      // "Sent to 18 recipients 2h ago"
      : t('workflows.lastRunFailed', { time: formatDistanceToNow(lastRun.completed_at) })}
  </span>
)}
```

**Recover Abandoned Carts:**
1. Query `business_events` for `checkout_started` without `payment_succeeded` (24h)
2. Send recovery email via `InhouseEmailService`
3. Track as `recovery_email_sent` event with `workflow_run_id` for attribution

**Worker endpoint:** `POST /v1/inhouse/projects/:projectId/run/actions/recover-abandoned`

#### Phase E: External Integrations (Future)
- Mailchimp integration for marketing campaigns
- Slack notifications for alerts
- Calendar integrations for bookings

### Effort Estimate
- Phase A: 1 day (architecture)
- Phase B: 1 day (navigate actions)
- Phase C: 3-4 days (modal actions)
- Phase D: 2-3 days (workflow actions)
- Phase E: Future scope

---

## Priority 2: Extended Date Ranges (Medium)

### Current State
- Date picker supports Today/Yesterday presets + custom date
- API already supports any date via `?date=YYYY-MM-DD`
- KPIs are per-day only

### Goal
Support week/month views with aggregated KPIs and trend indicators.

### Period Semantics (Critical)

Define these rules explicitly or metrics will confuse users:

| Rule | Implementation |
|------|----------------|
| "Today" | Project timezone, not server UTC |
| "Yesterday" | Project timezone, midnight to midnight |
| Period comparisons | Equal-length periods (7 vs previous 7) |
| Single-day comparison | Same weekday when possible (Sunday vs previous Sunday) |
| Display label | Always show "vs previous X days" explicitly |

**Timezone handling:**
- Store project timezone in `projects.config.timezone` (default to UTC)
- Worker calculates date boundaries using project timezone
- All KPI aggregations use project-local dates

### Metrics Dictionary (Single Source of Truth)

Define these once to prevent "two engineers, three definitions" syndrome:

| Metric | Definition | Events Used |
|--------|------------|-------------|
| **Revenue** | Gross captured payments, excluding refunds | `payment_succeeded` amount sum |
| **Refunds** | Total refunded amount | `payment_refunded` amount sum |
| **Net Revenue** | Revenue minus refunds | Calculated |
| **Orders** | Count of successful payments | `payment_succeeded` count |
| **Leads** | Contact form submissions + booking requests | `lead_captured`, `booking_requested` |
| **Signups** | Account registrations | `user_signed_up` |
| **Subscribers** | Newsletter/mailing list opt-ins | `newsletter_subscribed` |
| **Bookings** | Confirmed appointments (not just requested) | `booking_confirmed` |
| **Conversion Rate** | Orders ÷ Unique sessions with checkout_started | Requires session tracking |
| **Trials** | SaaS trial starts | `trial_started` |

**Important distinctions:**
- `booking_requested` ≠ `booking_confirmed` (request vs confirmed)
- `checkout_started` ≠ `payment_succeeded` (intent vs completion)
- Revenue is **captured** (charged), not authorized

### Implementation Plan

#### API Changes
```typescript
// GET /api/projects/[id]/run/overview
// New params: ?range=week|month|custom&start=YYYY-MM-DD&end=YYYY-MM-DD

// Worker: businessKpiService.getKpisForRange()
// Aggregates from business_kpi_daily table
// Uses project timezone for date boundaries
```

#### UI Changes
**Date Range Picker Component:**
```typescript
// src/components/run/date-range-picker.tsx
type DateRange = 'today' | 'yesterday' | 'last7' | 'last30' | 'custom'

// Presets: Today, Yesterday, Last 7 Days, Last 30 Days, Custom Range
```

**KPI Card Updates:**
- Show aggregated totals for range
- Add sparkline trend indicator (optional)

### Effort Estimate
- API changes: 1 day
- UI changes: 2 days

---

## Priority 3: KPI Comparisons (Medium)

### Current State
- KPIs show current period only
- No comparison to previous period

### Goal
Show delta indicators (↑12% vs last period) on KPI cards.

### Research Insights
Per [Klipfolio](https://www.klipfolio.com/resources/dashboard-examples/saas) and [UserPilot](https://userpilot.com/blog/saas-kpi-dashboard/), period comparisons are essential for actionable dashboards:
- Always compare same day-of-week or same period length
- Show both absolute and percentage change
- Color-code: green for positive, red for negative (context-aware: refunds ↓ is good)

### Implementation Plan

#### API Changes
```typescript
// Response shape addition:
{
  kpis: {
    revenue: { current: 1500, previous: 1200, change: 25, changePercent: 25 },
    leads: { current: 12, previous: 8, change: 4, changePercent: 50 },
    // ...
  },
  comparisonPeriod: 'yesterday' | 'last_week' | 'last_month'
}
```

#### Worker Changes
```typescript
// businessKpiService.ts
async getKpisWithComparison(projectId: string, date: string, compare: 'previous_period') {
  const current = await this.getKpis(projectId, date)
  const previous = await this.getKpis(projectId, getPreviousDate(date))

  return {
    ...current,
    comparison: calculateDeltas(current, previous)
  }
}
```

#### UI Changes
**KPI Card with Delta:**
```tsx
<KpiCard
  label="Revenue"
  value="$1,500"
  delta={{ value: 25, percent: 25, direction: 'up' }}
  deltaLabel="vs yesterday"
/>
```

**Visual Treatment:**
- ↑ with green text for positive changes
- ↓ with red text for negative changes
- Context-aware: refunds ↓ shows green (good)
- Neutral gray for no change

### Effort Estimate
- API/Worker: 1-2 days
- UI: 1-2 days

---

## Priority 4: Chart Visualizations (Medium)

### Current State
- KPIs are numeric cards only
- No trend visualization

### Goal
Add simple sparkline charts or mini line graphs showing 7-day trends.

### Research Insights
Per [Smashing Magazine](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/), real-time dashboards should minimize cognitive load:
- Sparklines over full charts for overview
- Reserve detailed charts for drill-down views
- Keep visualizations glanceable (3-5 second comprehension)

### Implementation Plan

#### Library Choice

**Option A: Custom SVG Sparkline (Recommended)**
If Recharts isn't already in the bundle, a custom SVG sparkline is ~30 lines and avoids shipping a charting library for 60×20px squiggles:

```typescript
// src/components/run/sparkline.tsx
interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

export function Sparkline({ data, width = 60, height = 20, color = 'currentColor' }: SparklineProps) {
  if (!data.length) return null

  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - ((v - min) / range) * height
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} className="inline-block">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
```

**Option B: Recharts**
Use if already in bundle or need more complex charts later.

#### API Changes
```typescript
// New endpoint or extend overview
// GET /api/projects/[id]/run/overview?includeTrend=true

// Response addition:
{
  trends: {
    revenue: [1200, 1100, 1400, 1300, 1500, 1450, 1500], // last 7 days
    leads: [8, 10, 7, 12, 9, 11, 12]
  }
}
```

#### UI Changes
**Sparkline KPI Card:**
```tsx
<KpiCard
  label="Revenue"
  value="$1,500"
  trend={[1200, 1100, 1400, 1300, 1500, 1450, 1500]}
  trendDirection="up"
/>
```

**Implementation Notes:**
- Sparklines should be ~60px wide, ~20px tall
- Single color (brand primary for up, muted for flat/down)
- No axis labels (just the shape)

### Effort Estimate
- API: 1 day
- UI with library: 2 days

---

## Priority 5: Load More Pagination (Medium)

### Current State
- Leads/Orders use offset-based pagination
- Shows "Page X of Y" with prev/next buttons
- 20 items per page

### Goal
Replace with "Load More" button for smoother UX while keeping sense of place.

### Research Insights
Per [HackerNoon](https://hackernoon.com/infinite-scrolling-vs-pagination-making-the-right-choice-for-react-apps) and [Medium](https://ashishmisal.medium.com/pagination-vs-infinite-scroll-vs-load-more-data-loading-ux-patterns-in-react-53534e23244d):
- **Load More** is best for lists where users want control but don't need page numbers
- Use **Intersection Observer** for performance (avoid scroll listeners)
- **React Query's `useInfiniteQuery`** handles state elegantly

**Key UX consideration:** Pagination gives orientation that infinite scroll removes. Hybrid approach:
- Load More button (smooth loading)
- "Showing 1–40 of 156" indicator (sense of place)
- **"Jump to date" filter** for long histories (infinite lists without anchors are where users lose their souls)

**Jump to Date Implementation:**
```tsx
// Quick date filter above the list
<div className="flex items-center gap-2 mb-4">
  <span className="text-sm text-muted-foreground">{t('leads.jumpTo')}:</span>
  <Button variant="ghost" size="sm" onClick={() => jumpToDate('today')}>Today</Button>
  <Button variant="ghost" size="sm" onClick={() => jumpToDate('yesterday')}>Yesterday</Button>
  <Button variant="ghost" size="sm" onClick={() => jumpToDate('last7')}>Last 7 days</Button>
  <DatePicker onChange={(date) => jumpToDate(date)} />
</div>
```

### Implementation Plan

#### API Changes
Change from offset to cursor-based pagination:
```typescript
// Current: ?offset=20&limit=20
// New: ?cursor=evt_abc123&limit=20

// Response:
{
  events: [...],
  nextCursor: 'evt_xyz789' | null,
  hasMore: true
}
```

#### UI Changes
**Load More Pattern:**
```tsx
// src/components/run/run-leads-content.tsx
const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
  queryKey: ['leads', projectId, filter],
  queryFn: ({ pageParam }) => fetchLeads({ cursor: pageParam }),
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})

// Render
<div className="flex items-center justify-between">
  <span className="text-sm text-muted-foreground">
    {t('leads.showing', { start: 1, end: allEvents.length, total: totalCount })}
  </span>
  {hasNextPage && (
    <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
      {isFetchingNextPage ? <Spinner /> : t('leads.loadMore')}
    </Button>
  )}
</div>
```

**Intersection Observer (Optional Enhancement):**
```tsx
const loadMoreRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting && hasNextPage) {
        fetchNextPage()
      }
    },
    { threshold: 0.1 }
  )
  if (loadMoreRef.current) observer.observe(loadMoreRef.current)
  return () => observer.disconnect()
}, [hasNextPage, fetchNextPage])

// At bottom of list
<div ref={loadMoreRef} />
```

### Translations
```json
{
  "leads": {
    "loadMore": "Load more",
    "loadingMore": "Loading...",
    "showing": "Showing {start}–{end} of {total}"
  },
  "orders": {
    "loadMore": "Load more",
    "loadingMore": "Loading...",
    "showing": "Showing {start}–{end} of {total}"
  }
}
```

### Effort Estimate
- API cursor support: 1 day
- UI refactor: 2 days

---

## Priority 6: Build State on Project Cards (Medium)

### Current State
- Project cards show "Live" badge for deployed projects
- Building/failed states not visible on dashboard

### Goal
Show build progress/status indicators on project cards in dashboard grid.

### Implementation Plan

#### Data Available
Project already has `build_status` field with values:
- `idle`, `queued`, `building`, `deployed`, `failed`

#### UI Changes
**Status Indicators:**
```tsx
// src/components/dashboard/project-grid.tsx

const BuildStatusIndicator = ({ status }: { status: string }) => {
  switch (status) {
    case 'building':
    case 'queued':
      return (
        <div className="flex items-center gap-1 text-amber-600">
          <Icon name="loader-2" className="w-3 h-3 animate-spin" />
          <span className="text-xs">Building...</span>
        </div>
      )
    case 'failed':
      return (
        <div className="flex items-center gap-1 text-red-600">
          <Icon name="alert-circle" className="w-3 h-3" />
          <span className="text-xs">Failed</span>
        </div>
      )
    case 'deployed':
      return (
        <div className="flex items-center gap-1 text-emerald-600">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs">Live</span>
        </div>
      )
    default:
      return null
  }
}
```

**Placement:**
- Grid view: Below project name, above "Modified X ago"
- List view: Between project name and badges

### Effort Estimate
- UI only: 0.5-1 day

---

## Priority 7: Data Freshness Indicator (Medium-High)

### Current State
- Overview shows "Last updated: X ago" from manual refresh
- No indication if event tracking is broken
- Users may blame Run Hub when their tracking stopped working

### Goal
Show clear data freshness status and warn when events stop flowing.

### Implementation Plan

**Freshness Indicator Component:**
```tsx
// src/components/run/data-freshness-indicator.tsx
interface FreshnessProps {
  lastEventAt: string | null  // ISO timestamp of most recent event
  lastUpdated: string         // When we last fetched data
}

export function DataFreshnessIndicator({ lastEventAt, lastUpdated }: FreshnessProps) {
  const hoursSinceLastEvent = lastEventAt
    ? differenceInHours(new Date(), new Date(lastEventAt))
    : null

  const isStale = hoursSinceLastEvent !== null && hoursSinceLastEvent > 24

  return (
    <div className="flex items-center gap-2 text-sm">
      {isStale ? (
        <div className="flex items-center gap-1 text-amber-600">
          <Icon name="alert-triangle" className="w-4 h-4" />
          <span>{t('overview.staleData', { hours: hoursSinceLastEvent })}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span>{t('overview.lastUpdated', { time: formatDistanceToNow(new Date(lastUpdated)) })}</span>
        </div>
      )}
    </div>
  )
}
```

**API Addition:**
```typescript
// Response includes:
{
  lastEventAt: '2026-01-27T14:30:00Z' | null,  // Most recent event timestamp
  // ... existing fields
}
```

**Translations:**
```json
{
  "overview": {
    "lastUpdated": "Updated {time} ago",
    "staleData": "No events in {hours}h — check your tracking"
  }
}
```

### Effort Estimate
- API: 0.5 day (add lastEventAt to response)
- UI: 0.5 day

---

## Priority 8: Basic Rule-Based Alerts (Medium-High)

### Current State
- "Needs Attention" section exists but only shows hardcoded alerts
- No automated anomaly detection
- Users must manually notice problems

### Goal
Surface simple rule-based alerts that highlight significant changes.

### Design Principle
Not AI/ML forecasting — just practical rules that catch 80% of important anomalies.

**Key insight:** Every alert should have a default action attached. Alerts without actions become noise.

| Alert Type | Rule | Priority | Default Action |
|------------|------|----------|----------------|
| Lead drop | Leads ↓ >50% vs previous 7 days | High | "Check traffic sources" / "Send promo" |
| Revenue drop | Revenue ↓ >40% vs previous 7 days | High | "Review recent orders" |
| Checkout issues | checkout_started ↑ but payment_succeeded flat | High | "Check payments health" |
| Payment failures | payment_failed events > 3 in 24h | High | "View failed payments" |
| Conversion drop | Conversion rate ↓ >30% vs previous 7 days | Medium | "Review checkout funnel" |
| Stale tracking | No events in >24h | High | "Check tracking setup" |

### Implementation Plan

**Alert Rules Engine:**
```typescript
// src/lib/run/alert-rules.ts
export interface AlertRule {
  id: string
  check: (kpis: KpiData, previousKpis: KpiData, events: EventData[]) => AlertResult | null
  severity: 'high' | 'medium' | 'low'
  actionId?: string  // Links to an action handler
  actionLabel?: string  // CTA text if no actionId
}

export interface AlertResult {
  type: string
  message: string
  severity: 'high' | 'medium' | 'low'
  action?: {
    id?: string           // Action handler ID (e.g., 'follow_up_leads')
    label: string         // CTA button text
    navigateTo?: string   // Direct navigation if no handler
  }
}

export const ALERT_RULES: AlertRule[] = [
  {
    id: 'lead_drop',
    severity: 'high',
    check: (current, previous) => {
      if (!previous.leads || previous.leads === 0) return null
      const drop = ((previous.leads - current.leads) / previous.leads) * 100
      if (drop > 50) {
        return {
          type: 'lead_drop',
          message: t('alerts.leadDrop', { percent: Math.round(drop) }),
          severity: 'high',
          action: {
            id: 'send_promo',
            label: t('alerts.actions.sendPromo'),
          },
        }
      }
      return null
    },
  },
  {
    id: 'checkout_issues',
    severity: 'high',
    check: (current, previous, events) => {
      const checkouts = events.filter(e => e.type === 'checkout_started').length
      const payments = events.filter(e => e.type === 'payment_succeeded').length
      if (checkouts > 5 && payments < checkouts * 0.3) {
        return {
          type: 'checkout_issues',
          message: t('alerts.checkoutIssues'),
          severity: 'high',
          action: {
            label: t('alerts.actions.checkPayments'),
            navigateTo: 'builder?infra=payments',
          },
        }
      }
      return null
    },
  },
  {
    id: 'payment_failures',
    severity: 'high',
    check: (current, previous, events) => {
      const failures = events.filter(e => e.type === 'payment_failed').length
      if (failures >= 3) {
        return {
          type: 'payment_failures',
          message: t('alerts.paymentFailures', { count: failures }),
          severity: 'high',
          action: {
            label: t('alerts.actions.viewFailedPayments'),
            navigateTo: 'run?tab=transactions&filter=failed',
          },
        }
      }
      return null
    },
  },
  // ... more rules
]
```

**Worker Changes:**
```typescript
// businessKpiService.ts
async getAlertsForProject(projectId: string): Promise<Alert[]> {
  const current = await this.getKpis(projectId, today())
  const previous = await this.getKpisForRange(projectId, daysAgo(7), daysAgo(1))
  const recentEvents = await this.eventsService.getEvents(projectId, { limit: 100 })

  return ALERT_RULES
    .map(rule => rule.check(current, previous, recentEvents))
    .filter(Boolean)
}
```

**Translations:**
```json
{
  "alerts": {
    "leadDrop": "Leads dropped {percent}% vs last 7 days",
    "revenueDrop": "Revenue dropped {percent}% vs last 7 days",
    "checkoutIssues": "Checkouts up but payments flat — possible payment issue",
    "paymentFailures": "{count} payment failures in the last 24 hours",
    "conversionDrop": "Conversion rate dropped {percent}% vs last 7 days",
    "actions": {
      "sendPromo": "Send promo",
      "checkPayments": "Check payments",
      "viewFailedPayments": "View failed payments",
      "checkTracking": "Check tracking"
    }
  },
  "actions": {
    "disabled": {
      "noLeads": "No leads yet — they'll appear here once visitors sign up",
      "noRecipients": "No customer emails in the last 30 days",
      "noAbandonedCarts": "No abandoned carts to recover",
      "noEvents": "No tracking data yet — publish your site to start collecting",
      "needsIntegration": "Connect {integration} to enable this",
      "insufficientPermissions": "Only {requiredRole}s can do this"
    }
  },
  "workflows": {
    "confirmTitle": "Confirm action",
    "confirmMessage": "You're about to email {count} people",
    "started": "Action started",
    "viewStatus": "View status",
    "failed": "Action failed",
    "lastRun": "Sent to {count} recipients {time} ago",
    "lastRunFailed": "Failed {time} ago",
    "impact": "Recovered {recovered} from {count} checkout(s)"
  }
}
```

### Effort Estimate
- Worker rules engine: 1-2 days
- API + UI: 1 day

---

## Lower Priority Features

### Custom KPI Configuration (Low)
Allow users to choose which KPI cards appear on their dashboard.

**Storage:** `projects.config.run_settings.kpi_cards: string[]`

**UI:** Settings modal with checkbox list of available KPIs per industry.

### Goal Setting & Tracking (Low)
Set targets for KPIs and track progress.

**Schema addition:**
```sql
-- projects.config.run_settings.goals
{
  "revenue_daily": 1000,
  "leads_daily": 10,
  "conversion_percent": 5
}
```

**UI:** Goal input fields + progress bar on KPI cards.

### Multi-Project Comparison (Low)
Portfolio view comparing KPIs across projects.

**New page:** `/dashboard/portfolio`
**Shows:** Table/grid of all projects with key KPIs side by side.

### Revenue Forecasting (Low)
AI-powered predictions based on historical trends.

**Approach:** Use 30-day moving average + seasonality detection.
**Display:** "Projected revenue this month: $X" card.

*Note: Basic Rule-Based Alerts (Priority 8) is more practical and valuable than ML forecasting.*

---

## Strategic Enhancements (Future Direction)

These are the bigger-picture features that transform Run Hub from "nice dashboard" into "this product runs my business with me."

### Actions → Outcomes Loop (The Differentiator)

**The gap:** Users can take actions (send promo, recover carts, follow up leads) but never see if those actions worked.

**The goal:** After a user takes an action, Run Hub later reports:
- "That promo generated +$340 in revenue from 3 orders"
- "Cart recovery emails converted 2 of 8 abandoned checkouts"
- "Following up leads resulted in 4 bookings"

**MVP Definition (Recover Abandoned):**

Define the minimum version now so earlier work keeps event schemas consistent:

| Aspect | Definition |
|--------|------------|
| **Action** | Recover Abandoned Carts workflow |
| **Impact metric** | Recovered revenue + recovered checkouts |
| **Attribution window** | 48 hours from email sent |
| **Matching logic** | `payment_succeeded` where `customer_email` matches `recovery_email_sent.recipient` within window |
| **Attribution model** | Last-touch within window (MVP) |

**Known edge cases (MVP accepts these limitations):**
- Shared emails (family accounts) → May over-attribute
- Multiple promos in 48h window → Credits last action only
- Order without email match (guest checkout) → Not attributed

*MVP uses last-touch within window; we'll refine to multi-touch or fractional attribution later if needed.*

**Event schema requirements:**
```typescript
// When recovery email sent
{
  type: 'recovery_email_sent',
  workflow_run_id: 'run_abc123',
  recipient_email: 'customer@example.com',
  abandoned_cart_id: 'cart_xyz',
  abandoned_amount: 8500,  // cents
}

// When payment succeeds, include attribution fields
{
  type: 'payment_succeeded',
  customer_email: 'customer@example.com',
  amount: 8500,
  // Attribution (set by worker if within window)
  attributed_to_workflow?: 'run_abc123',
  attributed_action?: 'recover_abandoned',
}
```

**Display:**
```tsx
// In workflow run details or action card
{impact && (
  <div className="text-sm text-emerald-600">
    {t('workflows.impact', {
      recovered: formatCurrency(impact.recoveredRevenue),
      count: impact.recoveredCheckouts,
    })}
    {/* "Recovered $85.00 from 1 checkout" */}
  </div>
)}
```

**Why this matters:** This creates a learning system — users discover what works for *their* business, not generic advice.

### Proactive Digests & Alerts

**The gap:** Dashboards are passive — users must remember to check them.

**The goal:** Run Hub comes to the user via daily digest.

**MVP: Email Daily Summary (Start Simple)**

Don't boil the ocean. Start with one channel, manual opt-in:

1. **Opt-in per project** in notification settings: "Email me a daily summary"
2. **Daily email** at configurable time (project timezone)
3. **Content:**
   - Summary: "Yesterday: $1,200 revenue, 8 leads, 12% conversion"
   - Anomalies: "1 alert: Leads dropped 40% vs last week"
   - Suggested actions: "2 leads awaiting follow-up"
4. **Template by industry** (different KPIs highlighted for ecommerce vs services)

**Implementation approach:**
1. Add `daily_digest_enabled` + `daily_digest_time` to notification settings
2. Scheduled worker job runs at configured time per project
3. Uses existing `InhouseEmailService` for delivery
4. Reuses alert rules engine for anomaly detection

**Future expansion:**
- WhatsApp channel (after email habit is proven)
- Weekly summary option
- Team digest (multiple recipients)

**Why this matters:** Makes Run Hub "felt daily" without requiring login. Builds habit and trust.

### Future Strategic Directions (Not Detailed)

These are valuable but lower priority than closing the loop and proactive outreach.

**Foundation requirements** (see Event Schema Requirements in Technical Considerations):
- Funnel detection requires `session_id` on all events
- Segmentation requires `customer_id` + `source`/`utm_*` fields

| Feature | Foundation Needed | Can Defer Implementation? |
|---------|-------------------|---------------------------|
| **Funnel/Bottleneck Detection** | `session_id` ✓ | Yes |
| **Segmentation** | `customer_id`, `source` ✓ | Yes |
| **Industry Playbooks** | None (UI layer) | Yes |
| **Team Collaboration** | None (data layer) | Yes |
| **Integration Strategy** | None (new channels) | Yes |

- **Funnel/Bottleneck Detection:** Where the conversion flow leaks (visit → view → cart → checkout → pay)
- **Segmentation:** New vs returning, organic vs paid (makes insights actionable)
- **Industry Playbooks:** "Salon weekly playbook" with rhythm: daily checks, weekly actions, monthly goals
- **Team Collaboration:** Assign actions to team members, notes on leads/orders
- **Integration Strategy:** WhatsApp (outreach), Payments (failure detection), Calendar (no-shows)

---

## Technical Considerations

### Event Schema Requirements (Foundation for Future Features)

All business events should include these fields from day one to enable future strategic features:

```typescript
// src/types/business-events.ts
interface BusinessEventBase {
  // Core identification
  id: string                  // Event ID
  project_id: string
  type: string                // 'payment_succeeded', 'lead_captured', etc.
  occurred_at: string         // ISO timestamp

  // Session tracking (enables funnel analysis)
  session_id?: string         // Required for client-side events, optional for server-side

  // Customer identification (enables new vs returning segmentation)
  customer_id?: string        // Set when user is identified
  customer_email?: string     // For matching across sessions

  // Traffic source (enables organic vs paid segmentation)
  source?: 'organic' | 'paid' | 'direct' | 'referral' | 'email'
  utm_source?: string         // e.g., 'google', 'facebook'
  utm_medium?: string         // e.g., 'cpc', 'social'
  utm_campaign?: string       // Campaign name

  // Action attribution (enables Actions → Outcomes loop)
  workflow_run_id?: string    // Set if triggered by a workflow
  attributed_action?: string  // e.g., 'recover_abandoned', 'send_promo'
}
```

**`session_id` requirement by event origin:**
| Origin | session_id | Examples |
|--------|------------|----------|
| Client-side tracking | **Required** | `page_view`, `checkout_started`, `add_to_cart` |
| Server-side webhooks | Optional | `payment_succeeded`, `payment_refunded` |
| Admin actions | N/A | Manual refunds, offline payments |

*Dev warning: Log warning if `session_id` missing on client-side event types.*

**Why these fields matter:**
- `session_id` → Funnel/bottleneck detection (visit → view → cart → checkout → pay)
- `customer_id` → New vs returning segmentation
- `source`/`utm_*` → Organic vs paid segmentation, campaign ROI
- `workflow_run_id` → "That promo generated +$340" attribution

**Implementation note:** Client-side fields captured by tracking script; server-side events enriched by worker where possible (e.g., linking `payment_succeeded` to existing session via `customer_email`).

### Codebase Patterns to Follow
- Use `@/i18n/routing` for navigation (not `next/navigation`)
- Add translations to all 9 locales simultaneously
- Use shared type guards (like `isIndustryTag()`) for validation
- Error states must have retry buttons
- Loading states should not cause layout shift
- Null-check all timestamps with fallback

### Files Commonly Modified
- `src/components/run/run-overview-content.tsx` - Main overview
- `src/components/run/run-leads-content.tsx` - Leads list
- `src/components/run/run-orders-content.tsx` - Orders list
- `src/config/vertical-packs.ts` - Industry configurations
- `src/messages/*/run.json` - Translations (9 locales)
- `src/app/api/projects/[id]/run/overview/route.ts` - API proxy
- Worker: `businessKpiService.ts`, `businessEventsService.ts`

### Testing Checklist
- [ ] TypeScript compiles (`npx tsc --noEmit`)
- [ ] All 9 locales have matching translation keys
- [ ] Mobile touch targets meet WCAG (44px minimum)
- [ ] Error states have retry affordance
- [ ] Loading states don't shift layout
- [ ] RTL layout works for Arabic locales

---

## Implementation Order Recommendation

**Phase 1: Quick Wins**
1. **Build State on Project Cards** - Quick win, high visibility
2. **Data Freshness Indicator** - Quick win, prevents user confusion
3. **Real Action Handlers - Navigate Type** - Quick win, improves flow

**Phase 2: Core Dashboard Value**
4. **Basic Rule-Based Alerts** - Immediate "decision assistant" value (works on today vs last 7 without full range UI)
5. **KPI Comparisons** - Core dashboard value
6. **Extended Date Ranges** - Builds on comparison logic

**Phase 3: UX Polish**
7. **Load More Pagination** - Better UX for data lists
8. **Chart Visualizations (Sparklines)** - Nice-to-have polish

**Phase 4: Decision Assistant**
9. **Real Action Handlers - Modal/Workflow** - With confirmation, status tracking, and results
10. **Actions → Outcomes Loop** - The differentiator (start with Recover Abandoned)
11. **Proactive Digests** - Start with email daily summary

**Key insight:** Phases 1-2 deliver "decision assistant" value fast. Phase 4 creates the moat.

**Critical early decisions that affect later phases:**
- Define Metrics Dictionary before KPI work (prevents inconsistency)
- Implement Event Schema Requirements (see Technical Considerations) — enables funnel analysis, segmentation, and attribution without backfilling
- Add `requires` to action handlers even for navigate actions (enables smart disabling)

---

## Sources

- [Klipfolio - SaaS Dashboard Examples](https://www.klipfolio.com/resources/dashboard-examples/saas)
- [UserPilot - SaaS KPI Dashboard](https://userpilot.com/blog/saas-kpi-dashboard/)
- [Smashing Magazine - UX Strategies for Real-Time Dashboards](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/)
- [HackerNoon - Infinite Scrolling vs Pagination in React](https://hackernoon.com/infinite-scrolling-vs-pagination-making-the-right-choice-for-react-apps)
- [Medium - Data Loading UX Patterns in React](https://ashishmisal.medium.com/pagination-vs-infinite-scroll-vs-load-more-data-loading-ux-patterns-in-react-53534e23244d)
- [UXPin - Dashboard Design Principles](https://www.uxpin.com/studio/blog/dashboard-design-principles/)
- [NetSuite - SaaS Dashboards Best Practices](https://www.netsuite.com/portal/resource/articles/erp/saas-dashboards.shtml)
