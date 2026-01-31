# Build vs Manage/Run — Platform Analysis & Recommendations

**Date:** 2026-01-26
**Scope:** `sheenappsai` (Next.js app), `sheenapps-claude-worker` (Fastify worker), `sheenapps-packages` (SDKs/services)

---

## Executive Summary
SheenApps is highly optimized for **building** (prompt → build → preview → deploy) but the **manage/run** side is fragmented, internal-facing, and mostly limited to account billing and limited admin/advisor dashboards. To make the workspace a real “business operating system,” we should introduce a dedicated **Run Hub** (operational dashboards + workflows), backed by a coherent **business signals layer** and **events pipeline**. This does not require a rewrite—most of the technical primitives already exist (analytics, payments, notifications, realtime, jobs, admin endpoints), but they are not yet productized into user-facing operations.

---

## Implementation Progress (Live)
**Status:** Phase 3.5 Complete ✅ (UX Polish)
**Last Updated:** 2026-01-27

Remaining Enhancements (another detailed plan file RUN_HUB_FUTURE_ENHANCEMENTS_PLAN.md was created for them):
┌──────────────────────────────┬──────────┬───────────────────────────────────────────────────────┐
│           Feature            │ Priority │                         Notes                         │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Real action handlers         │ High     │ Replace "Coming Soon" stubs with functional workflows │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Extended date ranges         │ Medium   │ Beyond Today/Yesterday                                │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ KPI comparisons              │ Medium   │ vs previous period                                    │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Chart visualizations         │ Medium   │ Graphs for trends                                     │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Load more pagination         │ Medium   │ Replace offset-based                                  │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Build state on project cards │ Medium   │ Show building/failed status                           │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Custom KPI configuration     │ Low      │ User-defined metrics                                  │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Goal setting & tracking      │ Low      │ Targets                                               │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Multi-project comparison     │ Low      │ Portfolio view                                        │
├──────────────────────────────┼──────────┼───────────────────────────────────────────────────────┤
│ Revenue forecasting          │ Low      │ Predictions                                           │
└──────────────────────────────┴──────────┴───────────────────────────────────────────────────────┘

### Completed
- Kickoff: plan finalized and implementation started.
- Added migrations for `business_events` + `business_kpi_daily`.
- Added worker ingestion route and KPI read route.
- Added Run Overview API proxy + initial UI scaffolding.
- Added daily KPI rollup job (UTC, 7‑day backfill).
- Added Run alerts endpoint (payments failures + build failures) and surfaced in Run Overview.
- Added analytics SDK requirement in AI SDK rules (page tracking required).
- Added Easy Mode analytics bootstrap injection (PageTracker component + layout insertion).
- Added server‑side auth guard + login redirect for `/project/:id/run`.
- Added project timezone + currency fields and wired rollups to use them.
- Hardened analytics bootstrap injection (layout.js support + body fallback + Pages Router warning).
- Added post‑generation analytics checks for non‑Easy Mode builds (dependency-aware injection).
- Added Pages Router auto‑injection for analytics when `_app` exists and SDK is present.
- Added analytics dependency seeding for Easy Mode outputs.
- Added AST-based analytics injection for App Router + Pages Router (no regex).
- Persisted template metadata in Easy Mode project creation (stored in project config).
- Derived `run_settings` from template metadata (industry_tag + default_packs + template_snapshot).
- Added AST fallback injection when layouts lack `<body>` / `<Component>`.
- Run Overview now backfills `run_settings` from template metadata on first view.
- Added RLS policies for business events + KPI rollups.
- Updated KPI rollups to be per-currency (primary key includes `currency_code`).
- Made migration 131 idempotent (conditional policy creation + PK alteration guards).
- Fixed SQL injection pattern in runAlertsService (parameterized intervals).
- Converted business services to singleton pattern (BusinessEventsService, BusinessKpiService, RunAlertsService).
- Added rate limiting to business events ingestion (100 events/min per project+source).
- **Added Run entry point in workspace header** (bar-chart icon + link to `/project/:id/run`).
- **Added Run menu item in project card dropdown** (shows for deployed projects only).
- **Added abandoned checkout alert detection** (`checkout_started` without `payment_succeeded` within 24h).
- Added translations for Run button in all 9 locales.
- **Added Run page header with navigation** (project name, mode indicator, Edit button, user menu).
- **Created Run translations namespace** (`run.json`) for all 9 locales.
- **Added seamless Build ↔ Run navigation** (Edit button in Run header, Run button in Build header).
- **Enhanced Run Overview UI** with polished KPI cards (icons, better styling, industry-specific labels).
- **Improved Needs Attention section** with alert icons, color coding, and relative timestamps.
- **Added interactive Next Actions** with industry-specific stub buttons (Send Promo, Follow Up, Post Update, etc.).
- **Added proper first-run empty state** for Run Overview (encouraging message when no data yet).
- **Expanded Run translations** in all 9 locales with full coverage for KPIs, actions, alerts, and empty states.
- **Added "Live" status badge on project cards** (visible green badge for deployed projects in both grid and list views).
- **Added manual refresh button** to Run Overview (spinning icon, shows "Updated X ago" timestamp).
- **Added deployment status protection** for Run page (non-deployed projects see friendly "Deploy to unlock Run" message with link to builder).
- **Added refresh translations** to all 9 locales (lastUpdated, refresh).
- **Added notDeployed translations** to all 9 locales (title, description, goToBuilder).
- **Added toast feedback for Next Actions** (clicking "Soon" buttons now shows info toast with feature name).
- **Added comingSoonToast translations** to all 9 locales (title, description with {feature} placeholder).
- **Added industry tag selector** in Run Overview (dropdown to change industry, updates run_settings via PATCH API).
- **Added PATCH endpoint** for `/api/projects/[id]/run/overview` to update run_settings.industry_tag.
- **Added industry translations** to all 9 locales (label, options for 6 industries, success/error messages).
- **Wrapped RunOverviewContent in ErrorBoundary** with context "RunOverview" for production resilience.
- **Added auto-refresh toggle** (30-second interval, clock icon button, green when active).
- **Added auto-refresh translations** to all 9 locales (autoRefreshOn, autoRefreshOff).
- **Added date picker for Run KPIs** (Today/Yesterday presets + custom date input, fetches KPIs for selected date).
- **Added dateFilter translations** to all 9 locales (today, yesterday).
- **Added Build Progress Sheet** to project-status-bar.tsx (View Progress button opens side panel with CleanBuildProgress).
- **Added Error Recovery Sheet** to project-status-bar.tsx (Retry button opens error details with retry option).
- **Added mobile touch optimization** to Run Overview controls (min-h-[44px] on mobile for accessibility compliance, compact on desktop).

