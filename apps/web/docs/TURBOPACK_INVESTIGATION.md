# Turbopack Investigation (Jan 2026)

**Goal**: Reduce Vercel build time from ~7 min to ~3 min using Turbopack
**Result**: Not viable for this codebase yet
**Next.js Version**: 15.5.9

---

## Summary

| Build Method | Local Time | Status |
|--------------|------------|--------|
| **Turbopack** | ~38s | Broken - multiple incompatibilities |
| **Webpack** | ~2.5 min | Working (756 pages) |

Turbopack promises 2-5x faster builds, but requires Next.js 16+ for stability and has compatibility issues with this codebase.

---

## Blockers Found

### 1. Dynamic i18n Imports (Critical)

Turbopack can't resolve dynamic imports with template literals:

```typescript
// This pattern doesn't work with Turbopack
const messages = await import(`../../../../messages/${locale}/admin.json`)
```

**Error:**
```
Module not found: Can't resolve '../../../../messages/' <dynamic> '/admin.json'
```

**Affected files:**
- `src/app/[locale]/invite/[code]/page.tsx`
- `src/app/[locale]/admin/advisor-matching/page.tsx`

**Fix required:** Rewrite to use static imports with a switch/map pattern or wait for Turbopack support.

### 2. Page Resolution Errors

Multiple pages fail to resolve during build:

```
[Error [PageNotFoundError]: Cannot find module for page: /[locale]/advisor/browse]
[Error [PageNotFoundError]: Cannot find module for page: /[locale]/advisor/dashboard/analytics]
[Error [PageNotFoundError]: Cannot find module for page: /_document]
```

**Root cause:** Unknown - possibly related to dynamic routing patterns or App Router edge cases.

### 3. tailwindcss-rtl Plugin (Fixed)

The `tailwindcss-rtl` package uses internal Tailwind APIs that Turbopack can't resolve:

```
Module not found: Can't resolve 'tailwindcss/lib/util/escapeClassName'
```

**Fix applied:** Removed plugin from `tailwind.config.js`. Tailwind v4 has native RTL support (`text-start`, `text-end`, `ms-*`, `me-*`, `rtl:`, `ltr:`).

### 4. Webpack Plugins Not Supported

These webpack plugins are ignored by Turbopack:
- `@sentry/nextjs` - Source map uploads
- `@grafana/faro-webpack-plugin` - Source map uploads
- `@next/bundle-analyzer`
- Custom `webpack()` config in next.config.ts

**Impact:** No Sentry/Faro source maps with Turbopack builds.

---

## What Works

Turbopack successfully:
- Compiled the codebase in ~24s (vs ~60-90s with webpack)
- Handled most static pages
- Processed Tailwind CSS (after removing tailwindcss-rtl)

---

## Recommendations

### Short-term (Now)
1. **Stay on Webpack** - Turbopack isn't ready for this codebase
2. **Keep tailwindcss-rtl removed** - Tailwind v4 has native RTL
3. **Fix the invite page** - The dynamic import warning appears in both builds

### Medium-term (Next.js 16)
1. **Upgrade to Next.js 16** when stable - Turbopack is default and more mature
2. **Refactor dynamic i18n imports** to static pattern:
   ```typescript
   // Instead of dynamic import
   const messageLoaders = {
     en: () => import('@/messages/en/admin.json'),
     ar: () => import('@/messages/ar/admin.json'),
     // ...
   }
   const messages = await messageLoaders[locale]()
   ```

### Long-term
1. **Enable Turbopack filesystem caching** when available:
   ```typescript
   // next.config.ts (Next.js 16+)
   experimental: {
     turbopackFileSystemCacheForBuild: true
   }
   ```

---

## How to Test Turbopack

```bash
# Run Turbopack build
npx next build --turbopack

# Run webpack build (default)
npx next build

# Or explicitly
npx next build --webpack
```

---

## Related Changes

### Files Modified
- `tailwind.config.js` - Removed `tailwindcss-rtl` plugin

### Files NOT Modified (would break build)
- `next.config.ts` - Webpack plugins still needed
- Dynamic i18n import files - Would require significant refactor

---

## References

- [Next.js Turbopack Docs](https://nextjs.org/docs/app/api-reference/turbopack)
- [Next.js 16 Release Notes](https://nextjs.org/blog/next-16)
- [Turbopack Build Feedback](https://github.com/vercel/next.js/discussions/77721)
- [Tailwind CSS v4 Logical Properties](https://tailwindcss.com/docs/text-align)

---

## Build Time Optimization Status

See `docs/BUILD_TIME_OPTIMIZATION_PLAN.md` for the full optimization effort.

| Optimization | Impact | Status |
|--------------|--------|--------|
| Limit solutions SSG (20 pages) | High | Done |
| Force-dynamic locale admin | High | Done |
| Dynamic imports for admin | Medium | Done |
| Turbopack | Would be High | Blocked |
| Reduce locale SSG | Medium | Not attempted |
