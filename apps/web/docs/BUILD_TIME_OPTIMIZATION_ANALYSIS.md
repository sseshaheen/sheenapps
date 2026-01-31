# Build Time Optimization Analysis

**Date:** January 2026
**Current build time:** ~11 minutes (Vercel, 2-core / 8GB machine)
**Target:** <5 minutes
**Next.js version:** 15.5.10

---

**Current status: 29 Jan 2025 - 11:52AM**

Further route consolidation potential is limited. The remaining 82 admin routes and 163 non-admin routes are almost entirely non-proxy — they use AdminAuthService + adminApiClient, direct Supabase calls, Zod validation, streaming, binary responses, etc. Only 1 thin proxy route exists outside the areas we already consolidated. Consolidating these would require refactoring business logic, not just routing.

---

## Build Timeline Breakdown

| Phase | Duration | % of Total |
|-------|----------|------------|
| File download (2,630 files) | ~15s | 2% |
| `npm install` (2,229 packages) | ~35s | 5% |
| **Webpack compilation** | **4.7 min** | **43%** |
| **Type checking (`tsc`)** | **2.5 min** | **23%** |
| Page data collection + SSG (829 pages) | ~40s | 6% |
| Build trace collection | ~56s | 8% |
| Serverless function creation (21.7s) | ~22s | 3% |
| Deploy + build cache upload (802 MB) | ~2 min | 10% |

**Note:** `vercel.json` uses `npm install` instead of `npm ci`. Switching to `npm ci` skips dependency resolution and enforces the lockfile, shaving a few seconds off install and reducing risk of version drift. Not a major win, but free.

**Top 3 bottlenecks: Compilation (4.7m), Type checking (2.5m), Build traces (56s)**

---

## Root Cause Analysis

### 1. Webpack Compilation — 4.7 minutes (43%)

**Why it's slow:**

- **Source maps always generated** — `next.config.ts:132` forces `config.devtool = 'hidden-source-map'` for all production client builds. This is the slowest devtool option — generates full, separate `.map` files for every chunk. Per Vercel's build logs, Faro keys aren't even present ("Skipping upload"), so these maps are generated and thrown away. Additionally, Grafana Faro's bundler plugins are designed for client-side rendered apps — SSR isn't well-supported, making this plugin questionable for a Next.js SSR app even when keys are present.

- **519 API route files = 519 serverless functions** — Webpack must independently resolve, bundle, and tree-shake each one. Of these, **267 are thin worker proxies** (`callWorker`/`workerFetch`) that just forward to a Fastify backend. A catch-all proxy pattern already exists at `/api/worker/[...path]/route.ts` proving the pattern works — but hundreds of routes still use individual files instead.

- **131 page components** — Many with heavy imports (workspace at 832 kB First Load JS, dashboard at 581 kB).

- **Large dependency tree** — 2,229 installed packages including heavy ones: `@anthropic-ai/sdk`, `sanity` ecosystem, `@sentry/nextjs`, `framer-motion`, `recharts`, `styled-components`, `react-syntax-highlighter`.

- **Config wrappers enabling expensive behaviors** — The `withNextIntl → withSentryConfig → withBundleAnalyzer` chain isn't slow itself, but enables expensive build behaviors: Sentry injects `clientTraceMetadata`, instrumentation passes, and source map processing. The wrappers are fine — it's the behaviors they turn on that need gating.

### 2. Type Checking — 2.5 minutes (23%)

**Why it's slow:**

- Next.js runs `tsc` during build when `typescript.ignoreBuildErrors: false`.
- The tsconfig includes `**/*.ts` and `**/*.tsx` — every TypeScript file in the project.
- 650+ source files are type-checked during build, even though `tsc --noEmit` already runs in pre-commit hooks.
- `incremental: true` is set in tsconfig, but has limited benefit on Vercel since the `.tsbuildinfo` cache may not persist well between deploys.

**This is redundant work.** Type checking should be the CI pipeline's job, not the build's.

### 3. SSG — 829 Static Pages

The 829 pages come from 9 locales × ~92 unique pages. The `generateStaticParams` limits are well-configured (max 20 slugs per segment), so this is already optimized. The SSG phase itself only takes ~40s which is acceptable.

### 4. Build Traces + Cache — ~3 minutes combined

- Build trace collection takes ~56s. This phase walks the dependency graph for every serverless function to determine what files to include. **519 routes = 519 trace operations.** Reducing route count has a non-linear effect here.
- Build cache is **802 MB** — very large. Creating it takes ~83s, uploading ~10s. This is likely dominated by `.next/cache` (webpack build cache, image cache, etc.) rather than traced output. Output tracing excludes can reduce trace time and traced bundle size, but won't necessarily shrink this cache.

---

## Optimization Plan

### Phase 1: Quick Wins — low-risk changes (est. savings: 3–4 minutes)

#### 1A. Move type checking out of `next build` (save ~2.5 min)

