# Build Time Optimization Plan (v3 - Implementation Complete)

**Problem**: Build time increased from ~2.5 min to ~7+ min
**Root cause**: SSG'ing 1098 pages (locale multiplication + solutions pre-render)
**Target**: Return to ~3 min builds
**Status**: ✅ Implementation complete (Jan 2026)

---

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0.1: Force dynamic on locale admin | ✅ Done | Created `src/app/[locale]/admin/layout.tsx` |
| Phase 0.2: Cap solutions SSG | ✅ Done | Limited to 20 slugs + ISR (1hr revalidate) |
| Phase 1: Locale admin evaluation | ✅ Done | Kept as-is (serves different purpose - advisor management) |
| Phase 2: Dynamic imports | ✅ Done | 6 admin dashboard components |
| Phase 3: Hygiene | ✅ Done | `.vercelignore` + `optimizePackageImports` |

---

## Diagnosis Summary (from Vercel logs)

| Phase | Duration | Status |
|-------|----------|--------|
| Install | 21s | OK |
| Compile | ~3.5 min | PROBLEM |
| Typecheck | ~59s | Minor |
| Static generation | 1098 pages | **MAIN CULPRIT** |
| Cache creation | 1:18 (783MB) | Symptom of bloat |

---

## Root Causes Identified

### 1. `/[locale]/admin/` Being SSG'd (HIGH IMPACT)
```
src/app/admin/           → ƒ Dynamic (correct)
src/app/[locale]/admin/  → ● SSG × 9 locales = 45 pages (WRONG)
```
The `/admin/*` routes are already dynamic, but `/[locale]/admin/` is being pre-rendered.

### 2. Solutions Mass Pre-render (HIGH IMPACT)
Build log shows "+519 more paths" under solutions:
- `/[locale]/solutions/[slug]` → 500+ slugs × 9 locales
- `/[locale]/solutions/type/[type]` → N types × 9 locales
- `/[locale]/solutions/migrate/[platform]` → N platforms × 9 locales

### 3. Admin Components No Code-Splitting (MEDIUM IMPACT)
- 19,207 LOC in `src/components/admin/`
- 0 uses of `next/dynamic`
- All bundled statically, increasing compile time

---

## Changes Made

### Phase 0.1: Locale Admin Layout
**File**: `src/app/[locale]/admin/layout.tsx` (created)
```tsx
export const dynamic = 'force-dynamic'
export const revalidate = 0
```

### Phase 0.2: Solutions ISR
**Files modified**:
- `src/app/[locale]/solutions/[slug]/page.tsx`
- `src/app/[locale]/solutions/type/[type]/page.tsx`
- `src/app/[locale]/solutions/migrate/[platform]/page.tsx`

**Changes**:
- Added `export const revalidate = 3600` (ISR: regenerate hourly)
- Limited `generateStaticParams` to first 20 items: `[0...20]`

### Phase 1: Locale Admin Evaluation
**Decision**: Keep `/[locale]/admin/` pages as-is.
**Reason**: These 5 pages serve a specific purpose (advisor management with translations). Phase 0.1 already prevents SSG multiplication.

### Phase 2: Dynamic Imports
**Files modified**:
- `src/app/admin/feature-flags/page.tsx`
- `src/app/admin/alerts/page.tsx`
- `src/app/admin/customer-health/page.tsx`
- `src/app/admin/incidents/page.tsx`
- `src/app/admin/system-health/page.tsx`
- `src/app/admin/users/[userId]/360/page.tsx`

**Pattern applied**:
```tsx
import dynamic from 'next/dynamic'

const ComponentName = dynamic(
  () => import('@/components/admin/ComponentName').then(m => m.ComponentName),
  { ssr: false }
)
```

### Phase 3: Hygiene
**Files created/modified**:
- `.vercelignore` (created)
- `next.config.ts` (updated `optimizePackageImports`)

---

## Post-Implementation Fixes (Code Review)

### Fix 1: Metadata Query Missing `features_ar`
**File**: `src/app/[locale]/solutions/[slug]/page.tsx`
**Issue**: Fallback description used `features_ar` but it wasn't fetched in metadata query.
**Fix**: Added `features_ar` to the Sanity query in `generateMetadata()`.

