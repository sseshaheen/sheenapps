# Admin Performance Dashboard Enhancements

**Created:** January 2026
**Status:** Planned
**Scope:** `/admin/performance` dashboard improvements

---

## Summary

Enhance the admin performance dashboard to be a "curated cockpit" with deep-links to Grafana for forensics, not a Grafana replacement.

**Philosophy:** OTel + Faro tell us *what's slow and where*. The admin panel surfaces the highlights and links out for deep analysis.

---

## Current State

| Component | Status | Notes |
|-----------|--------|-------|
| Web Vitals collection | ✅ Done | Faro + custom `/api/analytics/web-vitals` |
| Web Vitals dashboard | ✅ Done | `/admin/performance` with INP/LCP/CLS/TTFB/FCP |
| build_version tracking | ✅ Done | Stored in `web_vitals_raw` and `web_vitals_hourly` |
| Grafana Faro (RUM) | ✅ Done | `faro.client.ts` with TracingInstrumentation |
| OpenTelemetry (traces) | ✅ Done | Server traces to Grafana Cloud |
| Grafana dashboards URL | ❌ Missing | No env var for deep-linking |
| Release comparison | ❌ Missing | No UI to compare builds |
| Route→trace correlation | ❌ Missing | No links from routes to traces |

---

## Phase 1: Admin Panel Enhancements (Frontend Only)

### 1.1 Grafana Deep-Links

**Goal:** Add "Open in Grafana" buttons that link to relevant dashboards.

**Implementation:**
```typescript
// Add to .env.example and observability-config.ts
GRAFANA_BASE_URL=https://your-org.grafana.net

// Deep-link patterns:
// - Traces by route: ${GRAFANA_BASE_URL}/explore?left=["now-1h","now","traces",{"query":"route=\"/workspace\""}]
// - Frontend metrics: ${GRAFANA_BASE_URL}/d/faro-web-app
// - Worker metrics: ${GRAFANA_BASE_URL}/d/worker-overview
```

**UI Changes:**
- Add "Open in Grafana" dropdown in dashboard header
- Links: "Frontend Traces", "Worker Overview", "Slow Endpoints"
- Only show if `GRAFANA_BASE_URL` is configured

**Files to modify:**
- `src/config/observability-config.ts` - Add grafanaBaseUrl
- `src/components/admin/PerformanceDashboard.tsx` - Add deep-link buttons

### 1.2 Release Comparison

**Goal:** Compare current deploy's metrics to previous deploy.

**Implementation:**
- Query distinct `build_version` values from `web_vitals_hourly`
- Show toggle: "Compare to previous release"
- Display delta indicators: `+15% ↑` (regression) or `-10% ↓` (improvement)

**UI Changes:**
- Add release selector dropdown next to time range
- Show comparison badges on metric cards
- Highlight regressions in red

**API Changes:**
- `GET /api/admin/performance/web-vitals?range=24h&compare=true`
- Returns `{ current: {...}, previous: {...}, delta: {...} }`

**Files to modify:**
- `src/app/api/admin/performance/web-vitals/route.ts` - Add comparison logic
- `src/components/admin/PerformanceDashboard.tsx` - Add comparison UI

### 1.3 Route Drilldown with Trace Links

**Goal:** From worst routes, link to Grafana traces for that route.

**Implementation:**
- In "Performance by Route" table, add "View Traces" button
- Links to Grafana Explore filtered by route
- Show correlation: "Route `/workspace/[id]` has 500ms p95 LCP → [View backend traces]"

**Files to modify:**
- `src/components/admin/PerformanceDashboard.tsx` - Add trace links to route table

---

## Phase 2: Future Enhancements (If Needed)

### 2.1 On-Demand CPU Profiling (Worker-Side)

**When to consider:** If OTel shows CPU-bound slowness but can't identify the culprit function.

**Implementation (worker codebase):**
```typescript
// POST /admin/profiling/start - Start 30s CPU profile
// GET /admin/profiling/download - Download .cpuprofile file
// Guards: admin-only, rate-limited (1 per 5 min), prod-gated
```

**Why defer:**
- Worker is separate codebase
- OTel + Faro cover 90% of debugging needs
- Profile when you hit: high CPU with normal traffic, p99 spikes, event loop lag

### 2.2 Continuous Profiling (Pyroscope)

**When to consider:** If chasing perf regressions weekly across deploys.

**Why skip for now:**
- Early-stage traffic
- Not hitting weekly perf regressions
- Adds infrastructure complexity

---

## Implementation Priority

| Task | Priority | Effort | Impact |
|------|----------|--------|--------|
| Add GRAFANA_BASE_URL env var | P0 | Low | Enables all deep-linking |
| Add "Open in Grafana" buttons | P0 | Low | Immediate debugging value |
| Add release comparison toggle | P1 | Medium | Catch deploy regressions |
| Add trace links to route table | P1 | Low | RUM→backend correlation |
| Worker CPU profiling | P2 | Medium | Only if needed |

---

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| Don't rebuild Grafana in admin | Admin = cockpit with highlights. Grafana = forensics deep-dive. |
| Skip Pyroscope | Over-engineering for current traffic level |
| Skip worker profiling for now | Separate codebase, OTel covers most needs |
| Use Grafana Explore links | Leverage existing Faro traces with traceparent correlation |

---

## References

- Expert advice: "Admin should be a curated control room, not Grafana wearing a fake mustache"
- Faro TracingInstrumentation: Adds `traceparent` headers to all fetch calls
- Grafana Explore deep-link format: `/explore?left=["timeRange","datasource",{query}]`