### In Progress
- None (Phase 3.5 complete)

### Completed (Phase 1)
- **Connected payments webhooks → business_events** (2026-01-27)
  - Modified `InhousePaymentsService.storeWebhookEvent()` to emit business events
  - Stripe event mapping:
    - `payment_intent.succeeded` → `payment_succeeded` (with amount_cents, currency)
    - `invoice.payment_succeeded` → `payment_succeeded` (subscription renewals)
    - `charge.refunded` → `refund_issued` (with amount_cents)
    - `customer.subscription.created` → `subscription_started`
    - `customer.subscription.deleted` → `subscription_canceled`
    - `checkout.session.completed` (subscription mode) → `signup`
    - `invoice.payment_failed` → `payment_failed` (for alerts)
  - Uses existing `BusinessEventsService` singleton for idempotent inserts
  - Stripe event ID used as idempotency key prefix (`stripe:{eventId}`)
  - Errors logged but don't fail webhook (payment event already stored)
- **Added Transactions/Orders list component** (2026-01-27)
  - Created `run-orders-content.tsx` - displays payment events with filtering
  - Features: event type filter, pagination, status badges, amount display
  - Reuses existing `/api/inhouse/projects/[id]/payments/events` API endpoint
  - Translations added to all 9 locales (`orders` section in run.json)

### Completed (Phase 2)
- **Added Business Events list API** (2026-01-27)
  - Added `listEvents()` method to `BusinessEventsService` with filtering, pagination, date ranges
  - Added GET endpoint at `/v1/inhouse/projects/:projectId/business-events` in worker
  - Added Next.js API proxy at `/api/inhouse/projects/[id]/business-events`
- **Added Leads/Signups list component** (2026-01-27)
  - Created `run-leads-content.tsx` - displays lead_created, signup, subscription_started events
  - Features: event type filter (All/Leads/Signups/Subscribers), pagination, display name extraction
  - Translations added to all 9 locales (`leads` section in run.json)
- **Added Tab navigation to Run page** (2026-01-27)
  - Created tab navigation in `run-page-content.tsx` (Overview, Transactions, Leads tabs)
  - Mobile-friendly with 44px touch targets, icon-only on mobile
  - Translations added to all 9 locales (`tabs` section in run.json)

### Completed (Phase 2.5)
- **Event-driven notifications system** (2026-01-27)
  - Created `RunNotificationService` in worker to send emails on business events
  - Hooked into `BusinessEventsService.insertEvent()` to trigger notifications (fire-and-forget)
  - Notifiable events: `lead_created`, `signup`, `payment_succeeded`, `payment_failed`, `checkout_abandoned`
  - Uses existing `InhouseEmailService` for actual email delivery (Resend API)
  - Checks notification preferences before sending
- **Notification preferences API** (2026-01-27)
  - Extended PATCH `/api/projects/[id]/run/overview` to accept `notifications` object
  - Stores preferences in `projects.config.run_settings.notifications`
  - Keys: enabled, email_on_lead, email_on_payment, email_on_payment_failed, email_on_abandoned_checkout, email_recipient
- **Notification settings UI** (2026-01-27)
  - Created `run-notifications-content.tsx` component with toggle switches for each notification type
  - Added Notifications tab to Run Hub (4th tab after Overview, Transactions, Leads)
  - Features: master enable toggle, per-event toggles, custom email recipient option
  - Translations added to all 9 locales (`notifications` + `tabs.notifications`)

### Completed (Phase 3)
- **Vertical Packs Configuration System** (2026-01-27)
  - Created `/src/config/vertical-packs.ts` - centralized configuration for all industries
  - Defines KPI cards, actions, and alerts per industry via TypeScript config
  - Replaces hardcoded switch statements with config-driven lookup
  - Principle: Industry = configuration, not schema
- **Industry-Specific KPI Cards** (2026-01-27)
  - Each industry now has tailored KPI cards beyond just 2 fixed cards
  - E-commerce: Revenue, Orders, Refunds (when present), Conversion
  - SaaS: Revenue, Signups, Trials, Conversion
  - Restaurant: Revenue, Bookings, Orders, Conversion
  - Services: Revenue, Bookings, New Clients, Conversion
  - Fitness: Revenue, Bookings, New Members, Conversion
  - Generic: Revenue, Leads, Conversion
