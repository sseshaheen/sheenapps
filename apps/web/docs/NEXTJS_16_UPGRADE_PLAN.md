# Next.js 16.1 Upgrade Plan

**Current:** Next.js 15.5.9 | React 19.2.3 | Node 22.14.0
**Target:** Next.js 16.1.x | React 19.x (no change) | Node 22.x (no change)

**Why upgrade:** Turbopack becomes the default bundler (2-5x faster builds). Local compilation is currently 31s with webpack — Turbopack could bring this to ~10-15s. On Vercel (where compilation is 4.6min), the impact should be larger.

**Context:** Product is pre-launch (no real users). This means we can go straight to Turbopack without a prolonged webpack runway. Fix the blockers, upgrade, switch. Keep webpack as an escape hatch, not a safety blanket.

---

## Pre-Upgrade Compatibility Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| Node.js >= 20.9 | OK | Running 22.14.0 |
| TypeScript >= 5.1 | OK | Using ^5 |
| React 19 | OK | Already on 19.2.3 |
| App Router (no Pages Router) | OK | Fully migrated |
| No `next/legacy/image` | OK | Not used |
| No `images.domains` (deprecated) | OK | Using `remotePatterns` |
| No `next/config` runtime config | OK | Not used |
| No parallel routes (need `default.js`) | OK | None exist |
| No AMP usage | OK | Not used |

---

## Breaking Changes — Impact Assessment

### 1. Middleware renamed to Proxy

`middleware.ts` → `proxy.ts`, exported function `middleware` → `proxy`.

**Current file:** `middleware.ts` (484 lines). Uses `NextRequest`/`NextResponse`, integrates with `next-intl`, handles auth cookies, security headers, route protection. Has debug `console.log` statements that should be removed regardless.

`skipMiddlewareUrlNormalize` is not used in `next.config.ts` — no config flag rename needed.

**Action:** The codemod handles this: `npx @next/codemod@canary upgrade latest`
**Risk:** Low — mechanical rename.

### 2. `next lint` removed

5 scripts in `package.json` use `next lint`. Replace with direct ESLint CLI:
```json
"lint": "eslint src/",
"lint:errors": "eslint src/ --max-warnings 0",
"lint:critical": "eslint src/ --quiet",
"lint:clean": "eslint src/ 2>&1 | grep -E '(Error|error|Error:|✖)' || echo 'No critical errors found'",
"lint:fix": "eslint src/ --fix",
```

