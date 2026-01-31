# API Consolidation Recommendations

Analysis of frontend components making multiple API calls that could be consolidated into aggregate endpoints, following the pattern established by `GET /v1/inhouse/projects/:projectId/email/overview`.

---

## High Priority

### 1. Billing Overview ✅ DONE

**Endpoint:** `GET /v1/billing/overview/:userId`

**Status:** Implemented

**Discovery:** The plan overstated the problem. `useCurrencyPreference` is localStorage-only (no API call), and `useFormattedEnhancedBalance` wraps `useEnhancedBalance` with React Query deduplication (same query key = 1 network request). Actual API calls were 3, not 5. Still consolidated for cleaner code.

**Changes:**
- Created worker route: `sheenapps-claude-worker/src/routes/billingOverview.ts` — parallel fetches for balance, usage analytics (direct SQL), and pricing catalog with currency conversion
- Created proxy route: `src/app/api/v1/billing/overview/[userId]/route.ts`
- Created hook: `src/hooks/use-billing-overview.ts` (React Query, staleTime: 30s, refetchInterval: 60s)
- Updated `billing-content.tsx` — replaced 3 hooks with single `useBillingOverview`

**Actual impact:** 3 API calls → 1.

---

### 2. Domains + Mailboxes — Fix Duplicate Hook ✅ DONE

**Status:** Implemented (scoped to the actual problem)

**Discovery:** The plan's proposed aggregate endpoint was overkill. React Query already deduplicates `useEmailDomains` calls (same query key). The real issue was `MailboxManager` calling `useEmailDomains` independently — not a duplicate network request, but an unclear data flow. Creating an aggregate endpoint that eagerly loads all mailboxes for all domains would be wasteful since users only view one domain at a time.

**Fix applied:** Lifted `useEmailDomains(projectId)` to the parent `EmailDomains` component and passed `domains`/`domainsLoading` as props to both `CustomDomainsView` and `MailboxManager`. Cleaner data flow, single source of truth.

**Changes:**
- Updated `EmailDomains.tsx` — lifted hook, passes props to children
- Updated `MailboxManager.tsx` — accepts domains/domainsLoading as props, removed own hook call

**Impact:** Cleaner architecture. No new endpoint needed.

---

### 3. Run Overview (Move Aggregation to Worker) ✅ DONE

**Endpoint:** `GET /v1/inhouse/projects/:projectId/run/overview`

**Status:** Implemented

**Discovery:** `computeAlerts` logic had to stay in the proxy because it uses imported JS modules (threshold functions) not available in the worker. `runSettings` fetch also stays in proxy (Supabase RLS). So the proxy now makes 2 parallel calls (1 worker + 1 Supabase) instead of 5 worker calls + 1 Supabase.

**Changes:**
- Created worker route: `sheenapps-claude-worker/src/routes/inhouseRunOverview.ts` — parallel service calls for currentKpis, previousKpis, alerts, lastEvent, trends via `Promise.allSettled`
- Registered in `server.ts`
- Updated proxy `src/app/api/projects/[id]/run/overview/route.ts` — single worker call + parallel Supabase config fetch

