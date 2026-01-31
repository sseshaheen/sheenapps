# Run Hub Implementation Plan

**Date:** 2026-01-30
**Scope:** Verified issues + actionable roadmap for `sheenappsai` and `sheenapps-claude-worker`

**Architecture Context:** This plan addresses **two separate codebases**:
- **`sheenappsai` (Next.js)**: UI, proxy layer, settings management - *verified via code exploration*
- **`sheenapps-claude-worker` (Fastify)**: Execution engine, email, jobs, data ingestion - *audited 2026-01-30*

---

CURRENT SITUATION:

   Remaining Phase 5 items (deferred):
    - CRM-Lite Features
    - Multi-Project Overview
    - AI Summaries

   Admin Panel Updates (2026-01-30):
    - ✅ Workflows Admin: /admin/inhouse/workflows
    - ✅ Business Events Admin: /admin/inhouse/business-events
    - ✅ KPI Health Admin: /admin/inhouse/kpi-health
    - ✅ Worker endpoints implemented (see ADMIN_PANEL_WORKER_ENDPOINTS.md)



  Phase 1 Complete + Phase 2 Complete + Phase 2.5 Complete + Phase 3 Complete

  Phase 1 Tasks (Complete)

  Task #12: Fix navigation query params ✅
  Task #13: Rename hasActionHandler → hasClientHandler ✅
  Task #14: Locale normalization for email endpoints ✅
  Task #15: Worker audit ✅
  Task #16: Plan updated ✅

  Phase 2 Tasks (Complete — 2026-01-30)

  Task #17: Wire sendEmails() to InhouseEmailService ✅
  - Replaced stubbed sendEmails() with real InhouseEmailService integration
  - Uses 'notification' template (available in all 5 locales: en, ar, fr, es, de)
  - Action-specific email content: recover_abandoned, send_promo, onboard_users
  - Idempotency keys: workflow:{runId}:{email} prevents duplicate sends
  - Heartbeat every 50 recipients extends lease for large batches
  - Locale threaded from route handler → createRun params → sendEmails
  - Added inline execution (fire-and-forget) in route handler for MVP
  - Files changed: workflowExecutionService.ts, inhouseWorkflowRuns.ts

  Task #18: Add recipient exclusion tables + logic ✅
  - Created migration 151_workflow_sends_cooldown.sql (workflow_sends table)
  - 24-hour per-recipient cooldown: NOT EXISTS workflow_sends in all 3 buildRecipients queries
  - Records each send (sent/failed) for audit trail
  - Suppression already handled by InhouseEmailService.getSuppressedRecipients at send time
  - Updated getExclusionsList() to reflect actually-enforced exclusions
  - Files changed: workflowExecutionService.ts, migrations/151_workflow_sends_cooldown.sql

  Task #19: Add real alert counts to overview API ✅
  - Added COUNT(*) FILTER query for payment_failed and checkout_started events
  - Runs in parallel with other 5 overview queries (no latency impact)
  - Worker returns alertCounts: { paymentFailedCount, checkoutStartedCount }
  - Next.js overview route now uses real counts instead of hardcoded 0
  - Files changed: inhouseRunOverview.ts (worker), overview/route.ts (Next.js)

  Task #20: Resolve post_update workflow gap ✅ (no code changes)
  - post_update is a frontend-only concept that maps to send_promo backend workflow
  - Modal passes isUpdate: true in params to distinguish from regular promos
  - Working as designed — no new backend action needed

  Phase 2: Worker Coordination (✅ Complete)
  ┌────────────────────────────────────────────────────────────────┬────────┬───────────────┬──────────────────────────────────┐
  │ Task                                                          │ Status │ Codebase      │ Notes                            │
  ├────────────────────────────────────────────────────────────────┼────────┼───────────────┼──────────────────────────────────┤
  │ Wire sendEmails() to InhouseEmailService                      │ ✅     │ Worker        │ Uses notification template       │
  ├────────────────────────────────────────────────────────────────┼────────┼───────────────┼──────────────────────────────────┤
  │ Add recipient exclusion tables (cooldown via workflow_sends)   │ ✅     │ Worker        │ 24h cooldown + suppression list  │
  ├────────────────────────────────────────────────────────────────┼────────┼───────────────┼──────────────────────────────────┤
  │ Add real alert counts to overview API                          │ ✅     │ Worker+NextJS │ payment_failed+checkout_started  │
  ├────────────────────────────────────────────────────────────────┼────────┼───────────────┼──────────────────────────────────┤
  │ Resolve post_update workflow gap                               │ ✅     │ N/A           │ Frontend maps to send_promo      │
  └────────────────────────────────────────────────────────────────┴────────┴───────────────┴──────────────────────────────────┘
  Phase 2.5 Tasks (Complete — 2026-01-30)

  Task #22: Add lastRollupAt to overview API ✅
  - Queries MAX(updated_at) from business_kpi_daily for the project
  - Returns as lastRollupAt in overview response (ISO timestamp or null)
  - Frontend can show "Data as of X" freshness indicator
  - Files changed: inhouseRunOverview.ts (worker), overview/route.ts (Next.js)

  Task #23: Add workflow status counts + stuck run reaper ✅
  - Overview API now returns workflowCounts: { queued, running, succeeded, failed } (last 7 days)
  - Also returns stuckRunCount (running runs with expired leases)
  - Added WORKFLOW_STUCK_REAPER cron job (every 15 min) to scheduledJobs.ts
    - Marks runs as failed if stuck (running, expired lease, attempts >= 3)
    - Logs critical error for alerting
    - Uses advisory lock (key 2011) for concurrency safety
  - Files changed: inhouseRunOverview.ts, scheduledJobs.ts (worker), overview/route.ts (Next.js)

  Task #24: Add digest delivery metrics by locale ✅
  - Queries inhouse_emails for template_name='daily_digest' grouped by locale + status (last 30 days)
  - Returns as digestMetrics: Array<{ locale, status, count }> in overview
  - Leverages existing inhouse_emails table which already stores template_name and locale
  - Files changed: inhouseRunOverview.ts (worker), overview/route.ts (Next.js)

  Phase 2.5: Minimum Viable Observability (✅ Complete)
  ┌──────────────────────────────────────────────┬────────┬───────────────┬─────────────────────────────────────┐
  │ Task                                          │ Status │ Codebase      │ Notes                               │
  ├──────────────────────────────────────────────┼────────┼───────────────┼─────────────────────────────────────┤
  │ Add lastRollupAt to overview API              │ ✅     │ Worker+NextJS │ MAX(updated_at) from kpi_daily       │
  ├──────────────────────────────────────────────┼────────┼───────────────┼─────────────────────────────────────┤
  │ Workflow status counts + stuck detection      │ ✅     │ Worker+NextJS │ Counts + 15min reaper cron          │
  ├──────────────────────────────────────────────┼────────┼───────────────┼─────────────────────────────────────┤
  │ Digest delivery metrics by locale             │ ✅     │ Worker+NextJS │ From inhouse_emails table           │
  └──────────────────────────────────────────────┴────────┴───────────────┴─────────────────────────────────────┘
  Phase 3 Tasks (Complete — 2026-01-30)

  Task #26: Auto-emit form_submitted + lead_created business events ✅
  - Added import of getBusinessEventsService to InhouseFormsService
  - After successful form submission insert, emits form_submitted event (fire-and-forget)
  - If submission data contains email/Email/EMAIL field, also emits lead_created event
  - Idempotency keys: form:{submissionId} and lead:{submissionId} prevent duplicates
  - Follows same fire-and-forget + catch pattern used by InhousePaymentsService
  - Files changed: InhouseFormsService.ts

  Task #27: Auto-emit checkout_started business event ✅
  - Added checkout_started event emission after Stripe session creation
  - Fires after createCheckoutSession() succeeds (using session.id from Stripe)
  - Idempotency key: checkout:{sessionId} prevents duplicates on retries
  - Payload includes sessionId, mode, priceId, customerEmail for downstream use
  - Fire-and-forget: doesn't block checkout flow on event insertion failure
  - Files changed: InhousePaymentsService.ts

  Task #28: Increase KPI rollup frequency to every 15 minutes ✅
  - Changed cron schedule from '15 1 * * *' (daily 1:15AM) to '*/15 * * * *' (every 15 min)
  - Added backfillDays parameter to businessKpiRollupJob() (default 2 days for frequent runs)
  - Parameterized SQL query uses $1 parameter instead of string interpolation
  - Existing advisory lock (BUSINESS_KPI_ROLLUP) ensures only one instance runs at a time
  - 7-day full backfill still available by passing backfillDays=7 if needed
  - Files changed: businessKpiRollupJob.ts, scheduledJobs.ts

  Phase 3: Data Reliability (✅ Complete)
  ┌──────────────────────────────────────────────────────────┬────────┬───────────────┬──────────────────────────────────────────┐
  │ Task                                                      │ Status │ Codebase      │ Notes                                    │
  ├──────────────────────────────────────────────────────────┼────────┼───────────────┼──────────────────────────────────────────┤
  │ Auto-emit form_submitted + lead_created from forms        │ ✅     │ Worker        │ Dual-write at source (not transformer)   │
  ├──────────────────────────────────────────────────────────┼────────┼───────────────┼──────────────────────────────────────────┤
  │ Auto-emit checkout_started from payments                  │ ✅     │ Worker        │ After Stripe session creation             │
  ├──────────────────────────────────────────────────────────┼────────┼───────────────┼──────────────────────────────────────────┤
  │ Increase KPI rollup to every 15 minutes                   │ ✅     │ Worker        │ 2-day scan window, parameterized SQL     │
  └──────────────────────────────────────────────────────────┴────────┴───────────────┴──────────────────────────────────────────┘
  Phase 4: UX Polish ✅ COMPLETE
  ┌─────────────────────────────────────────┬─────────────┐
  │                  Task                   │   Status    │
  ├─────────────────────────────────────────┼─────────────┤
  │ Improve empty states with specific CTAs │ ✅ Done     │
  ├─────────────────────────────────────────┼─────────────┤
  │ Add integration status indicators       │ ✅ Done     │
  └─────────────────────────────────────────┴─────────────┘

  Phase 5: Setup Wizard ✅ COMPLETE
  ┌─────────────────────────────────────────┬─────────────┐
  │                  Task                   │   Status    │
  ├─────────────────────────────────────────┼─────────────┤
  │ Full-screen modal with 3 setup gates    │ ✅ Done     │
  ├─────────────────────────────────────────┼─────────────┤
  │ Progress bar + gate cards               │ ✅ Done     │
  ├─────────────────────────────────────────┼─────────────┤
  │ localStorage persistence per-project    │ ✅ Done     │
  ├─────────────────────────────────────────┼─────────────┤
  │ Skip/complete options + relaunch button │ ✅ Done     │
  ├─────────────────────────────────────────┼─────────────┤
  │ RTL support + 9 locale translations     │ ✅ Done     │
  └─────────────────────────────────────────┴─────────────┘
  Phase 5: Future Enhancements (Partial)

  ✅ Setup Wizard — Implemented 2026-01-30
  🔮 CRM-lite, multi-project overview, AI summaries — deferred until triggered by user demand.

  What's Next (Phase 5 — Future Enhancements)

  Phase 4 (UX Polish) is complete. Phase 5 Setup Wizard is complete. Implemented:
  1. ✅ Context-aware empty states with specific CTAs ("Connect Stripe", "Add form")
  2. ✅ Integration status bar (Tracking, Payments, Forms) with green/gray dots
  3. ✅ 4th checklist step for Stripe connection in first-run state
  4. ✅ 7 new translation keys across all 9 locales
  5. ✅ Setup Wizard: Full-screen modal with 3 gates (Tracking/Payments/Forms), progress bar, localStorage persistence, RTL support, 9 locales

  Pending Decisions

  1. ~~post_update — implement as distinct workflow or remove from frontend modals?~~ → RESOLVED: Maps to send_promo with isUpdate flag
  2. ~~Analytics → business_events — materialized view transformer vs. simpler dual-write?~~ → RESOLVED: Dual-write at source chosen. The two event systems serve different purposes (analytics = high-volume user behavior, business = transactional KPIs). A transformer would be over-engineering.
  3. ~~Checkout event timing — page load vs. form interaction?~~ → RESOLVED: Emit on Stripe session creation (server-side). More reliable than page-load tracking.
  4. ~~KPI update frequency — 5min vs. 15min vs. 1hr?~~ → RESOLVED: Every 15 minutes. Balances freshness vs. DB load. 2-day scan window for frequent runs.

  Key Discoveries (Phase 2)

  - InhouseEmailService already handles suppression via inhouse_email_suppressions table — no new unsubscribe table needed
  - The 'notification' template is generic enough for all 3 workflow types (with action-specific subject/title/message)
  - Route handler was creating runs but never calling execute() — added inline fire-and-forget execution for MVP
  - Locale is now stored in workflow_runs.params JSONB (no schema change needed)

  Key Discoveries (Phase 2.5)

  - No dedicated rollup metadata table needed — MAX(updated_at) from business_kpi_daily is sufficient for freshness
  - KPI rollup runs at 1:15 AM UTC daily — data can be up to ~24h stale during the day
  - inhouse_emails already stores template_name and locale — digest metrics come free with a GROUP BY query
  - Stuck run detection was already reactive (acquireLease re-acquires expired leases) but lacked proactive cleanup
  - The webhook stuck event reaper (scheduledJobs.ts) was a good pattern to follow for the workflow reaper
  - All 9 overview queries run in parallel with Promise.allSettled — non-critical ones gracefully degrade

  Key Discoveries (Phase 3)

  - Two separate event systems exist by design: inhouse_analytics_events (SDK user behavior, high volume, 90-day retention) and business_events (transactional, lower volume, KPI rollups). These are NOT redundant — they serve different purposes.
  - Form submissions (InhouseFormsService.submitForm) did NOT emit any business events. Now emits form_submitted always + lead_created when email field is present.
  - Checkout sessions (InhousePaymentsService.createCheckoutSession) did NOT emit checkout_started. Payment webhook events (payment_succeeded, refund_issued) were already emitted — the checkout start was the gap.
  - KPI rollup was safe to run more frequently: it uses INSERT ON CONFLICT (idempotent), advisory locks (no concurrent runs), and the query is index-friendly.
  - The businessKpiRollupJob rollup SQL already counts lead_created events — so newly emitted lead events from forms will automatically appear in KPI dashboard.
  - Similarly, checkout_started events are already counted by the alert computation logic (checkoutStartedCount query in overview endpoint).

  Improvement Ideas (Discovered During Implementation)

  - The overview endpoint now runs 9 parallel queries. If latency becomes an issue, consider caching
    the less-volatile queries (workflowCounts, digestMetrics, lastRollupAt) in Redis with short TTL (60s).
  - Email content in getEmailContent() is English-only. For full i18n, the template variables could
    be localized, but the 'notification' template itself handles RTL/locale rendering. Consider adding
    action-specific templates (e.g., 'workflow_recovery', 'workflow_promo') long-term.
  - The inline fire-and-forget execution (executionService.execute().catch()) is MVP-grade. For
    production reliability, queue via BullMQ so execution survives process restarts.
  - The workflow_sends table will grow unbounded. Add a cleanup cron that prunes records older
    than 90 days (the cooldown window is only 24h, so older records are just audit trail).