Type checking already runs in pre-commit hooks. Running it again in `next build` is pure redundancy.

**Change:**
```ts
// next.config.ts
typescript: {
  ignoreBuildErrors: true,
},
```

**CI enforcement (required companion — this is non-negotiable):**
Add `npm run type-check` as a **required status check** in GitHub branch protection rules so type errors can never reach production. The build itself just shouldn't be the place that catches them.

**Hard rule:** If you adopt this change, CI _must_ fail on type errors. Add a GitHub Actions step or Vercel build check that runs `npm run type-check` and configure it as a required check for merging to `main`. Without this, skipping build-time type checking is a liability.

**Risk:** Low — as long as CI enforces `npm run type-check` as a required merge gate.
**Savings:** ~2.5 minutes

#### 1B. Stop generating source maps by default (save ~1–2 min)

Currently source maps are always generated for production client builds. Three independent mechanisms force this: our manual `config.devtool`, Sentry's `withSentryConfig` override, and Faro's webpack plugin.

**Changes required (all three must be addressed):**

1. **Next.js native config:**
```ts
productionBrowserSourceMaps: process.env.UPLOAD_SOURCEMAPS === 'true',
```

2. **Remove manual `config.devtool = 'hidden-source-map'`** from the webpack config entirely.

3. **Sentry source maps — the critical piece.** `withSentryConfig` internally forces `productionBrowserSourceMaps: true` and sets `devtool: 'hidden-source-map'`, overriding our config. The old `hideSourceMaps: true` option only affected post-build cleanup, not generation. Replace with:
```ts
sourcemaps: {
  disable: !uploadSourcemaps,  // Skip entire source map pipeline
  deleteSourcemapsAfterUpload: true,
},
```
AND add a post-composition webpack override to force `devtool: false` for production client builds when source maps are disabled (because `withSentryConfig` may still set it internally).

4. **Gate Faro plugin behind same flag:**
```ts
if (process.env.UPLOAD_SOURCEMAPS === 'true' && process.env.FARO_API_KEY && process.env.FARO_APP_ID) {
  // ...Faro plugin setup
}
```

**Risk:** Low. Sentry error tracking continues to work without source maps — stack traces just show minified names. Source maps can be enabled per-deploy with `UPLOAD_SOURCEMAPS=true`.
**Savings:** ~1–2 minutes (confirmed: first build without this fix showed 4.8 min compilation, unchanged from baseline)

#### 1C. Replace babel console removal with SWC (save ~15–30s)

The current webpack config iterates babel-loader rules to inject `babel-plugin-transform-remove-console`. SWC has this built-in and is faster:

**Change:**
```ts
// next.config.ts — add to top-level config
compiler: {
  removeConsole: {
    exclude: ['error', 'warn'],
  },
},
```

Then **remove** the entire `babel-plugin-transform-remove-console` block from the webpack config (lines 214–232).

**Risk:** None. SWC is Next.js's default compiler.
**Savings:** ~15–30s

#### 1D. Reduce build trace scope with output tracing excludes

Large directories irrelevant to runtime inflate the trace phase. Exclude them from server output tracing:

```ts
// next.config.ts — top-level config
outputFileTracingExcludes: {
  '/*': [
    'docs/**',
    'scripts/**',
    'tests/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    'legacy-for-deletion/**',
    'packages-idea-was-not-used/**',
    'tmp/**',
  ],
},
```

Note: the key `'/*'` is a route glob (matches all routes). Patterns should be kept narrow — don't use overly-broad globs that could accidentally exclude runtime dependencies.

**Risk:** Low. These directories contain no runtime code.
**Savings:** Can reduce trace time (~56s) and traced output size. May or may not meaningfully reduce Vercel's build cache (the 802 MB is likely dominated by `.next/cache`, not traced output) — measure before claiming victory here.

---

### Phase 2: Medium Effort (est. savings: 1–3 minutes)

#### 2A. Consolidate thin proxy API routes

Of 519 API routes, **267 are thin worker proxies** that just authenticate and forward to the Fastify backend. A catch-all proxy already exists at `/api/worker/[...path]/route.ts` and works well.

The `admin/inhouse/*` routes are prime candidates. Most follow identical patterns:
1. `requireAdmin('inhouse.read|write')`
2. `workerFetch('/v1/admin/inhouse/...')`
3. Return response

These could be consolidated into catch-all routes like `/api/admin/inhouse/[...path]/route.ts` with permission mapping, reducing ~100+ individual route files to a handful. Similarly, `inhouse/projects/[id]/*` routes using `withProjectOwner` + `callWorker` could use a single catch-all.

**Impact:** Every route removed is one fewer serverless function to compile, trace, and deploy. This affects compilation time, trace time (56s), serverless function creation (22s), and cache size (802 MB) — the effects compound.

**Risk:** Medium. Requires careful permission mapping and testing. Do it incrementally — start with one route group, validate, expand.

#### 2B. Turbopack production builds (controlled experiment)