- **Industry-Specific Actions** (2026-01-27)
  - Each industry has 4 tailored suggested actions (up from 3)
  - E-commerce: Send Promo, Follow Up Orders, Recover Carts, Post Update
  - SaaS: Reach Out, Review Drop-offs, Onboard Users, Ship Update
  - Restaurant: Confirm Bookings, Follow Up Inquiries, Fill Slots, Send Promo
  - Services: Confirm Bookings, Follow Up Inquiries, Fill Slots, Send Reminders
  - Fitness: Confirm Bookings, Fill Slots, Send Motivation, Send Promo
- **Industry-Specific Alerts** (2026-01-27)
  - Alert types are now defined per industry in config
  - New alert types defined: low_bookings, refund_spike, churn_risk
  - E-commerce: payment_failed, abandoned_checkout, refund_spike, build_failed
  - SaaS: payment_failed, churn_risk, build_failed
  - Services/Fitness: payment_failed, low_bookings, build_failed
- **Backend Alert Detection (Worker)** (2026-01-27)
  - Updated `runAlertsService.ts` to detect all 6 alert types
  - Gets project's `industry_tag` to run industry-specific detections
  - `low_bookings`: Compares daily leads/bookings vs 30-day average (triggers when below 1 std dev or 50% avg)
  - `refund_spike`: Compares daily refunds vs 30-day average (triggers when above 1 std dev or 150% avg, min 3)
  - `churn_risk`: Detects subscription_canceled, membership_canceled, plan_downgraded events
- **New Translations** (2026-01-27)
  - Added new KPI keys: trials, newClients, newMembers, refunds
  - Added new action keys: recoverAbandoned, onboardUsers, sendReminders, sendMotivation
  - All 9 locales updated with full translations

### Completed (Phase 3.5 - UX Polish)
- **Expert Review Bug Fixes** (2026-01-27)
  - Industry tags mismatch: Created shared `/src/lib/run/industry-tags.ts` with `INDUSTRY_TAGS` const and `isIndustryTag()` guard
  - hasTemplate always true: Fixed to check `!!resolvedTemplate` instead of `!!templateData` in project creation
  - Null timestamps crash: Added defensive check in `project-grid.tsx` with "just now" fallback
  - Empty-state CTA locale bug: Changed imports from `next/navigation` to `@/i18n/routing`
  - Deep-link wipe on toggle: Drawer now preserves `?infra=database` instead of resetting to `?infra=open`
  - Amount "0" not rendering: Changed `{amount &&` to `{amount != null &&` in event details drawer
  - Date format validation: Added `/^\d{4}-\d{2}-\d{2}$/` regex check in Run overview GET
  - Error states without retry: Added retry buttons to leads and orders error states
  - Auto-refresh on historical: Auto-refresh now only works for today's data (not historical)
  - Notification "enabled" inconsistency: Added `normalizePrefs()` for consistent boolean handling
  - Email validation: Added inline email validation in notifications settings
  - RTL header issues: Added locale-aware `dir` attribute to workspace header
- **UX Enhancements** (2026-01-27)
  - Event Details Drawer: Created `event-details-drawer.tsx` with structured display and copy affordances
  - Clickable event rows: Leads and orders rows open details drawer on click
  - Empty State CTAs: Created `empty-state-ctas.tsx` with config-driven actions for empty states
  - Deep-link scroll-to: `?infra=database` scrolls to database panel in infrastructure drawer
  - Auto-expand advanced: Deep-linking to panels inside "Advanced Settings" auto-expands it
  - Collapsible raw payload: Event drawer has expandable JSON payload section
  - One-click copy: Copy buttons for email, IDs, and full payload with toast feedback
- **Translations** (2026-01-27)
  - Added `eventDetails.*` namespace to all 9 locales
  - Added `orders.retry` / `leads.retry` for error state retry buttons
  - Added `overview.live` / `overview.updating` / `overview.autoRefreshHistorical`
  - Added `notifications.invalidEmail` / `notifications.emailWillBeSentTo` / `notifications.save`

### Next Up (Future Enhancements)
- Real action handlers (replace "Coming Soon" stubs with functional workflows)
- Extended date ranges and KPI comparisons
- Chart visualizations
- Load more pagination (replace offset-based pagination)
- Show build state on project cards

### Phase 2.5 Analysis (2026-01-27)

**Discovery: Email Infrastructure Already Exists!**
- `InhouseEmailService` in worker fully implements email sending via Resend API
- Built-in templates: welcome, magic-link, password-reset, email-verification, receipt, notification
- Localization support: en, ar, fr, es, de (with RTL support for Arabic)
- Features: quota management, idempotency, scheduled sending, suppression lists
- The `NotificationService` in Next.js app (that just logs) is for platform-level notifications (trial ending, etc.), NOT project-level

**What Actually Needs Implementation:**
1. **Run Event Notifications** - Notify project owners when business events occur
   - New lead/signup → email to project owner
   - Payment received → optional celebration email
   - Payment failed → alert email
   - Abandoned checkout → reminder alert
   - Build failure → error notification

2. **Notification Preferences** - Project-level settings for what events trigger notifications
   - Store in `projects.config.run_settings.notifications`
   - Options: email_on_lead, email_on_payment, email_on_failure, etc.

