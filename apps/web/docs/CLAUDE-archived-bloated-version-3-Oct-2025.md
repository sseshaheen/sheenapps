# SheenApps Development Guide

## Project Overview
Next.js 15 marketing site with AI builder. 9 locales, App Router, SSR translations.

## Critical Patterns

### 🌐 Internationalization (9 Locales)
**Locales**: en, ar-eg, ar-sa, ar-ae, ar, fr, fr-ma, es, de

**Translation Loading** (CRITICAL PATTERN - Next.js 15):
```typescript
// In pages ([locale]/page.tsx)
// ✅ Next.js 15: params is a Promise that must be awaited
export default async function HomePage({
  params
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params;

  let messages;
  try {
    messages = (await import(`../../messages/${locale}.json`)).default;
  } catch (error) {
    notFound();
  }

  const translations = {
    navigation: { howItWorks: messages.navigation.howItWorks },
    hero: {
      badge: messages.hero.badge,
      floatingBadges: messages.hero.floatingBadges, // REQUIRED
      trustBar: messages.hero.trustBar, // REQUIRED
    },
  };

  return <HomeContent translations={translations} />;
}
```

**Adding Translations**:
1. Add to ALL 9 locale files
2. Update component interfaces
3. Map in page.tsx
4. Pass to client components

**Navigation (CRITICAL - Use Proper next-intl APIs)**:
```typescript
// ✅ ALWAYS use these imports for i18n-aware navigation
import { useRouter, Link } from '@/i18n/routing'
import { useNavigationHelpers } from '@/utils/navigation'

// ✅ Programmatic navigation
const { navigateToBilling, openBillingInNewTab } = useNavigationHelpers()

// ✅ Route constants (prevents typos)
import { ROUTES } from '@/i18n/routes'

// ❌ NEVER import directly (bypasses i18n)
import { useRouter } from 'next/navigation' // Wrong!
import Link from 'next/link' // Wrong!
```

**LESSON LEARNED**: Manual locale extraction (window.location.pathname parsing) is error-prone and bypasses framework i18n. Always use proper next-intl navigation APIs. We eliminated 35+ lines of workaround code by using centralized navigation utilities.

**CRITICAL: 'use client' Required for next-intl Hooks**:
All files using `useTranslations`, `useLocale`, or other next-intl hooks MUST have `'use client'` directive:
```typescript
'use client'  // REQUIRED at top of file

import { useTranslations, useLocale } from 'next-intl'
```
**Symptoms**: "No intl context found" errors, static assets returning 500 errors
**Root Cause**: Hooks called during server-side rendering outside NextIntlClientProvider
**Solution**: Add `'use client'` + IntlErrorBoundary for graceful fallbacks

**Navigation Import Patterns (Official next-intl Guidelines)**:
```typescript
// ✅ CORRECT: Use @/i18n/routing for locale-aware navigation
import { useRouter, usePathname, Link, redirect } from '@/i18n/routing'

// ✅ CORRECT: Use next/navigation for hooks without i18n alternatives
import { useParams, useSearchParams } from 'next/navigation'

// ✅ CORRECT: Server-side functions remain from next/navigation
import { notFound, redirect } from 'next/navigation' // In page components

// ❌ WRONG: Using next/navigation for hooks that have i18n alternatives
import { useRouter } from 'next/navigation' // Bypasses locale handling!
import Link from 'next/link' // Bypasses locale handling!
```

**Quick Reference - When to Use Which Import**:
- **Client Navigation**: `useRouter`, `usePathname`, `Link` → `@/i18n/routing`
- **Route Data**: `useParams`, `useSearchParams` → `next/navigation` 
- **Server Functions**: `notFound`, `redirect` → `next/navigation`
- **Tests**: Either import is acceptable

**CRITICAL**: Our Supabase architecture is **expert-validated and stable**. Before making auth/DB changes:
1. Review the **Expert Do/Don't Checklist** in the Authentication Architecture section below
2. Use the correct module imports: `supabase-server.ts` (server) vs `supabase-client.ts` (client)
3. Follow the repository pattern for all database operations

### 🏗️ Current Architecture Overview (August 2025)

**Status**: ✅ **Production-Ready Expert-Validated Architecture**

**Key Achievements**:
- ✅ **RLS-Based Security** (Aug 2025): All database access through authenticated client with row-level security
- ✅ **Zero Service Key Dependency**: Application runs without SUPABASE_SERVICE_ROLE_KEY in production
- ✅ **Expert v4 DbCtx Pattern**: Explicit database context prevents privilege escalation
- ✅ **Dual-Signature Architecture**: Backward-compatible migration path to explicit contexts
- ✅ **Clean Module Separation**: Next.js 15 compliant server-only imports
- ✅ **Expert Cookie Handling**: getAll/setAll pattern eliminates SSR warnings
- ✅ **Zero Manual Auth Token Management**: Supabase handles all cookie lifecycle
- ✅ **Bundle Optimization**: -164KB reduction (327% of goal)
- ✅ **9 Locale Support**: Complete i18n with next-intl navigation
- ✅ **Multilingual Advisor Network** (Aug 2025): Full i18n integration with ICU pluralization and RTL support

**Architecture Patterns**:
- **Authentication**: Supabase Auth for identity + server actions for auth operations
- **Database**: RLS-enforced access via authenticated client (no service key required)
- **Repository Pattern**: Expert v4 DbCtx with dual-signature compatibility
- **Client State**: Zustand with server-side bootstrap (eliminates hydration flash)
- **API Caching**: React Query v5 with proper cache invalidation
- **Module Structure**: Clean server/client separation with ESLint guards

### 🚀 Development Commands

**Quick Start**:
```bash
npm run dev:safe    # Recommended - clears cache issues
npm run dev         # Standard webpack dev
npm run check       # Pre-commit validation (clean lint + type-check + build)
```

**React Query**: Dashboard data fetching uses React Query. No more manual cache busting!
See `REACT_QUERY_IMPLEMENTATION.md` for patterns & troubleshooting.

**API Route Caching**: For dynamic data endpoints:
```typescript
// EXPERT PATTERN: Triple-layer cache prevention
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Response with cache-busting headers (use helper)
import { noCacheResponse } from '@/lib/api/response-helpers'
return noCacheResponse(data)

// Client-side cache busting
const params = new URLSearchParams({
  _t: Date.now().toString() // Prevents browser disk cache
})
```

**Lint Commands**:
```bash
npm run lint           # Full lint (1,259 warnings - for reference)
npm run lint:critical  # Only critical errors (clean for production)
npm run lint:clean     # Filtered view - shows only error-related lines
npm run lint:errors    # Zero tolerance (fails on any warning)
npm run lint:fix       # Auto-fix issues
```

**Common Issues**:
- File downloads on refresh → `npm run dev:safe`
- Hot reload broken → Use dev:safe (includes polling)
- Build failures → Run `npm run check` before commit

### 📦 Bundle Optimization

**Achievement**: -164KB reduction (327% of goal)
- Homepage: 314KB → 233KB (-81KB)
- Builder: 340KB → 257KB (-83KB)

**Key Optimizations**:
1. **Lucide → SVG Icons**: Use `<Icon name="arrow-right" />`
2. **LazyMotion**: Import from `@/components/ui/motion-provider` ONLY
3. **Dynamic Imports**: Heavy services loaded on-demand
4. **Server Actions**: Auth operations server-side
5. **AI Service Lazy Loading**: Services loaded only when needed
6. **Data Extraction**: Large static data moved to separate files

**Performance Results**:
- Build time: 14s → 5s (3x improvement)
- No more request timeouts
- Faster workspace loading

**CRITICAL**: Never import motion directly from framer-motion!

### 🏗️ Clean Architecture

**Configuration Files**:
- `src/config/ui-constants.ts` - Timeouts, z-indexes, styles
- `src/config/business-mappings.ts` - Business logic mappings
- `src/config/pricing-plans.ts` - Centralized pricing configuration (single source of truth)