We're on Next.js 15.5.10. Turbopack production builds (`next build --turbopack`) are **beta** in 15.5. They become stable/default in Next.js 16.

**Previous investigation (Jan 2026):** Turbopack was already tested on this codebase (see `docs/TURBOPACK_INVESTIGATION.md`). Results:
- Compiled in ~24s vs ~60–90s webpack locally — **speed gain is real**
- But **2 blockers** prevented it from working:

**Blocker 1: Dynamic i18n imports (Critical)**
```typescript
// This pattern fails with Turbopack:
const messages = await import(`../../../../messages/${locale}/admin.json`)
// Error: Can't resolve '../../../../messages/' <dynamic> '/admin.json'
```
Affected files: `src/app/[locale]/invite/[code]/page.tsx`, `src/app/[locale]/admin/advisor-matching/page.tsx`

**Fix:** Refactor to static import map:
```typescript
const messageLoaders: Record<string, () => Promise<any>> = {
  en: () => import('@/messages/en/admin.json'),
  ar: () => import('@/messages/ar/admin.json'),
  'ar-eg': () => import('@/messages/ar-eg/admin.json'),
  // ... all 9 locales
}
const messages = await messageLoaders[locale]()
```

**Blocker 2: Page resolution errors**
Several pages fail to resolve: `/[locale]/advisor/browse`, `/[locale]/advisor/dashboard/analytics`, `/_document`. Root cause unclear — possibly fixed in newer Turbopack versions or Next.js 16.

**Compatibility status (updated):**

| Plugin/Feature | Status |
|----------------|--------|
| `@sentry/nextjs` | Compatible via `runAfterProductionCompile` hook (15.3+) |
| `next-intl` | Compatible |
| `@grafana/faro-webpack-plugin` | **Not compatible** — webpack plugin. Remove (see 1B) |
| `@next/bundle-analyzer` | Needs standalone alternative |
| Babel console removal | **Not compatible** — but Phase 1C replaces it with SWC |
| Custom `config.devtool` | Not applicable — Phase 1B replaces with native config |
| `tailwindcss-rtl` | **Already removed** — Tailwind v4 has native RTL |
| Dynamic i18n imports | **Must refactor** (see Blocker 1 above) |

**Custom webpack loaders:** None found in the current config. The webpack customization is limited to devtool, babel plugin injection, and the Faro plugin — all addressed in Phase 1. No loader compatibility issues blocking Turbopack.

**Approach:**
1. Do Phase 1 wins first (get to ~7–8 min safely)
2. Fix Blocker 1 (dynamic i18n imports → static map pattern)
3. Then either:
   - **Upgrade to Next.js 16** and get Turbopack as the default (preferred — Blocker 2 may be resolved), or
   - **Stay on 15.5** and retest `next build --turbopack` after fixing Blocker 1

**Regression watchlist:** Validate chunking behavior, First Load JS sizes, and SSG output. Compare with current metrics (832 kB workspace, 581 kB dashboard, 829 SSG pages), not vibes.

**Risk:** Medium on 15.5 (beta + known blockers). Lower on Next.js 16 (stable).
**Savings:** 2–3 minutes on compilation (4.7m → ~1.5–2m based on Vercel benchmarks of 2–5x)

#### 2C. Make auth-gated pages dynamic

**Partially done.** Per the Turbopack investigation, `force-dynamic` was already applied to locale admin pages and dynamic imports were added for admin. Debug/test pages may still be statically generated:

```ts
// Check and apply to any remaining test/debug pages:
// src/app/[locale]/debug-db/page.tsx
// src/app/[locale]/auth-test/page.tsx
// src/app/[locale]/test-arabic-content/page.tsx
export const dynamic = 'force-dynamic'
```

**Risk:** Low — these pages require auth anyway.
**Savings:** Minor (~10–15s), but reduces trace scope.

---

### Phase 3: Larger Refactors (longer-term)

#### 3A. Bundle analysis and dependency audit

Run `npm run analyze` and review:
- **Workspace page: 832 kB First Load JS** — largest page by far
- `styled-components` + Tailwind — dual CSS-in-JS systems add bloat
- `react-syntax-highlighter` — very large; consider `shiki` or lazy loading
- `framer-motion` — verify tree-shaking via `@/components/ui/motion-provider`

#### 3B. Architectural: Next.js = frontend + BFF, Fastify = API surface

Long-term, the cleanest build-time and operational win is keeping Next.js focused on frontend + a few BFF routes, with the Fastify worker owning the real API surface. Every API route removed from Next.js is less compilation, fewer serverless artifacts, less trace scanning, smaller cache, and fewer deploy steps. It's not glamorous, but it's physics.

The proxy consolidation in 2A is the pragmatic first step toward this.

---

## Implementation Priority

