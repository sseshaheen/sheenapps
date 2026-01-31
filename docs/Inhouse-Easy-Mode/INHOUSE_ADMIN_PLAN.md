# In-House Mode Admin Panel Plan

> Admin features for managing In-House Mode SDK services, integrated into the existing SheenApps admin panel.

**Note**: This was originally named "Easy Mode" but renamed to "In-House Mode" for consistency with the codebase naming conventions.

**Created**: 2026-01-24
**Updated**: 2026-01-28 (Sprint 5 detailed plan created)
**Status**: Sprint 1-4/6 complete. Sprint 5 (Advanced Support) planned → see [INHOUSE_SPRINT5_SUPPORT_PLAN.md](./INHOUSE_SPRINT5_SUPPORT_PLAN.md)

---

## Implementation Progress

### Sprint 1: Foundation ✅ COMPLETE (2026-01-25)
| Task | Status | Notes |
|------|--------|-------|
| Database migration (activity log, usage events, etc.) | ✅ | `20260125_inhouse_admin_infrastructure.sql` |
| Worker routes: adminInhouseProjects.ts | ✅ | List, details, suspend/unsuspend |
| Worker routes: adminInhouseActivity.ts | ✅ | Project activity, global activity, errors |
| Next.js API: /api/admin/inhouse/projects | ✅ | Full proxy routes created |
| Admin UI: Projects list page | ✅ | `InhouseProjectsList.tsx` component |
| Admin UI: Project details page | ✅ | `InhouseProjectDetails.tsx` with tabs |
| Admin navigation | ✅ | Added to `AdminNavigationMobile.tsx` |
| Permissions setup (inhouse.*) | ✅ | Using `inhouse.read` and `inhouse.write` |
| Activity log writes from services | ✅ | Integrated into auth, storage, jobs, email, payments, backups |
| Activity log retention job | ⏸️ | Disabled - preserving data for future archival |

#### Files Created in Sprint 1:
**Database:**
- `sheenappsai/supabase/migrations/20260125_inhouse_admin_infrastructure.sql`

**Worker Routes:**
- `sheenapps-claude-worker/src/routes/adminInhouseProjects.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseActivity.ts`

**Activity Logger Service:**
- `sheenapps-claude-worker/src/services/inhouse/InhouseActivityLogger.ts` - Fire-and-forget activity logging
- Integrated into: `inhouseStorage.ts`, `inhouseJobs.ts`, `inhouseEmail.ts`

**Scheduled Jobs:**
- Modified `sheenapps-claude-worker/src/jobs/scheduledJobs.ts` - Activity log cleanup (disabled, pending archival strategy)

**Utilities:**
- Created `sheenapps-claude-worker/src/utils/dbTimeout.ts` - Safe statement timeout helper with SET LOCAL