**Service Layer**:
- Extract business logic to `src/services/`
- Components < 500 lines (300 preferred)
- No hardcoded values
- Always use centralized pricing from `pricing-plans.ts`

### 📱 Mobile Responsive

**Key Components**:
- `use-responsive()` hook for viewport detection
- Adaptive layouts (mobile/desktop)
- Touch-optimized interfaces

**CRITICAL**: Always mount panels, toggle visibility only:
```typescript
// ✅ Correct
<MobilePanel style={{ visibility: isActive ? 'visible' : 'hidden' }}>

// ❌ Wrong - breaks preview refs
{isActive && <MobilePanel>}
```

### 🏃 Builder Architecture

**Completed Features**:
1. ✅ **Clean Build Events** - Structured progress tracking via worker API `/api/builds/{id}/events`
2. ✅ **Post-Deployment Recommendations** - AI-powered next-step suggestions with worker integration
3. ✅ **React Preview** (2-5x faster than iframe)
4. ✅ **Pure Data History** (no DOM dependencies)
5. ✅ **React Query Integration** - Dashboard + billing with smart caching

**Build Events System**:
- `src/hooks/use-clean-build-events.ts` - Clean events API with React Query
- `src/components/builder/clean-build-progress.tsx` - Progress UI with recommendations
- `src/app/api/builds/[buildId]/events/route.ts` - Clean events API endpoint
- Legacy and clean events unified via `use-build-events-unified.ts`

**Recommendations System**:
- `src/app/api/projects/[id]/recommendations/route.ts` - Fetch from `project_recommendations` table
- `src/components/builder/project-recommendations.tsx` - Beautiful cards with priority/complexity
- `src/hooks/use-project-recommendations.ts` - React Query integration
- Auto-triggers worker `/v1/update-project` on selection

### 🌍 Multilingual Advisor Network (August 2025)

**Complete Implementation**: Full i18n integration for advisor browsing across 9 locales with RTL support.

**Key Features**:
- ✅ **ICU Pluralization**: Proper Arabic plural forms (zero|one|two|few|many|other)
- ✅ **RTL Direction Handling**: Card-level direction inheritance for Arabic locales
- ✅ **Backend Integration**: `x-sheen-locale` headers and Content-Language responses
- ✅ **Defensive Rendering**: Supports both old string arrays and new localized specialty objects

**Translation Pattern**:
```typescript
// Client components
const t = useTranslations('advisor');
{t('labels.yearsExperience', { years: advisor.years_experience })}

// Server components  
const messages = (await import(`../../../../messages/${locale}/advisor.json`)).default;
```

**API Integration**:
```typescript
// Locale extraction from headers/URL
const locale = urlLocale || headerLocale || acceptLanguage?.split(',')[0] || 'en';

// Worker API call with locale
headers: { 'x-sheen-locale': locale || 'en' }

// Response with Content-Language for SEO
'Content-Language': data.advisors?.[0]?.bio_locale_used || locale || 'en'
```

### ⚠️ Common Pitfalls (Updated with Expert Learnings)

**🔐 Authentication & Database**:
1. **Server-Only Import Violations**: Never import `'server-only'` modules in client components (causes build errors)
2. **Wrong Module Imports**: Use `@/lib/supabase-server` (server) vs `@/lib/supabase-client` (client)
3. **Manual Cookie Management**: Never manually manage `sb-*-auth-token` cookies (causes refresh churn)
4. **Deprecated Cookie API**: Use `getAll/setAll` pattern, never `get/set/remove`
5. **Environment Variable Mix-up**: Server code uses `SUPABASE_URL`, client code uses `NEXT_PUBLIC_SUPABASE_URL`
6. **Service Key Exposure**: Never put service role key in client bundles or use with `createBrowserClient`
7. **RLS vs Repository Authorization**: Don't rely on RLS in server-only architecture - use repository access control
8. **Hydration Auth Toasts**: Wait for `isSettled` before showing auth UI feedback
9. **Node.js Module Imports in Client Code**: Never directly import Node.js modules (`fs`, `path`, etc.) in utilities used by client components - use dynamic imports with proper environment checks

**🌐 General Application**:
10. **Missing Translations**: All 9 locales must have identical structure
11. **Motion Imports**: Only import from motion-provider
12. **Cache Issues**: Use dev:safe when dev server corrupts
13. **Arabic RTL**: Use calc() for positioning, test all Arabic locales
14. **React Query Keys**: Always use array-form keys `['projects']`, never string concatenation like `'projects-' + id`
15. **Mobile Preview Content Conflicts**: Check for existing option-specific content before applying generic impacts
16. **React Preview Section Accumulation**: Layout switching should clear sections first to prevent multiple hero sections
17. **Module Load Errors**: Check for code executing at import time (use lazy init)
18. **Server Actions**: Always return defined result objects, check for null/undefined
19. **API Caching Issues**: Browser disk cache ignores server headers - use triple-layer prevention:
    - Route config: `export const dynamic = 'force-dynamic'`
    - Response headers: Use `noCacheResponse()` helper
    - Client cache-busting: Add timestamp params `?_t=${Date.now()}`
20. **Next.js Route Conflicts**: Use consistent parameter names at same route level (all `/api/projects/[id]/*`)
21. **i18n Navigation**: Use `@/i18n/routing` for navigation hooks, `next/navigation` for data hooks only
    - ESLint will error if you try to import from `@/server/*` in client code
22. **Version vs Build Status (CRITICAL CONCEPT)**:
    - **Build Status** (`buildStatus`, `currentBuildId`): Latest build attempt status (can be failed)
    - **Version** (`currentVersionId`, `currentVersionName`): Always a SUCCESSFUL build
    - Failed builds DO NOT create versions - version info remains pointing to last successful build
    - **Never display "version X.Y.Z failed"** - versions cannot be failed by definition
    - Display version status and build status separately in UI
    - Example: Version 1.2.1 (deployed) + Latest build attempt failed (separate indicator)
24. **next-intl Context Errors (CRITICAL)**:
    - **Problem**: "No intl context found" errors breaking static asset loading
    - **Root Cause**: Using `useTranslations`, `useLocale` hooks without `'use client'` directive
    - **Symptoms**: Repeated intl context errors, CSS/font files returning 500 errors
    - **Solution**: Add `'use client'` to ALL files using next-intl hooks + IntlErrorBoundary
    - **Files Fixed**: `utils/navigation.ts`, `hooks/use-formatters.ts`, `hooks/use-error-handler.ts`
25. **API Response Caching Issues (CRITICAL - Browser Cache Bug)**:
    - **Problem**: Browser aggressively caches API responses even with `force-dynamic`, causing stale data
    - **Symptom**: "200 OK (from disk cache)" in Network tab, old data persists across refreshes
    - **Solution**: Triple-layer cache prevention pattern:
26. **Worker API Signature Mismatch (CRITICAL - Aug 2025)**:
    - **Problem**: Backend supports dual signature rollout (V1 + V2) but some endpoints only send single signature
    - **Symptoms**: `403 Forbidden` with `"error":"Signature validation failed","code":"INVALID_SIGNATURE"` and `"dualSignatureEnabled":true`
    - **Root Cause**: Using `generateWorkerSignature()` from `@/lib/worker-auth-server` instead of dual signature method
    - **Solution**: Use `createWorkerAuthHeaders()` from `@/utils/worker-auth` for all worker API calls
    ```typescript
    // ❌ WRONG: Single signature (causes 403 during rollout)
    const signature = generateWorkerSignature({ method, path, query, body, timestamp, nonce })
    headers: { 'x-sheen-signature': signature, 'x-sheen-timestamp': timestamp, ... }
    
    // ✅ CORRECT: Dual signature (V1 + V2 compatibility)
    const authHeaders = createWorkerAuthHeaders('GET', pathWithQuery, body)
    headers: { ...authHeaders, 'x-sheen-locale': locale, ... }
    // Generates both x-sheen-signature (V1) and x-sheen-sig-v2 (V2) headers automatically
    ```
    - **Fixed**: All persistent chat endpoints (messages, stream, presence, search) now use dual signature method
    - **Prevention**: Always use `createWorkerAuthHeaders()` for new worker API endpoints
