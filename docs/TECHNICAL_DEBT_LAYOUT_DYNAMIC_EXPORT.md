# Technical Debt: Root Layout Dynamic Export

**Status**: Documented for future work
**Priority**: P2 (Optimization)
**Impact**: SEO, caching, performance
**Risk**: Medium (could break auth if not done carefully)

---

## Problem

The root locale layout (`/app/[locale]/layout.tsx`) has `export const dynamic = 'force-dynamic'` which forces **ALL** routes to be dynamically rendered at request time.

```typescript
// Line 27-28 in /app/[locale]/layout.tsx
// EXPERT RECOMMENDATION: Force dynamic rendering to ensure server components read fresh cookies
export const dynamic = 'force-dynamic'
```

### Impact

This affects ALL pages under the locale layout:

**Marketing/Public Pages (should be static):**
- `/` (homepage)
- `/pricing`
- `/solutions/*`
- `/blog/*`
- `/privacy`, `/terms`

**Secure Pages (should be dynamic):**
- `/workspace/*`
- `/builder/*`
- `/admin/*`
- `/advisor/*`

### Consequences

1. **SEO Impact**: All pages are server-rendered on every request, no static HTML served
2. **No Caching**: Can't leverage CDN caching for marketing pages
3. **Slower TTFB**: Every request requires server execution
4. **Higher Server Load**: Every page view hits the server instead of serving static files

---

## Why It Was Added

The comment indicates this was an "EXPERT RECOMMENDATION" from a previous session to fix auth cookie issues. Without this, server components might not read fresh authentication cookies properly.

---

## Recommended Solution

Move `dynamic = 'force-dynamic'` from root layout to only the layouts that need it:

### Step 1: Remove from Root Layout

Remove from `/app/[locale]/layout.tsx`:

```typescript
// ❌ Remove this line
export const dynamic = 'force-dynamic'
```

### Step 2: Add to Secure Route Layouts

Add to routes that need fresh auth cookies:

**Create `/app/[locale]/workspace/layout.tsx`:**
```typescript
export const dynamic = 'force-dynamic'

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
```

**Update `/app/[locale]/builder/layout.tsx`:**
```typescript
import React from 'react'
import { LoggerInit } from '@/components/logger-init'

// Add this line
export const dynamic = 'force-dynamic'

export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <LoggerInit />
      {children}
    </>
  )
}
```

**Keep in `/app/[locale]/admin/layout.tsx`** (already has it)

**Consider adding to `/app/[locale]/advisor/layout.tsx`** if auth is needed

### Step 3: Test Auth Flows

After making changes, thoroughly test:
1. ✅ Login/logout flows
2. ✅ Session persistence across page navigations
3. ✅ Auth redirects (protected routes)
4. ✅ Cookie reading in server components
5. ✅ SSR with authenticated state

---

## Testing Checklist

Before deploying this change:

- [ ] Test login flow (/auth/signin)
- [ ] Test logout flow
- [ ] Navigate from marketing page → workspace (auth should work)
- [ ] Refresh workspace page (should stay authenticated)
- [ ] Test protected route redirects
- [ ] Verify `getServerAuthSnapshot()` reads cookies correctly
- [ ] Test in production-like environment (not just dev)
- [ ] Check Vercel logs for auth errors
- [ ] Monitor error rate after deployment

---

## Alternative: Incremental Approach

If full migration is risky, do it incrementally:

1. **Week 1**: Move only `/pricing` and `/solutions/*` to static
   - Add their own layout with default rendering
   - Monitor for issues
2. **Week 2**: Move homepage `/` to static
   - Requires careful auth button state handling
3. **Week 3**: Move remaining marketing pages

---

## References

- Next.js Dynamic Rendering: https://nextjs.org/docs/app/building-your-application/rendering/server-components#dynamic-rendering
- Route Segment Config: https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#dynamic

---

## Decision

**For Milestone C**: Document only, don't implement yet.

**Reasoning**:
1. Auth cookie issue was explicitly fixed by previous expert
2. Changing it requires thorough testing across all auth flows
3. Risk of breaking authentication outweighs performance benefits for now
4. Should be done in a dedicated task with proper testing plan

**Recommended Timeline**: Post-MVP (after Milestone D)
