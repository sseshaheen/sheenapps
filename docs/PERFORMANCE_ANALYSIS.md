# Performance Analysis & Optimization Plan

**Generated:** January 2026
**Target:** Make the app feel "snappy" for users
**Scope:** sheenappsai (Next.js frontend) + sheenapps-claude-worker (Fastify backend)

---

## Implementation Progress

| Task | Status | Date | Notes |
|------|--------|------|-------|
| Lazy-load react-syntax-highlighter | ✅ Done | 2026-01-20 | Created `syntax-highlighter-lazy.tsx` wrapper |
| Remove dead esbuild-wasm | ✅ Done | 2026-01-20 | Removed 7 dead files + package.json dep |
| Create web_vitals DB tables | ✅ Done | 2026-01-20 | Migration: `20260120_web_vitals_performance_tracking.sql` |
| Update web-vitals API endpoint | ✅ Done | 2026-01-20 | 10% sampling, UA parsing, route normalization |
| Create /admin/performance page | ✅ Done | 2026-01-20 | Dashboard + API + navigation link |
| Add TTFMUI custom metric | ✅ Done | 2026-01-20 | Tracks workspace shell interactive |
| Split homepage lazy chunks | ✅ Done | 2026-01-20 | Lazy-load 5 below-fold sections |
| Parallelize API calls | ✅ Done | 2026-01-20 | Promise.all for permission checks, DB queries |
| Memoize builder components | ✅ Done | 2026-01-20 | React.memo on MessageComponent |
| Audit date-fns imports | ✅ Done | 2026-01-20 | Already optimized via optimizePackageImports |
| Investigate code editor lazy loading | ✅ N/A | 2026-01-20 | No heavy editor in use (plain textarea) |
| Investigate debounce editor writes | ✅ Done | 2026-01-20 | Already implemented in code-content.tsx |
| Investigate file tree virtualization | ⚠️ Low Priority | 2026-01-20 | useMemo sufficient for typical use |

### Implementation Discoveries & Notes

**2026-01-20: react-syntax-highlighter lazy loading**
- Created `src/components/builder/code-viewer/syntax-highlighter-lazy.tsx` wrapper
- Updated `code-content.tsx` to use dynamic import
- The plain text fallback (already existed) serves as loading state during chunk load
- **Additional finding:** `src/components/blog/portable-text.tsx` also imports react-syntax-highlighter directly - lower priority since it's blog, not builder path

**2026-01-20: esbuild-wasm dead code removal**
- Removed `esbuild-wasm` from package.json dependencies
- Deleted 7 dead files from `src/services/preview/`:
  - `esbuild-bundler.ts`
  - `compilation-engine.ts`
  - `compilation-engine-v2.ts`
  - `compilation-cache.ts`
  - `asset-loader.ts`
  - `virtual-file-system.ts`
  - `path-alias-resolver.ts`
- These files were only importing from each other (isolated dead code island)
- Run `npm install` to update lockfile and remove esbuild-wasm from node_modules

**2026-01-20: Admin Performance Dashboard**
- Created `/admin/performance` page at `src/app/admin/performance/page.tsx`
- Created `PerformanceDashboard` component at `src/components/admin/PerformanceDashboard.tsx`
- Created API endpoint at `src/app/api/admin/performance/web-vitals/route.ts`
- Added navigation link in `AdminNavigationMobile.tsx` under "System" section
- Dashboard features:
  - Core Web Vitals cards (INP, LCP, CLS, TTFB, FCP) with p75 values and ratings
  - Performance score based on Core Web Vitals passing rates
  - Rating distribution visualization (good/needs-improvement/poor)
  - Thresholds reference table
  - Route-level performance breakdown
  - Time range selector (1h, 24h, 7d, 30d)
- Requires `analytics.read` permission or super_admin role

**2026-01-20: TTFMUI Custom Metric**
- Added `reportCustomMetric()` helper to `src/components/analytics/web-vitals.tsx`
- Added `trackTTFMUI()` function that uses Performance API marks/measures
- Integrated into `enhanced-workspace-page.tsx`:
  - Tracks when workspace shell transitions from 'loading' to 'ready' state
  - Uses ref to ensure it only measures once per page load
  - Sends metric to same web vitals endpoint (appears as metric_name='TTFMUI')
- Target threshold: < 1500ms for 'good' rating
- Custom metrics use `navigationType: 'custom'` to distinguish from standard Web Vitals

**2026-01-20: Expert Review Bug Fixes**

Fixed several bugs identified in code review:

1. **Supabase time filter** - `.gte('hour', 'now() - interval...')` doesn't work with Supabase JS (expects literal values). Fixed to compute startTime in JS and pass ISO string.

2. **Locale stripping regex** - `ar` matched before `ar-eg`, leaving `-eg` in path. Fixed by putting longer locales first (`ar-eg|ar-sa|ar-ae|fr-ma|en|ar|fr|es|de`) and using lookahead `(?=\/|$)`.

3. **Unweighted percentile averaging** - Hours with 5 samples had same weight as hours with 5000. Added `weightedAvg()` function using sample_count as weight.

4. **topRoutes aggregation** - First row per metric won "randomly" based on query order. Fixed with proper weighted aggregation `(num + p75*weight) / (den + weight)`.

5. **Trend data range** - Always showed 24 points even for 7d/30d ranges. Added `TREND_POINTS` map to vary by range.

6. **Log DDoS** - Every web vital request was logged. Added `LOG_SAMPLE_RATE` (100% in dev, 1% in prod).

7. **No payload validation** - Added zod schema for strict validation of web vital payloads.

8. **fetchMetrics not memoized** - Added useCallback to prevent recreation on every render.