27. **Worker API Claims Authentication (CRITICAL - Aug 2025)**:
    - **Problem**: Mixing user identifiers in query parameters when backend expects JWT claims in headers
    - **Symptoms**: `"error":"Missing authentication claims"` or `"error":"Invalid authentication claims"` from worker API
    - **Root Cause**: Sending `user_id` as query parameter instead of in `x-sheen-claims` header
    - **Solution**: User context belongs in JWT claims header only, never in URL parameters
    ```typescript
    // ❌ WRONG: User ID in query parameters + redundant headers
    const path = `/api/v1/advisors/profile?user_id=${userId}`
    headers: {
      'x-sheen-signature': hmacSignature,
      'x-user-id': userId  // Redundant with claims
    }
    
    // ✅ CORRECT: Clean path + user context in claims
    const path = `/api/v1/advisors/profile` // No query params
    const claims = { userId, roles: ['user'], issued: Date.now(), expires: Date.now() + 300 }
    headers: {
      'x-sheen-signature': hmacSignature,
      'x-sheen-claims': Buffer.from(JSON.stringify(claims)).toString('base64')
    }
    ```
    - **Rule**: User context goes in **one place only** - either URL params OR claims headers, never both
    - **Prevention**: Copy claim creation patterns from existing services like `advisor-api-client.ts`
28. **SSE Controller Lifecycle Fix (CRITICAL - Aug 2025)**:
    - **Problem**: "Controller is already closed" crashes in persistent chat SSE stream endpoint
    - **Root Cause**: Race conditions between heartbeat interval and controller cleanup, plus multiple cleanup attempts
    - **Expert Solution**: Lifecycle hardening pattern with idempotent finalize() function
    - **Key Features**:
      - Single `finalize()` function handles all cleanup idempotently
      - `closed` flag + `controller.desiredSize === null` state guarding
      - `safeEnqueue()` with try-catch around all controller methods
      - Client disconnect → upstream abort bridging
      - Smart heartbeats only when upstream is quiet (20s intervals)
      - Last-Event-ID security guard (1024 char limit)
      - Enhanced logging with `X-Upstream-Status` header
    - **Files Fixed**: `/src/app/api/persistent-chat/stream/route.ts` with expert-validated lifecycle management
    - **Result**: Zero controller state errors, proper cleanup, smart heartbeats without double-sending
      ```typescript
      // 1. Route configuration (top of API route file)
      export const dynamic = 'force-dynamic'
      export const revalidate = 0
      export const fetchCache = 'force-no-store'
      
      // 2. Response headers (use helper functions)
      import { noCacheResponse, noCacheErrorResponse } from '@/lib/api/response-helpers'
      return noCacheResponse(data)  // Adds all cache-busting headers
      
      // 3. Client-side cache busting (in React Query hooks)
      const params = new URLSearchParams({
        ...otherParams,
        _t: Date.now().toString() // Cache-busting timestamp
      })
      ```
    - **Headers Applied**: `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`, `Expires: 0`
    - **React Query Config**: Set `staleTime: 0` and `gcTime: 0` to prevent client-side caching
    - **Impact**: Discovered when version 1.1.13 was cached instead of showing latest 1.1.14
26. **Post-Login HMR Crashes Causing Logout (CRITICAL - Expert Solution Aug 2025)**:
    - **Root Cause**: Node-only modules (`fs/promises` via `auth-debug.ts`) bundled into client code causing HMR runtime errors → Fast Refresh full reloads → AuthProvider remounts with "guest" state
    - **Symptoms**: 
      - `Module not found: Can't resolve 'fs/promises'` errors
      - Fast Refresh hard reloads during development  
      - Login succeeds but then immediately shows as logged out
      - Authentication cookies work but UI flips to "Sign in"
    - **Expert Solution**: Two-part fix:
      1. **Remove Node imports from client bundle**: Replace static `auth-debug` imports in client code with client-safe debug helpers
      2. **AuthProvider resilient seeding**: Only seed positive auth assertions (when server snapshot has user), don't seed "guest" state from flaky snapshots
    - **Result**: Eliminates HMR crashes and post-login logout flicker. Authentication stays stable during development
    - **Files Fixed**: `server-auth-store.ts` (removed static auth-debug import), `auth-provider.tsx` (positive-only seeding)

**🏗️ Layout & State Management**:
27. **Grid+Flex height mixing**: `flex-1` won't fill → Use pure flex hierarchy
28. **Fragment height breaks**: `<>{children}</>` → Use `<div className="flex-1 flex flex-col h-full">`  
29. **Duplicate state sync**: Parent & child both managing same state → Single owner, props down/events up

### 🔐 RLS-Based Authentication Architecture (Expert-Validated Aug 2025)

**CRITICAL ARCHITECTURE CHANGE** (August 2025): **Service key eliminated** - application now uses Row-Level Security with authenticated client.

**Configuration**: 
- Server Auth: `ENABLE_SERVER_AUTH=true`, `NEXT_PUBLIC_ENABLE_SERVER_AUTH=true`
- **Service Key**: NO LONGER REQUIRED - `SUPABASE_SERVICE_ROLE_KEY` can be removed from production
- Database Access: RLS policies enforce all security via `authenticated` role

**Architecture**: RLS-enforced database access + Supabase Auth for identity management
**Expert Status**: ✅ Complete RLS migration validated eliminating service key dependency

**Admin Dashboard Authentication**: All admin endpoints use JWT-based authentication via `AdminAuthService.getAdminSession()` with role-based access control (admin vs super_admin permissions).

### 🔒 **RLS Migration Patterns (CRITICAL - Follow These Exactly)**

#### **1. Repository Pattern with Dual-Signature Support**
```typescript
// ✅ CURRENT: Works without service key (dual-signature shim)
class ProjectRepository extends BaseRepository {
  static async findById(projectId: string): Promise<Project | null> {
    return this.executeOptionalQuery(
      (client) => client.from('projects').select('*').eq('id', projectId).maybeSingle(),
      'findById'
      // Automatically uses authenticated client with RLS
    )
  }
}

// 🔄 FUTURE: Explicit context pattern (migration target)
class ProjectRepository extends BaseRepository {
  static async findById(projectId: string): Promise<Project | null> {
    const ctx = await this.makeUserContext() // Explicit user context
    return this.executeOptionalQuery(
      ctx,
      (client) => client.from('projects').select('*').eq('id', projectId).maybeSingle(),
      'findById'
    )
  }
}
```

#### **2. Auth Functions - RLS Pattern**
```typescript
// ✅ CORRECT: RLS-based auth functions (src/lib/server/auth.ts)
export async function userHasOrgAccess(userId: string, orgId: string): Promise<boolean> {
  const userCtx = await makeUserCtx()
  return await userHasOrgAccessRLS(userCtx, orgId)
}

// ✅ CORRECT: Direct project fetch with RLS
export async function getUserProjectOrThrow(userId: string, projectId: string) {
  const userCtx = await makeUserCtx()
  const project = await getProjectForUser(userCtx, projectId)
  if (!project) throw new Error('Forbidden: Project access denied or not found')
  return project
}
```

#### **3. Database Context Pattern**
```typescript
// ✅ CORRECT: User operations (default)
import { makeUserCtx } from '@/lib/db'

const userCtx = await makeUserCtx()  // Uses authenticated client with RLS
const projects = await ProjectRepository.findByOwner(userCtx, userId)

// ⚠️  ADMIN: Only for system operations (avoid in web context)
import { makeAdminCtx } from '@/lib/db'

const adminCtx = makeAdminCtx()  // Uses service client, bypasses RLS
// Only use in admin modules, workers, or migration scripts
```