#### Code Review Fixes (2026-01-25):
| Issue | Status | Notes |
|-------|--------|-------|
| `type = 'easy_mode'` bug | ✅ Fixed | Changed to `infra_mode = 'easy'` (the `type` column doesn't exist!) |
| Magic link verify rate limit | ✅ Added | 30 attempts per 10 min per IP |
| Magic link verify activity log | ✅ Added | Logs `magic_link_verified` on success |
| statement_timeout pooling issue | 🔲 Deferred | Helper created but routes not yet refactored |
| Cursor pagination for activity | 🔲 Deferred | Offset pagination OK for MVP |
| Queue restores instead of async | 🔲 Deferred | Works for now, queue later |

**Next.js API Routes:**
- `sheenappsai/src/app/api/admin/inhouse/projects/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/suspend/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/unsuspend/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/activity/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/activity/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/activity/errors/route.ts`

**Admin UI Pages:**
- `sheenappsai/src/app/admin/inhouse/projects/page.tsx`
- `sheenappsai/src/app/admin/inhouse/projects/[projectId]/page.tsx`
- `sheenappsai/src/app/admin/inhouse/activity/page.tsx`

**Admin UI Components:**
- `sheenappsai/src/components/admin/InhouseProjectsList.tsx`
- `sheenappsai/src/components/admin/InhouseProjectDetails.tsx`
- `sheenappsai/src/components/admin/InhouseActivityDashboard.tsx`

### Phase 3C Admin Features ✅ COMPLETE (2026-01-26)
| Task | Status | Notes |
|------|--------|-------|
| AI Admin Routes | ✅ | Usage stats, requests list, errors, by-model breakdown |
| Realtime Admin Routes | ✅ | Stats, channels list, usage log |
| Notifications Admin Routes | ✅ | Stats, notifications list, templates, preferences |
| ActivityLogger services update | ✅ | Added 'ai', 'realtime', 'notifications' to valid services |
| Route registration | ✅ | All 3 routes registered in server.ts |

#### Files Created in Phase 3C Admin:
**Worker Routes:**
- `sheenapps-claude-worker/src/routes/adminInhouseAI.ts` - AI usage stats, requests, errors, by-model/operation breakdown
- `sheenapps-claude-worker/src/routes/adminInhouseRealtime.ts` - Realtime stats, channels, usage log
- `sheenapps-claude-worker/src/routes/adminInhouseNotifications.ts` - Notification stats, list, templates, user preferences

**API Endpoints Added:**
AI Admin:
- `GET /v1/admin/inhouse/ai/usage` - Global AI usage stats
- `GET /v1/admin/inhouse/ai/requests` - List AI requests with filters
- `GET /v1/admin/inhouse/ai/errors` - Recent AI errors
- `GET /v1/admin/inhouse/projects/:projectId/ai/usage` - Project AI usage

Realtime Admin:
- `GET /v1/admin/inhouse/realtime/stats` - Global realtime stats
- `GET /v1/admin/inhouse/projects/:projectId/realtime/stats` - Project realtime stats
- `GET /v1/admin/inhouse/projects/:projectId/realtime/channels` - Project channels
- `GET /v1/admin/inhouse/projects/:projectId/realtime/usage` - Project usage log

Notifications Admin:
- `GET /v1/admin/inhouse/notifications/stats` - Global notification stats
- `GET /v1/admin/inhouse/projects/:projectId/notifications` - List notifications
- `GET /v1/admin/inhouse/projects/:projectId/notifications/stats` - Project notification stats
- `GET /v1/admin/inhouse/projects/:projectId/notifications/templates` - List templates
- `GET /v1/admin/inhouse/projects/:projectId/notifications/preferences` - List user preferences

### Sprint 2A: Forms + Search Admin ✅ COMPLETE (2026-01-26)
| Task | Status | Notes |
|------|--------|-------|
| Worker routes: adminInhouseForms.ts | ✅ | Forms list + submissions list + submission status update |
| Worker routes: adminInhouseSearch.ts | ✅ | Search indexes list + query log list |
| Next.js API: /api/admin/inhouse/projects/:projectId/forms* | ✅ | Proxy routes created |
| Next.js API: /api/admin/inhouse/projects/:projectId/search* | ✅ | Proxy routes created |
| Admin UI: Project details tabs | ✅ | Added Forms + Search tabs in `InhouseProjectDetails.tsx` |
| Admin exports | ✅ | Forms submissions + search queries (CSV/JSON) |
| Admin audit logging | ✅ | `log_inhouse_admin_action` used for all new admin routes |

**Worker Routes Added:**
- `sheenapps-claude-worker/src/routes/adminInhouseForms.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseSearch.ts`

**API Endpoints Added:**
Forms Admin:
- `GET /v1/admin/inhouse/projects/:projectId/forms` - List forms + submission counts
- `GET /v1/admin/inhouse/projects/:projectId/forms/submissions` - List submissions (filters)
- `PATCH /v1/admin/inhouse/projects/:projectId/forms/submissions/:submissionId` - Update submission status
- `GET /v1/admin/inhouse/projects/:projectId/forms/submissions/export` - Export submissions (CSV/JSON)

Search Admin:
- `GET /v1/admin/inhouse/projects/:projectId/search/indexes` - List search indexes
- `GET /v1/admin/inhouse/projects/:projectId/search/queries` - List query logs
- `GET /v1/admin/inhouse/projects/:projectId/search/queries/export` - Export query logs (CSV/JSON)

**Next.js API Routes Added:**
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/forms/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/forms/submissions/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/forms/submissions/[submissionId]/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/search/indexes/route.ts`
- `sheenappsai/src/app/api/admin/inhouse/projects/[projectId]/search/queries/route.ts`

**Admin UI Updates:**
- `sheenappsai/src/components/admin/InhouseProjectDetails.tsx` (Forms + Search tabs)

### Sprint 2B: Backups + Jobs + Emails Admin ✅ COMPLETE (2026-01-26)
| Task | Status | Notes |
|------|--------|-------|
| Worker routes: adminInhouseBackups.ts | ✅ | Backups list, trigger, preview, restore, restores list |
| Worker routes: adminInhouseJobs.ts | ✅ | Jobs list/details + cancel/retry + schedules list |
| Worker routes: adminInhouseEmails.ts | ✅ | Email stats + list + details |
| Next.js API proxies | ✅ | `/api/admin/inhouse/backups*`, `/jobs*`, `/emails*` |
| Admin UI pages | ✅ | `/admin/inhouse/backups`, `/admin/inhouse/jobs`, `/admin/inhouse/emails` |
| Admin navigation | ✅ | Added to desktop + mobile nav |
| Worker routes: adminInhouseStorage.ts | ✅ | Storage usage + file list + delete |
| Next.js API: /api/admin/inhouse/storage* | ✅ | Storage usage + file management proxies |
| Admin UI: /admin/inhouse/storage | ✅ | Storage usage + file list/delete |
| Worker routes: adminInhousePayments.ts | ✅ | Payments events + customers list |
| Next.js API: /api/admin/inhouse/payments* | ✅ | Payments events + customers proxies |
| Admin UI: /admin/inhouse/payments | ✅ | Payments events + customers view |
| Worker routes: adminInhouseAuth.ts | ✅ | Users list + sessions list + force logout/reset |
| Next.js API: /api/admin/inhouse/auth* | ✅ | Auth users + sessions + action proxies |
| Admin UI: /admin/inhouse/auth | ✅ | Users + sessions management |
| Email resend/bounces/suppressions | ✅ | Resend + bounce/suppression lists + clear |
| Jobs DLQ + bulk controls | ✅ | DLQ list + retry preview + retry-all |

**Worker Routes Added:**
- `sheenapps-claude-worker/src/routes/adminInhouseBackups.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseJobs.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseEmails.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseStorage.ts`
- `sheenapps-claude-worker/src/routes/adminInhousePayments.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseAuth.ts`

**Worker Migrations Added:**
- `sheenapps-claude-worker/migrations/128_inhouse_email_admin_extras.sql`

**Next.js API Routes Added:**
- `sheenappsai/src/app/api/admin/inhouse/backups/**`
- `sheenappsai/src/app/api/admin/inhouse/restores/**`
- `sheenappsai/src/app/api/admin/inhouse/jobs/**`
- `sheenappsai/src/app/api/admin/inhouse/emails/**`
- `sheenappsai/src/app/api/admin/inhouse/storage/**`
- `sheenappsai/src/app/api/admin/inhouse/payments/**`
- `sheenappsai/src/app/api/admin/inhouse/auth/**`

**Admin UI Components Added:**
- `sheenappsai/src/components/admin/InhouseBackupsAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseJobsAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseEmailsAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseStorageAdmin.tsx`
- `sheenappsai/src/components/admin/InhousePaymentsAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseAuthAdmin.tsx`

### Sprint 3: Monitoring + Usage + Analytics ✅ COMPLETE (2026-01-26)
| Task | Status | Notes |
|------|--------|-------|
| Monitoring health endpoints | ✅ | `/v1/admin/inhouse/monitoring/*` |
| Usage dashboard endpoints | ✅ | `/v1/admin/inhouse/usage/*` |
| Quota management endpoints | ✅ | `/v1/admin/inhouse/quotas/*` |
| Analytics admin endpoints | ✅ | `/v1/admin/inhouse/analytics/*` |
| Admin UI: Monitoring/Usage/Quotas/Analytics | ✅ | New admin pages + components |

**Worker Routes Added:**
- `sheenapps-claude-worker/src/routes/adminInhouseMonitoring.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseUsage.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseAnalytics.ts`

**Next.js API Routes Added:**
- `sheenappsai/src/app/api/admin/inhouse/monitoring/**`
- `sheenappsai/src/app/api/admin/inhouse/usage/**`
- `sheenappsai/src/app/api/admin/inhouse/quotas/**`
- `sheenappsai/src/app/api/admin/inhouse/analytics/**`

**Admin UI Components Added:**
- `sheenappsai/src/components/admin/InhouseMonitoringAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseUsageAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseQuotasAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseAnalyticsAdmin.tsx`

### Sprint 4/6: Revenue + Alerts + Secrets ✅ COMPLETE (2026-01-26)
| Task | Status | Notes |
|------|--------|-------|
| Revenue reporting endpoints | ✅ | `/v1/admin/inhouse/revenue/*` |
| Alert rules + active/history | ✅ | `/v1/admin/inhouse/alerts/*` |
| Secrets admin (audit-only) | ✅ | `/v1/admin/inhouse/secrets/*` |
| Admin UI: Revenue/Alerts/Secrets | ✅ | New admin pages + components |

**Worker Routes Added:**
- `sheenapps-claude-worker/src/routes/adminInhouseRevenue.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseAlerts.ts`
- `sheenapps-claude-worker/src/routes/adminInhouseSecrets.ts`

**Next.js API Routes Added:**
- `sheenappsai/src/app/api/admin/inhouse/revenue/**`
- `sheenappsai/src/app/api/admin/inhouse/alerts/**`
- `sheenappsai/src/app/api/admin/inhouse/secrets/**`

**Admin UI Components Added:**
- `sheenappsai/src/components/admin/InhouseRevenueAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseAlertsAdmin.tsx`
- `sheenappsai/src/components/admin/InhouseSecretsAdmin.tsx`

### Sprint 2-6: In Progress
See Implementation Priority section below.

---

## Notes & Discoveries (2026-01-26)
- **Forms submissions status** uses `unread/read/archived/spam/deleted` (see `126_inhouse_forms_search_fixes.sql`). Admin UI filters follow this.
- **Admin views show raw submission data** (PII visible). Redaction intentionally deferred for now.
- **Search query logs** are used for admin visibility; no additional analytics rollups yet.
- **Forms/Search admin routes** follow the same audit logging pattern as existing admin routes.
- **Auth admin endpoints** now expose user + session visibility with force logout/reset actions (audit logged).
- **Email admin now stores rendered content** (html/text) and uses `inhouse_email_suppressions` for bounce/suppression views.
- **Usage/Quotas dashboards** read from `inhouse_usage_events` and `inhouse_quotas` (adjustments recorded as admin events).
- **Revenue reporting** currently derives MRR/ARR from `billing_subscriptions` joined via in-house project owners (assumes one billing customer per owner).
- **Secrets admin** is audit-only; no secret values or encrypted payloads are ever returned.

---

## Future Improvements (Discovered During Implementation)

### 1. Profiles Table Abstraction
The plan recommends using a `profiles` table instead of joining `auth.users` directly. Currently:
- Existing codebase queries `auth.users` directly
- Admin tables reference `auth.users(id)` with TODO comments
- **Action needed**: Create `profiles` table with trigger to sync from `auth.users`

### 2. Activity Log Integration with Services ✅ COMPLETE
The `inhouse_activity_log` table is created and `InhouseActivityLogger.ts` service is implemented:
- ✅ `inhouseStorage.ts` - signed_upload_created, files_deleted
- ✅ `inhouseJobs.ts` - enqueue
- ✅ `inhouseEmail.ts` - send
- ✅ `inhouseAuth.ts` - sign_up, sign_in, sign_out
- ✅ `inhousePayments.ts` - checkout_created, customer_created, subscription_cancelled, webhook_received
- ✅ `inhouseBackups.ts` - backup_created, backup_deleted, restore_initiated, restore_rolled_back
- ⏭️ `inhouseAnalytics.ts` - Skipped (analytics IS the logging mechanism; would be redundant/circular)
- ⏭️ `inhouseSecrets.ts` - Skipped (secrets access logging handled separately for security audit requirements)

### 3. Activity Log Retention Job ⏸️ DISABLED
Implemented in `scheduledJobs.ts` but **disabled** to preserve historical data:
- Original schedule: 3:15 AM UTC daily, 30-day retention
- **Status**: Disabled pending archival strategy implementation
- TODO: Implement tiered retention or cold storage archival before re-enabling

### 4. Missing Permissions Configuration
The `inhouse.read` and `inhouse.write` permissions are used but may need to be:
- Added to default admin role permissions
- Documented in admin permissions management

---

## Expert Review Notes (2026-01-24)

Key refinements based on expert feedback:

1. **Don't join `auth.users` directly** - Use app-level `profiles` table instead ✅
2. **Single activity event stream** - Added `inhouse_activity_log` table ✅
3. **DB-enforced read-only for query tool** - Dedicated read-only role + statement_timeout ✅
4. **Impersonation constraints** - Route allowlist + stricter scope/TTL ✅
5. **Jobs blast-radius controls** - Rate limits + dry-run for bulk operations ✅
6. **Don't build Datadog** - Focus on actionable signals, link to external observability ✅
7. **Usage adjustment events** - Store events instead of resetting counters ✅
8. **Sprint reorder** - Backups first (existential), then Jobs/Email ✅

**Round 2 fixes** (2026-01-24):
9. **All admin FK references use `profiles(id)`** - Fixed quota_overrides, alert_rules, alerts ✅
10. **Activity log file comment updated** - No longer "aggregation", now queries single table ✅
11. **Query tool schema isolation** - Added `SET search_path` + project schema validation ✅
12. **Activity log retention plan** - Added Option A (partitions) and B (nightly cleanup) ✅
13. **Worker route naming** - Changed `/email` to `/emails` for consistency ✅

---

## Executive Summary

The In-House Mode SDK has 9 fully implemented services (auth, db, storage, jobs, email, payments, analytics, secrets, backups) but **zero admin visibility**. This plan adds comprehensive admin tooling for:

1. **Customer Support** - Debug issues, fix stuck jobs, resend emails
2. **Operations Monitoring** - Service health, error rates, queue depths
3. **Billing/Usage** - Usage tracking, quota management, revenue reporting

All features integrate into the existing admin panel, reusing auth/permissions/UI patterns.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Existing Admin Panel                         │
├─────────────────────────────────────────────────────────────────┤
│  Users │ Advisors │ Support │ Finance │ Flags │ In-House Mode (NEW) │
└─────────────────────────────────────────────────────────────────┘
                                              │
                   ┌──────────────────────────┴──────────────────────────┐
                   │                In-House Mode Admin                       │
                   ├──────────────────────────────────────────────────────┤
                   │  Projects │ Services │ Monitoring │ Usage │ Support │
                   └──────────────────────────────────────────────────────┘
```

### Integration Points

| Component | Approach |
|-----------|----------|
| **Authentication** | Reuse existing admin JWT + `requireAdmin()` |
| **Permissions** | Add `inhouse.*` permission namespace |
| **UI Components** | Reuse existing admin UI components |
| **API Routes** | Add under `/api/admin/inhouse/*` |
| **Worker Routes** | Add under `/v1/admin/inhouse/*` |
| **Audit Logging** | Use existing `rpc_log_admin_action()` |

### New Permission Namespace

```typescript
// In-House Mode admin permissions
'inhouse.read'           // View projects, usage, logs
'inhouse.write'          // Modify quotas, trigger actions
'inhouse.support'        // Support tools (impersonation, debug)
'inhouse.billing'        // Revenue reports, quota overrides
'inhouse.*'              // All In-House Mode permissions
```

---

## Phase 1: Projects Dashboard (Foundation)

**Goal**: Multi-tenant visibility into all In-House Mode projects.

### 1.1 Projects List Page

**Route**: `/admin/inhouse/projects`

**Features**:
- Search projects by ID, name, owner email
- Filter by status (active, suspended, deleted)
- Filter by plan (free, starter, pro, enterprise)
- Sort by created date, last activity, storage usage
- Quick actions: view details, suspend, unsuspend

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────────┐
│ In-House Mode Projects                              [Search...] [🔍] │
├─────────────────────────────────────────────────────────────────┤
│ Filter: [All Plans ▼] [All Status ▼] [Sort: Last Active ▼]     │
├───────────────────────────────────────────────────────────────────
│ Project              │ Owner          │ Plan    │ Status  │ Actions │
├───────────────────────────────────────────────────────────────────
│ my-saas-app          │ john@...       │ Pro     │ Active  │ [View]  │
│ arabic-store         │ ahmed@...      │ Starter │ Active  │ [View]  │
│ test-project         │ test@...       │ Free    │ Suspended│ [View] │
└───────────────────────────────────────────────────────────────────
```

**API Endpoints**:

```typescript
// Worker route
GET /v1/admin/inhouse/projects
  Query: ?search=&plan=&status=&sortBy=&sortDir=&limit=&offset=
  Returns: { projects: [...], total, hasMore }

// Next.js proxy
GET /api/admin/inhouse/projects
```

**Database Query**:
```sql
-- IMPORTANT: Use profiles table, NOT auth.users (Supabase internal)
-- Assumes profiles table exists with id, email, full_name mirrored from auth
SELECT
  p.id, p.name, p.created_at, p.status,
  pr.email as owner_email, pr.full_name as owner_name,
  bp.name as plan_name,
  iq.storage_bytes, iq.job_runs, iq.email_sends
FROM projects p
JOIN profiles pr ON pr.id = p.owner_id  -- App-level profiles table
LEFT JOIN billing_customers bc ON bc.user_id = p.owner_id
LEFT JOIN billing_plans bp ON bp.id = bc.plan_id
LEFT JOIN inhouse_quotas iq ON iq.project_id = p.id
WHERE p.type = 'inhouse'
  AND (
    p.name ILIKE $search OR
    pr.email ILIKE $search OR
    p.id::text = $search
  )
ORDER BY p.created_at DESC
LIMIT $limit OFFSET $offset;  -- Always cap: max 100
```

> **Architecture Note**: Never join `auth.users` directly. Keep a `profiles` table in public schema synced at signup/update. This decouples admin tooling from Supabase internals.

### 1.2 Project Details Page

**Route**: `/admin/inhouse/projects/[projectId]`

**Sections**:

1. **Overview Card**
   - Project ID, name, created date
   - Owner info (email, name, user ID)
   - Plan and billing status
   - Current status (active/suspended)
   - Quick actions: suspend, unsuspend, delete

2. **Usage Summary**
   - Storage: X / Y GB (progress bar)
   - Emails: X / Y sends (this period)
   - Jobs: X / Y runs (this period)
   - Secrets: X / Y count
   - Backups: X stored, Y GB

3. **Service Status Cards** (one per service)
   - Auth: active sessions, last login
   - Database: row count, last query
   - Storage: file count, total size
   - Jobs: pending, running, failed counts
   - Email: sent, bounced, failed counts
   - Payments: active customers, MRR
   - Analytics: events today, total users
   - Secrets: count, last accessed
   - Backups: last backup, next scheduled

4. **Recent Activity Log** (powered by `inhouse_activity_log`)
   - Last 50 operations across all services
   - Filterable by service type
   - Shows timestamp, operation, status, details
   - Single indexed query (not aggregated from everywhere)

> **Architecture Note**: All services write to a single `inhouse_activity_log` table. This makes "recent activity" a simple indexed query and enables consistent monitoring/alerting.

**API Endpoints**:

```typescript
// Worker route
GET /v1/admin/inhouse/projects/:projectId
  Returns: { project, owner, plan, usage, serviceStatus }

GET /v1/admin/inhouse/projects/:projectId/activity
  Query: ?service=&limit=&offset=
  Returns: { activities: [...], total }

POST /v1/admin/inhouse/projects/:projectId/suspend
  Body: { reason: string }
  Returns: { success }

POST /v1/admin/inhouse/projects/:projectId/unsuspend
  Body: { reason: string }
  Returns: { success }
```

### 1.3 Implementation Files

**Worker**:
```
sheenapps-claude-worker/src/routes/
├── adminInhouseProjects.ts    # Project list + details + actions
└── adminInhouseActivity.ts    # Activity log queries (from inhouse_activity_log table)
```

**Next.js**:
```
sheenappsai/src/app/
├── api/admin/inhouse/
│   ├── projects/
│   │   ├── route.ts           # GET list
│   │   └── [projectId]/
│   │       ├── route.ts       # GET details
│   │       ├── suspend/route.ts
│   │       ├── unsuspend/route.ts
│   │       └── activity/route.ts
└── [locale]/admin/inhouse/
    ├── page.tsx               # Dashboard overview
    └── projects/
        ├── page.tsx           # Projects list
        └── [projectId]/
            └── page.tsx       # Project details
```

---

## Phase 2: Service-Specific Admin Tools

### 2.1 Jobs Admin

**Route**: `/admin/inhouse/jobs`

**Features**:
- List all jobs across all projects
- Filter by project, status, job name
- View job details (payload, attempts, errors)
- Dead letter queue inspection
- Retry failed jobs (with blast-radius controls)
- Cancel pending jobs
- View execution logs

**Blast-Radius Controls** (prevent support tools causing outages):
- Per-project rate limit for admin retries: max 20/min
- Bulk retry requires dry-run preview first
- All bulk actions require reason + logged to audit

**UI Components**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Jobs Queue                              [Project: All ▼] [🔍]   │
├─────────────────────────────────────────────────────────────────┤
│ Status: [All] [Pending] [Running] [Completed] [Failed] [DLQ]    │
├───────────────────────────────────────────────────────────────────
│ Job ID        │ Project    │ Name      │ Status  │ Actions      │
├───────────────────────────────────────────────────────────────────
│ job_abc123    │ my-saas    │ send-email│ Failed  │ [Retry][View]│
│ job_def456    │ arabic-app │ process   │ Running │ [Cancel][View]│
└───────────────────────────────────────────────────────────────────
```

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/jobs
  Query: ?projectId=&status=&name=&limit=&offset=
  Returns: { jobs: [...], total, dlqCount }

GET /v1/admin/inhouse/jobs/:jobId
  Returns: { job, attempts, logs }

POST /v1/admin/inhouse/jobs/:jobId/retry
  Body: { reason: string }
  Returns: { success, newJobId }

POST /v1/admin/inhouse/jobs/:jobId/cancel
  Body: { reason: string }
  Returns: { success }

GET /v1/admin/inhouse/jobs/dlq
  Query: ?projectId=&limit=50&offset=  // Max 100 per page
  Returns: { jobs: [...], total }

POST /v1/admin/inhouse/jobs/dlq/retry-preview
  Body: { projectId?: string }
  Returns: { wouldRetry: 312, byProject: { 'proj-1': 150, 'proj-2': 162 } }

POST /v1/admin/inhouse/jobs/dlq/retry-all
  Body: { projectId?: string, reason: string, confirmCount: number }
  Returns: { retriedCount, failedCount }
  // Requires confirmCount to match preview count (prevents stale retries)
  // Rate limited: max 20 retries/min per project
```

### 2.2 Email Admin

**Route**: `/admin/inhouse/emails`

**Features**:
- Email delivery dashboard (sent, bounced, failed rates)
- Search emails by recipient, project, status
- View email content (rendered template)
- Manual resend capability
- Bounce list management
- Suppression list viewing

**UI Components**:
```
┌─────────────────────────────────────────────────────────────────┐
│ Email Delivery                                                   │
├─────────────────────────────────────────────────────────────────┤
│  📧 Sent: 12,456  │  ✅ Delivered: 12,100  │  ❌ Bounced: 234   │
│  ⏳ Queued: 45    │  📭 Failed: 122       │  🚫 Suppressed: 89  │
├─────────────────────────────────────────────────────────────────┤
│ [Search recipient...] [Project: All ▼] [Status: All ▼]         │
├───────────────────────────────────────────────────────────────────
│ Email ID   │ Project  │ To          │ Template│ Status │ Actions│
├───────────────────────────────────────────────────────────────────
│ em_abc123  │ my-saas  │ user@...    │ welcome │ Sent   │ [View] │
│ em_def456  │ arabic   │ ahmed@...   │ receipt │ Bounced│ [View] │
└───────────────────────────────────────────────────────────────────
```

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/emails/stats
  Query: ?projectId=&period=day|week|month
  Returns: { sent, delivered, bounced, failed, suppressed }

GET /v1/admin/inhouse/emails
  Query: ?projectId=&recipient=&status=&template=&limit=&offset=
  Returns: { emails: [...], total }

GET /v1/admin/inhouse/emails/:emailId
  Returns: { email, renderedContent, deliveryEvents }

POST /v1/admin/inhouse/emails/:emailId/resend
  Body: { reason: string }
  Returns: { success, newEmailId }

GET /v1/admin/inhouse/emails/bounces
  Query: ?projectId=&limit=&offset=
  Returns: { bounces: [...], total }

DELETE /v1/admin/inhouse/emails/bounces/:email
  Body: { reason: string }
  Returns: { success }

GET /v1/admin/inhouse/emails/suppressions
  Query: ?projectId=&limit=&offset=
  Returns: { suppressions: [...], total }
```

### 2.3 Storage Admin

**Route**: `/admin/inhouse/storage`

**Features**:
- Storage usage by project (table + chart)
- Browse project files (tree view)
- Find large files (> 10MB)
- Find orphaned files
- Delete files (with confirmation)
- Storage growth trends

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/storage/usage
  Query: ?sortBy=size|count|growth
  Returns: { projects: [{ id, name, bytes, fileCount, growth30d }] }

GET /v1/admin/inhouse/storage/projects/:projectId/files
  Query: ?prefix=&limit=&cursor=
  Returns: { files: [...], nextCursor }

GET /v1/admin/inhouse/storage/large-files
  Query: ?minSizeBytes=10485760&limit=
  Returns: { files: [...] }

GET /v1/admin/inhouse/storage/orphans
  Returns: { files: [...], totalBytes }

DELETE /v1/admin/inhouse/storage/files
  Body: { paths: string[], reason: string }
  Returns: { deleted, failed }
```

### 2.4 Payments Admin

**Route**: `/admin/inhouse/payments`

**Features**:
- Revenue by project (MRR, total)
- Customer search (by email, Stripe ID)
- Webhook event log
- Failed webhook inspection
- Payment reconciliation
- Refund tracking

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/payments/revenue
  Query: ?period=day|week|month
  Returns: { totalMRR, projectCount, customerCount, revenueByProject }

GET /v1/admin/inhouse/payments/events
  Query: ?projectId=&type=&status=&limit=&offset=
  Returns: { events: [...], total }

GET /v1/admin/inhouse/payments/events/:eventId
  Returns: { event, webhookDeliveries, relatedObjects }

POST /v1/admin/inhouse/payments/events/:eventId/retry
  Body: { reason: string }
  Returns: { success }

GET /v1/admin/inhouse/payments/customers
  Query: ?search=&projectId=&limit=&offset=
  Returns: { customers: [...], total }
```

### 2.5 Backups Admin

**Route**: `/admin/inhouse/backups`

**Features**:
- Backup status across all projects
- Failed backup alerts
- Storage usage by backups
- Trigger manual backup
- Initiate restore (with preview)
- Restore history and rollback

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/backups/status
  Returns: {
    totalProjects,
    backupsToday,
    failedToday,
    storageBytes,
    projectsWithoutBackup
  }

GET /v1/admin/inhouse/backups
  Query: ?projectId=&status=&reason=&limit=&offset=
  Returns: { backups: [...], total }

POST /v1/admin/inhouse/backups/trigger
  Body: { projectId: string, reason: string }
  Returns: { backupId }

GET /v1/admin/inhouse/backups/:backupId/preview
  Query: ?includeDiff=false  // Diff is optional (expensive)
  Returns: {
    tableCounts, rowCounts, sizeBytes,
    diff?: { tables: [...] }  // Top 20 tables only, capped for performance
  }

POST /v1/admin/inhouse/backups/:backupId/restore
  Body: { reason: string, skipValidation?: boolean }
  Returns: { restoreId }

GET /v1/admin/inhouse/restores/:restoreId
  Returns: { restore, progress, validationResults }

POST /v1/admin/inhouse/restores/:restoreId/rollback
  Body: { reason: string }
  Returns: { success }
```

### 2.6 Secrets Admin

**Route**: `/admin/inhouse/secrets`

**Features**:
- Secrets count by project
- Access audit log viewer (redacted values)
- Suspicious access detection
- Last access timestamps
- Rotation status tracking

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/secrets/stats
  Returns: { totalSecrets, projectsWithSecrets, accessesLast24h }

GET /v1/admin/inhouse/secrets/audit
  Query: ?projectId=&action=&limit=&offset=
  Returns: { entries: [...], total }

GET /v1/admin/inhouse/secrets/projects/:projectId
  Returns: { secrets: [{ name, createdAt, lastAccessedAt }] } // No values!

GET /v1/admin/inhouse/secrets/suspicious
  Returns: { alerts: [...] } // Unusual access patterns
```

### 2.7 Analytics Admin

**Route**: `/admin/inhouse/analytics`

**Features**:
- Event volume by project
- Top events (by frequency)
- User count by project
- Data retention status
- Export data (for project)

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/analytics/stats
  Query: ?period=day|week|month
  Returns: { totalEvents, totalUsers, eventsByProject }

GET /v1/admin/inhouse/analytics/top-events
  Query: ?projectId=&limit=
  Returns: { events: [{ name, count }] }

POST /v1/admin/inhouse/analytics/export
  Body: { projectId: string, startDate: string, endDate: string }
  Returns: { exportId, downloadUrl }
```

### 2.8 Database Admin

**Route**: `/admin/inhouse/database`

**Features**:
- Schema viewer (read-only)
- Row counts by table
- Slow query log
- Query inspector (DB-enforced read-only)
- Connection pool status

**CRITICAL: Query Tool Security**

The query tool accepts SQL text from admins. Regex filtering is NOT sufficient security.

**DB-Enforced Read-Only** (required implementation):
```sql
-- Create dedicated read-only role
CREATE ROLE inhouse_admin_readonly WITH LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE sheenapps TO inhouse_admin_readonly;
GRANT USAGE ON SCHEMA public TO inhouse_admin_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO inhouse_admin_readonly;
-- NO INSERT, UPDATE, DELETE, TRUNCATE grants

-- Connection settings (enforced at session start):
SET default_transaction_read_only = on;
SET statement_timeout = '3s';  -- Hard timeout
SET idle_in_transaction_session_timeout = '10s';
SET lock_timeout = '1s';
SET work_mem = '4MB';  -- Prevent monster sorts
```

**Schema Isolation** (In-House Mode uses per-project schemas):
```typescript
// Before executing admin query:
// 1. Validate schema belongs to project
const { rows } = await pool.query(
  `SELECT schema_name FROM inhouse_schemas WHERE project_id = $1`,
  [projectId]
)
if (!rows.length) throw new Error('Invalid project schema')

// 2. Set search_path to project schema only
await readonlyPool.query(
  `SET search_path TO ${rows[0].schema_name}, public`
)
// This prevents "clever SQL" from reaching other project schemas
```

**Additional Safeguards**:
- Block multi-statement execution at driver level
- Whitelist: SELECT, EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
- Regex filter as UX layer only (not security)
- All queries logged to audit trail with full SQL
- Hard check that schema belongs to requested project

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/database/projects/:projectId/schema
  Returns: { tables: [{ name, columns, rowCount }] }

GET /v1/admin/inhouse/database/slow-queries
  Query: ?projectId=&minDurationMs=100&limit=50  // Default 100ms, max 100 results
  Returns: { queries: [...] }

POST /v1/admin/inhouse/database/query
  Body: { projectId: string, sql: string, explain?: boolean }
  Returns: { rows, columns, durationMs, plan? }
  // Uses inhouse_admin_readonly role
  // statement_timeout = 3s
  // Max 1000 rows returned

GET /v1/admin/inhouse/database/connections
  Returns: { poolSize, active, idle, waiting }
```

### 2.9 Auth Admin

**Route**: `/admin/inhouse/auth`

**Features**:
- Active sessions by project
- User search (by email, ID)
- Force logout (invalidate sessions)
- Password reset enforcement
- Login attempt monitoring

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/auth/sessions
  Query: ?projectId=&limit=&offset=
  Returns: { sessions: [...], total }

GET /v1/admin/inhouse/auth/users
  Query: ?projectId=&search=&limit=&offset=
  Returns: { users: [...], total }

POST /v1/admin/inhouse/auth/users/:userId/logout
  Body: { reason: string }
  Returns: { invalidatedSessions }

POST /v1/admin/inhouse/auth/users/:userId/force-reset
  Body: { reason: string }
  Returns: { success }

GET /v1/admin/inhouse/auth/login-attempts
  Query: ?projectId=&status=&limit=
  Returns: { attempts: [...] }
```

---

## Phase 3: Monitoring & Alerts

> **Philosophy**: Don't build Datadog. Focus on actionable health signals + "what to do next". Link to external observability (PostHog, OTel, Grafana) for deep dives.

### 3.1 Service Health Dashboard

**Route**: `/admin/inhouse/monitoring`

**Focus on SLO-ish Metrics + Actions**:
- Job failure rate → Link to Jobs admin
- Queue depth → Link to Jobs admin
- Backup failures / projects without backups → Link to Backups admin
- Email bounce spikes → Link to Email admin
- Storage quota approaching → Link to Quotas

**NOT building**: Custom trace viewer, log search, APM dashboards (use existing tools)

**UI Mockup**:
```
┌─────────────────────────────────────────────────────────────────┐
│ In-House Mode Service Health                   Last updated: 2s ago │
├─────────────────────────────────────────────────────────────────┤
│  🟢 Auth      │  🟢 Database   │  🟢 Storage    │  🟡 Jobs      │
│  0.01% err    │  0.02% err     │  0.00% err     │  2.1% err [→] │
├─────────────────────────────────────────────────────────────────┤
│  🟢 Email     │  🟢 Payments   │  🟢 Analytics  │  🟢 Backups   │
│  0.5% bounce  │  0.00% err     │  0.01% err     │  3 failed [→] │
├─────────────────────────────────────────────────────────────────┤
│ Needs Attention                                                  │
│  • 12 projects approaching storage quota [View →]               │
│  • 3 backup failures today [View →]                             │
│  • Jobs queue depth: 234 (above threshold) [View →]             │
├─────────────────────────────────────────────────────────────────┤
│ Deep Dive: [PostHog →] [Grafana →] [Logs →]                     │
└─────────────────────────────────────────────────────────────────┘
```

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/monitoring/health
  Returns: {
    services: [{ name, status, errorRate, actionUrl }],
    queues: { jobs: N, emails: N, backups: N },
    needsAttention: [{ type, message, actionUrl, severity }]
  }

GET /v1/admin/inhouse/monitoring/summary
  Query: ?period=hour|day
  Returns: {
    jobFailureRate, emailBounceRate, backupFailures,
    projectsNearQuota, activeAlerts
  }

// For deep dives, link to external tools:
// - PostHog for user analytics
// - Grafana/Prometheus for metrics
// - Existing log streaming for traces
```

### 3.2 Alert Configuration

**Route**: `/admin/inhouse/alerts`

**Features**:
- Create alert rules (threshold-based)
- View active alerts
- Alert history
- Notification channels (email, Slack)

**Alert Types**:
- Job failure rate > X%
- Email bounce rate > X%
- Backup failed for project
- Storage quota > 90%
- Error rate spike
- Queue depth > threshold

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/alerts/rules
  Returns: { rules: [...] }

POST /v1/admin/inhouse/alerts/rules
  Body: { name, condition, threshold, channels, enabled }
  Returns: { rule }

GET /v1/admin/inhouse/alerts/active
  Returns: { alerts: [...] }

POST /v1/admin/inhouse/alerts/:alertId/acknowledge
  Body: { reason: string }
  Returns: { success }

GET /v1/admin/inhouse/alerts/history
  Query: ?limit=&offset=
  Returns: { alerts: [...], total }
```

---

## Phase 4: Usage & Billing

### 4.1 Usage Dashboard

**Route**: `/admin/inhouse/usage`

**Features**:
- Usage overview (all services, all projects)
- Usage by project (drill-down)
- Usage trends (growth charts)
- Quota status (approaching limits)
- Export usage data

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/usage/overview
  Query: ?period=day|week|month
  Returns: {
    storage: { total, byProject },
    email: { total, byProject },
    jobs: { total, byProject },
    // ...
  }

GET /v1/admin/inhouse/usage/projects/:projectId
  Query: ?period=
  Returns: { metrics: [...], trends: [...] }

GET /v1/admin/inhouse/usage/approaching-limits
  Returns: { projects: [{ id, name, metric, usage, limit, percentUsed }] }
```

### 4.2 Quota Management

**Route**: `/admin/inhouse/quotas`

**Features**:
- View project quotas (computed from events)
- Override quotas (temporary or permanent)
- Usage adjustments (NOT counter resets)
- Quota change history

**Usage Counter Architecture** (billing-defensible):
```
┌─────────────────────────────────────────────────────────────────┐
│ Don't reset counters directly. Store adjustment events.         │
│                                                                 │
│ inhouse_usage_events:                                          │
│   project_id, metric, delta, reason, admin_id, created_at       │
│                                                                 │
│ Current usage = SUM(delta) for metric in period                 │
│ "Reset" = negative adjustment event (auditable, reversible)     │
└─────────────────────────────────────────────────────────────────┘
```

**Why**: Counter resets cause billing disputes. Adjustment events are auditable, reversible, and defensible.

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/quotas/projects/:projectId
  Returns: {
    quotas: { storage, email, jobs, ... },
    currentUsage: { storage, email, jobs, ... },  // Computed from events
    overrides: [...]
  }

POST /v1/admin/inhouse/quotas/projects/:projectId/override
  Body: { metric, newLimit, reason, expiresAt? }
  Returns: { success, overrideId }

POST /v1/admin/inhouse/quotas/projects/:projectId/adjust
  Body: { metric, delta: number, reason: string }
  Returns: { success, newUsage, adjustmentId }
  // delta can be negative (e.g., -500 to credit 500 emails)
  // Stored as event, not counter mutation

GET /v1/admin/inhouse/quotas/projects/:projectId/adjustments
  Query: ?metric=&limit=50
  Returns: { adjustments: [...], total }

GET /v1/admin/inhouse/quotas/history
  Query: ?projectId=&limit=50
  Returns: { changes: [...] }
```

### 4.3 Revenue Reporting

**Route**: `/admin/inhouse/revenue`

**Features**:
- Total MRR from In-House Mode projects
- Revenue by plan tier
- Revenue trends
- Top revenue projects
- Churn tracking

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/revenue/summary
  Query: ?period=
  Returns: { mrr, arr, customerCount, avgRevenuePerProject }

GET /v1/admin/inhouse/revenue/by-plan
  Returns: { plans: [{ name, projectCount, mrr }] }

GET /v1/admin/inhouse/revenue/top-projects
  Query: ?limit=
  Returns: { projects: [{ id, name, mrr }] }

GET /v1/admin/inhouse/revenue/churn
  Query: ?period=
  Returns: { churned, churnRate, reasons }
```

---

## Phase 5: Support Tools

### 5.1 Project Impersonation (Read-Only)

**Route**: `/admin/inhouse/support/impersonate`

> **HIGH-RISK FEATURE**: Even read-only impersonation can expose PII, invoices, secrets metadata. Treat with surgical constraints.

**Features**:
- View project as owner would see it
- Read-only access (no modifications)
- All actions logged to audit trail
- Time-limited sessions (30 min max)

**Security Constraints** (required implementation):

1. **Two-Step Friction**:
   - Step 1: Provide reason + confirm intent
   - Step 2: Explicit "Start Impersonation" action
   - Optional: 2FA challenge for sensitive tenants (enterprise plans)

2. **Hard TTL**: 30 minutes maximum, no extensions

3. **Scoped Token** includes:
   - `project_id` (cannot access other projects)
   - `read_only: true` (enforced at API layer)
   - `allowed_routes` (explicit allowlist, not "everything")
   - `admin_id` (for audit correlation)
   - `expires_at` (hard expiry)

4. **Route Allowlist** (NOT "proxy everything"):
   ```typescript
   const IMPERSONATION_ALLOWED_ROUTES = [
     'GET /v1/inhouse/projects/:projectId/storage/files',
     'GET /v1/inhouse/projects/:projectId/jobs',
     'GET /v1/inhouse/projects/:projectId/email',
     'GET /v1/inhouse/projects/:projectId/analytics/events',
     // Explicitly NO: secrets, payments customer data, backups
   ]
   ```

5. **UI Watermark**: "IMPERSONATING (READ-ONLY) - project-name" banner

6. **Every Request Logged**: correlation_id, route, timestamp, admin_id

**API Endpoints**:

```typescript
POST /v1/admin/inhouse/support/impersonate/start
  Body: { projectId: string, reason: string }
  Returns: { confirmationToken, expiresIn: 60 }  // Must confirm within 60s

POST /v1/admin/inhouse/support/impersonate/confirm
  Body: { confirmationToken: string }
  Returns: { sessionToken, expiresAt, allowedRoutes: [...] }

GET /v1/admin/inhouse/support/impersonate/:projectId/:allowedRoute
  Headers: { Authorization: 'Bearer <sessionToken>' }
  // Only proxies routes in allowlist, rejects others with 403
```

### 5.2 Debug Query Tool

**Route**: `/admin/inhouse/support/query`

**Features**:
- Run read-only SQL against project database
- Explain plan viewer
- Query history
- Export results

**API Endpoints**:

```typescript
POST /v1/admin/inhouse/support/query
  Body: { projectId, sql, explain?: boolean }
  Returns: { rows, columns, duration, plan? }

GET /v1/admin/inhouse/support/query/history
  Query: ?adminId=&limit=
  Returns: { queries: [...] }
```

### 5.3 Request Replay

**Route**: `/admin/inhouse/support/replay`

**Features**:
- Find failed requests by correlation ID
- View request/response details
- Replay request (with modifications)
- Track replay results

**API Endpoints**:

```typescript
GET /v1/admin/inhouse/support/requests/:correlationId
  Returns: { request, response, timing, error }

POST /v1/admin/inhouse/support/requests/:correlationId/replay
  Body: { modifications?: object, reason: string }
  Returns: { newCorrelationId, result }
```

---

## Implementation Priority

### Sprint 1: Foundation (2 weeks)
- [ ] Projects list page + API
- [ ] Project details page + API
- [ ] Basic navigation/layout
- [ ] Permissions setup (`inhouse.*`)
- [ ] `inhouse_activity_log` table creation
- [ ] Activity log writes from: db, jobs, backups (minimum for Sprint 2 support tools)
- [ ] Activity log retention job (nightly cleanup > 30 days)

### Sprint 2: Critical Support Tools (2 weeks)
- [x] **Backups admin** (status, trigger, restore) ← Existential, do first
- [x] Jobs admin (list, retry, cancel, DLQ with blast-radius controls)
- [x] Email admin (list, resend, bounces, suppressions)

### Sprint 3: Monitoring + Usage (2 weeks)
- [x] Service health dashboard (actionable signals, not Datadog)
- [x] Usage dashboard (computed from events)
- [x] Quota management (adjustment events, not counter resets)

### Sprint 4: Billing + Storage (2 weeks)
- [x] Revenue reporting
- [x] Storage admin (usage, file browser, cleanup)
- [x] Payments admin (events, customer search)

### Sprint 5: Advanced Support (2 weeks)
> **Detailed Plan**: [INHOUSE_SPRINT5_SUPPORT_PLAN.md](./INHOUSE_SPRINT5_SUPPORT_PLAN.md)

- [ ] Database inspector (with DB-enforced read-only role)
- [ ] Impersonation (with route allowlist + strict constraints)
- [ ] Request replay
- [ ] External observability links (PostHog, Grafana)

### Sprint 6: Polish (1 week)
- [x] Analytics admin
- [x] Auth admin
- [x] Secrets admin (audit only)
- [x] Alert configuration

---

## Database Changes

### New Tables

```sql
-- ============================================================
-- CANONICAL ACTIVITY LOG (Single Event Stream)
-- All services write here. Enables fast "recent activity" queries
-- and consistent monitoring/alerting.
-- ============================================================
CREATE TABLE IF NOT EXISTS inhouse_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service TEXT NOT NULL, -- 'auth', 'db', 'storage', 'jobs', 'email', 'payments', 'analytics', 'secrets', 'backups'
  action TEXT NOT NULL, -- 'query', 'upload', 'enqueue', 'send', 'backup_created', etc.
  status TEXT NOT NULL DEFAULT 'success', -- 'success', 'error', 'pending'
  correlation_id TEXT,
  actor_type TEXT, -- 'user', 'system', 'admin', 'cron'
  actor_id TEXT, -- user_id, admin_id, or null for system
  resource_type TEXT, -- 'file', 'job', 'email', 'backup', etc.
  resource_id TEXT,
  metadata JSONB, -- Service-specific details (keep small!)
  duration_ms INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_inhouse_activity_project_created ON inhouse_activity_log(project_id, created_at DESC);
CREATE INDEX idx_inhouse_activity_service ON inhouse_activity_log(service, created_at DESC);
CREATE INDEX idx_inhouse_activity_correlation ON inhouse_activity_log(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX idx_inhouse_activity_errors ON inhouse_activity_log(created_at DESC) WHERE status = 'error';

-- ============================================================
-- RETENTION STRATEGY (prevent accidental data warehouse)
-- ============================================================
-- Option A: Monthly partitions + drop old (preferred for scale)
--   - Use pg_partman for automated partition management
--   - CREATE TABLE inhouse_activity_log (...) PARTITION BY RANGE (created_at);
--   - pg_partman auto-creates monthly partitions and drops > 30 days
--
-- Option B: Nightly cleanup job (simpler for low volume)
--   - DELETE FROM inhouse_activity_log WHERE created_at < NOW() - INTERVAL '30 days'
--   - Run at 4 AM UTC via scheduled job
--   - Requires index on created_at (already have it)
--
-- Operational plan: Start with Option B, migrate to A when > 10M rows/month

-- ============================================================
-- USAGE EVENTS (Billing-Defensible)
-- Store events, not mutable counters. Enables auditable adjustments.
-- ============================================================
CREATE TABLE IF NOT EXISTS inhouse_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, -- 'storage_bytes', 'email_sends', 'job_runs', etc.
  delta BIGINT NOT NULL, -- Can be negative for adjustments
  reason TEXT, -- Required for admin adjustments
  actor_type TEXT NOT NULL, -- 'system', 'admin'
  actor_id UUID, -- admin_id for adjustments, null for system
  period_start DATE NOT NULL, -- Billing period start
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inhouse_usage_project_metric ON inhouse_usage_events(project_id, metric, period_start);
CREATE INDEX idx_inhouse_usage_period ON inhouse_usage_events(period_start, metric);

-- Helper function to get current usage
CREATE OR REPLACE FUNCTION get_inhouse_usage(
  p_project_id UUID,
  p_metric TEXT,
  p_period_start DATE DEFAULT date_trunc('month', CURRENT_DATE)::DATE
) RETURNS BIGINT AS $$
  SELECT COALESCE(SUM(delta), 0)
  FROM inhouse_usage_events
  WHERE project_id = p_project_id
    AND metric = p_metric
    AND period_start = p_period_start;
$$ LANGUAGE SQL STABLE;

-- ============================================================
-- ADMIN AUDIT (Specific to Admin Operations)
-- ============================================================
CREATE TABLE IF NOT EXISTS inhouse_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES profiles(id), -- Use profiles, not auth.users
  action TEXT NOT NULL, -- 'project_view', 'job_retry', 'quota_override', 'impersonate_start', etc.
  project_id UUID REFERENCES projects(id),
  resource_type TEXT, -- 'job', 'email', 'backup', etc.
  resource_id TEXT,
  reason TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inhouse_admin_audit_admin ON inhouse_admin_audit(admin_id);
CREATE INDEX idx_inhouse_admin_audit_project ON inhouse_admin_audit(project_id);
CREATE INDEX idx_inhouse_admin_audit_created ON inhouse_admin_audit(created_at DESC);

-- Quota overrides
CREATE TABLE IF NOT EXISTS inhouse_quota_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, -- 'storage_bytes', 'email_sends', 'job_runs'
  original_limit BIGINT NOT NULL,
  new_limit BIGINT NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),  -- Use profiles, not auth.users
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES profiles(id)  -- Use profiles, not auth.users
);

CREATE INDEX idx_inhouse_quota_overrides_project ON inhouse_quota_overrides(project_id);
CREATE INDEX idx_inhouse_quota_overrides_active ON inhouse_quota_overrides(project_id, metric)
  WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());

-- Alert rules
CREATE TABLE IF NOT EXISTS inhouse_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service TEXT NOT NULL, -- 'jobs', 'emails', 'storage', etc.
  metric TEXT NOT NULL, -- 'error_rate', 'queue_depth', 'bounce_rate'
  condition TEXT NOT NULL, -- 'gt', 'lt', 'eq'
  threshold NUMERIC NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 5,
  channels JSONB NOT NULL DEFAULT '[]', -- ['email', 'slack']
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),  -- Use profiles, not auth.users
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active alerts
CREATE TABLE IF NOT EXISTS inhouse_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES inhouse_alert_rules(id),
  project_id UUID REFERENCES projects(id),
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  message TEXT NOT NULL,
  metadata JSONB,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES profiles(id),  -- Use profiles, not auth.users
  resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_inhouse_alerts_active ON inhouse_alerts(triggered_at DESC)
  WHERE resolved_at IS NULL;
```

---

## File Structure

```
sheenapps-claude-worker/src/
├── routes/
│   ├── adminInhouseProjects.ts    # Projects list, details, suspend/unsuspend
│   ├── adminInhouseJobs.ts        # Jobs admin
│   ├── adminInhouseEmails.ts       # Email admin
│   ├── adminInhouseStorage.ts     # Storage admin
│   ├── adminInhouseBackups.ts     # Backups admin
│   ├── adminInhousePayments.ts    # Payments admin
│   ├── adminInhouseAnalytics.ts   # Analytics admin
│   ├── adminInhouseSecrets.ts     # Secrets admin (audit only)
│   ├── adminInhouseDatabase.ts    # Database inspector
│   ├── adminInhouseAuth.ts        # Auth admin
│   ├── adminInhouseMonitoring.ts  # Health + alerts
│   ├── adminInhouseUsage.ts       # Usage + quotas
│   └── adminInhouseSupport.ts     # Impersonation, debug tools
└── services/
    └── admin/
        ├── InhouseProjectsAdminService.ts
        ├── InhouseJobsAdminService.ts
        ├── InhouseEmailAdminService.ts
        └── ... (one per feature area)

sheenappsai/src/app/
├── api/admin/inhouse/
│   ├── projects/...
│   ├── jobs/...
│   ├── email/...
│   └── ... (mirrors worker routes)
└── [locale]/admin/inhouse/
    ├── layout.tsx              # In-House Mode admin layout
    ├── page.tsx                # Dashboard overview
    ├── projects/
    │   ├── page.tsx            # Projects list
    │   └── [projectId]/page.tsx # Project details
    ├── jobs/page.tsx
    ├── emails/page.tsx
    ├── storage/page.tsx
    ├── backups/page.tsx
    ├── payments/page.tsx
    ├── analytics/page.tsx
    ├── secrets/page.tsx
    ├── database/page.tsx
    ├── auth/page.tsx
    ├── monitoring/page.tsx
    ├── usage/page.tsx
    ├── quotas/page.tsx
    ├── alerts/page.tsx
    └── support/
        ├── impersonate/page.tsx
        └── query/page.tsx
```

---

## Security Considerations

1. **All endpoints require admin authentication** via `requireAdmin('inhouse.*')`
2. **Audit logging** for all destructive/sensitive operations
3. **Read-only impersonation** - route allowlist + scoped tokens + 30min TTL
4. **Secret values never exposed** - only metadata visible
5. **DB query tool** - dedicated read-only role + statement_timeout (not just regex)
6. **Rate limiting** on admin APIs to prevent abuse
7. **Blast-radius controls** on bulk operations (dry-run, confirm counts)
8. **Never join auth.users** - use app-level profiles table
9. **Usage adjustments as events** - auditable, reversible (not counter mutations)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Support ticket resolution time | < 15 min for common issues |
| Admin can find any project | < 30 seconds |
| Admin can retry failed job | < 5 clicks |
| Zero customer data exposure | 100% |
| Admin audit coverage | 100% of write operations |

---

## Open Questions

1. ~~Should impersonation require two-person approval?~~ → **No for MVP**, two-step friction + route allowlist is sufficient. Add later if needed.
2. Should quota overrides have maximum limits? (e.g., max 10x plan limit)
3. How long to retain admin audit logs? (Suggest: 1 year)
4. How long to retain activity logs? (Suggest: 30 days, with hourly rollups for long-term)
5. Should we add Slack/Discord integration for alerts?
6. Do we need a `profiles` table sync mechanism from `auth.users`? (Suggest: trigger on auth signup)

## Resolved Questions

- **Join auth.users?** → No, use app-level `profiles` table
- **Single activity stream?** → Yes, `inhouse_activity_log` table
- **Usage counter resets?** → No, use adjustment events for billing defensibility
- **SQL query tool security?** → DB-enforced read-only role, not just regex
- **Impersonation scope?** → Route allowlist, not "proxy everything"
- **Build Datadog clone?** → No, focus on actionable signals + link to external tools

---

## Appendix: Existing Admin Patterns to Reuse

### Authentication
```typescript
import { requireAdmin } from '@/lib/admin/require-admin'

export async function GET(request: NextRequest) {
  const { session, error } = await requireAdmin('inhouse.read')
  if (error) return error
  // ... proceed
}
```

### Worker Proxy
```typescript
import { proxyGet, proxyPost } from '@/lib/admin/worker-proxy'

// Proxy to worker with admin auth
return proxyGet('/v1/admin/inhouse/projects')
return proxyPost('/v1/admin/inhouse/jobs/retry', body)
```

### Audit Logging
```typescript
// In worker routes
await pool.query(
  `SELECT rpc_log_admin_action($1, $2, $3, $4, $5, $6, $7)`,
  [adminId, 'job_retry', 'job', jobId, reason, correlationId, metadata]
)
```

### Default Limits (All List Endpoints)
```typescript
// Apply to every list endpoint
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const STATEMENT_TIMEOUT = '5s'

// In route handler:
const limit = Math.min(parseInt(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT)
const offset = parseInt(req.query.offset) || 0

// In query:
await pool.query(`SET statement_timeout = '5s'`)
await pool.query(`SELECT ... LIMIT $1 OFFSET $2`, [limit, offset])
```

### Response Format
```typescript
return noCacheResponse({
  success: true,
  data: result,
  correlation_id: correlationId
})
```