3. **Event-driven triggers** - Hook into business event ingestion to check preferences and send notifications

**Architecture Decision:**
- Leverage existing `InhouseEmailService` for email sending
- Add notification trigger logic to `BusinessEventsService.insertEvent()`
- Store notification preferences in `run_settings`
- Use existing `notification` template for generic alerts

### Decisions / Notes
- **Run is universal** (event-driven), Easy Mode just auto-fills faster.
- KPIs come only from `business_events` rollups.
- Conversion hides when sessions are missing.

### Discoveries / Risks
- **Run Overview now consumes `run_settings`** for labels and cards; Pro projects will backfill from template metadata on first Run view.
- **Business KPIs are now per-currency**; cross-currency reporting requires explicit UI aggregation or FX strategy.
- **Session tracking isn't guaranteed** in generated apps; ensure analytics injection or hide conversion.
- **AST-based injection now falls back to first JSX element**, but layouts with no JSX still miss tracking.
- **Rollups now ignore mismatched currencies** (payload currency vs project currency) to avoid mixing multi‑currency totals.
- **Non‑Easy Mode analytics injection requires SDK dependency** (skips if `@sheenapps/analytics` missing).
- **Easy Mode may inject analytics without dependency** (warns but still injects).
- **Easy Mode now seeds analytics dependency** (adds `@sheenapps/analytics` to `package.json`).
- **Abandoned checkout detection requires session/correlation linkage**; if apps don't set session_id or correlation_id on checkout events, abandonments won't be detected.
- **Run entry points now available** in workspace header and project card dropdown; users no longer need to manually type the URL.
- **Run menu only shows for deployed projects** (build_status === 'deployed'); non-deployed projects won't see the option.
- **run_settings backfill is N/A** — no existing users/projects before launch, so no backfill needed.
- **Gap analysis (2026-01-26)**: Explored Run Hub for missing features. Key gaps found and addressed:
  - "Live" badge was only in dropdown → now visible on card
  - No refresh mechanism → added manual refresh button with timestamp
  - No deployment check → added friendly redirect for non-deployed projects
  - Next Actions were disabled with no feedback → added toast on click
  - No industry selection UI → added dropdown to change industry
  - No error boundaries → wrapped RunOverviewContent in ErrorBoundary
  - No auto-refresh → added 30s interval toggle
  - ~~Remaining: date range picker (API supports it, UI doesn't expose)~~ → **Done (2026-01-27)**
- **Gap analysis (2026-01-27)**: Continued implementation:
  - Date picker added (Today/Yesterday presets + custom date input)
  - Build Progress Sheet added to project-status-bar (was TODO)
  - Error Recovery Sheet added to project-status-bar (was TODO)
  - Mobile touch optimization added (44px min touch targets on mobile, 32px on desktop)
  - All Phase 0 polish items complete
- **Phase 3.5 polish (2026-01-27)**: Expert review identified several edge cases:
  - Industry tags were mismatched between creation and validation (now shared source of truth)
  - Project cards could crash with null timestamps (now defensive with fallback)
  - Event details drawer needed proper null-check for $0 amounts
  - Deep-link state was being wiped on drawer toggle (now preserved)
  - Error states needed retry affordance (now have retry buttons)
- **Phase 1 discovery (2026-01-27)**: Payments → business_events bridge:
  - `InhousePaymentsService.storeWebhookEvent()` was storing to `inhouse_payment_events` but NOT emitting to `business_events`
  - `BusinessEventsService` singleton already exists with idempotent insert
  - `businessKpiRollupJob` expects `payment_succeeded` and `refund_issued` with `amount_cents` and `currency` in payload
  - Bridge added: Stripe webhooks now emit corresponding business events
  - Key insight: Payment events were isolated in `inhouse_payment_events`; KPI rollups only read from `business_events`

---

## UX Design Decisions (Build vs Run Navigation)

### Core Mental Model
**Build** and **Run** are two activities on the **same project**, not separate destinations:
- **Build** = Development mode (edit, iterate, deploy) — the primary workspace
- **Run** = Operations mode (KPIs, alerts, business performance) — monitoring dashboard

### Why Build Remains the Default Entry Point
1. **Build is where work happens** — Users go to Builder to make changes, iterate, and deploy. It's the active workspace.
2. **Run is for monitoring** — Users go to Run to see how their business is performing. It's a passive view.
3. **Avoiding confusion** — Redirecting live projects to Run would break user expectations. When users click on a project, they expect to work on it.
4. **Progressive disclosure** — Run only makes sense after deployment. Pre-deployed projects have no business signals.

### Navigation Pattern
Both Build and Run have consistent navigation:
- **From Builder**: "Run" button in header → goes to Run overview
- **From Run**: "Edit" button in header → goes back to Builder
- **Both**: Logo link → back to Dashboard

### Visual Differentiation
- **Builder**: Dark workspace theme (gray-800 header, dark canvas)
- **Run**: Light dashboard theme (standard background, card-based layout)
- **Mode indicator**: Run page shows "Live" badge with green pulse dot

### What We Did NOT Do
- ❌ Auto-redirect live projects to Run (confusing, breaks expectations)
- ❌ Create complex mode switching UI (unnecessary, simple buttons work)
- ❌ Add project "tabs" (URLs already handle navigation cleanly)

---

## Improvements Backlog (from implementation)
- Use `run_settings` to auto-configure Run packs + cards per industry (beyond basic labels). (Done for Overview cards)

---

## Additional Improvements Noted (2026-01-26)
- Consider persisting a lightweight `template_snapshot` (id + tags + category) in Run settings to decouple from full template data. (Done)

## Current State (What We Have)

### 1) Build-Focused UX (Strong)
- **Builder workspace** is the primary product surface; infra tools (DB, CMS, auth, deploy, etc.) live inside the workspace drawer and header actions.
- There is a **project dashboard** that mostly manages projects (create/open/archive/rename/duplicate).
- Recent UX work focuses on simplifying build flows for non‑technical users (see `WORKSPACE_SIMPLIFICATION_PLAN.md`, `UX_ACTION_PLAN_JAN_2026.md`).

**Evidence (examples):**
- Project dashboard: `sheenappsai/src/components/dashboard/dashboard-content.tsx`
- Project list/grid: `sheenappsai/src/components/dashboard/project-grid.tsx`
- Workspace simplification plan: `WORKSPACE_SIMPLIFICATION_PLAN.md`
- UX plan: `UX_ACTION_PLAN_JAN_2026.md`

### 2) Manage/Run UX (Partial, scattered)
- **Billing dashboard** exists and is fairly complete for AI time/usage (but it is *platform billing*, not the user’s business performance).
- **Referral dashboard** exists for partner program.
- **Advisor dashboards** exist (availability, earnings, consultations, analytics) but serve advisors—not business owners.
- **Admin dashboards** and analytics appear in docs and some admin routes, likely internal or platform‑level.

**Evidence (examples):**
- Billing dashboard UI: `sheenappsai/src/components/dashboard/billing-content.tsx`
- Referral dashboard: `sheenappsai/src/components/referral/partner-dashboard.tsx`
- Advisor dashboards: `sheenappsai/src/app/[locale]/advisor/dashboard/*`
- Admin analytics components: `sheenappsai/src/app/admin/ab-testing/page.tsx`

### 3) Backend & Packages (Strong primitives, not assembled)
We already have SDKs and backend primitives that can power a business‑run experience:
- **Analytics SDK**: `sheenapps-packages/analytics/README.md`
- **Payments SDK**: `sheenapps-packages/payments/README.md`
- **Notifications SDK**: `sheenapps-packages/notifications/README.md`
- **Realtime SDK**: `sheenapps-packages/realtime/README.md`
- Worker has rich capabilities (queueing, builds, deployment, billing/usage endpoints) and documented admin endpoints.

This suggests the platform already has **critical building blocks** for operational dashboards, but lacks a **unified “Run” UX** and a **business signals layer** to surface insights and control.

### 4) Templates Package (Opt‑in build accelerator)
The templates library is a **shared, type-safe template system** used by both Next.js and the worker. It includes 12 pre-configured templates (8 free, 4 PRO) with deterministic scaffolds, budgets, and token‑efficient prompts. Users can opt into templates via the builder/new flow and still supply their own prompt.

Key capabilities:
- **Scaffolded builds** (pages/entities/flows/roles) → more predictable output
- **Budget controls** (steps/tokens/time) → guardrails for build time
- **PRO gating** server-side → structured errors for upgrades
- **Shared prompt builder** → consistent output across frontend + worker

Why this matters for Run:
- Templates already encode **domain intent** (ecommerce, booking, restaurant, course, SaaS, etc.), which can seed **industry_tag** and default **vertical pack** configuration without new schemas.
- Template metadata + scaffold can inform **default KPIs, events, and UI modules** in Run when users opt in.

Concrete leverage (low effort):
- When a template is chosen, set `industry_tag` and default `kpi_set`/`workflows_enabled`.
- Use template scaffold to preconfigure Run cards (e.g., ecommerce → revenue + checkout funnel; booking → bookings + messages).

Naming guardrail:
- Avoid “template” ambiguity in docs and code comments. Use **builder templates** (this package), **preview templates** (CSS/preview), and **notification/email templates** (messaging) to prevent implementation drift.

---

## Core Gap Analysis

### A) Surface Gap: “Build” is a workspace; “Run” is not
- Users build in a dedicated workspace with clear context.
- **Management experiences are scattered** across billing, referrals, and internal admin views.
- **No single place** answers: “How is my business performing today?”

### B) Data Gap: Business signals are implicit, not explicit
- The system tracks **builds, projects, AI usage**, and some billing data.
- It does **not model or normalize** business signals (customers, orders, products, leads, inventory, content, KPIs).
- Without a shared signals layer, it’s impossible to provide meaningful operational dashboards.

### C) Workflow Gap: No operational tasks/automation
- There’s no explicit notion of **“tasks to run my business”** (e.g., fulfill orders, follow up leads, schedule posts, respond to customer tickets).
- Notifications, jobs, and realtime exist but **aren’t orchestrated** into business workflows.

### D) Ownership Gap: Role‑based dashboards are narrow
- Advisors have a dashboard. Admins have docs and tools. Business owners don’t have a **primary run dashboard**.

---

## Recommendation: Introduce a “Run Hub” + Business Signals Layer

### 1) Product/UX Structure
**Add a top‑level split: Build vs Run**
- **Build**: current workspace (prompt, preview, edit, deploy)
- **Run**: operational dashboard (sales, customers, content, analytics, alerts, tasks)

**Build remains the default entry point, with easy access to Run.**
- When a project has a deployed domain, **Run** becomes accessible via header button.
- Build is where work happens; Run is for monitoring. Users expect to land in their workspace.
- See "UX Design Decisions" section above for full rationale.

**Per‑project management space (not a scary admin panel):**
- Every project gets a **Run Hub** as a “business cockpit.”
- Run starts minimal and only **expands when signals/integrations exist**.

**Mode coverage (strategic intent):**
- **Run is universal** (works for all projects) because it is driven by `business_events`.
- **Easy/Inhouse Mode** delivers the fastest “auto‑filled” Run experience via built‑in SDKs.
- **External/third‑party projects** light up Run once events are sent via SDK or integrations (Stripe, forms, CRM).

**Core Run pages** (Phase 0 MVP = one page):
1) **Overview** only: KPI cards + alerts + next actions
   - “Today”: revenue, new leads/signups, conversion
   - “Needs attention”: failed payments, abandoned checkout, deploy errors
   - “Next actions”: send promo, follow up leads, post update (stubbed)