#### **✅ RLS DO Patterns**

**1. Repository Operations**: Always use dual-signature shim
```typescript
// ✅ CORRECT: Uses authenticated client automatically
const project = await ProjectRepository.findById(projectId)

// ❌ WRONG: Don't try to pass service client manually
const project = await ProjectRepository.findById(projectId, true) // Admin flag deprecated
```

**2. Auth Validation**: Use RLS functions 
```typescript
// ✅ CORRECT: RLS-based with user context
if (await userHasOrgAccess(userId, orgId)) { /* authorized */ }

// ❌ WRONG: Don't use legacy service client functions 
if (await userHasOrgAccessLegacy(userId, orgId)) { /* deprecated */ }
```

**3. Database Access**: Let RLS handle security
```typescript
// ✅ CORRECT: Direct fetch - if user can see it, they have access
const project = await client.from('projects').select('*').eq('id', projectId).maybeSingle()
// Returns null if not visible due to RLS policies

// ❌ WRONG: Don't add manual ownership checks on top of RLS
const project = await client.from('projects').select('*').eq('id', projectId).eq('owner_id', userId)
```

#### **❌ RLS DON'T Patterns**

**1. Service Key Dependency**:
```typescript
// ❌ CRITICAL ERROR: Don't add service key back
const serviceClient = getServiceClient() // Will fail if key not available

// ✅ CORRECT: Use authenticated patterns
const userCtx = await makeUserCtx() // Works without service key
```

**2. Manual Access Checks**:
```typescript
// ❌ WRONG: Duplicates RLS logic, can drift from policies
if (project.owner_id !== userId) throw new Error('Access denied')

// ✅ CORRECT: Let RLS handle it - if you can fetch it, you can access it
const project = await getProjectForUser(userCtx, projectId)
if (!project) throw new Error('Not found') // RLS made it invisible
```

**3. Admin Context in Web**:
```typescript
// ❌ WRONG: Admin operations in user-facing routes
const adminCtx = makeAdminCtx() // Blocked by runtime checks

// ✅ CORRECT: User context for all web operations  
const userCtx = await makeUserCtx()
```

#### **🔄 Migration Validation**
- ✅ **Dashboard loads** without service key
- ✅ **Workspace functions** without service key  
- ✅ **Users see only their data** (RLS working)
- ✅ **No 42501 permission errors** (grants applied)
- ✅ **Repository logs show "mode=user"** (authenticated client)

#### **📋 Key Files Modified**
- `src/lib/server/repositories/base-repository.ts` - Dual-signature shim
- `src/lib/server/auth.ts` - RLS-based auth functions
- `src/lib/server/auth-rls.ts` - Expert v4 RLS implementations
- `src/lib/db/context.ts` - DbCtx pattern and factory functions

#### **✅ Legacy DO: Expert-Validated Patterns (Pre-RLS)**

**1. Login Forms**: Use server actions with `formAction`
```typescript
// ✅ CORRECT: Server action approach (src/lib/actions/auth-actions.ts)
export async function signInWithPasswordAndRedirect(formData: FormData) {
  const cookieStore = await cookies() // Opt out of Next.js caching
  const supabase = await createServerSupabaseClientNew()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string
  })

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

// ✅ CORRECT: Form with server action
<form action={signInWithPasswordAndRedirect}>
  <input name="email" type="email" required />
  <input name="password" type="password" required />
  <button type="submit">Sign In</button>
</form>
```

**2. Client-Side Services**: Pass userId from auth store
```typescript
// ✅ CORRECT: Pass userId to avoid server-side calls from client
const { user } = useAuthStore()
await PreviewDeploymentService.updateProject(projectId, changes, prompt, user?.id)

// ❌ WRONG: Don't call getCurrentUserId() from client-side code
await PreviewDeploymentService.updateProject(projectId, changes, prompt) // This will fail
```

**3. Environment Variables**: Client-side needs NEXT_PUBLIC_ prefix
```env
# ✅ CORRECT: Both versions for compatibility
WORKER_BASE_URL=http://localhost:8081                    # Server-side
NEXT_PUBLIC_WORKER_BASE_URL=http://localhost:8081        # Client-side
WORKER_SHARED_SECRET=your-secret                         # Server-side
NEXT_PUBLIC_WORKER_SHARED_SECRET=your-secret             # Client-side
```

**4. Error Handling**: URL parameters from server actions
```typescript
// ✅ CORRECT: Handle errors from server action redirects
const searchParams = useSearchParams()
useEffect(() => {
  const urlError = searchParams.get('error')
  if (urlError) {
    setError(decodeURIComponent(urlError))
  }
}, [searchParams])
```

#### **❌ DON'T: Critical Anti-Patterns to Avoid**

```typescript
// ❌ WRONG: Client-side session management with server auth
const supabase = createClient()
await supabase.auth.setSession(tokens) // Don't do this with server auth

// ❌ WRONG: Calling server-only functions from client
await getCurrentUserId() // Will fail with cookies error

// ❌ WRONG: Missing NEXT_PUBLIC_ prefix for client-side env vars
process.env.WORKER_BASE_URL // undefined in client code

// ❌ WRONG: Client-side polling for auth state
setInterval(() => checkAuthState(), 100) // Use server redirects instead
```

#### **🏗️ Expert Three-Client Architecture (Aug 2025)**

**Edge-Safe Middleware Module**:
- `src/lib/supabase-mw.ts` - Edge runtime compatible middleware client
  - `createMiddlewareClient(req, res)` - Pure getAll/setAll, no server-only imports
  - No custom cookie attributes (SameSite, Secure, HttpOnly, maxAge)

**Server-Only Auth Module** (`import 'server-only'`):
- `src/lib/supabase-server.ts` - Node.js runtime auth operations
  - `createServerSupabaseClientNew()` - Write-capable for auth/session ops
  - `createServerSupabaseClientReadOnly()` - Read-only for server components
  - Used in API routes, server actions, RSC for user authentication

**Service Role Database Module**:
- `src/lib/server/supabase-clients.ts` - Admin database operations
  - `getServiceClient()` - Service role key, no cookies, bypasses RLS
  - Used for data operations after auth validation
  - Never mixed with auth/session operations

**Client-Safe Module**:
- `src/lib/supabase-client.ts` - Browser functions (components, hooks, client services)
  - `createClient()` - Conditional based on server auth settings

**Repository Pattern**:
- `src/lib/server/repositories/` - All DB access with built-in authorization
- Enforces owner/org access checks at the data layer
- Eliminates need for RLS with proper server-side authorization

#### **🛡️ Expert Do/Don't Checklist (Aug 2025)**

#### **Middleware (Edge)**
**✅ DO**:
- Use `supabase-mw.createMiddlewareClient(req, res)` with pure getAll/setAll
- Flow a single NextResponse through the whole pipeline
- On redirects, copy cookies from the working response to the redirect
- Keep middleware free of server-only imports and cookie overrides

**❌ DON'T**:
- Don't use get/set/remove cookie methods  
- Don't set custom cookie attributes (SameSite, Secure, HttpOnly, maxAge) in middleware

#### **Server Actions / API Routes (Node)**
**✅ DO**:
- Use the write-capable server client (`createServerSupabaseClientNew`) for any auth/session ops
- For service-role DB access, use a separate client with the service key and no cookies
- On auth-required endpoints, read user via auth client; run data ops via service client

**❌ DON'T**:
- Don't reuse the service client for auth or session reads
- Don't rely on middleware cookies inside server actions unless the client supports setAll

#### **Auth Flows**
**✅ DO**:
- Ensure OAuth callback/login actions call `exchangeCodeForSession()` with write-capable server client before redirect
- After successful login/logout, redirect using the same response (or copy cookies onto the redirect response)