### Fix 2: Canonical URL Encoding for Arabic Slugs
**File**: `src/app/[locale]/solutions/[slug]/page.tsx`
**Issue**: Canonical URL used decoded slug, but Arabic characters need to stay URI-encoded.
**Fix**: Use `rawSlug` (already encoded) instead of decoded `slug` for canonical.

### Fix 3: Remove Debug Console Logs
**File**: `src/app/[locale]/solutions/[slug]/page.tsx`
**Issue**: Debug `console.log` statements in production code.
**Fix**: Removed all debug logging from server component.

### Fix 4: Hardcoded `/ar/` Links (Code Review Round 2)
**Files**:
- `src/app/[locale]/solutions/[slug]/page.tsx`
- `src/app/[locale]/solutions/type/[type]/page.tsx`
- `src/app/[locale]/solutions/migrate/[platform]/page.tsx`
- `src/app/[locale]/solutions/page.tsx`

**Issue**: Links were hardcoded as `/ar/builder/new` and `/ar/contact` instead of using the dynamic `locale` parameter. Users on `ar-eg`, `ar-sa`, `en`, etc. would be redirected to wrong locale.
**Fix**: Changed all links to use template literals with `locale`:
- `href="/ar/builder/new"` → `href={\`/${locale}/builder/new\`}`
- `href="/ar/contact"` → `href={\`/${locale}/contact\`}`
- `builderUrl` also fixed to use dynamic locale

### Fix 5: `.vercelignore` Scripts Exclusion
**File**: `.vercelignore`
**Issue**: Originally excluded `scripts/` but `scripts/generate-template-css.js` is used during `npm run build`.
**Fix**: Removed `scripts/` from exclusion list.

### Fix 6: `ssr: false` Not Allowed in Server Components
**Files**:
- `src/app/admin/feature-flags/page.tsx`
- `src/app/admin/alerts/page.tsx`
- `src/app/admin/customer-health/page.tsx`
- `src/app/admin/incidents/page.tsx`
- `src/app/admin/system-health/page.tsx`
- `src/app/admin/users/[userId]/360/page.tsx`

**Issue**: Next.js build failed with error: `ssr: false` is not allowed with `next/dynamic` in Server Components.
**Root cause**: The dynamic imports used `{ ssr: false }` but the page components are async Server Components.
**Fix**: Removed `{ ssr: false }` from all dynamic imports. Code splitting still works without this option.

### Fix 7: Guard Sanity Fetches During Build
**Files**:
- `src/app/[locale]/solutions/[slug]/page.tsx`
- `src/app/[locale]/solutions/type/[type]/page.tsx`
- `src/app/[locale]/solutions/migrate/[platform]/page.tsx`
- `src/app/[locale]/test-arabic-content/page.tsx`

**Issue**: Build-time collection failed when Sanity CDN DNS was unavailable, causing `next build` to error on page data collection.
**Fix**: Wrapped Sanity fetches in try/catch and returned safe fallbacks (empty arrays/null) so builds can complete even when the Sanity API is unreachable.

---

## 🚨 CRITICAL: Pre-existing Issues Found (Not Part of This Plan)

### Caching Headers Security Risk

**Location**: `next.config.ts` → `headers()` function

**Issue 1: HTML caching too broad**
```ts
{
  source: '/:locale((?!api).*)*',
  headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }]
}
```
This matches ALL locale routes including authenticated pages. If any page contains user-specific data (e.g., `adminEmail` prop), it could be cached and served to other users.

**Issue 2: API caching too broad**
```ts
{
  source: '/api/:path((?!admin).*)',
  headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=60' }]
}
```
Non-admin API routes may still contain user-specific data.

**Recommended Fix for API caching**:
```ts
// Default: no caching for APIs
{
  source: '/api/:path*',
  headers: [{ key: 'Cache-Control', value: 'no-store' }]
},
// Allow caching for explicitly public endpoints only
{
  source: '/api/public/:path*',
  headers: [{ key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=60' }]
}
```

**Recommended Fix for HTML caching**:
Only cache known marketing routes (e.g., `/[locale]/solutions/*`), not everything.

**Priority**: HIGH - potential security/correctness bug