**Phase 1 unlocks deep links** (not required for MVP):
- **Orders/Sales**, **Customers/Leads**, **Content/Marketing**, **Operations/Tasks**, **Settings/Integrations**

**Quick wins**:
- Add a **Run entry point** in the dashboard and workspace header.
- Use existing analytics/payments SDKs to surface first KPIs.

### 2) Data Architecture (Business Signals Layer)
Start with an **event-first contract**, not a heavy business model:
- **business_events** (append-only, normalized, typed)
- **business_kpi_daily** (rollup table for fast dashboards)

Add a small **universal entity set** (optional in Phase 1): `customer`, `lead`, `order`, `subscription`, `message`, `content_item`.

Later, project orders/customers/products **as derived views** rather than foundation tables unless a project explicitly enables a commerce module.

This keeps the system flexible across verticals (salon, SaaS, restaurant, courses) while delivering KPIs quickly.

**Business views vs DB explorer (two layers):**
- **Layer 1 (default):** Business views (Orders, Customers/Leads, Messages, Content) with filters/search.
- **Layer 2 (advanced):** DB Explorer for raw tables/records (read‑first, gated edits).

### 3) Event & Analytics Pipeline
We already have analytics SDK and event coordination for dashboard usage. Extend:
- Standardize **business events** (payment, lead, signup, subscription, refund, booking)
- Create **aggregation jobs** (daily/weekly summaries)
- Provide **user-facing analytics** in Run Hub