Files updated:
- `src/app/api/admin/performance/web-vitals/route.ts` - Time filter, weighted avg, trend points
- `src/app/api/analytics/web-vitals/route.ts` - Locale regex, zod, log sampling
- `src/components/admin/PerformanceDashboard.tsx` - useCallback memoization

**2026-01-20: Homepage Lazy Chunk Splitting (Phase 1)**

Implemented lazy loading for below-the-fold homepage sections in `src/app/[locale]/home-content.tsx`:

- **Kept synchronous:** `HeroV2Client` (above fold, critical for LCP)
- **Lazy-loaded with `ssr: true`:**
  - `TechTeamClient` - Tech team/advisors section
  - `FeatureWorkflowClient` - Workflow steps section
  - `PricingClient` - Pricing plans section
  - `FeaturesClient` - Features list section
  - `FooterClient` - Page footer
- **Lazy-loaded with `ssr: false`:**
  - `BuilderWrapper` - Floating builder button (uses browser APIs)

Expected impact: Reduced initial JS bundle, improved LCP since only Hero loads immediately.

**2026-01-20: Parallelize API Calls (Phase 2)**

Converted sequential await calls to `Promise.all` for better TTFB:

1. **Admin permission checks** (`src/app/api/admin/finance/overview/route.ts`, `src/app/api/admin/metrics/dashboard/route.ts`):
   ```typescript
   // Before: Sequential
   const hasPermission = await hasPermission('finance.view') || await hasPermission('admin.read')

   // After: Parallel
   const [financePermission, adminPermission] = await Promise.all([...])
   ```

2. **Advisor matching queries** (`src/app/api/advisor-matching/match-requests/route.ts`):
   - Parallelized project ownership verification + existing match check
   - Both queries are independent and can run simultaneously

**2026-01-20: Memoize Builder Components (Phase 2)**

Optimized `src/components/builder/message-component.tsx` for chat performance:

1. **React.memo wrapper:** Wrapped `MessageComponent` in `memo()` to prevent re-renders when props unchanged
2. **Extracted helper functions:** Moved `formatTime`, `getEmotionIcon`, `getEventColor`, `getSystemIcon`, `getSystemColor` outside component to prevent recreation on every render
3. **Impact:** During chat streaming, existing messages no longer re-render when new messages arrive

**2026-01-20: Debounce & Virtualization Investigation (Phase 2)**

Investigation findings for remaining Phase 2 pending tasks:

1. **Debounce editor state writes** - Already implemented:
   - `code-content.tsx` uses `useStreamingHighlight` with 80ms debounce for syntax highlighting
   - Content updates immediately on every chunk, only highlighting is debounced
   - File saves are explicit (user clicks Save or presses Ctrl+S) - no auto-save to debounce
   - The textarea in `EnhancedFileViewer` uses local React state, not store writes
   - No additional debouncing needed

2. **Virtualize file tree** - Low priority:
   - `FileTreePanel` already uses `useMemo` for tree building and filtering
   - Current implementation renders all nodes (no virtualization)
   - For typical projects (<100 files), current approach is performant
   - Virtualization with react-window would help for very large projects (100+ files)
   - Marked as low priority - implement only if user reports performance issues with large file trees

**2026-01-20: Code Editor Investigation (Phase 1)**

Investigation findings:
- The original plan assumed Monaco or CodeMirror would be used for code editing (~150KB each)
- **Actual implementation:** Uses plain `<textarea>` in `EnhancedFileViewer` for editing
- **Code viewer:** Uses `react-syntax-highlighter` which is already lazy-loaded via `syntax-highlighter-lazy.tsx`
- **No heavy editor library exists** in the codebase - Grep confirmed zero Monaco/CodeMirror imports
- Task marked as N/A since there's nothing to lazy-load
- The `GeneratedCodeViewer` is read-only; editing happens via simple textarea

**2026-01-20: date-fns Audit (Phase 2)**

Findings:
- `date-fns` is already in `optimizePackageImports` in `next.config.ts` line 57
- This enables automatic tree-shaking of unused date-fns functions
- 24 files import from date-fns, mostly in admin components (not critical path)
- User-facing paths only use `formatDistanceToNow` in `project-grid.tsx`
- **No action needed** - already optimized

---

## Executive Summary

The app has **comprehensive performance profiling infrastructure** already in place (Web Vitals, bundle analysis, Sentry, Grafana Faro, OpenTelemetry). However, **bundle sizes significantly exceed targets**:

| Page | Current | Target | Status |
|------|---------|--------|--------|
| Homepage | 340KB | 200KB | ❌ +70% over |
| Builder Workspace | 337KB | 150KB | ❌ +124% over |

**Priority focus:** The Builder Workspace is the most performance-critical page and the most over-budget.

---

## 1. Definition of "Snappy" (Pass/Fail Targets)

| Metric | Target | What It Measures | User Feel |
|--------|--------|------------------|-----------|
| **INP** (Interaction to Next Paint) | < 200ms | Response time after click/tap/keypress | "Instant" feedback |
| **LCP** (Largest Contentful Paint) | < 2.5s | Time to see main content (on mid-tier mobile + 4G) | Page "loaded" |
| **TTFB** (Time to First Byte) | < 800ms | Server response time (ideally <200ms for cached) | Server is "fast" |
| **Long Tasks** | < 50ms | No JS blocking main thread during interactions | No "jank" |

### How to Verify
```bash
# Run these checks against production build, NOT dev mode
cd sheenappsai
npm run build && npm run start

# Then test in Chrome DevTools with:
# - Network: "Fast 3G" or "Slow 4G"
# - CPU: 4x slowdown (simulates mid-tier Android)
```

---

## 2. Current Performance Tooling Status

### Frontend (sheenappsai) ✅ Fully Instrumented