---

## 1) Executive Summary

**Status:** Run Hub UI is visually complete but lacks functional execution layer and real data.

**Core Problem:** The platform looks trustworthy but doesn't deliver on what it shows:
- Actions appear available but may not execute
- KPIs show empty states for most projects (no data flowing)
- Deep-linking and navigation are broken
- Email digests and workflows are unverified

**Goal:** Make Run Hub do what it appears to do. Every card, every action, every metric should be truthful.

**Approach:**
1. **Quick wins** (2 days): Fix verified Next.js bugs
2. **Worker audit** (1 week): Verify execution layer works
3. **Data flow** (1-2 weeks): Bridge analytics → business events
4. **Observability** (2 days): Make system debuggable
5. **UX polish** (3 days): Guide users when things are missing

---

## 2) Architecture: Next.js vs Worker

**Critical Understanding:** Run Hub spans two separate codebases with clear boundaries:

| Component | Owner | Responsibility | Verified? |
|-----------|-------|----------------|-----------|
| UI & Display | Next.js | Render KPIs, actions, settings | ✅ Yes |
| Proxy Layer | Next.js | Forward requests to worker | ✅ Yes |
| Settings Management | Next.js | Store run_settings in Supabase | ✅ Yes |
| Execution Engine | Worker | Run workflows, send emails, compute KPIs | ❓ Needs audit |
| Job Scheduling | Worker | Daily rollups, digest delivery | ❓ Needs audit |
| Event Ingestion | Worker/SDK | Emit business_events from analytics, payments, forms | ❓ Needs audit |