### 4) Workflow Layer
Leverage existing `jobs` + `notifications` + `realtime` packages:
- **Scheduled jobs** for reminders and reports
- **Notifications** for operational alerts (failed payments, low inventory)
- **Realtime feed** for live updates

### 5) Role-based UX
Introduce explicit roles:
- **Owner**: KPI + operations control
- **Team member**: limited operational tasks
- **Advisor**: current advisor dashboard stays separate
- **Admin**: internal platform dashboard

---

## Implementation Roadmap

### Phase 0 (2–3 weeks) — "Run Entry Point + One-Page Overview"
- Add **Run Hub entry point** in user dashboard and workspace header ✅
- Add **Run page header with navigation** (project name, mode indicator, Edit button) ✅
- Ship **Overview-only** page with: ✅
  - Today: revenue, new leads/signups, conversion (event-based) ✅
    - **Conversion (Phase 0):** `lead_created / sessions` (default) or `payment_succeeded / sessions` if commerce-enabled
  - Needs attention: failed payments, abandoned checkout, deploy/build errors ✅
  - Next actions: stub actions (send promo, follow up leads, post update) ✅
- **Enhanced UI polish** ✅
  - KPI cards with icons and industry-specific labels
  - Alerts with icons, color coding, and timestamps
  - Interactive stub buttons for next actions
  - First-run empty state with encouraging messaging

### Phase 1 (4–6 weeks) — “Events + Sales View”
- Add **business_events** + **business_kpi_daily**
- Connect payments webhooks → emit `payment_succeeded`, `refund_issued`
- Add Sales/Orders dashboard as **derived projections** (views/tables)

### Phase 2 (6–10 weeks) — “Customer + Automation”
- Customer/Lead dashboards using analytics + forms + email packages
- Task/automation engine (scheduled jobs + notifications)

### Phase 3 (10+ weeks) — “Vertical templates”
- Industry‑specific dashboards (e.g., salons, e‑commerce, SaaS)
- Provide tailored KPIs and workflows

---

## Architectural Notes (How to use what you already have)

### Leverage existing assets
- **Analytics SDK** for KPIs and event funnels (`sheenapps-packages/analytics`)
- **Payments SDK** for revenue + orders (`sheenapps-packages/payments`)
- **Notifications** for alerts (`sheenapps-packages/notifications`)
- **Realtime** for live feed (`sheenapps-packages/realtime`)
- **Worker** for aggregation jobs + scheduled reporting

### Suggested service boundaries (worker)
- `business-events` service: canonical event ingestion
- `analytics-aggregator` job: daily KPIs
- `payments-webhooks` service: Stripe webhook ingestion → business_events
- `alerts` service: evaluate thresholds → notify

### Platform activity vs business events (recommended separation)
- Keep **platform activity** (builds, deploys, admin actions) in the existing activity log.
- Add **business_events** for domain signals, then **merge in the UI** for a unified “Recent activity” feed.
- Run Overview consumes both streams for activity, but computes KPIs only from **business_events**.

---