**Actual impact:** 5 worker network round-trips → 1 (+ 1 Supabase call that can't move to worker).

---

## Medium Priority

### 4. System Health Dashboard ✅ DONE

**Endpoint:** `GET /v1/admin/system-health/comprehensive`

**Status:** Implemented

**Changes:**
- Added `/v1/admin/system-health/comprehensive` to worker `adminSystemHealth.ts` — runs getServiceStatuses, getSLOCompliance, and 3 sparkline queries in parallel
- Created proxy route: `src/app/api/admin/system-health/comprehensive/route.ts`
- Updated `SystemHealthDashboard.tsx` — replaced separate `fetchHealthData` + `fetchSparklines` with single `fetchAllHealthData`

**Impact:** 4 calls → 1, repeated every 30s auto-refresh.

---

### 5. Customer Health Dashboard ✅ DONE

**Endpoint:** `GET /v1/admin/customer-health/dashboard`

**Status:** Implemented

**Discovery:** Kept a separate `fetchAtRiskCustomers` function because filter changes (renewalFilter, tagFilter) need individual re-fetches with query params — the aggregate endpoint loads default at-risk list, but filter changes trigger targeted refetches.

**Changes:**
- Added `/v1/admin/customer-health/dashboard` to worker `adminCustomerHealth.ts` — parallel fetches for summary, atRisk, dropped, recovered, workerStatus via `Promise.allSettled`
- Created proxy route: `src/app/api/admin/customer-health/dashboard/route.ts`
- Updated `CustomerHealthDashboard.tsx` — replaced 4 separate fetch functions with single `fetchDashboardData`, kept separate `fetchAtRiskCustomers` for filter changes

**Impact:** 4 calls → 1 on initial load. Filter changes still use targeted fetch.

---

### 6. Admin Alerts Dashboard ✅ DONE

**Endpoint:** `GET /v1/admin/inhouse/alerts/dashboard`

**Status:** Implemented

**Discovery:** Kept individual `fetchRules` for targeted refreshes after rule CRUD mutations (create/toggle/delete). The aggregate endpoint is used for initial load and full refresh. History status filter is passed as query param to the aggregate endpoint.

**Changes:**
- Added `/v1/admin/inhouse/alerts/dashboard` to worker `adminInhouseAlerts.ts` — parallel fetches for rules, active alerts, and history via `Promise.allSettled`, supports history status/limit/offset query params
- Created proxy route: `src/app/api/admin/inhouse/alerts/dashboard/route.ts` — forwards query params
- Updated `InhouseAlertsAdmin.tsx` — initial load and refresh use single `fetchDashboardData`, kept `fetchRules` for post-mutation refreshes

**Impact:** 3 calls → 1 on mount and refresh.

---

## Low Priority / Quick Fixes

### 7. Remove Duplicate Balance Hooks ✅ DONE

**Status:** Implemented

**Changes:**
- Removed deprecated `useAITimeBalance` function from `use-ai-time-balance.ts`
- Removed deprecated `useFormattedBalance` function from `use-ai-time-balance.ts`
- Updated `ai-time-balance.tsx` — removed legacy fallback, `AITimeBalanceCompact` now uses `useFormattedEnhancedBalance` directly
- Updated `builder-chat-interface.tsx` — replaced `useAITimeBalance` with `useEnhancedBalance`, removed legacy balance fallback

**Discovery:** `formattedBalance.remainingMinutes` from the legacy hook was replaced with `formattedBalance.totalMinutes` from the enhanced hook since the enhanced balance already accounts for usage in its totals.

### 8. Admin Metrics Page — Parallelize ✅ DONE

**Status:** Implemented

**Changes:**
- Updated `src/app/admin/page.tsx` — changed sequential `fetch` calls to `Promise.all([...])` for revenue and usage data

**Impact:** Simple latency win, no new endpoint needed.

---

## Implementation Pattern

Each aggregate endpoint follows the same structure established by `emailOverview`:

**Worker** (`sheenapps-claude-worker/src/routes/inhouse*.ts`):
```typescript
export async function inhouseXxxOverviewRoutes(fastify: FastifyInstance) {
  const hmacMiddleware = requireHmacSignature()

  fastify.get<{
    Params: { projectId: string }
    Querystring: { userId?: string }
  }>('/v1/inhouse/projects/:projectId/xxx/overview', {
    preHandler: hmacMiddleware as any,
  }, async (request, reply) => {
    // 1. Validate userId
    // 2. assertProjectAccess(projectId, userId)
    // 3. Promise.all([...parallel SQL queries...])
    // 4. Return { ok: true, data: { ... } }
  })
}
```

**Proxy** (`src/app/api/inhouse/projects/[id]/xxx/overview/route.ts`):
```typescript
import { withProjectOwner, PROJECT_ROUTE_EXPORTS } from '@/lib/api/with-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const { dynamic, revalidate, fetchCache } = PROJECT_ROUTE_EXPORTS

export const GET = withProjectOwner(async (_req, ctx) => {
  const result = await callWorker({
    method: 'GET',
    path: `/v1/inhouse/projects/${ctx.projectId}/xxx/overview`,
    queryParams: { userId: ctx.userId },
    claims: { userId: ctx.userId },
  })
  return ctx.workerResponse(result)
})
```

**Hook** (`src/hooks/use-xxx-overview.ts`):
```typescript
export function useXxxOverview(projectId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.xxxOverview(projectId),
    queryFn: () => fetchXxxOverview(projectId),
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}
```

**Query key** (add to `src/lib/query-keys.ts`):
```typescript
xxxOverview: (projectId: string) => [...keys.all, 'xxx-overview', projectId] as const,
```

---

## Post-Implementation Hardening (Code Review Follow-Up)

### 9. Partial Success Metadata ✅ DONE

All `Promise.allSettled` aggregate endpoints now return `meta.partial` + `meta.failures` when any section fails, instead of silently returning `[]`/`null`. This lets the frontend distinguish "empty data" from "broken section."

**Changes:**
- `adminCustomerHealth.ts` dashboard endpoint — added failures tracking
- `adminInhouseAlerts.ts` dashboard endpoint — added failures tracking
- `inhouseRunOverview.ts` — added failures tracking for optional fields (previousKpis, lastEvent, trends)
- `billingOverview.ts` — added failures tracking for optional usage/catalog
- `adminSystemHealth.ts` comprehensive endpoint — converted from `Promise.all` to `Promise.allSettled` with failures tracking; overall status now reports "degraded" when sections fail to load

### 10. Statement Timeouts on Aggregate Routes ✅ DONE

**Changes:**
- `billingOverview.ts` — wrapped direct `pool.query()` for usage analytics with `withStatementTimeout(pool, '5s', ...)`

**Not changed (by design):** adminCustomerHealth, adminSystemHealth, and inhouseRunOverview delegate to service classes that manage their own DB connections. Adding `withStatementTimeout` at the route level would require restructuring the service layer. The `Promise.allSettled` + partial metadata already handles the case where a service hangs — it degrades gracefully instead of stalling.

### Code Review Items Evaluated and Skipped

| Recommendation | Verdict | Reason |
|---|---|---|
| Standardize response envelope (`ok` vs `success`) | Skip | 100+ file refactor across both codebases. Separate project. |
| Make userId non-optional on project routes | Skip | Systemic issue (9+ route files). HMAC ensures only proxy calls these. Worth a separate task for defense-in-depth. |
| Collapse multi-count to single SQL | Skip | Reviewer assumed same-table counts. Actually 4 different tables — parallel is faster. |
| HTTP semantics polish (202, Cache-Control) | Skip | Generic advice, not specific to aggregation work. |
| Rename `hmacMiddleware` in admin routes | Skip | Cosmetic. |