**❌ DON'T**:
- Don't perform auth in client code or leak the anon/service keys to the browser

#### **Environment & Build Hygiene**
**✅ DO**:
- Keep only `SUPABASE_URL` / `SUPABASE_ANON_KEY` (no `NEXT_PUBLIC_*`) in server/middleware
- Verify middleware envs are available in your host's Edge runtime
- Keep server-only imports in files that are never referenced by client or pages/

**❌ DON'T**:
- Don't import server-only modules from client components or middleware
- Don't bundle the service role key anywhere outside server code

#### **Debugging & Verification**
**✅ DO**:
- After changes, confirm there are no "@supabase/ssr … configured without set/remove" warnings
- On login, verify two sb-… cookies are set, and after refresh you still get auth.getUser() on the server
- Grep for legacy patterns: `createClient(`, `.from(` in client code; `get/set/remove(` in Supabase cookie adapters

**❌ DON'T**:
- Don't ship any custom cookie middleware that "fixes" attributes—let Supabase own them
- Don't create multiple NextResponse objects that could drop cookies mid-pipeline

#### **Code Organization**
**✅ DO**:
- Centralize: supabase-mw (Edge), supabase-server (Node auth), supabase-service (service role)
- Add ESLint "restricted imports" to block client-side Supabase DB usage and service key access

**❌ DON'T**:
- Don't keep duplicate createMiddlewareClient exports—delete old ones to prevent accidental imports

#### **🚨 CRITICAL: Cookie Attribute Loss (Aug 2025 Expert Finding)**

**Problem**: The `getAll() → set()` pattern silently drops cookie attributes (`HttpOnly`, `Max-Age`, `SameSite`), causing "logout after refresh" issues.

```typescript
// ❌ CRITICAL BUG: Drops cookie attributes
response.cookies.getAll().forEach(cookie => {
  otherResponse.cookies.set(cookie) // Loses HttpOnly, SameSite, etc.
})

// ✅ SOLUTION: Single response throughout middleware pipeline  
let response = await intlMiddleware(request)
// Work with SAME response object - no cookie copying
```

**Expert's Clean Pattern**:
1. **i18n First**: Run `intlMiddleware` first, get response
2. **Single Response**: Work with same response throughout pipeline
3. **Pure Cookie Adapters**: Never override Supabase cookie options
4. **Lightweight Middleware**: Cookie presence checks only, heavy auth in RSC

#### **🧪 Testing & Debugging (Current Implementation)**

```bash
# Verify three-client architecture
ls src/lib/supabase-*.ts # Should show: supabase-mw.ts, supabase-server.ts, supabase-client.ts
grep -r "import.*supabase-server" src/components/ # Should be empty (no client imports)
grep -r "createMiddlewareClient" middleware.ts # Should import from supabase-mw

# Check environment variable usage
grep -r "NEXT_PUBLIC_SUPABASE_URL" src/app/api/ # Should be empty (server-side)
grep -r "NEXT_PUBLIC_SUPABASE_URL" middleware.ts # Should be empty (edge-safe)
grep -r "SUPABASE_URL" src/components/ # Should be empty (client-side)

# Verify cookie adapter patterns
grep -r "getAll.*setAll" src/lib/supabase-*.ts # Should show clean adapters only
grep -r "get.*set.*remove" src/lib/supabase-*.ts # Should show no deprecated patterns

# Legacy pattern detection
grep -r "createClient(" src/components/ # Check client-side usage
grep -r "\.from(" src/components/ # Should be empty (no client DB calls)
grep -r "response\.cookies\.getAll.*forEach" src/ # Should be empty (no cookie copying)

# Verify SSR warnings are gone
npm run dev 2>&1 | grep "configured without" # Should be empty
```

**Production Verification**:
1. **Login Test**: Login → Refresh → Should stay logged in
2. **Cookie Inspection**: Two `sb-*` cookies with `HttpOnly=true`
3. **No SSR Warnings**: Development console clean of cookie adapter warnings
4. **Edge Runtime**: Middleware works in production Edge environment

**Architecture Summary**: Server-only DB operations + Supabase Auth identity + Clean module separation + Repository pattern authorization + Expert-validated cookie handling = Stable, secure, maintainable authentication system.

**Migration Guide**: If updating from legacy patterns, use `src/lib/supabase.ts` stub file error messages to find and update problematic imports to correct modules.

#### **🚨 CRITICAL: Auth Store Import Lesson (Aug 2025)**

**Problem**: Components importing wrong auth store causing authentication state mismatches
**Symptoms**: Header shows "logged in" but other components show "Authentication Required"
**Root Cause**: Multiple auth store files with similar names leading to import confusion

**❌ WRONG IMPORTS (Common Mistakes)**:
```typescript
// ❌ Direct import bypasses feature flag selection
import { useAuthStore } from '@/store/auth-store'        // Mock auth store
import { useAuthStore } from '@/store/supabase-auth-store' // Supabase auth store  
import { useAuthStore } from '@/store/server-auth-store'   // Server auth store
```

**✅ CORRECT IMPORT (Always Use This)**:
```typescript
// ✅ Uses feature flag to select the right store automatically
import { useAuthStore } from '@/store'  // Conditional export based on FEATURE_FLAGS
```

**How It Works**:
```typescript
// src/store/index.ts - Conditional selection
export const useAuthStore = FEATURE_FLAGS.ENABLE_SERVER_AUTH
  ? useServerAuthStore      // Production: Server-side auth
  : FEATURE_FLAGS.ENABLE_SUPABASE 
    ? useSupabaseAuthStore  // Legacy: Direct Supabase
    : useMockAuthStore      // Development: Mock auth
```

**Prevention**:
1. **Always import from `/store`** - never from specific auth store files
2. **Search for wrong imports**: `grep -r "store/.*auth-store" src/` should be empty
3. **Consistent imports**: All components must use the same auth store via feature flags
4. **ESLint rule**: Consider adding restricted imports for auth store files

**Files to Deprecate**: 
- `src/store/auth-store.ts` (mock auth - only for development)
- `src/store/supabase-auth-store.ts` (direct Supabase - legacy)  
- Direct imports should be prevented, only `src/store/index.ts` should be used

**Validation**:
```bash
# Check for problematic direct imports (should return empty)
grep -r "from '@/store/.*auth-store'" src/components/
grep -r "from '@/store/supabase-auth-store'" src/components/
grep -r "from '@/store/server-auth-store'" src/components/

# Correct imports (should find many)
grep -r "from '@/store'" src/components/ | grep useAuthStore
```

#### **Chat System Integration**

When chat system calls Worker API from client-side:
```typescript
// ✅ CORRECT: Pass user ID from auth store to services
const { user } = useAuthStore()
await PreviewDeploymentService.updateProject(projectId, changes, prompt, user?.id)

// ✅ CORRECT: Environment variables accessible client-side
NEXT_PUBLIC_WORKER_BASE_URL=http://localhost:8081
NEXT_PUBLIC_WORKER_SHARED_SECRET=your-secret

// ✅ CORRECT: Handle 402 balance errors gracefully
try {
  await onPromptSubmit(inputValue, mode)
} catch (error) {
  if (isBalanceError(error)) {
    // Show balance prompt banner with purchase link
    setBalanceError({ message: error.message, recommendation: error.data.recommendation })
  }
}
```

#### **Critical Auth Store Initialization (Expert Fix - August 2025)**

**Problem**: Header showing "Sign in" even when user is authenticated
**Root Cause**: AuthProvider not calling `store.initialize()` with server auth enabled