## Key UX Principles for Run Hub
1) **Outcome‑first**: show “Money, Customers, Growth, Issues” first
2) **Actionable**: every card offers an action (send message, fix, promote)
3) **Low‑jargon**: match Arabic‑first tone (use current UX guidelines)
4) **Progressive disclosure**: start simple, unlock advanced

---

## Event Contract v1 (MVP)
**Goal:** keep it tiny, stable, and extensible. Append-only + idempotent.

**Core events** (v1):
- `lead_created`
- `signup`
- `checkout_started`
- `payment_succeeded`
- `refund_issued`
- `subscription_started`
- `subscription_canceled`
- `booking_requested` (optional)
- `message_received`
- `content_published`

**Required fields**:
- `project_id`, `event_type`, `occurred_at`, `source`, `payload`, `idempotency_key`

**Recommended fields**:
- `actor_type`, `actor_id`, `entity_type`, `entity_id`, `correlation_id`

**Custom events**:
- Namespaced as `custom.<vertical>.<event>`

**Event sources**:
- App SDK events
- Stripe webhooks
- Internal platform signals (bridged into Run as “Needs attention” only)

**Retention + privacy**:
- Raw `business_events` retained for 90 days; rollups retained indefinitely
- PII in `payload` should be minimized or hashed where possible

**Idempotency**:
- `idempotency_key` must be unique per `(project_id, source, event_type, idempotency_key)` **forever**
- Keys should be naturally unique where possible (e.g., Stripe event id)

Event ingestion ownership:
- Require **project-scoped keys** (public for SDK, server for backends/webhooks)
- Rate-limit per project + source
- All events must include `project_id` and pass auth validation

Event governance (non‑negotiable):
- **Core event list frozen (v1)** with explicit required fields
- **Schema versioning** (`schema_version`) for safe evolution
- **PII policy** enforced at ingestion (hash/redact where possible)

---

## Minimal Schema: business_events + rollups (proposed)

**business_events** (append-only)
```sql
CREATE TABLE IF NOT EXISTS business_events (
  id               BIGSERIAL PRIMARY KEY,
  public_id        UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL,
  event_type       TEXT NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL,
  received_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source           TEXT NOT NULL, -- sdk | webhook | server | manual

  actor_type       TEXT NULL,
  actor_id         TEXT NULL,
  entity_type      TEXT NULL,
  entity_id        TEXT NULL,

  session_id       TEXT NULL,
  anonymous_id     TEXT NULL,
  correlation_id   TEXT NULL,
  idempotency_key  TEXT NOT NULL,
  schema_version   SMALLINT NOT NULL DEFAULT 1,

  payload          JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Idempotency (required)
CREATE UNIQUE INDEX IF NOT EXISTS business_events_idem
  ON business_events (project_id, source, event_type, idempotency_key);

-- Query indexes
CREATE INDEX IF NOT EXISTS business_events_project_time
  ON business_events (project_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS business_events_project_type_time
  ON business_events (project_id, event_type, occurred_at DESC);
```

**business_kpi_daily** (rollup)
```sql
CREATE TABLE IF NOT EXISTS business_kpi_daily (
  project_id          UUID NOT NULL,
  date               DATE NOT NULL,
  currency_code      CHAR(3) NOT NULL, -- project default currency

  sessions            INTEGER NOT NULL DEFAULT 0,
  leads               INTEGER NOT NULL DEFAULT 0,
  signups             INTEGER NOT NULL DEFAULT 0,
  payments            INTEGER NOT NULL DEFAULT 0,
  refunds             INTEGER NOT NULL DEFAULT 0,

  revenue_cents       BIGINT NOT NULL DEFAULT 0,
  refunds_cents       BIGINT NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (project_id, date)
);
```

Notes:
- KPIs should be computed **only** from `business_events`.
- Store currency in event payload; convert to a **project default currency** during rollup.
- Rollups computed by `occurred_at` in **project timezone**; late events backfill up to **7 days**.
- If sessions are missing, conversion should be hidden or shown as “—” (not 0%).

---

## Run Overview Spec (Phase 0)

**Layout:**
1) **Today** (KPI cards)
2) **Needs attention** (alerts)
3) **Next actions** (stub actions)

**KPI cards + formulas:**
- **Revenue (today):** sum of `payment_succeeded.amount` for `occurred_at` today
- **New leads:** count of `lead_created` today
- **New signups:** count of `signup` today
- **Conversion:**
  - default: `lead_created / sessions` (same day)
  - commerce-enabled: `payment_succeeded / sessions`
  - if sessions missing, hide or show “—”

**Needs attention (sources):**
- Failed Stripe payments (`payment_failed` or webhook failure list)
- Abandoned checkouts (`checkout_started` without `payment_succeeded` within 24h)
- Deploy/build errors (platform activity stream)
- Alert rules (threshold-based, e.g., refund spike)

**Next actions (stub actions in Phase 0):**
- Send promo (placeholder action)
- Follow up leads (placeholder action)
- Post update (placeholder action)

**Data sources:**
- business_events + business_kpi_daily (KPIs)
- project_build_events / platform activity (deploy/build errors)

---

## Analytics SDK Injection Checklist (generated apps)

**Goal:** guarantee session tracking so conversion KPIs are reliable.

**Where to inject (by framework):**
- **Next.js App Router**: `src/app/layout.tsx` (init) + `usePathname()` listener for `analytics.page()`
- **Next.js Pages Router**: `src/pages/_app.tsx` (init) + router events for `analytics.page()`
- **Vite/React**: `src/main.tsx` (init) + `useEffect` in root for route changes
- **Static HTML fallback**: add a small `<script>` to init analytics + `analytics.page(location.pathname)`