| # | Action | Effort | Savings | Risk |
|---|--------|--------|---------|------|
| **1** | **Skip type checking in build + enforce in CI** | 1 line + CI config | **~2.5 min** | Low |
| **2** | **Stop generating source maps by default** | ~10 lines (remove more than add) | **~1–2 min** | Low |
| **3** | **SWC console removal (replace babel hack)** | ~10 lines (net removal) | **~15–30s** | None |
| **4** | **Output tracing excludes** | ~10 lines | **~10–20s (trace phase)** | Low |
| 5 | Consolidate proxy API routes | Incremental, days | ~30s–1 min (compounds) | Medium |
| 6 | Fix dynamic i18n imports (Turbopack prereq) | ~2 files | Unblocks #7 | Low |
| 7 | Turbopack build (after #6 + Next 16 upgrade) | Half day + testing | ~2–3 min | Medium |
| 8 | Dynamic remaining test/debug pages | ~5 files | ~10–15s | Low |

**Phase 1 (items 1–4): ~11 min → ~7–8 min. Low risk, can ship today.**
**Phase 1 + proxy consolidation + Turbopack: target ~4–5 min.**

> **Note:** Turbopack was already tested on this codebase (see `docs/TURBOPACK_INVESTIGATION.md`).
> The speed gain is real (~24s compile vs ~60–90s webpack locally), but 2 blockers must be fixed first.
> Phase 1 changes (1B, 1C) are also Turbopack prerequisites — they remove webpack-specific config
> (`config.devtool`, babel plugin) that has no Turbopack equivalent, making the migration cleaner.

---

## Measurement Plan

Track these metrics after each phase to validate savings and catch regressions:

| Metric | Baseline | v1 | v2 | v3 (2A+2A-2) | v4 (2A-3) | Where to find it |
|--------|----------|-----|-----|------|------|------------------|
| Total build time | ~11 min | 9 min | **8 min** | pending Vercel | pending Vercel | Vercel deploy logs (top-level) |
| npm install | ~35s | 71s (npm ci regressed) | **5s** (reverted to npm install + cache hit) | — | — | Install phase |
| Webpack compilation | 4.7 min | 4.8 min | **4.6 min** | **41s local** | **30.9s local** | `Compiling...` → `Compiled` |
| Type checking | 2.5 min | **Skipped** | **Skipped** | Skipped | Skipped | `Linting and checking validity of types` |
| Build trace collection | ~56s | ~64s | ~68s | pending | pending | `Collecting build traces` phase |
| Serverless function creation | 21.7s | 26.4s | **17s** | pending | pending | `Created all serverless functions` |
| Build cache size | 802 MB | 796 MB | (log truncated) | pending | pending | `Build Cache` line in deploy logs |
| First Load JS (workspace) | 832 kB | 831 kB | **831 kB** | **823 kB** | pending | Build output route table |
| First Load JS (dashboard) | 581 kB | 581 kB | **581 kB** | **574 kB** | pending | Build output route table |
| SSG page count | 829 | 829 | **829** | **829** | **829** | `Generating static pages` phase |
| API route count | 519 | 519 | 519 | **346** | **307** | Build output route table |

**Process:**
1. Record baseline from current production deploy
2. Apply Phase 1 changes → deploy → record all metrics
3. Compare. If total time didn't drop as expected, check which phase didn't shrink
4. Repeat for each subsequent phase

The build output already contains all of this — no extra tooling needed. Copy the relevant lines into a spreadsheet or comment on the PR.

---

## Implementation Log

### Phase 1 — Implemented (Jan 29, 2026)

All Phase 1 changes applied in a single pass. `tsc --noEmit` passes cleanly after changes.

#### 1A. Skip type checking in build — DONE
- `next.config.ts:68–70`: Set `typescript.ignoreBuildErrors: true`
- **CI gate:** `p0-tests.yml` runs `npm run type-check` on every push to main and every PR. Ensure this workflow is configured as a **required status check** in GitHub branch protection rules.

#### 1B. Stop generating source maps by default — DONE
- `next.config.ts:54`: Added `productionBrowserSourceMaps: process.env.UPLOAD_SOURCEMAPS === 'true'`
- Removed `config.devtool = 'hidden-source-map'` (was always-on for prod client builds)
- Faro plugin now gated behind `UPLOAD_SOURCEMAPS === 'true'` + API key checks
- Removed the "Skipping upload" console.log that ran on every build

#### 1C. Replace babel console removal with SWC — DONE
- `next.config.ts:72–77`: Added `compiler.removeConsole` with `exclude: ['error', 'warn']`
- Removed entire babel-loader iteration block (~20 lines) and the empty Terser minimizer extension
- Net effect: removed more code than added

#### 1D. Output tracing excludes — DONE
- `next.config.ts:40–50`: Added `outputFileTracingExcludes` for `docs/`, `scripts/`, `tests/`, `*.test.ts(x)`, `legacy-for-deletion/`, `packages-idea-was-not-used/`
- Excluded `tmp/` from plan — directory doesn't exist
- Key uses `'/*'` (route glob matching all routes), not `'*'`

#### npm ci — DONE then REVERTED
- `vercel.json`: Changed `installCommand` from `"npm install"` to `"npm ci"`
- **Reverted after first build.** `npm ci` took 71s vs ~35s with `npm install`. On Vercel, the restored build cache speeds up `npm install` (reuses cached packages), but `npm ci` always deletes `node_modules` and installs from scratch, bypassing the cache benefit. Net regression of ~36s. Kept `npm install`.

#### 2C. Make test/debug pages dynamic — DONE
- `debug-db/page.tsx`: Already had `force-dynamic` (no change needed)
- `auth-test/page.tsx`: Added `export const dynamic = 'force-dynamic'`
- `test-arabic-content/page.tsx`: Added `export const dynamic = 'force-dynamic'`
- **Note:** SSG page count stayed at 829. These pages are under `[locale]` which has `generateStaticParams`. The pages still appear as `●` (SSG) in the build output — they may be pre-rendered as static shells even with `force-dynamic`. Minimal impact on build time regardless.

### Phase 1 Build Results (v1) — Jan 29, 2026

**Total: ~11 min → 9 min (saved ~2 min).** Type checking skip worked as expected. But compilation time was **unchanged at 4.8 min** — the source map optimization had no effect.

**Root cause: Sentry was overriding our source map config.** `@sentry/nextjs`'s `withSentryConfig` wrapper internally:
1. Forces `productionBrowserSourceMaps: true` in the Next.js config, overriding our `false` setting
2. Sets `devtool: 'hidden-source-map'` via its webpack plugin, even though we removed our manual `config.devtool`
3. Does this regardless of whether `SENTRY_AUTH_TOKEN` is set — maps are generated even when they can't be uploaded

The `hideSourceMaps: true` option (which was set in our config) doesn't prevent generation — it only controls whether the `.map` files are deleted _after_ the build. The generation cost (which is the expensive part) still happens.

### Phase 1 Fix (v2) — Sentry source map override

Applied fix to properly gate Sentry's source map behavior:

1. **Replaced `hideSourceMaps: true` with `sourcemaps.disable: !uploadSourcemaps`** — tells Sentry's webpack plugin to skip the entire source map pipeline when `UPLOAD_SOURCEMAPS` is not set
2. **Added post-Sentry `devtool` override** — even with `sourcemaps.disable`, `withSentryConfig` may still set `devtool: 'hidden-source-map'`. A post-composition webpack override sets `devtool: false` for production client builds when source maps aren't needed
3. **Reverted npm ci → npm install** — eliminated the 36s install regression

Expected: compilation should drop from 4.8 min to ~3–3.5 min (no source map generation). Combined with type checking skip, total should be ~6–7 min.

### Phase 1 Build Results (v2) — Jan 29, 2026

**Total: ~11 min → 8 min (saved ~3 min).** The Sentry source map fix had **no measurable effect** on compilation — 4.6 min vs 4.7 min baseline is within noise. Either `sourcemaps.disable` doesn't fully prevent Sentry from modifying `devtool`, or source map generation was never the dominant cost in the 4.7 min compilation.

The real wins were:
- Type checking skip: **-2.5 min** (confirmed)
- `npm install` with restored build cache: **-30s** (5s vs 35s — previous build used npm ci which killed the cache)
- Serverless function creation: 17s vs 21.7s (minor)

**Compilation at 4.6 min is now 57% of total build time.** The remaining optimization levers are:
1. **Route consolidation (Phase 2A)** — reduce 519 serverless functions
2. **Turbopack (Phase 2B)** — fundamentally faster compilation

The source map optimization was worth keeping (it's correct practice and a Turbopack prerequisite) but didn't deliver the expected 1-2 min savings. The plan's estimated savings for 1B were wrong — the compilation cost is dominated by the sheer number of routes and dependency resolution, not source map generation.

### Phase 2A — Admin Inhouse Route Consolidation (Jan 29, 2026)

Replaced 133 thin proxy API routes under `src/app/api/admin/inhouse/` with a single catch-all route at `src/app/api/admin/inhouse/[...path]/route.ts`.

#### What was done
- Created `[...path]/route.ts` catch-all that handles GET, POST, PUT, PATCH, DELETE
- Permission mapping matches existing per-route behavior exactly:
  - `support/impersonate/confirm`, `support/impersonate/start`, `support/replay/requests/**`, `database/projects/*/tables/*/sample` → `inhouse.support`
  - All other GET → `inhouse.read`
  - All other POST/PUT/PATCH/DELETE → `inhouse.write`
- Path segments are `encodeURIComponent`-encoded (handles table names with special characters)
- Query parameters forwarded as-is
- Non-GET bodies parsed as JSON; gracefully handles no-body POST requests (e.g. `support/impersonate/end`)
- Deleted 133 route files and cleaned up empty directories

#### Routes kept separate (6 files)
| Route | Reason |
|-------|--------|
| `projects/[projectId]/forms/submissions/export` | Binary response, direct fetch with custom Content-Disposition |
| `projects/[projectId]/search/queries/export` | Same binary export pattern |
| `projects/[projectId]/suspend` | Zod validation + audit logging (session.user.id) |
| `inbox/messages/[messageId]/attachments/[index]` | Binary attachment data |
| `database/projects/[projectId]/query` | Custom 15s timeout override + custom error code forwarding |
| `support/impersonate/proxy/[...path]` | No requireAdmin() — uses X-Impersonation-Token header auth at worker level |

#### Route count change
- Before: 139 route files under `admin/inhouse/`
- After: 7 route files (1 catch-all + 6 special)
- Net reduction: 132 serverless functions (the catch-all replaces 133 routes but adds 1)

#### Build results
- **API routes: 519 → 387** (132 fewer serverless functions)
- **Compilation: 77s local** (down from baseline)
- Build succeeded, all 6 special routes visible in output alongside catch-all

### Phase 2A-2 — Inhouse Project Route Consolidation (Jan 29, 2026)

Replaced 42 thin proxy routes under `src/app/api/inhouse/projects/[id]/` with a single catch-all at `src/app/api/inhouse/projects/[id]/[...path]/route.ts`.

#### What was done
- Created `[...path]/route.ts` catch-all using inline auth (same pattern as `withProjectOwner` but with correct types for catch-all params)
- Auth flow: Supabase session → `requireProjectOwner()` → `callWorker()` → response
- For GET/DELETE: forwards `userId` as queryParam + passes through original search params + sends `claims: { userId }`
- For POST/PUT/PATCH: reads body, injects `userId`, forwards + sends `claims: { userId }`
- Gracefully handles no-body POST requests (e.g. restore, suspend actions)
- Deleted 42 route files across email-domains, mailboxes, registered-domains, inbox, and other subsystems

#### Routes kept separate (52 files with custom logic)
Routes were kept if they used ANY of: Zod validation, `assertSameOrigin` (CSRF), `intParam()`, `parseUuid()`/`parseDomain()`, direct Supabase/DB calls, `SecretsService`, `extraHeaders`, `getServerAuthState` (instead of `withProjectOwner`), streaming/SSE, raw body handling, or complex conditional logic.

Key categories kept:
- **Analytics** (6): manual auth, query param cherry-picking, direct Supabase calls
- **CMS** (4): Zod validation, CSRF, parseUuid
- **Jobs** (6): extraHeaders (`x-project-id`), manual validation, sys: prefix checks
- **Payments** (8): action-based routing, webhook signature verification, raw body handling
- **Secrets** (4): SecretsService class, direct DB calls
- **Storage** (3): extraHeaders, path traversal validation (`..` checks)
- **Deployments** (2): SSE streaming, manual auth
- **Others** (19): various custom patterns (domains, email, tables, exports, etc.)

#### Route count change
- Before: 95 route files under `inhouse/` (including 3 root-level + `projects/create`)
- After: 54 route files (1 catch-all + 53 kept separate/root-level)
- Net reduction: 41 serverless functions

#### Build results
- **API routes: 387 → 346** (41 fewer serverless functions)
- **Compilation: 41s local** (down from 77s after Phase 2A — nearly halved)
- SSG pages: 829 (unchanged)
- Catch-all visible in build output alongside all 49 kept-separate routes

#### Cumulative impact (after 2A + 2A-2)
- **Total API routes: 519 → 346** (173 fewer serverless functions, 33% reduction)
- **Local compilation: 41s** (vs ~77s after Phase 2A, ~4.7 min baseline on Vercel)

### Phase 2A-3 — Admin (Non-Inhouse) Route Consolidation (Jan 29, 2026)

Replaced 40 thin proxy routes under `src/app/api/admin/` (excluding `admin/inhouse/`) with a single catch-all at `src/app/api/admin/[...path]/route.ts`.

#### What was done
- Created `[...path]/route.ts` catch-all using `requireAdmin()` + `workerFetch()` + `noCacheResponse/noCacheErrorResponse`
- Permission mapping covers 6 domains with 11 distinct permission strings:
  - **alerts**: `alerts.read` (GET), `alerts.write` (mutations), `alerts.acknowledge` (acknowledge action)
  - **customer-360**: `customer_360.read` (GET), `customer_360.write` (mutations)
  - **customer-health**: `customer_health.read` (GET), `customer_health.write` (mutations)
  - **feature-flags**: `feature_flags.read` (GET), `feature_flags.write` (mutations)
  - **incidents**: `incidents.read` (GET), `incidents.create` (general mutations), `incidents.resolve` (resolve action), `incidents.edit_postmortem` (postmortem action)
  - **system-health**: `system_health.read` (GET only — no mutation routes)
- Special override: `alerts/*/create-incident` uses `incidents.create` (not `alerts.write`)
- Path segments `encodeURIComponent`-encoded; query parameters forwarded wholesale
- Unknown domains (paths not in the 6 supported domains) return 404
- Deleted 40 route files and cleaned up empty directories

#### Behavioral changes (minor, acceptable)
- Query param cherry-picking removed: some routes previously selected specific params and added defaults (e.g. `limit=50`, `offset=0`). The catch-all forwards all params to the worker, which handles its own defaults.
- `logger.info` audit logging removed from ~8 routes (e.g. alert acknowledge, incident create/resolve). The worker has its own audit trail via correlation IDs.
- One route (`feature-flags POST`) previously returned 201. The catch-all returns 200 for all successful responses. Clients check `ok: true` in the body, not HTTP status.

#### Routes kept separate (82 non-inhouse admin routes remain)
These use different patterns: `AdminAuthService` + `adminApiClient`, direct Supabase calls, Zod validation, binary exports, streaming, custom timeouts, etc. Includes:
- `customer-health/export` — binary CSV export with Content-Disposition
- `voice-analytics/recordings/[id]` — binary audio data
- All `auth/`, `builds/`, `dashboard/`, `exports/`, `feedback/`, `finance/`, `management/`, `metrics/`, `pricing/`, `promotions/`, `sanity/`, `support/tickets/`, `trust-safety/`, `users/`, `voice-analytics/` routes (various non-proxy patterns)

#### Route count change
- Before: 122 non-inhouse admin route files
- After: 83 route files (1 catch-all + 82 kept separate)
- Net reduction: 39 serverless functions (40 deleted - 1 catch-all added)

#### Build results
- **API routes: 346 → 307** (39 fewer serverless functions)
- **Compilation: 30.9s local** (down from 41s after Phase 2A-2)
- SSG pages: 829 (unchanged)

#### Cumulative impact (after 2A + 2A-2 + 2A-3)
- **Total API routes: 519 → 307** (212 fewer serverless functions, 41% reduction)
- **Local compilation: 30.9s** (vs 41s after 2A-2, 77s after 2A, ~4.7 min baseline on Vercel)

### Discoveries & Observations

1. **The babel console removal was doubly wasteful.** The webpack config had both an empty Terser minimizer extension (did nothing) AND the babel-loader iteration hack. The Terser block was dead code — it added an empty array to the minimizer list. Removed both.

2. **Sentry `hideSourceMaps` is a misleading name.** It doesn't hide source maps from the build process — it hides them from the deployed output _after_ they've already been generated. The generation is the expensive part (~1-2 min of compilation time). The option has been deprecated in `@sentry/nextjs` v8 in favor of the `sourcemaps` config object, which gives proper control over whether maps are generated at all.

3. **`withSentryConfig` overrides `productionBrowserSourceMaps`.** Even when you set `productionBrowserSourceMaps: false` in your Next.js config, `withSentryConfig` forces it back to `true` internally. This means the top-level config option alone is insufficient — you also need `sourcemaps.disable: true` in the Sentry options AND a post-composition `devtool: false` override.

4. **`npm ci` is slower than `npm install` on Vercel.** Vercel's build cache includes `node_modules`. `npm install` reuses it; `npm ci` deletes it and reinstalls from scratch. For CI pipelines without cached `node_modules`, `npm ci` is faster. On Vercel with build cache, `npm install` wins.

5. **`test-arabic-content` page imports `sanity.client` at the top level** and fetches content server-side without `force-dynamic`. This means it was being statically generated at build time, making a Sanity API call during SSG for every locale (9 calls). Adding `force-dynamic` prevents these unnecessary build-time fetches for a test page nobody visits via direct URL.

---

## Auth Pattern Discrepancy Analysis

During route consolidation, three distinct auth/proxy patterns were identified across the admin and inhouse API routes. This inconsistency increases cognitive load, makes it harder to write shared tooling, and creates subtle behavioral differences.

### Pattern A: `requireAdmin()` + `workerFetch()` (admin/inhouse routes)

**Used by:** `src/app/api/admin/inhouse/[...path]/route.ts`, `src/app/api/admin/[...path]/route.ts`
**Modules:** `@/lib/admin/require-admin`, `@/lib/admin/worker-proxy`

```typescript
const { error } = await requireAdmin('inhouse.read')
if (error) return error
const result = await workerFetch('/v1/admin/inhouse/...')
return noCacheResponse(result.data)
```

- `requireAdmin` checks session + permission in one call
- `workerFetch` adds auth headers via `AdminAuthService.getAuthHeaders()`, correlation IDs, timeout, safe body parsing
- Returns `{ ok, status, data, error, correlationId }`
- Convenience wrappers: `proxyGet`, `proxyPost`, `proxyPut`, `proxyPatch`, `proxyDelete`
- Response includes `x-correlation-id` header

### Pattern B: Supabase session + `requireProjectOwner()` + `callWorker()` (inhouse/projects routes)

**Used by:** `src/app/api/inhouse/projects/[id]/[...path]/route.ts`
**Modules:** `@/lib/supabase-server`, `@/lib/auth/require-project-owner`, `@/lib/api/worker-helpers`

```typescript
const supabase = await createServerSupabaseClientNew()
const { data: { user } } = await supabase.auth.getUser()
const ownerCheck = await requireProjectOwner(supabase, projectId, user.id)
if (!ownerCheck.ok) return ownerCheck.response
const result = await callWorker({ method, path, body, claims: { userId: user.id } })
```

- Auth is multi-step: create Supabase client → get user → check project ownership
- `callWorker` uses HMAC-based auth (`createWorkerAuthHeaders`) — different from `workerFetch`'s `AdminAuthService.getAuthHeaders()`
- Injects `userId` into query params AND body AND claims headers (redundant — see CLAUDE.md security note about IDOR)
- Returns `{ ok, status, data, error }` — no correlation ID
- No convenience wrappers; handler builds response manually with `NextResponse.json`

### Pattern C: `AdminAuthService.getAdminSession()` + `adminApiClient` (30 "medium" admin routes)

**Used by:** ~30 admin routes (feedback, finance, pricing, promotions, etc.)
**Modules:** `@/lib/admin/admin-auth-service`, `@/lib/admin/admin-api-client`

```typescript
const session = await AdminAuthService.getAdminSession()
if (!session) return noCacheErrorResponse('Unauthorized', 401)
// Manual permission check
if (!session.permissions.includes('feedback.read')) return noCacheErrorResponse('Forbidden', 403)
const data = await adminApiClient.get('/v1/admin/feedback')
```

- Session + permission check is manual (not via `requireAdmin` helper)
- `adminApiClient` is a separate HTTP client class with `.get()`, `.post()`, etc.
- Some routes include mock/fallback data for development
- No correlation IDs, no standardized error shape

### Recommendations for Future Consistency

1. **Standardize on `requireAdmin()` + `workerFetch()` for all admin routes.** Pattern A is the cleanest: single-call auth check, consistent error responses, correlation IDs for debugging. The remaining 82 admin routes that use Pattern C should be migrated to Pattern A over time.

2. **Eliminate `adminApiClient`.** It duplicates what `workerFetch` already does, but without correlation IDs, safe body parsing, or standardized error handling. Replace its ~30 call sites with `workerFetch` calls.

3. **Stop injecting `userId` in multiple places (Pattern B).** Per CLAUDE.md guidance, user context belongs in claims headers, not URL params AND body. The worker should extract identity from the signed HMAC headers (`x-sheen-claims`), not from the request body. This reduces IDOR risk and simplifies the proxy.

4. **Unify the worker HTTP clients.** Currently three modules exist for calling the worker:
   - `workerFetch()` in `@/lib/admin/worker-proxy` (admin routes, uses `AdminAuthService`)
   - `callWorker()` in `@/lib/api/worker-helpers` (inhouse routes, uses HMAC signing)
   - `adminApiClient` in `@/lib/admin/admin-api-client` (legacy admin routes)

   These should converge into two: one for admin-authenticated calls and one for user-authenticated calls. The `adminApiClient` should be retired entirely.

5. **Add correlation IDs to Pattern B.** The inhouse project catch-all doesn't generate or forward correlation IDs. Adding `x-correlation-id: crypto.randomUUID()` to `callWorker` calls would improve debuggability across both admin and user-facing proxy routes.

---

## Sources

- [Vercel: How to reduce build time with Next.js](https://vercel.com/kb/guide/how-do-i-reduce-my-build-time-with-next-js-on-vercel)
- [Vercel Community: Optimize build times for large Next.js apps](https://community.vercel.com/t/how-can-i-optimize-build-times-for-a-large-next-js-app-on-vercel/16802)
- [Next.js 15.5 release blog (Turbopack production builds)](https://nextjs.org/blog/next-15-5)
- [Next.js 16 release blog](https://nextjs.org/blog/next-16)
- [Turbopack 2026: Complete Guide](https://dev.to/pockit_tools/turbopack-in-2026-the-complete-guide-to-nextjss-rust-powered-bundler-oda)
- [Sentry: Next.js Build Options (Turbopack compatibility)](https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/build/)
- [Turbopack build feedback (GitHub Discussion)](https://github.com/vercel/next.js/discussions/77721)
- [Webpack devtool documentation](https://webpack.js.org/configuration/devtool/)
- [Next.js: Memory Usage Guide](https://nextjs.org/docs/app/guides/memory-usage)
- [Next.js: productionBrowserSourceMaps config](https://nextjs.org/docs/app/api-reference/config/next-config-js/productionBrowserSourceMaps)
- [GitHub: Build very slow (30+ min) discussion](https://github.com/vercel/next.js/discussions/65317)
- [DEV.to: Vercel Optimization Guide](https://dev.to/pipipi-dev/vercel-optimization-reducing-build-time-and-improving-response-2eji)