| Tool | Purpose | Status | Location |
|------|---------|--------|----------|
| **Web Vitals** | CLS, INP, FCP, LCP, TTFB | ✅ Active | `src/components/analytics/web-vitals.tsx` |
| **@next/bundle-analyzer** | Visualize JS bundles | ✅ Ready | `ANALYZE=true npm run build` |
| **Bundle Size Checker** | Enforce limits | ✅ Active | `scripts/check-bundle-size.js` |
| **Workspace Bundle Analyzer** | Component-level analysis | ✅ Ready | `scripts/analyze-workspace-bundle.js` |
| **Grafana Faro** | Frontend observability | ✅ Active | `src/app/faro.client.ts` |
| **Sentry** | Error tracking | ✅ Active | `next.config.ts` |
| **PostHog** | Product analytics | ✅ Active | Event capture, feature flags |
| **Microsoft Clarity** | Session recording | ✅ Active | Heatmaps, user behavior |

### Backend (sheenapps-claude-worker) ✅ Fully Instrumented

| Tool | Purpose | Status |
|------|---------|--------|
| **OpenTelemetry** | Distributed tracing | ✅ Full instrumentation |
| **Pino Logger** | Structured logging | ✅ With trace context |
| **BullMQ** | Job queue monitoring | ✅ Observable |

### How to Use Existing Tools

```bash
# 1. Bundle Analysis (run after build)
cd sheenappsai
ANALYZE=true npm run build
# Opens browser with bundle visualization

# 2. Check Bundle Sizes
npm run check-bundle-size

# 3. Detailed Workspace Analysis
npm run analyze:workspace

# 4. View Web Vitals (in browser console)
# Already logging to console in development
# Sending to /api/analytics/web-vitals in production
```

---

## 3. Key Pages to Audit

### Priority Order (by user traffic & performance criticality)

| Priority | Page | Route | Why Critical |
|----------|------|-------|--------------|
| **P0** | Builder Workspace | `/:locale/builder/workspace/[projectId]` | Core product, highest interaction density, 337KB bundle |
| **P1** | Builder New | `/:locale/builder/new` | First-time experience, sets expectations |
| **P1** | Dashboard | `/:locale/dashboard` | User hub, frequent visits |
| **P2** | Landing Page | `/` | First impression, 340KB bundle |
| **P2** | Pricing | `/:locale/pricing` | Conversion-critical |

---

## 4. Bundle Analysis: Current State

### First-Load JS by Page

```
Page                                          Size
──────────────────────────────────────────────────
Homepage (/)                                  340KB  ❌ Target: 200KB
Builder Workspace                             337KB  ❌ Target: 150KB
Dashboard                                     ~280KB (estimated)
Pricing                                       ~200KB (estimated)
```

### Heavy Dependencies (Verified via Codebase Audit)

**False positives removed after verification:**
- ~~esbuild-wasm~~ → **DEAD CODE** - not imported anywhere, cleanup script never run
- ~~Monaco editor~~ → **NOT USED** - zero imports found

**Actual dependencies affecting bundle:**

| Package | Size Impact | Used In | Status |
|---------|-------------|---------|--------|
| `react-syntax-highlighter` | ~100KB+ | Builder code viewer (`code-content.tsx`) | ❌ **Not lazy-loaded** - real bottleneck |
| `lucide-react` | ~50KB+ if not tree-shaken | Everywhere | ⚠️ `optimizePackageImports` enabled |
| `date-fns` | ~30KB+ | Various | ⚠️ `optimizePackageImports` enabled |
| `framer-motion` | ~40KB | Animations | ✅ Properly wrapped in LazyMotion |
| `recharts` | ~100KB+ | Admin only (`/admin/revenue`, `/admin/usage`) | ✅ Not in builder path |

**Action items:**
1. Remove `esbuild-wasm` from package.json (dead dependency)
2. Lazy-load `react-syntax-highlighter` in code viewer
3. Run cleanup script or manually remove dead preview service files

---

## 5. Bundle Budget: Shell vs Editor (Recommended Approach)

**Key insight:** A flat "150KB for builder" target is misleading. Split it:

| Component | Target | What It Includes | User Feel |
|-----------|--------|------------------|-----------|
| **Workspace Shell** | ≤ 150KB transferred | Header, sidebar, chat panel skeleton, preview frame | "I can interact immediately" |
| **Code Viewer Chunk** | Lazy-loaded after shell | `react-syntax-highlighter`, virtualized view | Loads while user orients |
| **Heavy Features** | On-demand | Infrastructure drawer, schema browser, etc. | Loaded when clicked |