**Expert Solution**:
```typescript
// ✅ CORRECT: Expert's clean AuthProvider pattern
export function AuthProvider({ children, initialAuthSnapshot }) {
  const seeded = useRef(false)

  // 1) Seed from SSR snapshot once (don't flip to guest prematurely)
  if (!seeded.current && initialAuthSnapshot?.isSettled) {
    useAuthStore.setState({
      user: initialAuthSnapshot.user ?? null,
      isAuthenticated: !!initialAuthSnapshot.user,
      isGuest: !initialAuthSnapshot.user,
      isLoading: false,
      isInitializing: false,
      sessionLimits: initialAuthSnapshot.sessionLimits
    })
    seeded.current = true
  }

  // 2) Mount-side initialize — runs first /api/auth/me and sets polling
  useEffect(() => {
    if (!FEATURE_FLAGS.ENABLE_SERVER_AUTH) return
    
    logger.info('🔧 Server auth enabled — initialize()')
    const cleanup = useAuthStore.getState().initialize()
    return () => { try { cleanup?.() } catch {} }
  }, [])

  return children
}
```

**Why This Works**:
- `initialize()` immediately calls `checkAuth()` which hits `/api/auth/me` 
- Sets up periodic auth checks every 10 minutes
- Updates store with server auth state
- Without `initialize()`, no `/api/auth/me` calls happen and UI stays in "Sign in" state

**Verification**: After login, you should see `GET /api/auth/me` in Network tab returning `{"isAuthenticated": true}`

#### **Post-Login Logout Issue Fix (Expert Solution - August 2025)**

**Problem**: User logs in successfully but gets logged out immediately after
**Root Cause**: Race condition between login cookie setting and auth store initialization

**Expert Solution Applied**:
```typescript
// 1) Login adds success indicator in redirect URL
redirectTo.searchParams.set('auth_success', 'true')

// 2) Auth store detects success and waits appropriately
const hasAuthSuccess = window.location.search.includes('auth_success=true')
if (hasAuthSuccess) {
  // Wait 500ms for cookie to be fully processed
  await new Promise(resolve => setTimeout(resolve, 500))
  sessionStorage.setItem('recent_auth_success', 'true')
}

// 3) More resilient error handling - don't logout on temporary failures
if (response.status === 401 || response.status === 403) {
  // Only logout for definitive auth failures
  set(unauthenticatedState)
} else {
  // Keep current state for temporary errors (500, network, etc.)
  authDebug.client('TEMP_FAILURE', 'Temporary error - keeping current auth state')
}
```

**Key Improvements**:
- **Timing Fix**: Added proper delays for cookie processing (500ms for success cases)
- **Success Detection**: Login redirect includes `auth_success=true` parameter
- **Resilient Error Handling**: Only logout for 401/403, not temporary failures
- **Race Condition Prevention**: Auth store waits for browser to process Set-Cookie headers

### 🧪 Testing

**Setup**: Vitest + React Testing Library
```bash
npm run test        # Run tests
npm run test:watch  # Watch mode
```

**Critical Tests**:
- Translation completeness
- Undo/redo state management
- Mobile viewport detection
- Bundle size limits

### 🔄 Systematic Modernization Lessons (Aug 2025)

**CSS-First Modernization Works** (from Phase 1 implementation):
- ✅ **Expert validation first** - Saved weeks of overengineering
- ✅ **Incremental migration** - Old components work while new ones modernize
- ✅ **Copy-paste playbooks** - Systematic approach prevents mistakes
- ✅ **Named containers** - `cq-workspace { container: workspace / inline-size; }` prevents conflicts
- ✅ **CI guardrails** - `npm run check:hardcoded-colors` prevents regression

**Key Discoveries**:
1. **Container queries simplify responsive logic** (99 lines vs 361 lines)
2. **Chart colors need tokens** - Use `CHART_COLOR_ARRAY` not hardcoded arrays  
3. **Template colors are intentional** - Don't modernize dynamic content generation
4. **Standards-based = future-proof** - CSS container queries vs viewport hooks

**Pattern**: JavaScript → CSS where possible (responsive, colors, animations)

### 🚨 Pre-Deployment

**MUST RUN** before committing:
```bash
npm run check       # Lint + type-check + build
npm run pre-commit  # Full validation
```

**Deployment fails if**:
- ESLint errors/warnings
- TypeScript errors
- Build failures
- Missing dependencies

### 🔧 Integration Learnings

**When enabling new systems**:
1. Build errors often cascade - fix compilation first
2. TypeScript errors reveal integration points
3. Module initialization order matters
4. Feature flags should control both imports AND runtime

**Debug approach**:
1. `npm run check` - catch issues early
2. Fix ESLint errors systematically
3. Comment out problem code temporarily
4. Re-enable incrementally after base functionality works

### 📋 Current Status & Quick Wins

**Recent Achievements (August 2025)**:
- ✅ **Database Schema Refactoring**: Broke down `projects.config` JSON column into proper typed columns (`build_status`, `current_build_id`, `preview_url`, etc.) for performance and type safety
- ✅ Fixed route conflicts (`[id]` vs `[projectId]` - unified to `/api/projects/[id]/*`)
- ✅ Implemented clean build events API with real-time progress tracking
- ✅ Built post-deployment recommendations system with worker integration
- ✅ Enhanced chat interface with structured build progress and beautiful recommendation cards
- ✅ **Proper i18n Navigation**: Eliminated 35+ lines of manual locale workarounds with centralized utilities
- ✅ **Server-Side Auth Implementation**: Fixed client-side cookie access issues with proper Supabase server-side patterns
- ✅ **API Cache Prevention**: Implemented triple-layer cache busting to prevent browser disk caching issues

**Known Test Issues** (non-blocking):
- Test files need updates after architecture refactor
- ~30 instances of deprecated store API calls in tests
- Missing mock data properties in test files
- Run `npm run type-check` to see details

## Quick Reference

**File Structure**:
```
src/
├── app/api/
│   ├── builds/[buildId]/events/          # Clean build events API
│   └── projects/[id]/recommendations/    # Post-deployment recommendations
├── i18n/
│   ├── routing.ts                        # next-intl navigation setup
│   └── routes.ts                         # Centralized route constants
├── components/builder/
│   ├── clean-build-progress.tsx          # Build progress UI with recommendations
│   ├── project-recommendations.tsx       # Beautiful recommendation cards
│   └── builder-chat-interface.tsx        # Main chat with progress integration
├── hooks/
│   ├── use-clean-build-events.ts         # Clean events with React Query
│   ├── use-project-recommendations.ts    # Recommendations fetching
│   ├── use-build-events-unified.ts       # Legacy + clean events unified
│   └── use-version-history.ts            # Version history with cache-busting
├── services/
│   ├── worker-api-client.ts              # HMAC-authenticated worker calls
│   └── preview-deployment.ts             # Handles /v1/update-project calls
├── lib/
│   ├── api/
│   │   └── response-helpers.ts           # Cache prevention helpers
│   └── client/
│       └── api-fetch.ts                  # Client fetch with retry logic
├── utils/
│   ├── navigation.ts                     # i18n-aware navigation utilities
│   └── __tests__/navigation.test.ts      # Navigation utilities tests
└── types/
    └── project-recommendations.ts        # Complete type definitions
```

**Key APIs**:
- `NEXT_PUBLIC_ENABLE_CLEAN_EVENTS=true` - Clean build events (✅ active)
- `WORKER_BASE_URL` - Worker microservice endpoint
- `WORKER_SHARED_SECRET` - HMAC authentication for worker calls

**Database Schema (Migration 028)**:
- `projects.config` JSON → Proper typed columns (`build_status`, `current_build_id`, `preview_url`, `framework`, `last_build_started`, `last_build_completed`)
- Enhanced performance with dedicated indexes and foreign key constraints
- TypeScript types updated in `/src/types/supabase.ts` to match new schema

**Enhanced Database Security (August 2025)**:
- ✅ **RLS + FORCE RLS**: All user data tables protected with row-level security
- ✅ **Selective Privilege System**: Only RLS-protected tables receive base privileges
- ✅ **Fail-Safe Defaults**: New tables have zero access until explicitly secured
- ✅ **Security Templates**: Use `scripts/secure-new-table-templates.sql` for consistent security patterns
- ✅ **Verification Tools**: `SELECT * FROM verify_table_security('table_name')` to check security status