### images.remotePatterns Too Permissive
**Location**: `next.config.ts` → `images` config
```ts
images: {
  remotePatterns: [{ protocol: 'https', hostname: '**' }]
}
```
**Issue**: Allows any HTTPS host, turning the image optimizer into an open proxy (abuse + cost risk).
**Recommendation**: Restrict to actual CDNs (Sanity, S3, etc.)

### Faro + Sentry Source Map Conflict
**Location**: `next.config.ts` → webpack config
**Issue**: Both Faro and Sentry are configured to upload source maps:
- Faro: `deleteAfterUpload: true`
- Sentry: `hideSourceMaps: true`

If Faro deletes `.map` files before Sentry uploads them (or vice versa), one loses source maps.
**Recommendation**: Pick one owner of source maps, or gate `deleteAfterUpload` behind "Sentry not enabled".

---

## Future Improvements (Lower Priority)

### 1. Trailing Slash Redirect Redundant
**Location**: `next.config.ts` → `redirects()` → rule #5
**Issue**: `trailingSlash: false` + `skipTrailingSlashRedirect: false` already handles this.
**Recommendation**: Remove the manual redirect rule to avoid double-redirect chains.

### 2. Sentry/Faro on Preview Builds
**Location**: `next.config.ts`
**Issue**: Source map uploads happen on all non-development builds, including previews.
**Recommendation**: Gate to production only:
```ts
if (process.env.VERCEL_ENV === 'production') { ... }
```

### 3. Console Removal via Babel Doesn't Work with SWC
**Location**: `next.config.ts` → webpack config
**Issue**: The babel-loader plugin injection for removing console statements doesn't apply with SWC.
**Recommendation**: Use Next.js built-in:
```ts
compiler: {
  removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false
}
```

### 4. Route Groups as Regression Guardrail
**Structure**:
```
src/app/[locale]/(marketing)/   → allowed to SSG
src/app/[locale]/(app)/         → forced dynamic by default
```
**When**: After verifying build time improvements. Prevents future regressions.

---

## Expected Results

| Phase | Estimated Savings |
|-------|-------------------|
| Phase 0: Kill SSG explosion | **~2-3 min** |
| Phase 1: (evaluated, no change needed) | — |
| Phase 2: Dynamic imports | ~30s-1min |
| Phase 3: Hygiene | ~0-10s |
| **Total** | **~3-4 min** |

**Expected final build time**: ~3 min

---

## Verification Checklist

After deployment, check Vercel build logs:

- [ ] **Static page count** drops from 1098 to ~200-400
- [ ] `/[locale]/admin/*` shows as `ƒ` (Dynamic), not `●` (SSG)
- [ ] `/[locale]/solutions/[slug]` no longer shows "+519 more paths"
- [ ] **Cache size** drops from 783MB to ~400MB
- [ ] **Cache creation time** drops from 1:18 to <30s
- [ ] **Total build time** ~3 min

---

## Quick Reference: SSG vs Dynamic

| Route Pattern | Before | After |
|---------------|--------|-------|
| `/admin/*` | ƒ Dynamic | ƒ Dynamic (no change) |
| `/[locale]/admin/*` | ● SSG | ✅ ƒ Dynamic |
| `/[locale]/solutions/[slug]` | ● SSG (500+) | ✅ ISR (top 20) |
| `/[locale]/solutions/type/[type]` | ● SSG | ✅ ISR (top 20) |
| `/[locale]/solutions/migrate/[platform]` | ● SSG | ✅ ISR (top 20) |
| `/[locale]/*` marketing | ● SSG | ● SSG (keep for SEO) |

---

## Files Changed Summary

```
Created:
  src/app/[locale]/admin/layout.tsx
  .vercelignore

Modified:
  src/app/[locale]/solutions/[slug]/page.tsx        # ISR + metadata fix + canonical fix + link fix
  src/app/[locale]/solutions/type/[type]/page.tsx   # ISR + link fix
  src/app/[locale]/solutions/migrate/[platform]/page.tsx  # ISR + link fix
  src/app/[locale]/solutions/page.tsx               # link fix
  src/app/admin/feature-flags/page.tsx
  src/app/admin/alerts/page.tsx
  src/app/admin/customer-health/page.tsx
  src/app/admin/incidents/page.tsx
  src/app/admin/system-health/page.tsx
  src/app/admin/users/[userId]/360/page.tsx
  next.config.ts
```