**Measuring correctly (don't confuse these):**
- **Transferred JS** (gzip/brotli) → what goes over the wire
- **Total JS parsed/executed** → what blocks main thread
- **Main-thread time to interactive shell** → what user feels

Users don't feel KB; they feel main-thread blockage.

---

## 6. Top Bottlenecks (Prioritized by User Pain)

### 🔴 P0: Interaction Jank (INP/Long Tasks)

#### Bottleneck 1: react-syntax-highlighter Not Lazy-Loaded
- **Evidence:** Imported directly in `code-content.tsx`, included in initial bundle
- **Impact:** ~100KB+ added to first load, delays shell interactivity
- **Root Cause:** Direct import instead of dynamic import
- **Fix:**
  ```typescript
  // In code-content.tsx - lazy load the highlighter
  const SyntaxHighlighter = dynamic(
    () => import('react-syntax-highlighter').then(mod => mod.Prism),
    { ssr: false, loading: () => <CodeSkeleton /> }
  )
  ```
- **Expected Impact:** -100KB from shell bundle, faster INP

#### Bottleneck 2: Re-renders During Typing
- **Evidence:** Need to profile with React DevTools
- **Impact:** Dropped frames, input lag
- **Root Cause:** State updates propagating to unmemoized components
- **Fix:**
  ```typescript
  // Memoize expensive components
  const FileTree = memo(FileTreeComponent, (prev, next) =>
    prev.files === next.files && prev.selected === next.selected
  )

  // Debounce expensive state writes
  const debouncedSave = useDebouncedCallback(saveToServer, 500)
  ```
- **Expected Impact:** Remove 50ms+ long tasks during typing

### 🟠 P1: Slow First View (LCP/TTFB)

#### Bottleneck 3: Homepage Bundle Bloat
- **Evidence:** 340KB (target 200KB)
- **Impact:** Slow LCP on mobile, poor first impression
- **Root Cause:** All marketing sections bundled together, animations loaded upfront
- **Fix:**
  ```typescript
  // Split landing sections
  const FeatureShowcase = dynamic(() => import('./features'), {
    loading: () => <FeatureSkeleton />
  })

  const Testimonials = dynamic(() => import('./testimonials'))
  ```
- **Expected Impact:** -100KB initial load, LCP <2.5s on 4G

#### Bottleneck 4: Waterfall Data Fetching
- **Evidence:** Need to trace with OpenTelemetry
- **Impact:** Slow TTFB, delayed content
- **Root Cause:** Sequential API calls instead of parallel
- **Fix:**
  ```typescript
  // Parallelize data fetching
  const [projects, user, stats] = await Promise.all([
    getProjects(),
    getUser(),
    getStats()
  ])
  ```
- **Expected Impact:** TTFB -200-500ms

### 🟡 P2: Background Inefficiency

#### Bottleneck 5: Unvirtualized Lists
- **Evidence:** Check FileTree, logs, history components
- **Impact:** Memory + CPU during scroll
- **Root Cause:** Rendering all items
- **Fix:**
  ```typescript
  // Already have react-window, ensure it's used
  import { FixedSizeList } from 'react-window'

  <FixedSizeList
    height={400}
    itemCount={items.length}
    itemSize={32}
  >
    {Row}
  </FixedSizeList>
  ```
- **Expected Impact:** Smooth scrolling, lower memory

---

## 6. Measurement Protocol

### Step 1: Get Baseline (Before Optimization)

```bash
# 1. Build production
cd sheenappsai
npm run build

# 2. Record bundle sizes
npm run check-bundle-size > baseline-bundles.txt

# 3. Start production server
npm run start

# 4. Run Lighthouse on key pages
# Chrome DevTools > Lighthouse > Mobile > Performance
# Test: /, /en/dashboard, /en/builder/workspace/test-project

# 5. Record Performance traces
# Chrome DevTools > Performance > Record page load + interactions
```

### Step 2: Profile Key Interactions

For each priority page, record:

1. **Page Load** (cold cache)
2. **Key Interactions:**
   - Builder: Type in editor, open file, switch tabs, save
   - Dashboard: Load projects, click project, filter
   - Landing: Scroll, click CTA

3. **Look For:**
   - Long tasks (>50ms blocks in flame chart)
   - Heavy Recalculate Style / Layout
   - Expensive scripts (identify function names)

### Step 3: Document Findings

Create per-page analysis with:
- Screenshot of Lighthouse scores
- Screenshot of biggest long tasks
- List of "expensive" operations with timestamps

---

## 7. Fix Plan by Priority

### Phase 1: Immediate (Critical Path)

| Fix | Page | Expected Impact | Effort | Status |
|-----|------|-----------------|--------|--------|
| Dynamic import code editor | Builder | N/A | N/A | ✅ N/A (no heavy editor) |
| Dynamic import syntax highlighter | Builder | -80KB JS | Low | ✅ Done |
| Defer esbuild-wasm to idle | Builder | Better perceived perf | Low | ✅ Done (removed dead code) |
| Split homepage sections | Landing | -100KB JS | Medium | ✅ Done |

### Phase 2: Short-term

| Fix | Page | Expected Impact | Effort | Status |
|-----|------|-----------------|--------|--------|
| Memoize builder components | Builder | Remove long tasks | Medium | ✅ Done (MessageComponent) |
| Debounce editor state writes | Builder | Smoother typing | Low | ✅ Done (already implemented) |
| Virtualize file tree | Builder | Smooth scroll, lower memory | Medium | ⚠️ Low priority (useMemo sufficient) |
| Parallelize API calls | All | TTFB -200ms | Low | ✅ Done |
| Audit date-fns imports | All | -10-20KB | Low | ✅ Done (already optimized) |

### Phase 3: Medium-term

| Fix | Page | Expected Impact | Effort | Status |
|-----|------|-----------------|--------|--------|
| Replace recharts with lighter alt | Dashboard | -50KB+ | High | ⏳ Pending |
| Implement route prefetching | All | Faster navigation | Medium | ⏳ Pending |
| Add ISR to more pages | All | Better TTFB | Medium | ⏳ Pending |
| Profile & fix re-renders | All | Better INP | High | ⏳ Pending |

---

## 8. Real User Monitoring (RUM) Setup

### Already Tracking (via web-vitals.tsx)
- CLS, INP, FCP, LCP, TTFB
- Sent to `/api/analytics/web-vitals`

### Two "Snappiness" Metrics That Matter More Than Lighthouse

These catch the "it feels sticky" problems that standard metrics miss:

| Metric | What It Measures | Target | How to Capture |
|--------|------------------|--------|----------------|
| **Time to First Meaningful UI** | Workspace shell visible & clickable | < 1.5s | Custom mark at shell render |
| **Typing Long Tasks** | Main thread blocks >50ms during editor input | 0 occurrences | DevTools profiling during typing |

### Recommended Custom Spans

```typescript
// In relevant components, track UX-critical operations:

// 1. Time to First Meaningful UI (shell clickable)
// In workspace-core.tsx or equivalent
useEffect(() => {
  performance.mark('workspace-shell-ready')
  performance.measure('ttfmui', 'navigationStart', 'workspace-shell-ready')
  const entry = performance.getEntriesByName('ttfmui')[0]
  if (entry) reportCustomMetric('ttfmui', entry.duration)
}, [])

// 2. First AI response token (critical for perceived speed)
performance.mark('ai-request-sent')
// ... on first streaming token
performance.mark('ai-first-token')
performance.measure('ai-ttft', 'ai-request-sent', 'ai-first-token')

// 3. Save project
performance.mark('save-start')
// ... after save completes
performance.mark('save-done')
performance.measure('save-project', 'save-start', 'save-done')

// 4. Tab/section switch
performance.mark('tab-switch-start')
// ... after new content renders
performance.mark('tab-switch-done')
performance.measure('tab-switch', 'tab-switch-start', 'tab-switch-done')
```

### Send to Analytics

```typescript
// Extend existing web-vitals reporter
const reportCustomMetric = (name: string, value: number) => {
  fetch('/api/analytics/custom-metrics', {
    method: 'POST',
    body: JSON.stringify({ name, value, timestamp: Date.now() })
  })
}
```

---

## 9. Perf Regression Gates (CI/CD)

Bundle size checks are necessary but insufficient. "Snappy" regressions often come from re-render storms, not bundle growth.

### Recommended CI Gates

| Gate | Tool | Threshold | When to Run |
|------|------|-----------|-------------|
| **Bundle size** | `check-bundle-size` | Shell ≤150KB, total ≤350KB | Every PR |
| **Executed JS time** | Playwright + trace | No increase >10% on workspace load | Every PR |
| **Long tasks during interaction** | Playwright + trace | No new >50ms tasks during typing | Weekly or release |
| **Web Vitals trend** | Admin dashboard alert | INP/LCP p75 ≤ previous release | Post-deploy |

### Playwright Performance Trace Example

```typescript
// e2e/performance/workspace-load.spec.ts
import { test, expect } from '@playwright/test'

test('workspace shell loads without long tasks', async ({ page, browser }) => {
  // Start tracing
  await browser.startTracing(page, { screenshots: true, categories: ['devtools.timeline'] })

  await page.goto('/en/builder/workspace/test-project')

  // Wait for shell to be interactive
  await page.waitForSelector('[data-testid="workspace-shell"]', { state: 'visible' })

  const trace = await browser.stopTracing()
  const traceJson = JSON.parse(trace.toString())

  // Find long tasks (>50ms)
  const longTasks = traceJson.traceEvents.filter(
    e => e.name === 'RunTask' && e.dur > 50000 // microseconds
  )

  expect(longTasks.length).toBeLessThan(3) // Allow max 2 long tasks during load
})
```

---

## 10. Testing Checklist

### Before Each Release

- [ ] Run `npm run check-bundle-size` - shell ≤150KB, total ≤350KB
- [ ] Run Lighthouse on `/` - LCP < 2.5s, Performance > 80
- [ ] Run Lighthouse on `/en/builder/workspace/test` - Performance > 70
- [ ] Check Web Vitals dashboard: INP p75 < 200ms
- [ ] Manual test: Type in builder for 30 seconds - should feel instant
- [ ] Compare metrics to previous release (no regressions)

### Monthly Review

- [ ] Review Web Vitals trends in Grafana/PostHog
- [ ] Review Sentry for performance-related errors
- [ ] Profile builder with Chrome DevTools
- [ ] Check bundle growth (should not increase without reason)

---

## 10. Quick Reference Commands

```bash
# Bundle analysis
ANALYZE=true npm run build          # Visual bundle analyzer
npm run check-bundle-size           # Enforce size limits
npm run analyze:workspace           # Component-level breakdown

# Performance testing
npm run test:performance            # Vitest performance tests
npm run test:memory                 # Memory leak detection

# Production build test
npm run build && npm run start      # Test production mode locally

# Lighthouse CLI (optional)
npx lighthouse http://localhost:3000 --preset=perf --throttling.cpuSlowdownMultiplier=4
```

---

## Appendix A: Current next.config Optimizations

```typescript
// Already configured in next.config.ts:
experimental: {
  optimizePackageImports: ['lucide-react', 'date-fns', 'sonner', 'recharts']
}

// Caching headers configured for:
// - Static assets: 1 week + SWR
// - _next/static: 1 year (immutable)
// - API routes: 5 minutes + SWR
// - HTML: 1 hour + SWR
```

---

## Appendix B: Worker Performance Notes

The backend (sheenapps-claude-worker) has full OpenTelemetry instrumentation. Key areas to monitor:

1. **Queue Processing Time** (BullMQ jobs)
2. **Claude API Latency** (streaming response TTFT)
3. **Database Query Time** (PostgreSQL via Supabase)
4. **File Operations** (S3 presigned URLs)

Use Grafana dashboards to correlate frontend TTFB with backend processing time.

---

## Summary: Top 3 Actions for Maximum Impact

**Based on verified codebase analysis (not assumptions):**

1. **Lazy-load react-syntax-highlighter** → -100KB from shell bundle, faster TTFMUI
   - Location: `src/components/builder/code-viewer/code-content.tsx`
   - Currently: Direct import (loads with shell)
   - Fix: `dynamic(() => import('...'), { ssr: false })`

2. **Remove dead esbuild-wasm dependency** → Cleaner bundle, accurate analysis
   - Location: `package.json`
   - Files to delete: `src/services/preview/esbuild-bundler.ts` and related

3. **Store Web Vitals + build admin dashboard** → Visibility into actual user experience
   - Current: `/api/analytics/web-vitals` logs then discards
   - Fix: Store to database with aggregation, create `/admin/performance`

**Secondary actions:**
- Split homepage sections into lazy chunks → -50-100KB LCP improvement
- Memoize + debounce builder state → Remove typing jank
- Add release comparison to admin dashboard → Catch regressions fast

**What we DON'T need to do (false positives eliminated):**
- ~~Optimize esbuild-wasm~~ → Dead code, not used
- ~~Split Monaco editor~~ → Not used
- ~~Optimize recharts in builder~~ → Only in admin pages

---

## 11. Expert Advice Evaluation (Fastify + Next.js)

Critical analysis of external recommendations against our actual codebase.

### What's ALREADY IMPLEMENTED (Don't Duplicate)

| Expert Recommendation | Our Status | Evidence |
|-----------------------|------------|----------|
| Request ID tracing | ✅ Done | `middleware.ts:15-89` generates `x-request-id`, worker has `correlationIdMiddleware.ts` |
| Fastify onRequest/onResponse hooks | ✅ Done | `apiMetricsMiddleware.ts:101-186` tracks duration, route, status |
| Response time per route | ✅ Done | Sampled to `AdminMetricsService` |
| APM in prod | ✅ Done | OpenTelemetry + Sentry + Grafana Faro |
| Pino async logging | ✅ Done | Already configured with trace context |
| SSE connection tracking | ✅ Done | `sseConnectionManager.ts` - Redis-based with limits, LRU eviction |

### What's ACTUALLY A GAP (Fix These)

| Gap | Priority | Why It Matters |
|-----|----------|----------------|
| **Web Vitals not stored** | 🔴 High | `/api/analytics/web-vitals` logs then discards data - can't visualize |
| **No admin performance page** | 🔴 High | Metrics exist but no dashboard to see them |
| **W3C traceparent not propagated** | 🟡 Medium | OpenTelemetry context doesn't flow from Next.js→Worker |
| **Request ID format mismatch** | 🟢 Low | Next.js uses `req_xxx`, Worker expects UUID - works but inconsistent |

### What's OVER-ENGINEERING (Skip These)

| Expert Suggestion | Verdict | Reason |
|-------------------|---------|--------|
| clinic.js / 0x in admin panel | ❌ Skip | Dev-time profiling tools, not production dashboards. OpenTelemetry is always-on and better. |
| Build custom Prometheus `/metrics` endpoint | ❌ Skip | OpenTelemetry already exports to Grafana. Adding prom-client is redundant. |
| autocannon load testing | 🟡 Optional | Useful for stress tests but don't build into admin panel. Run manually when needed. |
| Session replay for "it felt slow" | ❌ Skip | Microsoft Clarity already does this. Don't add another tool. |

### Backend Targets (Realistic for Our Stack)

| Metric | Target | Excludes |
|--------|--------|----------|
| Worker p50 | < 100ms | AI streaming calls (Claude API) |
| Worker p95 | < 300ms | AI streaming calls |
| p95 > 500ms endpoints | Trace + investigate | Before optimization |

---

## 12. Admin Performance Dashboard Implementation

### Architecture (Minimal, Not Over-Engineered)

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA SOURCES (Already Exist)                 │
├─────────────────────────────────────────────────────────────────┤
│ Web Vitals        → /api/analytics/web-vitals (needs storage)   │
│ Backend Latency   → AdminMetricsService (already collecting)    │
│ Traces            → Grafana/Sentry (deep-link, don't duplicate) │
│ Errors            → Sentry (deep-link, don't duplicate)         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                   ADMIN PERFORMANCE PAGE                         │
│                   /admin/performance                             │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ INP p75     │ │ LCP p75     │ │ TTFB p95    │ │ Worker p95  │ │
│ │ 180ms ✅    │ │ 2.1s ✅     │ │ 340ms ✅    │ │ 220ms ✅    │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Slowest 20 Requests (last 24h)                              │ │
│ │ Route              Duration  Status  User     [View Trace]  │ │
│ │ /api/build/start   1.2s      200     user@... [→ Sentry]    │ │
│ │ /api/chat/send     890ms     200     user@... [→ Grafana]   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Web Vitals by Route (7-day trend)                           │ │
│ │ [Chart: INP/LCP/TTFB lines over time]                       │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Implementation Tasks

#### Task 1: Store Web Vitals (Critical Gap)

The endpoint exists but discards data. Fix:

```typescript
// File: sheenappsai/src/app/api/analytics/web-vitals/route.ts
// CURRENT: Just logs and returns
// NEEDED: Store in database

import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const data = await request.json()
  const supabase = await createClient()

  // Store with sampling (e.g., 20% of requests)
  if (Math.random() < 0.2) {
    await supabase.from('web_vitals').insert({
      metric_name: data.name,      // INP, LCP, CLS, TTFB
      value: data.value,
      rating: data.rating,         // good, needs-improvement, poor
      route: data.url,
      user_agent: request.headers.get('user-agent'),
      build_version: process.env.VERCEL_GIT_COMMIT_SHA,
      created_at: new Date().toISOString()
    })
  }

  return NextResponse.json({ success: true })
}
```

**Database tables needed:**

```sql
-- Raw samples (sampled 5-20%, kept 7-14 days)
CREATE TABLE web_vitals_raw (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  metric_name TEXT NOT NULL,        -- INP, LCP, CLS, TTFB
  value NUMERIC NOT NULL,
  rating TEXT,                      -- good, needs-improvement, poor
  route TEXT,
  device_class TEXT,                -- mobile, tablet, desktop (parsed from UA)
  browser TEXT,                     -- chrome, safari, firefox (parsed from UA)
  build_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Don't store raw user_agent (high-cardinality + privacy risk)
-- Parse to device_class + browser instead

CREATE INDEX idx_vitals_raw_metric_created ON web_vitals_raw(metric_name, created_at DESC);
CREATE INDEX idx_vitals_raw_route ON web_vitals_raw(route);

-- Hourly aggregates (kept 90 days, fast for dashboard)
CREATE TABLE web_vitals_hourly (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  hour TIMESTAMPTZ NOT NULL,
  metric_name TEXT NOT NULL,
  route TEXT,
  build_version TEXT,
  p50 NUMERIC,
  p75 NUMERIC,
  p95 NUMERIC,
  sample_count INT,
  good_count INT,
  needs_improvement_count INT,
  poor_count INT,
  UNIQUE (hour, metric_name, route, build_version)
);

CREATE INDEX idx_vitals_hourly_lookup ON web_vitals_hourly(metric_name, hour DESC);

-- Aggregation job (run hourly via cron or pg_cron)
-- INSERT INTO web_vitals_hourly (hour, metric_name, route, build_version, p50, p75, p95, ...)
-- SELECT date_trunc('hour', created_at), metric_name, route, build_version,
--        percentile_cont(0.5) WITHIN GROUP (ORDER BY value),
--        percentile_cont(0.75) WITHIN GROUP (ORDER BY value),
--        percentile_cont(0.95) WITHIN GROUP (ORDER BY value), ...
-- FROM web_vitals_raw WHERE created_at >= NOW() - INTERVAL '1 hour'
-- GROUP BY 1, 2, 3, 4
-- ON CONFLICT DO UPDATE ...

-- Retention: raw 14 days, hourly 90 days
-- DELETE FROM web_vitals_raw WHERE created_at < NOW() - INTERVAL '14 days';
-- DELETE FROM web_vitals_hourly WHERE hour < NOW() - INTERVAL '90 days';
```

**Why aggregation matters:**
- Raw samples balloon fast (~10K rows/day at 10% sample rate)
- Dashboard queries are instant against hourly aggregates
- p50/p75/p95 pre-computed = no runtime percentile calculation

#### Task 2: Create Admin Performance Page

```typescript
// File: sheenappsai/src/app/admin/performance/page.tsx

export default async function AdminPerformancePage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1>Performance Dashboard</h1>
        {/* Time range + release comparison controls */}
        <div className="flex gap-2">
          <TimeRangeSelector options={['24h', '7d', '30d']} />
          <ReleaseCompareToggle />
        </div>
      </div>

      {/* Metric Cards with release comparison */}
      <Suspense fallback={<MetricCardsSkeleton />}>
        <MetricCards />
      </Suspense>

      {/* Slow Requests Table */}
      <Suspense fallback={<TableSkeleton />}>
        <SlowRequestsTable />
      </Suspense>

      {/* Web Vitals Trend Chart with release markers */}
      <Suspense fallback={<ChartSkeleton />}>
        <WebVitalsTrendChart showReleaseMarkers />
      </Suspense>
    </div>
  )
}

// Metric card component with comparison
function MetricCard({ label, current, previous, target, unit }) {
  const delta = previous ? ((current - previous) / previous * 100) : null
  const isRegression = current > target

  return (
    <Card className={isRegression ? 'border-red-500' : ''}>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold">
        {current}{unit}
        {delta && (
          <span className={delta > 0 ? 'text-red-500' : 'text-green-500'}>
            {delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      <div className="text-xs">Target: &lt;{target}{unit}</div>
    </Card>
  )
}
```

#### Task 3: Trace Propagation (Keep It Simple)

**Don't overbuild.** The worker already has OpenTelemetry that extracts context from incoming headers.

**Practical approach (90% of debugging value):**

```typescript
// In any Next.js API route or server action that calls the worker:
// Just forward trace headers if present

async function callWorker(path: string, options: RequestInit) {
  const headers = new Headers(options.headers)

  // Forward trace context if present (browser may send via Faro)
  const incomingHeaders = headers
  const traceparent = incomingHeaders.get('traceparent')
  const tracestate = incomingHeaders.get('tracestate')

  if (traceparent) headers.set('traceparent', traceparent)
  if (tracestate) headers.set('tracestate', tracestate)

  // x-request-id remains the human-friendly join key
  // (already implemented in middleware.ts)

  return fetch(`${WORKER_URL}${path}`, { ...options, headers })
}
```

**What NOT to do:**
- Don't add complex OTel middleware injection to Next.js edge runtime
- Don't try to instrument all fetch calls automatically
- Don't worry about browser→Next.js trace continuity unless you need it

**Result:** Worker traces link to Next.js via x-request-id (always) and traceparent (when present).

#### Task 4: Admin API for Performance Metrics

```typescript
// File: sheenappsai/src/app/api/admin/metrics/performance/route.ts

export async function GET(request: NextRequest) {
  await requireAdmin(request)

  const supabase = await createClient()
  const timeRange = request.nextUrl.searchParams.get('range') || '24h'

  // Get p75 for each metric
  const { data: vitals } = await supabase.rpc('get_web_vitals_percentiles', {
    time_range: timeRange,
    percentile: 75
  })

  // Get slowest requests from AdminMetricsService
  const slowRequests = await AdminMetricsService.getSlowestRequests(20)

  return NextResponse.json({
    webVitals: vitals,
    slowRequests,
    targets: {
      inp: 200,
      lcp: 2500,
      ttfb: 800,
      workerP95: 300
    }
  })
}
```

### What NOT to Build (Avoid Over-Engineering)

| Don't Build | Instead Do |
|-------------|------------|
| Full traces viewer | Deep-link to Sentry/Grafana |
| Session replay viewer | Deep-link to Microsoft Clarity |
| Custom flamegraph viewer | Use Chrome DevTools for episodic debugging |
| Real-time metrics websocket | Polling every 30s is fine for admin |
| Per-user performance breakdown | Aggregate by route, not by user |

### Security Requirements (Non-Negotiable)

- [ ] Admin RBAC enforced on `/admin/performance`
- [ ] Web Vitals endpoint: no PII stored (hash user IDs if needed)
- [ ] Slow requests: redact auth tokens, passwords in logged data
- [ ] 14-day retention max for raw vitals, aggregate for longer

---

## 13. End-to-End Tracing Setup

### Current State

```
Next.js                         Worker
┌──────────────────┐           ┌──────────────────┐
│ x-request-id: ✅  │ ────────► │ X-Correlation-Id: ✅│
│ traceparent: ❌   │           │ OpenTelemetry: ✅  │
└──────────────────┘           └──────────────────┘
```

### Target State

```
Next.js                         Worker
┌──────────────────┐           ┌──────────────────┐
│ x-request-id: ✅  │ ────────► │ X-Correlation-Id: ✅│
│ traceparent: ✅   │ ────────► │ OpenTelemetry: ✅  │
└──────────────────┘           └──────────────────┘
          │                              │
          └──────────► Grafana ◄─────────┘
                   (unified traces)
```

### Implementation

1. **Install @vercel/otel in Next.js** (if not present)
2. **Add instrumentation.ts** to register OpenTelemetry
3. **Propagate context in API calls** to worker

This enables: "This slow click was caused by X in the worker" - single trace view.

---

## 14. Recommended Audit Deliverables

For each of the top 5 pages, produce:

### 1-Pager Template

```markdown
# Performance Audit: [Page Name]
Date: YYYY-MM-DD

## Baseline Metrics
| Metric | Value | Target | Pass/Fail |
|--------|-------|--------|-----------|
| LCP    | X.Xs  | <2.5s  | ✅/❌     |
| INP    | Xms   | <200ms | ✅/❌     |
| TTFB   | Xms   | <800ms | ✅/❌     |

## Lighthouse Screenshot
[Attach mobile Lighthouse screenshot]

## Top 3 Bottlenecks
1. **[Issue]** - Evidence: [trace/flamegraph ref]
   - Impact: +Xms to Y metric
   - Root cause: [specific code/query]

2. ...

## Fix Plan
| Fix | Expected Impact | Effort |
|-----|-----------------|--------|
| ... | -XKB / -Yms    | Low/Med/High |
```

### Pages to Audit (Priority Order)

1. `/en/builder/workspace/[id]` - Core product
2. `/en/builder/new` - Onboarding
3. `/en/dashboard` - User hub
4. `/` - Landing page
5. `/en/pricing` - Conversion

---

## Appendix C: Dev-Time Profiling Tools (Not for Admin Panel)

Use these for episodic deep-dives, not production monitoring:

```bash
# CPU profiling with clinic.js (install globally or per-project)
npm install -g clinic
clinic doctor -- node dist/index.js  # Run worker
# Opens flamegraph in browser

# Quick flamegraph with 0x
npx 0x dist/index.js

# Load testing with autocannon
npx autocannon -c 100 -d 30 http://localhost:8080/api/health
```

These are developer tools. Don't try to integrate them into the admin panel.

---

## Appendix D: Improvement Ideas (Discovered During Implementation)

Ideas noted during implementation that may be worth exploring:

### Code Quality Findings

1. **Unused `userCtx` in advisor-matching routes**
   - File: `src/app/api/advisor-matching/match-requests/route.ts`
   - `makeUserCtx()` is called but the `userCtx` variable is never used - code uses `supabase` directly
   - May indicate incomplete migration to RLS context pattern
   - Consider: Audit similar routes for consistency

2. **Additional components for memoization**
   - `CleanBuildProgress` - renders frequently during builds
   - `StreamingStatus` - updates during streaming
   - `CompactBuildProgress` - event list component
   - Consider: Profile with React DevTools Profiler during actual streaming

3. **File tree virtualization consideration**
   - `FileTreePanel` already uses `useMemo` for tree construction and filtering
   - Actual virtualization (react-window/react-virtualized) may help with 100+ file projects
   - Consider: Measure actual performance with large file trees before implementing

### Infrastructure Opportunities

1. **Cron job for web vitals aggregation**
   - Migration creates `aggregate_web_vitals_hourly()` function
   - Need to set up actual cron trigger (pg_cron, Vercel cron, or edge function)
   - Also need `cleanup_web_vitals_data()` daily for retention

2. **Admin dashboard enhancements** (from expert review)
   - Release comparison toggle (we store `build_version`)
   - Deep-links to Grafana dashboards
   - RUM→backend trace correlation via `traceparent`
   - See: `/docs/ADMIN_PERFORMANCE_ENHANCEMENTS.md`

### Bundle Size Opportunities

1. **Dynamic import code editor** (Phase 1 pending)
   - Still ~150KB potential savings
   - Need to identify which code editor component is in use

2. **Recharts replacement** (Phase 3)
   - Only used in admin dashboards, not critical path
   - Alternatives: visx, chart.js, or lightweight custom SVG

---

## References

- [OpenTelemetry Context Propagation](https://opentelemetry.io/docs/concepts/context-propagation/)
- [Next.js OpenTelemetry Guide](https://nextjs.org/docs/app/guides/open-telemetry)
- [W3C Trace Context Specification](https://www.w3.org/TR/trace-context/)
- [Sentry Fastify Integration](https://sentry.io/for/fastify/)
- [Apitally - Fastify API Monitoring](https://apitally.io/fastify)