**New Table Security Workflow**:
```sql
-- 1. Create table (automatically secure by default - no access)
CREATE TABLE public.new_feature (...);

-- 2. Apply security template based on access pattern
SELECT secure_user_table('new_feature');        -- User-owned data
SELECT secure_project_table('new_feature');     -- Project-based access  
SELECT secure_admin_table('new_feature');       -- Admin-only access
SELECT secure_reference_table('new_feature');   -- Read-only reference

-- 3. Verify security implementation
SELECT * FROM verify_table_security('new_feature');
```

**Essential Patterns**:
- **RLS-Based Auth**: `makeUserCtx()` for all user operations, no service key needed
- **Repository**: Dual-signature shim works with or without explicit context
- Clean events: `useCleanBuildEvents(buildId, userId)` with React Query
- Recommendations: Auto-fetch after build completion, trigger `/v1/update-project`
- Route consistency: Always use `/api/projects/[id]/*` structure
- Navigation: `useNavigationHelpers()` for locale-aware routing, `ROUTES` constants

---

## 🎯 Quick Reference Summary

**Essential Commands**:
```bash
npm run dev:safe    # Development with cache clearing
npm run check       # Pre-commit validation (lint + type + build)
```

**Key Import Patterns** (RLS Migration Updated):
```typescript
// ✅ RLS User Operations (NEW DEFAULT)
import { makeUserCtx } from '@/lib/db'
const userCtx = await makeUserCtx() // No service key needed!

// ✅ Repository Operations (dual-signature)
import { ProjectRepository } from '@/lib/server/repositories/project-repository'
const project = await ProjectRepository.findById(projectId) // Uses authenticated client

// ✅ Auth Functions (RLS-based) 
import { userHasOrgAccess, verifyProjectAccess } from '@/lib/server/auth'
const hasAccess = await userHasOrgAccess(userId, orgId) // Uses RLS internally

// ✅ Server-side auth (for server actions, middleware)
import { createServerSupabaseClientNew } from '@/lib/supabase-server'

// ✅ Client-side (components, hooks)
import { createClient } from '@/lib/supabase-client'

// ⚠️  Admin operations (only for system/worker modules - not web)
import { makeAdminCtx } from '@/lib/db' // Bypasses RLS, use carefully

// ✅ Navigation (locale-aware)
import { useRouter, Link } from '@/i18n/routing'
```

**Critical Rules** (RLS Migration Updated):
- **RLS FIRST**: Use `makeUserCtx()` for all user database operations (no service key needed)
- **Repository Pattern**: Use dual-signature shim - existing calls work, new code can use explicit context
- **No Service Key**: Application runs without `SUPABASE_SERVICE_ROLE_KEY` in production
- **Admin Context**: Only use `makeAdminCtx()` in worker/system modules, never in web routes
- **Let RLS Handle Security**: Don't add manual ownership checks on top of database policies
- **Never** import `'server-only'` modules in client components
- **Always** complete translations for all 9 locales
- **Always** run `npm run check` before commit
- **Never** manually manage Supabase auth cookies
- **Always** use `getAll/setAll` cookie pattern

### 🚫 Git Operations Policy

**IMPORTANT**: Never run git staging commands on behalf of the user:
- ❌ Never use `git add`
- ❌ Never use `git stage`
- ❌ Never use `git commit`
- ❌ Never use `git push`

**Why**: All git operations are the user's decision. Claude should only:
- ✅ Review code and suggest fixes
- ✅ Implement features and fix bugs
- ✅ Check git status for context
- ✅ Analyze staged changes when requested

The user maintains full control over their repository and commit history.

### 🌙 Dark Mode Implementation (Lessons Learned - August 2025)

**Working Solution**: `next-themes` + CSS variables for problematic components

**What Works**:
1. **next-themes library** with `attribute="class"` - Handles dark class on HTML element
2. **CSS variables approach** - For components where Tailwind dark: classes don't compile properly
3. **Tailwind config**: `darkMode: 'class'` is essential

**Common Issues & Solutions**:
1. **ClientFontLoader overwrites classes** - Use `classList.add()` instead of replacing className
2. **Tailwind dark: classes not working** - Use CSS variables with `.dark` selector as fallback
3. **Hydration errors** - Avoid inline scripts, use next-themes which handles SSR properly
4. **Streaming/portal components** - May need CSS variables if rendered outside normal component tree

**Implementation**:
```css
/* When Tailwind dark: doesn't work, use CSS variables */
:root { --component-bg: light-color; }
.dark { --component-bg: dark-color; }
.component { background: var(--component-bg); }
```

### 🎨 Theme Consistency (Critical Lesson - August 2025)

**Problem**: New pages/components use hardcoded colors, breaking theme consistency (white backgrounds in dark theme).

**Root Cause**: Bypassing layout systems loses theme context. Hardcoded colors don't adapt to theme changes.

**Solution**: **Always use semantic theme classes**
```tsx
// ✅ CORRECT: Adapts to any theme
<div className="bg-background">
  <h1 className="text-foreground">Title</h1>
  <p className="text-muted-foreground">Subtitle</p>
</div>

// ❌ WRONG: Hardcoded colors break themes
<div className="bg-gray-900" style={{backgroundColor: '#111827'}}>
  <h1 className="text-white">Title</h1>
  <p className="text-gray-300">Subtitle</p>
</div>
```

**One-Sentence Rule**: "If I'm typing a color name or hex code, I'm probably doing it wrong."

**Quick Reference**: `bg-background`, `text-foreground`, `text-muted-foreground`, `bg-card`, `bg-muted`, `border-border`

### 🎯 Fixed Header Overlap (Modern Solution - August 2025)

**Problem**: Content gets covered by fixed headers, hardcoded `pt-16` solutions are brittle and non-semantic.

**Modern Solution** (2024 best practice): Use CSS `scroll-padding-top` + semantic utilities
```css
/* Global - handles anchor links */
html { scroll-padding-top: 4rem; }

/* Semantic utilities */
.header-spacer { height: 4rem; }
.pt-header { padding-top: 4rem; }
```

**Usage**: Add `<div className="header-spacer" aria-hidden="true" />` after page opening, or use `pt-header` on content.

**One-Rule**: Never hardcode padding values like `pt-16` - use semantic header-aware utilities.

### 🔄 Database Sync & Caching Issues (Critical Lesson - August 2025)

**Problem**: API returning stale cached data instead of fresh database values, causing app-wide sync issues

**Root Causes**:
1. **Browser disk caching**: Browser caches API responses to disk, ignoring server headers
2. **Incomplete cache prevention**: Only using `force-dynamic` without response headers
3. **Client hooks without React Query**: Basic `useEffect` fetches once and never refreshes
4. **Missing cache-busting**: No timestamp params to force fresh requests
5. **No cache invalidation**: Data doesn't refresh when database changes