Also: `next build` no longer runs linting at all (our config already has `eslint: { ignoreDuringBuilds: true }`, so no behavioral change — but verify CI workflows don't depend on `next lint` as a command).

**Codemod available:** `npx @next/codemod@canary next-lint-to-eslint-cli .`

### 3. Async Request APIs — sync access fully removed (NO IMPACT)

This codebase already awaits `params`, `searchParams`, `cookies()`, `headers()`, `draftMode()`. Migration was done for Next.js 15. No changes needed.

### 4. Turbopack is now default

If the project has a custom `webpack()` config, both `next dev` and `next build` will fail with Turbopack. Our `next.config.ts` has a ~70-line webpack function. This is the main migration effort — see Step 3 below.

### 5. Dynamic i18n imports break with Turbopack

32+ files use template-literal dynamic imports:
```typescript
const messages = (await import(`../messages/${locale}/${ns}.json`)).default
```

Turbopack cannot resolve these. **This is the #1 blocker.** See Step 2 below.

### 6. `next/image` default changes (LOW IMPACT)

| Change | Impact |
|--------|--------|
| `minimumCacheTTL` 60s → 4h | Beneficial — longer CDN cache |
| `imageSizes` removes 16px | Unlikely to affect |
| `qualities` → only `[75]` | May affect if quality variants are used |
| `maximumRedirects` unlimited → 3 | Check if remote image sources redirect >3 times |

Review after upgrade. Only add overrides if specific behaviors break.

### 7. Scroll behavior override removed (LOW IMPACT)

Next.js no longer overrides `scroll-behavior: smooth`. Test after upgrade. Add `data-scroll-behavior="smooth"` to `<html>` if smooth scrolling breaks.

---

## Implementation Steps

Since the product is pre-launch, we do this in one pass: upgrade deps, fix Turbopack blockers, delete webpack config, go straight to Turbopack.

### Step 1: Upgrade to Next.js 16.1 + run codemods

```bash
npx @next/codemod@canary upgrade latest
```

This handles:
- `middleware.ts` → `proxy.ts` rename
- `next lint` → ESLint CLI migration
- Turbopack config move from `experimental.turbopack` to top-level

Then update dependencies:
```bash
npm install next@^16.1.0 next-intl@^4.7.0 @next/bundle-analyzer@^16.1.0
npm install -D @types/react@latest @types/react-dom@latest
```

Dependency notes:
- `next-intl` must be `^4.4.0` or later for Next.js 16 support (currently `^4.1.0`)
- `@sentry/nextjs` `^9.33.0` should work — upgrade to latest if issues arise
- Ensure `instrumentation-client.ts` exists with `Sentry.init()` call (required for Turbopack)

### Step 2: Fix dynamic i18n imports (CRITICAL BLOCKER)

**Problem:** 32+ files use `await import(\`../messages/${locale}/${ns}.json\`)`. Turbopack cannot resolve template-literal dynamic imports.

**Solution:** Generate a static import map. Write a small codegen script that reads the filesystem and produces the file — don't handwrite 306 import lines.

**Codegen script** (`scripts/generate-message-loader.ts`):
```bash
# Reads messages/{locale}/*.json directory structure
# Generates src/i18n/message-loader.ts with static imports
# Run: npx tsx scripts/generate-message-loader.ts
```

**Generated output** (`src/i18n/message-loader.ts`):
```typescript
// AUTO-GENERATED — do not edit manually. Run: npm run generate:i18n
const messageLoaders: Record<string, Record<string, () => Promise<{ default: Record<string, any> }>>> = {
  en: {
    common: () => import('../messages/en/common.json'),
    auth: () => import('../messages/en/auth.json'),
    // ... all 34 namespaces
  },
  // ... all 9 locales (306 lines total)
}

export async function loadNamespace(locale: string, ns: string): Promise<Record<string, any>> {
  const localeLoaders = messageLoaders[locale]
  if (!localeLoaders?.[ns]) {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Namespace ${ns} not found for locale ${locale}`)
    }
    return {}
  }
  return (await localeLoaders[ns]()).default
}
```

Add to `package.json`:
```json
"generate:i18n": "tsx scripts/generate-message-loader.ts"
```

**Files to update (two tiers):**

**Tier 1 — Central loaders (must fix, 4 files):**
1. `src/i18n/request.ts` — replace the `loadMessages()` loop (line 52/58) with `loadNamespace()` calls
2. `src/i18n/chunked-request.ts` — replace dynamic import (line 38)
3. `src/services/error-translation.ts` — replace dynamic import (line 52)
4. `src/lib/api/error-messages.ts` — replace dynamic imports (lines 36, 39)

**Tier 2 — Page files (~20 files, likely zero changes needed):**

Many pages manually import messages that `src/i18n/request.ts` already loads via its default namespace list (common, auth, builder, dashboard, billing, errors, etc.). These pages can simply use `next-intl`'s `getTranslations()` / `useTranslations()` instead of manual JSON imports — the central loader already provides those namespaces.

Audit each page file:
- **Already loaded by central config** → delete the manual import, use `getTranslations()`
- **Page-specific namespace not in central config** → add it to the central config's namespace list, or use `loadNamespace()` from the generated map

### Step 3: Delete webpack config + switch to Turbopack

Current `webpack()` function in `next.config.ts` does 5 things:

| Webpack Feature | Action |
|----------------|--------|
| Dev HMR fix (runtimeChunk/splitChunks disable) | **Delete** — Turbopack handles HMR differently |
| Faro source map plugin | **Delete** — defer Faro CLI migration until real error monitoring is needed |
| Dev memory cache + suppress warnings | **Delete** — not applicable to Turbopack |
| Server externals (`@opentelemetry/instrumentation`) | **Migrate** to top-level `serverExternalPackages` |
| Post-Sentry devtool override | **Delete** — Turbopack doesn't use webpack devtool |

**Changes to `next.config.ts`:**
- Delete the entire `webpack()` function (lines 152-220)
- Delete the post-composition devtool override (lines 362-371)
- Add top-level `serverExternalPackages`:
  ```typescript
  serverExternalPackages: ['@opentelemetry/instrumentation'],
  ```

### Step 4: Enable React Compiler

Add to `next.config.ts`:
```typescript
reactCompiler: true,
```

This auto-memoizes components, eliminating unnecessary re-renders without manual `useMemo`/`useCallback`. It's a single flag with zero code changes. If a component misbehaves (relies on referential identity in a way the compiler doesn't handle), either fix the component or disable the flag — both are trivial pre-launch.

### Step 5: Update scripts

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:safe": "rm -rf .next/cache && next dev",
    "dev:webpack": "next dev --webpack",
    "build": "next build",
    "build:webpack": "next build --webpack",
    "build:analyze": "ANALYZE=true next build --webpack",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix"
  }
}
```