**Checklist (builder templates + generator):**
- [ ] Add `@sheenapps/analytics` dependency to generated app
- [ ] Inject analytics client init with `NEXT_PUBLIC_SHEEN_PK`
- [ ] Auto-track `page` events on route changes
- [ ] Emit core events where applicable (lead_created, signup, checkout_started)
- [ ] Persist `session_id`/`anonymous_id` in browser storage
- [ ] Ensure Easy Mode templates include analytics by default

**Where to enforce in pipeline:**
- Worker prompt scaffolding includes analytics usage snippet (SDK context)
- Post-processing step injects analytics bootstrap when missing
- Template selection sets `industry_tag` + default event mapping for Run

---

## Vertical Packs (Configuration, not schema)
**Principle:** Industry = configuration, not schema. Packs *extend* the core without forking the data model.

**Pack contents**:
- Recommended KPIs (which cards show)
- Recommended events (mapped from core)
- Recommended workflows (tasks/alerts)
- Recommended UI modules (cards/tables)
- Optional extra entities (only if truly needed)

**Per‑project configuration**:
- `industry_tag` (salon, ecommerce, coaching, services, etc.)
- `kpi_set` (which cards show)
- `event_mapping` (how events are interpreted)
- `workflows_enabled` (alerts/tasks on/off)

**What not to do (yet)**:
- Don’t create vertical-specific tables like appointments/inventory/shipments on day 1
- Don’t promise vertical dashboards until real usage validates the KPIs

**Phased rollout**:
- **Phase 0–1**: generic event-driven Run Hub + payments + leads
- **Phase 2**: ship 2 vertical packs max (likely ecommerce + services/salon)
- **Phase 3**: scale packs once usage proves which metrics/actions matter

---

## Risks & Mitigations
- **Risk:** Event taxonomy sprawl
  - **Mitigation:** Freeze core v1 list; allow custom namespaced events only
- **Risk:** Multi‑tenant analytics performance
  - **Mitigation:** Append-only events + rollups; index `(project_id, occurred_at)` and `(project_id, event_type, occurred_at)`; never compute KPIs live from raw events in UI
- **Risk:** UX overload for non‑technical users
  - **Mitigation:** Keep Run Hub summary minimal; hide advanced sections
- **Risk:** Confusion between platform billing and business revenue
  - **Mitigation:** Separate “SheenApps Billing” (account) from “Business Revenue” (project/run)
- **Risk:** Missing session tracking breaks conversion KPI
  - **Mitigation:** Ensure templates/default app shell auto‑track sessions via analytics SDK; define fallback denominator if sessions unavailable
- **Risk:** Easy Mode drops template metadata → Run defaults lost
  - **Mitigation:** Persist templateId/category in project config for Easy Mode projects
- **Risk:** KPIs derived from mixed sources
  - **Mitigation:** KPIs come **only** from `business_events` rollups (source‑of‑truth rule)

---

## Concrete Next Steps
1) Confirm **Run Overview** layout (Today / Needs attention / Next actions)
2) Finalize **Event Contract v1** + idempotency rules
3) Add **business_events** ingestion endpoint + nightly rollup job
4) Build **Overview dashboard** from analytics + payments events
5) Add **Run entry point** into dashboard + workspace and promote Run for live projects

---

## Platform Scan Notes (2026-01-26)
- **Analytics SDK exists**, but there is no obvious guarantee that generated apps/templates auto‑track sessions. Conversion KPIs depend on this; ensure SDK injection or a fallback denominator.
- **Inhouse analytics/payment routes exist** in the worker; these can be adapted/aliased to `business_events` ingestion to avoid duplicating infra.
- **Build event stream exists** (project_build_events + SSE). This is ideal for “Needs attention” (deploy/build errors) but should not contribute to KPIs.
- **Templates are wired in Pro flow** (templateId + templateData); Easy Mode currently drops template metadata in responses—persist this for Run defaults.

## Platform Scan Additions (Auth, RLS, Quotas, Multi‑tenant)
- **RLS patterns are established** in Next.js (`auth-rls` + RLS-based project access). Run data endpoints should follow the same RLS context patterns to avoid bypassing tenant isolation.
- **Worker uses HMAC + signed actor** for inhouse routes; any new `business_events` ingestion endpoints should either use the same HMAC pattern or be fronted by the Next.js proxy with signed user/project context.
- **Quota / rate limiting exists** in worker routes (usage limits, token bucket limits). Business event ingestion should be rate-limited per project + source to prevent noisy events from tanking Run metrics.
- **Project-scoped authorization helpers exist** (`projectAccess`, `projectAuth`). Reuse these to validate `project_id` on new Run endpoints.

## Source Highlights (files reviewed)
- `WORKSPACE_SIMPLIFICATION_PLAN.md`
- `UX_ACTION_PLAN_JAN_2026.md`
- `sheenappsai/src/components/dashboard/dashboard-content.tsx`
- `sheenappsai/src/components/dashboard/project-grid.tsx`
- `sheenappsai/src/components/dashboard/billing-content.tsx`
- `sheenappsai/src/app/[locale]/advisor/dashboard/*`
- `sheenapps-packages/analytics/README.md`
- `sheenapps-packages/payments/README.md`
- `sheenapps-packages/notifications/README.md`
- `sheenapps-packages/realtime/README.md`