**Solution Pattern**:
```typescript
// API Route - Triple defense against caching
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

// Response with cache-busting headers
return NextResponse.json(data, {
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  }
})

// Client hook - ALWAYS use React Query for data fetching
useQuery({
  queryKey: ['workspace-project', projectId],
  staleTime: 0, // Consider stale immediately
  refetchOnWindowFocus: true,
  // Add cache-busting to fetch
  queryFn: () => fetch(`/api/projects/${id}?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache' }
  })
})
```

**Key Learnings**:
- **Always use React Query** for data fetching hooks - never plain `useEffect`
- **Triple-layer cache busting**: Route config + response headers + fetch options
- **Invalidate on mutations**: Call `queryClient.invalidateQueries()` after updates
- **Add timestamps**: Include server timestamp in responses to verify freshness
- **Test with Network tab**: Check response headers and timestamps to confirm fresh data

### 🌍 RTL Implementation (Expert-Validated Aug 2025)

**Critical Learning**: Always use **logical properties + CSS variants** instead of JavaScript RTL detection.

**❌ Complex JavaScript Approach (Avoid)**:
```typescript
// Prop plumbing + runtime checks + complex utilities
const rtl = useRTL(locale)
className={`absolute ${rtl.isRTL ? 'right-8 md:right-1/2 md:translate-x-1/2' : 'left-8 md:left-1/2 md:-translate-x-1/2'}`}
```

**✅ Logical Properties Approach (Preferred)**:
```typescript
// Pure CSS, no JavaScript, no props, no bugs
className="absolute start-8 md:start-1/2 ltr:md:-translate-x-1/2 rtl:md:translate-x-1/2"
```

**Key Patterns**:
- `start-*` / `end-*` instead of `left-*` / `right-*`
- `ms-*` / `me-*` instead of `ml-*` / `mr-*` 
- `ps-*` / `pe-*` instead of `pl-*` / `pr-*`
- `ltr:` / `rtl:` variants for directional overrides
- No locale prop plumbing needed

**Math Fix for Absolute Positioning**:
- **LTR**: `left-1/2 -translate-x-1/2` (anchor left, pull back)
- **RTL**: `right-1/2 translate-x-1/2` (anchor right, push forward)
- **Universal**: `start-1/2 ltr:-translate-x-1/2 rtl:translate-x-1/2`

**Expert RTL Patterns (Aug 2025)**:
- **Mixed-direction text**: Use `<bdi>` + `unicode-bidi:isolate` (or `plaintext`) to keep Arabic + numbers in the right order. Wrap digits with `dir="ltr"` only if a browser needs it.
- **Direction is data, not DOM**: Decide RTL/LTR from the locale at render time (SSR-safe) and pass it as a prop (`dir="rtl" | "ltr"`) to components. Don't read `document.dir` during SSR.
- **Numerals are a product choice**: Don't auto-switch to Arabic-Indic digits; keep current numerals unless product explicitly asks.
- **Progress bars**: Avoid `translateX(…)` which always fills from left. Use `scaleX(pct)` + `transform-origin` (`origin-right` in RTL, `origin-left` in LTR) so fill starts at the logical inline start.
- **Make components direction-aware**: Expose a `dir` prop and use it to flip layout/animations; don't rely on global CSS hacks.
- **Accessibility**: When you know progress, set `aria-valuenow`, `aria-valuemin/max`, and optional `aria-valuetext`; avoid `data-state="indeterminate"`.
- **Localization strings, not string math**: Provide full phrases per locale ("خطوة {x} من {y}") instead of concatenating LTR chunks; reduces bidi surprises.
- **Cross-engine testing**: Always verify RTL in Safari + Chromium; bidi & transform behaviors can differ.
- **Prefer CSS logical properties**: Use margin/padding/border `inline-start/end` where possible so layout flips automatically with `dir`.
- **`dir="rtl"` Alone Isn't Enough**: For robust RTL text direction, you need **triple-layer enforcement**: `dir="rtl"` (HTML attribute), `direction: rtl` (CSS property), and `unicode-bidi: plaintext` (CSS property for bidirectional algorithm).

**Benefits**: Cleaner code, better performance, no prop dependencies, fewer bugs, easier maintenance.

**Migration Success (August 2025)**:
- ✅ **Complete RTL Migration**: All 4 phases completed successfully (converted 76+ utility calls, removed 182 lines of dead code)
- ✅ **89% Code Reduction**: `/utils/rtl.ts` reduced from 204 to 22 lines (only `isRTL()` and `getDirection()` remain)
- ✅ **CI Guardrails**: `npm run check:rtl-phys` prevents regression to physical properties
- ✅ **Zero Breaking Changes**: All components work correctly with logical properties
- ✅ **Performance Boost**: Eliminated runtime RTL utility generation and prop plumbing
- ✅ **Systematic Approach**: Replacement map enabled 288x faster implementation than planned

### 🏗️ Layout & State Quick Reference (August 2025)

**1) One layout system per tree**  
Grid = 2D, Flex = 1D. Don't mix for height.
```css
.container{display:flex;flex-direction:column;min-height:100vh}
.child{flex:1;display:flex;flex-direction:column}
.grandchild{flex:1}
```

**2) No fragments in height chains**
```typescript
// ❌ <>...</>  
// ✅ <div className="flex-1 flex flex-col h-full">{children}</div>
```

**3) Single state owner**
```typescript
const [open,setOpen]=useState(false)
<Child isOpen={open} onToggle={setOpen}/>
```

**4) Complete height chain**
```css
html,body{height:100%}
#__next{min-height:100%}
.app-root{min-height:100vh}
.layout{display:flex;flex-direction:column;flex:1}
.content{flex:1}
```

**5) Root uses min-height; children use flex**
```css
.app-root{min-height:100vh;display:flex;flex-direction:column}
.content{flex:1}.sidebar{flex-shrink:0}
```

**6) Props down, events up**
```typescript
<Sidebar isCollapsed={collapsed} onCollapseChange={setCollapsed}/>
```

**7) Big layout change ⇒ render different components**
```typescript
return isCollapsed ? <CollapsedView onExpand={onExpand}/> : <FullView onCollapse={onCollapse}/>
```

**8) Debug height quickly**  
Check computed styles → ensure every parent sized → remove fragments → temp backgrounds → "Show layout".

**9) Catch state desync**
```typescript
useEffect(()=>{ if(p!==c) console.warn('State conflict',{p,c}) },[p,c])
```

**10) Research-first**  
Search with year, read MDN, check real apps, test in isolation.

**Pre-merge mini-check:**  
Grid or Flex (not both) • unbroken height chain • single state owner • cross-browser/viewport test • no fragment breaks • types clean • note tricky decisions.

### 🚀 Chat Layout Best Practices

**1. Height Chain**
- Every scrollable container needs a fixed height chain (`h-screen` → `h-full` → `overflow-y-auto`)
- ❌ Don't mix `min-h-*` for layout containers (they expand infinitely)

**2. Fixed vs. Minimum Heights**
- Use `h-*` for layout containers, `min-h-*` for content
- Example: `.workspace-root { height: 100vh }`, `.message-bubble { min-height: 40px }`

**3. Flexbox "One-Scroller" Pattern**
```tsx
<div className="h-full flex flex-col">
  <Header className="flex-shrink-0" />
  <Messages className="flex-1 overflow-y-auto" />
  <Input className="flex-shrink-0" />
</div>
```
- Only one `overflow-y-auto`
- Header/footer: `flex-shrink-0`
- Messages: `flex-1 overflow-y-auto`

**4. Avoid Anti-Patterns**
- ❌ Multiple nested scrollers
- ❌ Missing height references
- ❌ Mixing `h-screen` + `min-h-full`

**5. Modern Viewport Units**
```css
.workspace {
  height: 100vh;   /* fallback */
  height: 100svh;  /* small viewport */
  height: 100dvh;  /* dynamic viewport */
}
```

**6. Debugging Flow**
1. Trace height chain
2. Identify expanding containers
3. Ensure single scroller
4. Use borders in DevTools

**7. Prevention Checklist**
- Root uses `h-screen`/`h-full`
- Height chain intact (no `min-h-*`)
- One scrollable area
- Header/footer `flex-shrink-0`
- Mobile viewport tested

**8. Final Test**
- Add 100 messages → scrolls?
- Resize window → contained?
- iOS Safari → scrollbar works?

### 🚫 Git Operations Policy

**IMPORTANT**: Never run git staging commands on behalf of the user:
- ❌ Never use `git add`
- ❌ Never use `git stage`
- ❌ Never use `git commit`
- ❌ Never use `git push`

**Why**: All git operations are the user's decision. Claude should only:
- ✅ Review code and suggest fixes
- ✅ Implement features and fix bugs
- ✅ Check git status for context
- ✅ Analyze staged changes when requested

The user maintains full control over their repository and commit history.