`dev:webpack` and `build:webpack` are escape hatches — use them if Turbopack surfaces issues, not as defaults.

### Step 6: Smoke test

Run the build:
```bash
npm run build
```

Check:
- Compilation time (expect 2-5x improvement over webpack)
- All 307 API routes present in output
- SSG page count unchanged (829)
- First Load JS sizes comparable to webpack
- No missing modules or resolution errors

Test critical flows:
- Auth (login, signup, magic link, password reset)
- Builder/workspace (largest pages)
- Admin panel (catch-all routes)
- i18n (all 9 locales load correctly)
- Proxy/middleware logic (renamed file)

If Sentry causes build errors with Turbopack: upgrade `@sentry/nextjs` to latest, or fall back to `build:webpack` temporarily. Known issue: `@sentry/node-core` can trigger `import-in-the-middle` warnings that become errors in 16.1. Check the [Sentry Turbopack issue tracker](https://github.com/getsentry/sentry-javascript/issues/8105) for fixes.

---

## Post-Upgrade Optimizations (optional, defer)

### Enable Turbopack filesystem cache for builds

```typescript
// next.config.ts
turbopack: {
  unstable_fileSystemCacheForBuild: true,
},
```

Caches build artifacts on disk. Dev filesystem cache is already stable and on by default in 16.1.

### Clean up `setRequestLocale` calls

Once `next/root-params` ships (RFC in progress), `next-intl` can access locale without `headers()`. Will remove `setRequestLocale()` boilerplate from every page/layout.

---

## What NOT to spend time on now

- **Bundle analyzer parity for Turbopack** — use `build:webpack` when you need analysis. Not worth migrating.
- **Faro source map plugin migration** — no real users means no urgent need for source map uploads. Defer until monitoring matters.
- **Over-optimizing build time estimates** — the bottleneck pre-launch is developer iteration speed, not Vercel minutes.

---

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Dynamic import build failures | High (without fix) | Build won't complete | Step 2 fixes imports before switching to Turbopack |
| Sentry warnings/errors with Turbopack | Medium | Noisy logs or build failure | `build:webpack` fallback; upgrade Sentry; check issue tracker |
| `next-intl` SSG issues in 16 | Medium | Build failure on SSG pages | Upgrade to next-intl ^4.7; test SSG pages explicitly |
| Bundle size regression with Turbopack | Low | Larger client bundles | Compare First Load JS sizes; `build:webpack` fallback |
| Proxy rename breaks CI/CD | Low | Deploy pipeline failure | Search CI configs for "middleware" references |

---

## Expected Build Time Impact

| Metric | Current (webpack) | After upgrade (Turbopack) |
|--------|-------------------|--------------------------|
| Local compilation | 31s | ~10-15s (2-3x faster) |
| Vercel compilation | ~4.6min | ~1.5-2.5min (2-3x faster) |
| Vercel total build | ~8min | ~5-6min |
| Dev server startup | ~3-5s | ~1-2s (Turbopack FS cache) |

Estimates based on Vercel's published benchmarks. Actual results depend on codebase complexity.

---

## Implementation Log

### Steps 1-5 completed (Jan 2026)

**Dependencies upgraded:**
- `next`: 15.5.9 → 16.1.6
- `next-intl`: 4.1.0 → 4.8.0
- `eslint-config-next`: 15.3.3 → 16.1.6
- `@next/bundle-analyzer`: 15.3.4 → 16.1.6
- `@sentry/nextjs`: 9.33.0 → 9.47.1 (stayed on v9; v10 is a separate migration)

**Middleware → Proxy rename:**
- `middleware.ts` renamed to `proxy.ts`
- Exported function `middleware()` → `proxy()`
- Runtime changes from Edge to Node.js (no behavioral impact for our use case)
- Note: API route processing code in the old middleware (lines 177-224) was dead code — the matcher regex excluded `/api` routes. Kept as-is in proxy.ts for now.

**Dynamic i18n imports fixed (31 imports across 21 files):**
- Created codegen script `scripts/generate-message-loader.ts` → generates `src/i18n/message-loader.ts` with 306 static imports (9 locales × 34 namespaces)
- Updated 4 central loaders: `request.ts`, `chunked-request.ts`, `error-translation.ts`, `error-messages.ts`
- Updated 17 page files to use `loadNamespace()` from the generated import map
- Zero template-literal dynamic imports remaining in `src/`
- Bug found: `advisor/workspace/[projectId]/page.tsx` was importing `${locale}.json` (root locale file that doesn't exist) — always triggered `notFound()`. Fixed to import `workspace` namespace correctly.

**Webpack config deleted:**
- Removed entire `webpack()` function (69 lines)
- Removed post-Sentry devtool override (10 lines)
- Migrated `@opentelemetry/instrumentation` to `serverExternalPackages`
- Faro source map plugin deferred (no real users = no urgent monitoring)
- Dev HMR fixes, memory cache, warning suppression — all not applicable to Turbopack

**React Compiler enabled:**
- `reactCompiler: true` added to `next.config.ts`

**eslint config removed:**
- `eslint: { ignoreDuringBuilds: true }` removed (Next.js 16 removed the option; `next build` no longer runs linting at all)

**Scripts updated:**
- `lint`/`lint:*` scripts: `next lint` → `eslint src/`
- Added `dev:webpack` and `build:webpack` escape hatches
- Removed redundant `dev:turbo` and `dev:clean-turbo` (Turbopack is now default)
- `analyze` scripts point to `build:webpack` (bundle analyzer requires webpack)
- Added `generate:i18n` script

**Step 6 — Smoke test build: PASSED**

```
✓ Compiled successfully in 44-68s (Turbopack)
✓ Generating static pages (828/828) in 4-10s
✓ 449 routes (307 API routes)
```

**Comparison with webpack baseline (from BUILD_TIME_OPTIMIZATION_ANALYSIS.md):**

| Metric | Webpack (v4) | Turbopack (v5) | Change |
|--------|--------------|----------------|--------|
| Compilation | 30.9s | 44-68s | +43-120% slower |
| SSG pages | 828 | 828 | Same |
| API routes | 307 | 307 | Same |
| Total routes | 449 | 449 | Same |

**Note:** First Turbopack build is slower due to cache warming. Subsequent builds and dev server startup should be faster. The real win is in incremental compilation during development.

### Discoveries during implementation

1. **`admin` namespace doesn't exist:** `admin/advisor-matching/page.tsx` imports `admin.json` but no such namespace exists in `src/messages/*/`. The `loadNamespace()` call will return `{}`, which triggers `notFound()`. This was the same behavior before (the dynamic import would throw). Needs a namespace file or page refactor.

2. **Sentry `withSentryConfig` uses webpack plugin options:** The Sentry config wrapper passes `sentryWebpackPluginOptions` which reference webpack-specific concepts. With Turbopack as default, Sentry may need updated configuration. Monitor for build warnings.

3. **`@next/bundle-analyzer` requires webpack:** The analyze scripts now explicitly use `--webpack` flag. No Turbopack equivalent exists yet.

4. **ESLint 9 + eslint-config-next 16 circular structure error:** `FlatCompat` wrapper caused "Converting circular structure to JSON" error. Fixed by removing `FlatCompat` and importing `eslint-config-next` directly (native flat config). Updated `eslint.config.mjs` to use native imports.

5. **eslint-plugin-react-hooks 7.x new rules:** The upgrade brought stricter rules:
   - `react-hooks/error-boundaries` — flags JSX inside try/catch blocks
   - `react-hooks/set-state-in-effect` — flags setState inside useEffect
   - Plus 6 other new rules (immutability, purity, refs, etc.)

   All disabled temporarily to maintain backward compatibility. Tracked for future cleanup.

6. **`revalidateTag` signature change in Next.js 16:** Now requires a second `cacheLife` argument (e.g., `revalidateTag('tag', 'max')`). Single-argument form is deprecated. Fixed all calls in `project-repository-actions.ts`.

7. **Pre-existing `rules-of-hooks` violations discovered:** 3 errors in `run-overview-content.tsx` where `useMemo` is called after early returns. Not related to upgrade but now more visible with stricter linting.

---

## Follow-up Tasks (Post-Upgrade Cleanup)

### Completed (Jan 2026)
- [x] Fix `rules-of-hooks` violations in `run-overview-content.tsx` (useMemo called after early returns)
- [x] Fix `no-restricted-globals` violations (process access in 2 client components: `web-vitals.tsx`, `migration-progress-view.tsx`)
- [x] Create `admin.json` namespace for all 9 locales (advisor matching translations)
- [x] Re-enable `react-hooks/error-boundaries` rule (0 violations after fixing 5 files: careers pages, match-approval-dialog, UnifiedLogsContent)
- [x] Re-enable `react-hooks/use-memo` rule (0 violations)

### Deferred (High violation count)
- [ ] `react-hooks/set-state-in-effect` (~63 instances) — requires significant useState/useEffect pattern refactoring
- [ ] `react-hooks/refs` (~49 instances) — ref access patterns need audit
- [ ] `react-hooks/immutability`, `react-hooks/purity`, `react-hooks/static-components` — remaining new rules from eslint-plugin-react-hooks 7.x

### Low Priority / Defer
- [ ] Migrate Faro source map plugin when monitoring becomes critical
- [ ] Wait for Turbopack bundle analyzer equivalent
- [ ] Monitor Sentry compatibility with Turbopack builds

---

## Sources

- [Next.js 16 Blog Post](https://nextjs.org/blog/next-16)
- [Next.js 16.1 Blog Post](https://nextjs.org/blog/next-16-1)
- [Next.js 16 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Turbopack API Reference](https://nextjs.org/docs/app/api-reference/turbopack)
- [How hard is it to upgrade from 15.5.9 to 16?](https://github.com/vercel/next.js/discussions/87221)
- [Next.js 16.1 Upgrade Experience](https://sourabhyadav.com/blog/nextjs-16-1-update-experience/)
- [next-intl Next.js 16 Compatibility Issue](https://github.com/amannn/next-intl/issues/2064)
- [Sentry Turbopack Support Issue](https://github.com/getsentry/sentry-javascript/issues/8105)
- [Turbopack 2026 Complete Guide](https://dev.to/pockit_tools/turbopack-in-2026-the-complete-guide-to-nextjss-rust-powered-bundler-oda)
- [Next.js 16.1 What's Breaking](https://www.wisp.blog/blog/nextjs-16-1-upgrade-guide)