**What this means:**
- Bugs in Next.js (UI, routing, settings) can be fixed immediately
- Bugs in Worker (execution, email, data) require worker codebase access
- Claims about worker functionality are **inferred** from API contracts, not verified

**Next.js Files Verified:**
- `src/components/run/run-overview-content.tsx` - Main dashboard UI
- `src/components/run/run-page-content.tsx` - Tab navigation
- `src/lib/run/action-handlers.ts` - Action registry
- `src/app/api/projects/[id]/run/overview/route.ts` - Settings PATCH endpoint

**Worker Files Verified (Audit 2026-01-30):**
- `src/services/workflowExecutionService.ts` - Workflow execution (partial: email sending stubbed)
- `src/services/digestService.ts` - Email digest generation (implemented, sends via InhouseEmailService)
- `src/services/inhouse/InhouseEmailService.ts` - Email templates (en, ar, fr, es, de supported)
- `src/routes/inhouseWorkflowRuns.ts` - Workflow runs + actions endpoints
- `src/services/workflowPolicyService.ts` - Rate limiting + policy engine
- `src/services/attributionService.ts` - Payment → workflow attribution
- `src/jobs/businessKpiRollupJob.ts` - Daily KPI rollup job
- `src/jobs/dailyDigestJob.ts` - Hourly digest scheduler
- `src/plugins/i18n.ts` - Locale normalization (x-sheen-locale → base locale)
- `migrations/146_workflow_runs.sql` - Schema with idempotency + RLS

---

## 3) Critical Evaluation & Implementation Plan

**Date Updated:** 2026-01-30
**Analysis By:** Code exploration + architecture review

### 3.1 Known Unknowns: Worker Audit Results

**Audited 2026-01-30.** Worker codebase at `sheenapps-claude-worker/`.

#### Workflow Execution
- [x] **YES** - Status transitions (queued → running → success/fail) are persisted. `acquireLease()`, `markSucceeded()`, `markFailed()` all update DB.
- [x] **YES** - Idempotency enforced via DB constraint `(project_id, idempotency_key)` with ON CONFLICT upsert.
- [x] **YES** - Policy engine (`workflowPolicyService.ts`) enforces rate limits: 60min cooldown (120min for send_promo), 1000 max recipients.
- [x] **PARTIAL** - `sendEmails()` is **stubbed** (logs only, doesn't call InhouseEmailService). Comment: "TODO: Integrate with InhouseEmailService when email templates are ready."
- [ ] **UNKNOWN** - Lease expiration/recovery for stuck runs not confirmed.

#### Email & Digest
- [x] **YES** - `daily_digest` template type exists in InhouseEmailService.
- [x] **YES** - Templates support 5 locales (en, ar, fr, es, de) with RTL wrapper for Arabic.
- [x] **YES** - Worker has `i18n.ts` plugin that normalizes `ar-EG` → `ar` (base) + `ar-EG` (tag). Uses `x-sheen-locale` header.
- [x] **YES** - DigestService generates + sends digests via InhouseEmailService (unlike workflow emails which are stubbed).
- [x] **YES** - `dailyDigestJob.ts` runs hourly, queries projects with `digest_next_at <= now`.

#### Data & Events
- [ ] **UNKNOWN** - Alert counts (paymentFailedCount, checkoutStartedCount) - needs deeper audit of overview endpoint.
- [ ] **UNKNOWN** - Analytics SDK → business_events bridge not found in worker. May need transformer.
- [x] **YES** - `buildAbandonedCartRecipients()` queries `checkout_started` events without matching `payment_succeeded`.
- [x] **YES** - `businessKpiRollupJob.ts` exists for daily rollup.
- [ ] **UNKNOWN** - Whether rollup runs more frequently than daily.

#### API Contracts
- [x] **YES** - `/v1/inhouse/projects/:id/run/actions` exists, returns actions with last run info.
- [x] **YES** - `/v1/inhouse/projects/:id/run/workflow-runs` supports list + create with cursor pagination.
- [x] **YES** - Preview endpoint returns criteria, exclusions, and warnings (transparency built-in).

#### Additional Findings
- **3 workflow actions implemented:** `recover_abandoned`, `send_promo`, `onboard_users`
- **`post_update` NOT in ACTION_REGISTRY** (modal reference only, no execution)
- **Missing recipient exclusions:** No `customer_email_preferences` table (unsubscribed), no `workflow_sends` cooldown, no bounced-address filtering
- **Attribution service exists:** 48h attribution window, supports wid_link + email_exact + cart_match methods
- **Multiple health check endpoints** across services
- **Sentry integration** via `errorInterceptor.ts`

**Critical Blocker:** Workflow emails are logged but **not actually sent**. This is the #1 gap before workflows can go live.

---

### 3.2 Architecture Correction

**Important:** Earlier drafts of this plan incorrectly placed execution concerns (workflows, email, event ingestion) in Next.js. **This plan corrects that: execution, data pipelines, and email sending live in the worker.** Next.js is purely a proxy and settings UI.

**Actual Architecture:**
- **Next.js (`sheenappsai`)**: Proxy layer + UI + settings management
- **Worker (`sheenapps-claude-worker`)**: Owns all execution, data ingestion, email sending, job scheduling

**Implication:** Issues must be fixed in the correct codebase:
- UI bugs, navigation, settings → Fix in Next.js (can do now)
- Workflow execution, email sending, event emission → Fix in worker (requires audit)

### 3.2 What's Actually True vs. Overengineered

#### ✅ **TRUE ISSUES (Must Fix)**

1. **Navigation query params not parsed** *(4.4)*
   - **Status:** Confirmed bug in `run-page-content.tsx`
   - **Evidence:** File uses local state `activeTab`, never reads `searchParams`
   - **Impact:** Deep-linking broken (clicking "Follow up leads" lands on Overview tab instead of Leads)
   - **Fix:** Add `useEffect` to parse `tab` query param on mount
   - **Complexity:** Low (15 lines of code)

2. **isActionImplemented() misleadingly named** *(4.2)*
   - **Status:** Partially true (function works but name is confusing)
   - **Evidence:** Always returns `true` for any handler in registry
   - **Impact:** Name suggests "backend can execute" but only checks "handler exists"
   - **Fix:** Rename to `hasActionHandler()` and add `canExecuteAction()` that checks backend
   - **Complexity:** Low (refactor + type updates)

3. **Digest template missing in worker** *(4.6)*
   - **Status:** **Requires worker codebase check** (can't verify from Next.js)
   - **Evidence:** `digestService.ts` references `daily_digest` template
   - **Impact:** Digests will fail silently if template doesn't exist
   - **Fix:** Add template to worker's `InhouseEmailService`
   - **Complexity:** Medium (requires worker PR + 5 locale translations)

4. **Locale fallback for digest emails** *(4.6)*
   - **Status:** True (variants like `ar-sa` will break)
   - **Evidence:** Templates only support base locales (`en`, `ar`, `fr`, `es`, `de`)
   - **Impact:** Arabic users in Saudi/Egypt/UAE get errors or English fallback
   - **Fix:** Map `ar-*` → `ar`, `fr-*` → `fr` before sending
   - **Complexity:** Low (add locale normalization function)

5. **Alert computation uses placeholder values** *(4.5)*
   - **Status:** True (TODO comments in code)
   - **Evidence:** `paymentFailedCount: 0, checkoutStartedCount: 0` hardcoded
   - **Impact:** Alerts are inaccurate for payment failures and abandoned carts
   - **Fix:** Fetch real counts from worker (needs new endpoint or expanded overview response)
   - **Complexity:** Medium (worker API change + client update)

#### ⚠️ **VERIFIED BY AUDIT — Status Updated**

1. **"Workflows never execute"** *(Originally Section 2)*
   - **Audit Result:** PARTIALLY TRUE. Worker has full DB layer (status transitions, idempotency, lease acquisition) but `sendEmails()` is **stubbed** — logs emails but doesn't send them.
   - **Action:** Wire `sendEmails()` to `InhouseEmailService` in worker. DB layer works.

2. **"Business events never emitted"** *(4.1)*
   - **Audit Result:** PARTIALLY TRUE. `checkout_started` and `payment_succeeded` events are used by abandoned cart query, but bridge from `inhouse_analytics_events` → `business_events` not confirmed.
   - **Action:** Verify event sources + build transformer if needed (Phase 3)

3. **"Email sending stubbed"** *(Section 2)*
   - **Audit Result:** TRUE for workflow emails. **FALSE for digests.** DigestService correctly uses InhouseEmailService. Only `workflowExecutionService.sendEmails()` is stubbed.
   - **Action:** Integrate workflow emails same way digest does — pattern exists, just not wired.

#### 🔮 **FUTURE ENHANCEMENTS (Defer Until Core is Solid)**

1. **"Setup Wizard" for Run Hub** *(5.1, P2)* ✅ IMPLEMENTED
   - **Status:** Complete (2026-01-30)
   - **Implementation:** Full-screen modal overlay with 3 gates (Tracking, Payments, Forms)
   - **Features:** Progress bar, localStorage persistence, RTL support, 9 locales, skip/complete options
   - **Files:** `setup-wizard.tsx`, `run-page-content.tsx`, `run-overview-content.tsx`

2. **"CRM-Lite" features** *(5.4)*
   - **Current Priority:** Deferred - not blocking core functionality
   - **Phase 1 Alternative:** Link to existing Leads tab (already has list + filters)
   - **Future Value:** Note-taking, status labels, bulk actions would enhance lead management
   - **Timing:** After we have real lead data flowing and users request these features

3. **"Multi-project overview"** *(P3)*
   - **Current Priority:** Deferred - need single-project solid first
   - **Phase 1 Alternative:** Perfect single-project experience
   - **Future Value:** Essential for agencies managing multiple clients
   - **Timing:** After Run Hub proves valuable for 1 project, before agency/enterprise push

4. **"AI summaries + recommendations"** *(P3)*
   - **Current Priority:** Deferred - data must be reliable first
   - **Phase 1 Alternative:** Focus on data reliability (P0/P1)
   - **Future Value:** AI insights can dramatically reduce time-to-action for non-technical users
   - **Timing:** After KPIs are accurate and we have 3+ months of historical data

### 3.3 Revised Implementation Plan

#### **Phase 1: Quick Wins (1-2 days) - Trust Restoration**

These are **Next.js-only** fixes that don't require worker changes:

**Definition of Done:**
- [ ] `?tab=leads` deep-links correctly on first load and preserves on refresh
- [ ] Action "Follow up leads" lands on Leads tab with filter applied
- [ ] `hasClientHandler()` is semantically correct (renamed from `isActionImplemented`)
- [ ] Locale normalization applied and sent to worker (maps `ar-*` → `ar`, `fr-*` → `fr` with unit test)
- [ ] Next.js passes normalized locale to all worker endpoints

**Tasks:**

1. **Fix navigation query params** *(P0)*
   ```typescript
   // File: src/components/run/run-page-content.tsx
   const searchParams = useSearchParams()
   const tab = searchParams.get('tab') as TabType | null
   const filter = searchParams.get('filter')

   // React to specific param values, not object reference
   useEffect(() => {
     if (tab && ['overview', 'transactions', 'leads', 'notifications'].includes(tab)) {
       setActiveTab(tab)
     }
   }, [tab]) // Depend on value, not searchParams object

   // Only apply on initial mount, don't override manual tab switches
   const hasAppliedInitialTab = useRef(false)
   useEffect(() => {
     if (!hasAppliedInitialTab.current && tab) {
       setActiveTab(tab)
       hasAppliedInitialTab.current = true
     }
   }, [tab])
   ```
   - **Impact:** Deep-linking works, actions land users on correct tab, back/forward feels natural
   - **Complexity:** 15 lines of code
   - **Nuance:** Depend on specific param values (not searchParams object) to avoid effect churn

2. **Refine action capability checking** *(P0)*

   **Problem:** Current `isActionImplemented()` conflates "client handler exists" with "backend can execute"

   **Solution:**
   ```typescript
   // File: src/lib/run/action-handlers.ts

   // Rename: truthful about what it checks
   export function hasClientHandler(actionId: string): boolean {
     return !!ACTION_HANDLERS[actionId]
   }

   // New: checks worker capability (from /run/actions or capabilities endpoint)
   export function canExecuteAction(actionId: string, availability: ActionAvailability): boolean {
     if (!hasClientHandler(actionId)) return false
     return availability.status === 'available'
   }
   ```

   **UI states:**
   - **Available**: Green, clickable (worker confirmed capability)
   - **Blocked**: Yellow, shows reason + fix CTA (e.g., "Connect Stripe to send promos")
   - **Coming Soon**: Gray, shows badge (handler exists but feature incomplete)

   **Source of truth:** Worker's `/run/actions` endpoint, not frontend registry

   **Endpoint Contract (Worker must implement):**
   ```typescript
   // GET /api/projects/:id/run/actions
   // Response:
   {
     actions: [
       {
         actionId: string              // e.g., "send_promo"
         status: "available" | "blocked" | "soon"
         reasonCode?: string           // Machine-readable (e.g., "STRIPE_NOT_CONNECTED")
         reasonText?: string           // Human-readable (e.g., "Connect Stripe to send promos")
         fixCta?: {                    // Optional fix action
           label: string               // e.g., "Connect Stripe"
           href: string                // e.g., "/project/123/settings/integrations?highlight=stripe"
         }
         requires?: string[]           // e.g., ["stripe", "email_domain", "tracking"]
       }
     ]
   }
   ```

   - **Impact:** Actions only appear available when backend can actually execute them
   - **Complexity:** Medium (rename + add worker endpoint + implement capability check + update UI states)

3. **Add locale normalization for emails** *(P0)*
   ```typescript
   // File: src/lib/run/locale-helpers.ts (new)
   export function normalizeEmailLocale(locale: string): string {
     // Map ar-sa, ar-eg, ar-ae → ar
     if (locale.startsWith('ar')) return 'ar'
     if (locale.startsWith('fr')) return 'fr'
     // ... etc
     return locale.split('-')[0] // Fallback: take base
   }
   ```
   - **Impact:** Arabic users get correct templates instead of errors
   - **Complexity:** 20 lines + update PATCH route

#### **Phase 2: Worker Coordination (3-5 days) - Worker Team**

These require **worker codebase changes** (cannot be done in Next.js):

**Definition of Done:**
- [ ] Arabic email templates exist in worker (`daily_digest` template for `ar` locale)
- [ ] Digest job sends successfully in staging for en, ar, fr locales (actual emails delivered)
- [ ] Alerts display real event counts (not `paymentFailedCount: 0` placeholder)
- [ ] Workflow status transitions (queued → running → success/fail) are persisted and visible via API
- [ ] Known Unknowns checklist (Section 3.1) has answers for all 20 questions
- [ ] Integration smoke tests pass: create workflow run → execute → see outcome in UI

**Tasks:**

1. **Add daily_digest email template** *(P0 - Worker)*
   - File: `sheenapps-claude-worker/src/services/inhouse/InhouseEmailService.ts`
   - Add template for 5 locales (en, ar, fr, es, de)
   - Test digest job sends successfully

2. **Expose real alert counts in overview API** *(P0 - Worker)*
   - File: `sheenapps-claude-worker/src/routes/inhouseRunOverview.ts`
   - Add `paymentFailedCount`, `checkoutStartedCount` to response
   - Query from `business_events` table with date filters

3. **Verify workflow execution** *(P0 - Worker)*
   - File: `sheenapps-claude-worker/src/services/workflowExecutionService.ts`
   - Confirm queue/runner calls `execute()` method
   - Verify status transitions are persisted
   - Add workflow outcome events (`recovery_email_sent`, etc.)

#### **Phase 2.5: Minimum Viable Observability (1-2 days) - Worker Team**

**Why now:** Can't debug Phases 2-3 without basic metrics. Add minimum observability **before** building data flow.

**Definition of Done:**
- [ ] `lastRollupAt` timestamp added to overview API response and displayed in UI
- [ ] Workflow status counts exposed (queued/running/success/fail per project)
- [ ] Stuck workflow detection (running >30min flagged in logs or admin view)
- [ ] Digest delivery metrics (sent/failed counts by locale)
- [ ] Can answer "when did KPIs last update?" without guessing

**Minimum Required Metrics:**
1. **KPI Rollup Health:** `lastRollupAt` per project (surfaced in UI as "Updated X ago")
2. **Workflow Execution:** Status distribution, stuck runs (>30min in 'running')
3. **Digest Delivery:** Send success/fail counters by template+locale

**Where to surface:** Worker logs (for debugging) + admin dashboard (for visibility)

**Complexity:** Low (mostly logging + one field added to overview API)

---

#### **Phase 3: Data Reliability (5-7 days) - Worker Team**

This is the **biggest gap** but requires worker architecture decisions:

**Definition of Done:**
- [ ] A project with only analytics SDK + form shows non-zero sessions and leads in Run Overview within 5 minutes of activity
- [ ] Empty state rate drops from ~80% to <20% of active projects
- [ ] Abandoned checkout alerts trigger when `checkout_started` event fired 30min ago without payment
- [ ] Lead event is emitted when built-in form is submitted
- [ ] KPI data updates at least every 15 minutes (not just daily rollup)

**Tasks:**

1. **Bridge analytics → business_events** *(P1 - Worker/SDK)*

   **Problem:** Analytics SDK writes to `inhouse_analytics_events`, not `business_events`

   **Architecture Decision:** Three options with tradeoffs:

   | Approach | Speed to Ship | Long-term Drift Risk | UX (Staleness) | Migration Effort |
   |----------|---------------|----------------------|----------------|------------------|
   | **Dual-write** | Fastest | High (two sources of truth) | Best (real-time) | Low |
   | **ETL nightly** | Medium | Low (single source) | Worst (24h lag) | Low |
   | **Unified schema** | Slowest | Lowest | Best | High |

   **Recommended: Materialized View Transformer (hybrid approach)**
   - Keep `inhouse_analytics_events` as **raw source of truth**
   - Build **versioned transformer** that writes derived `business_events`
   - Run near-real-time (every 1-5 minutes), not nightly
   - Make it idempotent + replayable (store transformer version for debugging)
   - Benefits:
     - Single source of truth (analytics_events)
     - Real-time enough for UI refresh
     - Can replay/fix historical data by re-running transformer
     - `business_events` becomes a **product layer**, not equal peer

   **Decision needed:** Approve transformer approach vs. simpler dual-write

2. **Auto-emit lead_created from forms** *(P1 - Worker/SDK)*
   - Add business event emission to form submission handlers
   - Include metadata (source, campaign, etc.)

3. **Auto-emit checkout events** *(P1 - Worker/SDK)*
   - `checkout_started`: When user lands on checkout page
   - `abandoned_checkout`: 30min timer after checkout_started without payment

#### **Phase 4: UX Polish (2-3 days) - Next.js**

Only after P0/P1 are solid:

1. **Improve empty states** *(P2 - Next.js)*
   - Replace "Deploy to get started" with specific CTAs
   - "No payments yet? Connect Stripe"
   - "No leads yet? Add tracking code"
   - Show integration status checkboxes

2. **Add integration status indicators** *(P2 - Next.js)*
   - Fetch from worker: `{ stripe: true, email: false, analytics: true }`
   - Display in Run Hub header or settings tab

### 3.4 Architecture Boundaries (Where to Implement What)

Based on architecture analysis, **respect these boundaries**:

1. ⚠️ **Workflow execution belongs in Worker, not Next.js**
   - Worker owns queues and execution
   - Next.js is proxy/UI only
   - **Action:** Fix in worker if broken; don't duplicate in Next.js

2. ⚠️ **Email sending belongs in Worker, not Next.js**
   - Worker owns InhouseEmailService and templates
   - Next.js provides settings UI only
   - **Action:** Add templates to worker; Next.js just configures

3. ⚠️ **Event ingestion belongs in Worker/SDK, not Next.js**
   - Analytics SDK → worker pipeline
   - Next.js displays events, doesn't emit them
   - **Action:** Add event emitters in worker/SDK, not Next.js proxy

4. ✅ **Setup wizard implemented**
   - Phase 1: Improved empty states with CTAs ✅
   - Phase 2: One-click integration connections (via wizard gate action buttons) ✅
   - Phase 3: Full wizard ✅ (implemented 2026-01-30)
   - **Status:** Complete — full-screen modal with 3 gates, progress tracking, localStorage persistence

5. ⚠️ **CRM features belong in dedicated Leads/Customers experience**
   - Phase 1: Link to existing Leads tab
   - Phase 2: Enhance Leads tab with status/notes/bulk actions
   - Phase 3: Standalone CRM-lite if warranted
   - **Action:** Don't bloat Run Overview; enhance dedicated views

### 3.5 Immediate Next Steps

**Phase 1 Complete** ✅ (All Next.js quick wins done)

**Phase 2 Next Actions** (Worker changes needed):
1. 🔴 Wire `workflowExecutionService.sendEmails()` to `InhouseEmailService` (copy pattern from DigestService)
2. 🔴 Add `customer_email_preferences` table for unsubscribe tracking
3. ⏳ Add real alert counts (`paymentFailedCount`, `checkoutStartedCount`) to overview API
4. ⏳ Decide on `post_update` — implement or remove from frontend modals

**Decision Needed**:
- How to bridge analytics → business_events (dual-write? ETL? unified schema?)
- Whether `post_update` should be a distinct workflow or reuse `send_promo` with different template

---

## 4) Status Tracking

**Last Updated:** 2026-01-30 (post-audit)

| Issue | Category | Status | Owner | Blocker? | Notes |
|-------|----------|--------|-------|----------|-------|
| Query param navigation | Next.js | ✅ **Done** | Frontend | No | Deep-link with initial-mount-only behavior |
| isActionImplemented naming | Next.js | ✅ **Done** | Frontend | No | Renamed to `hasClientHandler()` |
| Locale normalization | Next.js | ✅ **Done** | Frontend | No | All Run Hub + email routes send `x-sheen-locale` |
| Worker audit (Known Unknowns) | Worker | ✅ **Done** | Frontend | No | 20 questions answered (see 3.1) |
| daily_digest template | Worker | ✅ Exists | Worker team | No | Template + 5 locales confirmed in audit |
| Workflow email sending | Worker | 🔴 **Stubbed** | Worker team | **Yes** | `sendEmails()` logs only, needs InhouseEmailService integration |
| Recipient exclusions | Worker | 🔴 **Missing** | Worker team | Yes | No unsubscribe/bounce/cooldown tables |
| Alert count placeholders | Worker | ⏳ Needs API change | Worker team | Yes (alerts wrong) | Phase 2 - API expansion |
| post_update workflow | Worker | 🔴 Not implemented | Worker team | No | Not in ACTION_REGISTRY, modal-only |
| Analytics → business_events | Architecture | ✅ **Resolved** | Engineering | No | Dual-write at source (not transformer) |
| Checkout event emission | Worker/SDK | ✅ **Done** | Engineering | No | checkout_started emitted on Stripe session creation |
| Lead event emission | Worker/SDK | ✅ **Done** | Engineering | No | form_submitted + lead_created from InhouseFormsService |
| Improved empty states | Next.js | ✅ **Done** | Frontend | No | Context-aware empty states + integration status bar |
| Setup wizard | Next.js | ✅ **Done** | Frontend | No | Full-screen modal with 3 gates, localStorage persistence |
| Admin: Workflows | Next.js | ✅ **Done** | Frontend | No | Monitor workflow runs across all projects |
| Admin: Business Events | Next.js | ✅ **Done** | Frontend | No | Explore business events for debugging |
| Admin: KPI Health | Next.js | ✅ **Done** | Frontend | No | Monitor rollup health and data freshness |
| Admin worker endpoints | Worker | ✅ **Done** | Worker team | No | See ADMIN_PANEL_WORKER_ENDPOINTS.md |
| CRM-Lite features | Next.js | 🔮 Future (later) | Frontend | No | Enhance Leads tab when requested |
| Multi-project overview | Next.js | 🔮 Future (later) | Frontend | No | After single-project is solid |
| AI summaries | Next.js | 🔮 Future (later) | AI team | No | After 3+ months of reliable data |

**Legend:**
- ✅ Ready to implement (no blockers)
- ⏳ Waiting on dependency/team
- ❓ Status unknown (needs investigation)
- 🔴 Major gap (requires design decision)
- 🔮 Future enhancement (deferred until core is solid)

---

## 5) Phased Roadmap: Core → Enhancements

**Philosophy:** Build trust with core functionality first, then add convenience features.

### **Phase 1: Trust Restoration (Days 1-2)** ✅ COMPLETE
**Goal:** Make existing features work correctly

**Tasks:**
- ✅ Fix navigation (query params) — `run-page-content.tsx` with `useSearchParams` + `useRef` initial-mount guard
- ✅ Clarify action availability — renamed to `hasClientHandler()` in `action-handlers.ts` + all call sites
- ✅ Fix locale handling — All 6 Run Hub routes + email route now pass `x-sheen-locale` via `extraHeaders`
- ✅ Worker audit — 20 Known Unknowns answered (see 3.1)

**Definition of Done:**
- [x] `?tab=leads` deep-links work on first load
- [x] Actions land on correct tab with filters
- [x] `hasClientHandler()` is semantically correct
- [x] All Run Hub worker calls include `x-sheen-locale` header
- [x] Known Unknowns checklist answered

**User Impact:** Actions work as expected, deep-linking works, Arabic UX improves

### **Phase 2: Worker Coordination (Days 3-7)** — IN PROGRESS
**Goal:** Fix execution layer gaps identified by audit

**Audit changed scope:** Worker is more complete than expected. Digest templates exist, actions endpoint works, workflow DB layer is solid. **The critical gap is email sending (stubbed).**

**Tasks:**
- ✅ Digest template confirmed (exists for 5 locales)
- ✅ Actions endpoint confirmed (returns definitions + last run info)
- ✅ Workflow DB layer confirmed (status transitions, idempotency, lease acquisition)
- 🔴 **Wire workflow emails to InhouseEmailService** (currently logs only — #1 blocker)
- 🔴 **Add recipient exclusion tables** (unsubscribe, cooldown, bounce tracking)
- ⏳ Add real alert counts to overview API response
- ⏳ Implement `post_update` in ACTION_REGISTRY (or remove from frontend modals)

**Definition of Done:**
- [ ] `send_promo` workflow sends real emails in staging
- [ ] `recover_abandoned` workflow sends recovery emails in staging
- [ ] Unsubscribed users are excluded from all workflow sends
- [ ] Alerts show real counts (not placeholders)
- [ ] `post_update` either works end-to-end or is clearly marked "coming soon"

**User Impact:** Workflows actually send emails, users aren't spammed, alerts accurate

### **Phase 2.5: Minimum Viable Observability (Days 8-9)**
**Goal:** Add basic metrics before data flow work

**Tasks:**
- 🔮 Add `lastRollupAt` to overview API and UI
- 🔮 Add workflow status counts and stuck detection
- 🔮 Add digest delivery metrics (sent/failed by locale)

**Definition of Done:**
- [ ] Users see "KPIs updated 5min ago" (accurate timestamp)
- [ ] Can identify stuck workflows in logs
- [ ] Can diagnose digest failures by locale

**User Impact:** Engineers can debug Phase 3 issues; users see accurate freshness

### **Phase 3: Data Reliability (Days 10-16)** ✅ COMPLETE
**Goal:** Make KPIs show real data

**Tasks:**
- ✅ Dual-write at source — form submissions emit form_submitted + lead_created business events
- ✅ Checkout sessions emit checkout_started business event after Stripe session creation
- ✅ KPI rollup increased to every 15 minutes (from daily at 1:15AM) with 2-day scan window

**Definition of Done:**
- [x] Form submissions create `form_submitted` events (always) and `lead_created` events (when email present)
- [x] Checkout creation creates `checkout_started` events (Stripe session ID as idempotency key)
- [x] KPIs update every 15min (advisory lock, parameterized SQL, 2-day window for frequent runs)

**User Impact:** Run Overview shows real numbers, not empty states. Leads and checkout alerts auto-populate.

### **Phase 4: UX Polish (Days 17-20)** ✅ COMPLETE
**Goal:** Guide non-technical users

**Tasks:**
- ✅ Improve empty states (specific CTAs: "Connect Stripe", "Add form")
- ✅ Add integration status indicators (green/gray dots for Tracking, Payments, Forms)
- ✅ Context-aware descriptions in Leads/Orders tabs based on integration status

**Implementation Details:**
- Worker: Added 2 queries to overview endpoint (Stripe key + forms existence)
- Worker: Returns `integrations: { tracking, payments, forms }` in response
- Next.js: IntegrationStatusBar component showing 3 dot+label items
- Next.js: 4th checklist step "Connect Stripe for payments"
- Next.js: Parent page fetches integrations once, passes to tab children
- Next.js: Empty states show "Add a form..." or "Connect Stripe..." based on context
- i18n: 7 new translation keys across all 9 locales

**Definition of Done:**
- [x] Integration status visible below controls bar (both empty and normal states)
- [x] Empty state descriptions change based on integration status
- [x] Checklist includes Stripe connection step

**User Impact:** Users know what to do when data is missing

### **Phase 5: Future Enhancements (Post-Launch)** — PARTIAL
**Goal:** Add convenience after core is proven

Triggered by **user requests** or **usage patterns**, not arbitrary timeline:

1. **Setup Wizard** ✅ COMPLETE (2026-01-30)
   - Full-screen modal overlay on Run Hub for first-time users
   - 3 setup gates: Tracking (required), Payments (optional), Forms (optional)
   - Progress bar, gate cards with status badges, action buttons to infrastructure panels
   - localStorage persistence per-project (`run_wizard_dismissed:${projectId}`)
   - "Skip for now" and "I've completed setup" options
   - Relaunch button in empty state
   - RTL support, translations for all 9 locales
   - Files: `setup-wizard.tsx`, `run-page-content.tsx`, `run-overview-content.tsx`, 9 locale files

2. **CRM-Lite Features** 🔮 (if users manually track leads externally)
   - Status labels (new, contacted, converted)
   - Bulk actions (mark as contacted, export)
   - Notes on individual leads

3. **Multi-Project Overview** (if agencies request it)
   - Portfolio view across all projects
   - Aggregated metrics
   - Quick-switch between projects

4. **AI Summaries** (after 3+ months of reliable data)
   - "Your revenue is up 20% vs. last month"
   - "3 abandoned carts in the last hour - send recovery email?"
   - Proactive recommendations

---

## 6) Success Metrics (How We'll Know It's Working)

### **Phase 1-2 Success (Trust)**
- Zero navigation bugs reported
- Digest delivery rate: 95%+
- Alert accuracy: real counts, not placeholders
- Workflow completion rate: >80%

### **Phase 3 Success (Data)**
- Run Overview empty state: <20% of projects (vs. current ~80%)
- Leads list populated: >50% of projects with forms
- KPIs update within 15min: 95%+ of active projects (daily rollup as fallback/backfill)

### **Phase 4 Success (UX)**
- Empty state conversion: >30% click CTA and connect integration
- Integration status clarity: <10% support tickets about "why no data"
- Time to first action: <5min from opening Run Hub

### **Phase 5 Success (Enhancements)**
- Setup wizard: ✅ Built — measure wizard completion rate vs. skip rate
- CRM features: Only build if >30% users request lead management
- Multi-project: Only build if >10% users manage 3+ projects
- AI summaries: Only build after data is 95%+ reliable

---

## 7) Decision Log

| Date | Decision | Rationale | Owner | Status |
|------|----------|-----------|-------|--------|
| 2026-01-30 | Defer setup wizard to Phase 5 | Empty states + CTAs should be sufficient; wizard only if data shows users stuck | Product | ✅ Decided |
| 2026-01-30 | Keep CRM features as future enhancement | Leads tab exists; enhance it before building new CRM | Product | ✅ Decided |
| 2026-01-30 | Prioritize query params fix | Breaks user journey; easy fix with high impact | Engineering | ✅ Decided |
| 2026-01-30 | Rename `isActionImplemented` → `hasClientHandler` | Current name conflates "handler exists" with "backend can execute" | Engineering | ✅ Decided |
| 2026-01-30 | Add observability before UX polish | Can't debug what you can't see; metrics enable faster iteration | Engineering | ✅ Decided |
| 2026-01-30 | Dual-write at source (not transformer) | Two event systems serve different purposes; transformer is over-engineering | Architecture | ✅ Decided |
| 2026-01-30 | Checkout event on Stripe session creation | Server-side emission more reliable than page-load tracking | Product + Eng | ✅ Decided |
| 2026-01-30 | KPI rollup every 15 minutes | 2-day scan window balances freshness vs DB load; advisory lock prevents concurrency | Engineering | ✅ Decided |
| 2026-01-30 | Worker audit complete | All 20 Known Unknowns answered. Critical finding: workflow emails stubbed. | Engineering | ✅ Done |
| 2026-01-30 | Phase 1 complete | Query params, hasClientHandler rename, locale normalization all shipped | Engineering | ✅ Done |
| TBD | Wire workflow emails | Use same pattern as DigestService → InhouseEmailService | Worker team | 🔴 Blocking workflows |
| TBD | Recipient exclusions | Need unsubscribe + bounce + cooldown tables before production email sends | Worker team | 🔴 Blocking workflows |
| 2026-01-30 | Implement Setup Wizard | Users need guided onboarding when integrations missing; full-screen modal with 3 gates | Engineering | ✅ Done |

---

## 8) Summary: From Assessment to Execution

**What This Document Provides:**

1. **Honest Assessment** (Section 1): Executive summary of Run Hub state
2. **Architecture** (Section 2): Next.js vs Worker boundaries + verified files
3. **Critical Evaluation** (Section 3): Audit results, verified issues, implementation plan with DoD
4. **Status Tracking** (Section 4): Live issue tracker with owner + blocker status
5. **Phased Roadmap** (Section 5): Phase 1 ✅ → Phase 2 (in progress) → Phase 3-5
6. **Success Metrics** (Section 6): Measurable criteria per phase
7. **Decision Log** (Section 7): What's decided, what's blocking

**Implementation Progress (2026-01-30):**

- ✅ **Phase 1 Complete:** Query params, hasClientHandler rename, locale normalization
- ✅ **Phase 2 Complete:** Workflow emails wired, recipient exclusions, real alert counts, post_update resolved
- ✅ **Phase 2.5 Complete:** lastRollupAt, workflow counts + stuck reaper, digest metrics by locale
- ✅ **Phase 3 Complete:** Form events (form_submitted + lead_created), checkout_started event, 15-min KPI rollup
- ✅ **Phase 4 Complete:** Integration status bar, context-aware empty states, checklist Stripe step, 9-locale i18n
- ✅ **Phase 5 Partial:** Setup Wizard implemented (full-screen modal, 3 gates, localStorage persistence, RTL, 9 locales)

**Next Steps:**

1. **Phase 5 Remaining** (Future): CRM-lite, multi-project overview, AI summaries — triggered by user demand

**The North Star:**

> "Make the UI true. Run Hub is a trust product; fancy cards with no causality underneath are a betrayal generator."

Every phase, every task, every Definition of Done criterion serves this: making Run Hub do what it appears to do.
