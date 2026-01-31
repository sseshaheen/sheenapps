# WorkerAPIClient Architecture Refactor Plan

## 🎯 Executive Summary

Implementing expert-recommended solution to fix WorkerAPIClient browser instantiation and Supabase SSR cookie issues by following proper Next.js 13+ RSC patterns.

### 🚀 Current Implementation Status

**✅ Completed (Phase 1-3):**
- Server services isolated in `/src/server/services/` with `server-only` imports
- ESLint rules preventing client imports of server modules  
- Centralized `apiFetch` utility with timeout, retry, and error handling
- Supabase SSR configuration with proper cookie handling
- API routes for Worker operations (versions, status, updates, publish)

**✅ Completed (All Phases):**
- Server services isolated in `/src/server/services/` with `server-only` imports
- ESLint rules preventing client imports of server modules  
- Centralized `apiFetch` utility with timeout, retry, and error handling
- Supabase SSR configuration with proper cookie handling
- API routes for Worker operations (versions, status, updates, publish)
- All client components refactored to use API routes
- All hooks updated to use `apiFetch` utility

**🔄 Final Step:**
- Test and validate the refactored architecture

## 🔍 Current State Analysis

### Problem Chain
```
Client Component → Hook → Service → WorkerAPIClient → Browser Crash ❌
```

**Specific Chain:**
```
version-status-badge.tsx ('use client') 
  → use-version-history.ts (hook)
    → version-management.ts (service)
      → worker-api-client.ts (server-only)
        → Crashes in browser
```

### Files Currently Importing Server Services from Client Code
- `src/hooks/use-version-history.ts` → `version-management.ts`
- `src/hooks/use-version-management.ts` → `version-management.ts`  
- `src/hooks/use-project-status.ts` → `version-management.ts`
- `src/components/builder/version-status-badge.tsx` → uses above hooks
- `src/components/builder/version-history-modal.tsx` → uses above hooks
- `src/components/builder/project-status-bar.tsx` → uses above hooks

## 🏗️ Target Architecture

### Proper RSC Flow
```
Server Component → Server Service → WorkerAPIClient → Pass data to Client ✅
```

### Alternative: Route Handler Pattern
```
Client Component → fetch('/api/...') → Route Handler → Server Service → WorkerAPIClient ✅
```

## 📋 Implementation Plan

### Phase 1: Analysis & Setup (Day 1)

#### 1.1 Analyze Dependencies ✅ COMPLETED
- [x] Map all client components importing server services
- [x] Identify which data needs server-side loading vs client-side fetching
- [x] Determine which components can become server components

#### 1.2 Create Guardrails (Expert #1 - HIGH PRIORITY)
- [x] Move server services to `src/server/services/` structure ✅
  - Created `/src/server/services/` directory
  - Copied worker-api-client.ts, version-management.ts, ai-time-billing.ts, preview-deployment.ts
  - Added `import 'server-only'` to all files
  - Removed conditional window checks (no longer needed with server-only)
- [x] Add `import 'server-only'` to all server service files ✅
- [x] Add ESLint rules with patterns to prevent `@/server/*` imports from client ✅
  - Added no-restricted-imports rule for @/server/* and old service paths
- [x] Add path alias `@/server/*` to tsconfig.json ✅
- [ ] Check for any barrel exports in `src/services/index.ts` and remove server services

**Progress Notes:**
- Server services now properly isolated in `/src/server/services/`
- All services have `import 'server-only'` marker
- ESLint will now error if client code tries to import server modules
- Cleaned up conditional imports - now using direct imports in server modules

#### 1.3 Fix Supabase SSR (Expert #3 - HIGH PRIORITY)
- [x] Create `lib/server/supabase.ts` with proper `setAll` cookie handler ✅
  - Created server-only Supabase client with proper cookie handling
  - Added `getServerUser()` helper for auth validation
- [ ] Update all server-side Supabase usage to use new client
- [x] Ensure only called from route handlers, server components, or server actions ✅
  - Added 'server-only' import to prevent client usage
- [ ] Remove any client-side Supabase calls in server contexts

#### 1.4 Create Centralized Fetch Utility (Expert #5 - RECOMMENDED)
- [x] Create `lib/client/api-fetch.ts` with 10s timeout and AbortController ✅
- [x] Replace scattered retry logic in hooks with centralized utility ✅
  - Implemented exponential backoff retry logic
  - Added special handling for 401/402 errors
  - Created convenience methods (apiGet, apiPost, apiPut, apiDelete)
- [x] Add proper error handling and credentials: 'include' ✅
  - Custom ApiFetchError class with status and data
  - Automatic cookie inclusion with credentials: 'include'

### Phase 2: Server-Side Data Loading (Day 1-2)

#### 2.1 Create Server Data Loaders (Updated Structure)
```typescript
// New: src/server/loaders/version-loader.ts
import { getWorkerClient } from '@/server/services/worker-api-client';
export async function getVersionHistory(projectId: string) {
  const client = getWorkerClient();
  return client.getVersionHistory(projectId);
}
```

#### 2.2 Update Page Components to Server Components + Hydration (Expert #4)
```typescript
// app/[locale]/builder/workspace/[projectId]/page.tsx
export default async function WorkspacePage({ params }) {
  const initialVersions = await getVersionHistory(params.projectId);
  return (
    <ClientWorkspace 
      initialVersions={initialVersions} 
      projectId={params.projectId} 
    />
  );
}

// ClientWorkspace.tsx - Add React Query hydration
'use client'
export function ClientWorkspace({ initialVersions, projectId }) {
  const qc = useQueryClient();
  
  // Hydrate React Query to prevent double fetch (Expert #4)
  useEffect(() => {
    qc.setQueryData(['versions', projectId], initialVersions);
  }, [projectId, initialVersions, qc]);
  
  // Rest of component...
}
```

### Phase 3: Route Handlers for Dynamic Data (Day 2) ✅ IN PROGRESS

**Progress Notes:**
- Created comprehensive API routes for Worker operations
- All routes include proper auth validation and error handling
- Using new server-only services from `/src/server/services/`

#### API Routes Created:
- ✅ `/api/worker/versions/[projectId]` - Version history fetching
- ✅ `/api/worker/projects/[projectId]/status` - Project status
- ✅ `/api/worker/projects/[projectId]/update` - Project updates (for chat)
- ✅ `/api/worker/versions/publish` - Publish version operation

### Phase 3: Route Handlers for Dynamic Data (Day 2)

#### 3.1 Create Worker API Route Handlers (Expert #2 - HIGH PRIORITY)
```typescript
// app/api/worker/versions/[projectId]/route.ts
export const runtime = 'nodejs';           // Expert: Keep for Redis/crypto/libs
export const dynamic = 'force-dynamic';    // Expert: Explicit cache control
// Alternative: export const revalidate = 0;

import { getSupabaseServerClient } from '@/lib/server/supabase';
import { getWorkerClient } from '@/server/services/worker-api-client';

export async function GET(req: Request, { params }: { params: { projectId: string } }) {
  // Expert #3: Use proper Supabase SSR in route handlers
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const data = await getWorkerClient().getVersionHistory(params.projectId);
  
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store' }  // Expert: Safety header
  });
}
```

#### 3.2 Update Client Hooks with Centralized Fetch (Expert #5)
```typescript
// Updated: src/hooks/use-version-history.ts
import { apiFetch } from '@/lib/client/api-fetch';

export function useVersionHistory(projectId: string) {
  return useQuery({
    queryKey: ['versions', projectId],
    queryFn: () => apiFetch(`/api/worker/versions/${projectId}`)  // Expert: Use centralized fetch
  });
}
```

### Phase 4: Component Refactoring (Day 2-3) ✅ IN PROGRESS

**Progress Notes:**
- Successfully refactored hooks to use API routes
- Created shared types file for client-safe type definitions
- Discovered leftover code from previous implementations that needed cleanup
- All hooks now use the centralized `apiFetch` utility

#### Hooks Refactored:
- ✅ `use-version-history.ts` - Now uses `/api/worker/versions/[projectId]`
- ✅ `use-project-status.ts` - Now uses `/api/worker/projects/[projectId]/status`
- ✅ `use-version-management.ts` - Now uses `/api/worker/versions/publish` and other endpoints

### Phase 4: Component Refactoring (Day 2-3)

#### 4.1 Split Server/Client Components (Expert #4 - RECOMMENDED)
- [ ] Convert data-loading components to server components with React Query hydration:
```typescript
// app/[locale]/builder/workspace/[projectId]/page.tsx (Server Component)
export default async function WorkspacePage({ params }) {
  const initialVersions = await getVersionHistory(params.projectId);
  const initialProjects = await getProjectData(params.projectId);
  
  return (
    <ClientWorkspace 
      initialVersions={initialVersions} 
      initialProjects={initialProjects}
      projectId={params.projectId} 
    />
  );
}

// ClientWorkspace.tsx (Client Component with Hydration)
'use client'
export function ClientWorkspace({ initialVersions, initialProjects, projectId }) {
  const qc = useQueryClient();
  
  // Expert #4: Hydrate React Query to prevent double fetch
  useEffect(() => {
    qc.setQueryData(['versions', projectId], initialVersions);
    qc.setQueryData(['project', projectId], initialProjects);
  }, [projectId, initialVersions, initialProjects, qc]);
  
  // Rest of interactive component logic...
}
```

#### 4.2 Update Hook Dependencies with Centralized Fetch (Expert #5 - RECOMMENDED)
- [ ] Remove direct service imports from hooks
- [ ] Replace with centralized apiFetch utility:
```typescript
// Updated: src/hooks/use-version-history.ts
import { apiFetch } from '@/lib/client/api-fetch';

export function useVersionHistory(projectId: string) {
  return useQuery({
    queryKey: ['versions', projectId],
    queryFn: () => apiFetch(`/api/worker/versions/${projectId}`),
    staleTime: 30000, // 30s cache for version data
  });
}

// Updated: src/hooks/use-project-status.ts  
export function useProjectStatus(projectId: string) {
  return useQuery({
    queryKey: ['project-status', projectId],
    queryFn: () => apiFetch(`/api/worker/projects/${projectId}/status`),
    refetchInterval: 5000, // Poll every 5s for status updates
  });
}
```

#### 4.3 Add Suspense Boundaries (Expert Feedback - OPTIONAL)
- [ ] Consider adding Suspense boundaries for slower data loading:
```typescript
// Optional: Add loading states for better UX
export default async function WorkspacePage({ params }) {
  return (
    <Suspense fallback={<WorkspaceLoadingSkeleton />}>
      <WorkspaceDataLoader projectId={params.projectId} />
    </Suspense>
  );
}
```

### Phase 5: Testing & Validation (Day 3)

#### 5.1 Build & Runtime Tests (Expert #6 - HIGH PRIORITY)
- [ ] Ensure build completes without errors
- [ ] **Regression Prevention Test** - Add bundle analysis validation:
```typescript
// tests/bundle-analysis.test.ts
import fs from 'fs';
import path from 'path';

describe('Bundle Analysis - Server Code Isolation', () => {
  test('client bundle does not include server-only code', () => {
    const clientBundle = fs.readFileSync('.next/static/chunks/main.js', 'utf8');
    
    // Expert #6: Prevent server imports in client bundles
    expect(clientBundle).not.toContain('worker-api-client');
    expect(clientBundle).not.toContain('version-management');
    expect(clientBundle).not.toContain('ai-time-billing');
    expect(clientBundle).not.toContain('preview-deployment');
  });
  
  test('server code properly marked with server-only', () => {
    const serverServices = [
      'src/server/services/worker-api-client.ts',
      'src/server/services/version-management.ts'
    ];
    
    serverServices.forEach(servicePath => {
      const content = fs.readFileSync(servicePath, 'utf8');
      expect(content).toContain("import 'server-only'");
    });
  });
});
```

- [ ] **ESLint Validation** - Ensure no restricted imports:
```bash
# Should pass without server import violations
npm run lint -- --no-ignore --ext .ts,.tsx src/components/ src/hooks/
```

- [ ] **Runtime Bundle Check** - Verify using webpack-bundle-analyzer:
```bash
npm run build
npx @next/bundle-analyzer
# Manually verify no server services in client chunks
```

#### 5.2 Functionality Tests (Expert Recommendations Applied)
- [ ] **Server-Side Data Loading** - Verify initial page loads work:
  * Version history displays immediately (no loading spinner)
  * Project status shows correct initial state
  * No hydration mismatches in console

- [ ] **Client-Side Interactions** - Test dynamic features:
  * Version history updates on user actions
  * Interactive features (publish/rollback) still function
  * React Query caching prevents unnecessary refetches

- [ ] **Error Handling** - Validate graceful degradation:
  * Server data loading errors show proper fallbacks
  * Client fetch errors display retry options
  * Network issues don't crash the application

#### 5.3 Production Validation (Expert #3 - HIGH PRIORITY)
- [ ] **Supabase SSR Verification**:
```typescript
// Test new Supabase server client
const testSupabaseSSR = async () => {
  const supabase = getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  console.log('✅ Supabase SSR working:', !!user);
};
```

- [ ] **Route Handler Testing** - Verify all endpoints work:
```bash
# Test route handlers manually
curl -H "Cookie: sb-*=test" http://localhost:3000/api/worker/versions/test-project-id
curl -H "Cookie: sb-*=test" http://localhost:3000/api/worker/projects/test-project-id/status
```

- [ ] **Cache Behavior Validation** - Ensure proper caching:
  * `dynamic = 'force-dynamic'` prevents unwanted caching
  * React Query hydration eliminates double fetches
  * Cache-Control headers properly set

#### 5.4 Performance & Security Validation (Expert Enhancements)
- [ ] **Network Timeout Testing**:
```typescript
// Test apiFetch utility handles timeouts gracefully
const testTimeouts = async () => {
  try {
    await apiFetch('/api/slow-endpoint'); // Should timeout after 10s
  } catch (error) {
    expect(error.message).toContain('timeout');
  }
};
```

- [ ] **Auth Context Verification**:
  * Server components properly validate user auth
  * Route handlers return 401 for unauthorized requests
  * Client-side auth state syncs with server state

## 📁 File Structure Changes

### New Files
```
src/lib/server/
├── version-loader.ts       # Server data loaders
├── project-loader.ts       # Project data loaders
└── supabase-server.ts      # Fixed Supabase config

app/api/worker/
├── versions/[projectId]/route.ts
├── projects/[projectId]/route.ts
└── billing/[userId]/route.ts
```

### Modified Files
```
src/services/
├── worker-api-client.ts    # Add @server-only
├── version-management.ts   # Add @server-only
├── ai-time-billing.ts      # Add @server-only
└── preview-deployment.ts   # Add @server-only

src/hooks/
├── use-version-history.ts  # Use route handlers
├── use-version-management.ts # Use route handlers
└── use-project-status.ts   # Use route handlers

src/components/builder/
├── version-status-badge.tsx # Receive server data as props
├── version-history-modal.tsx # Use client hooks with routes
└── project-status-bar.tsx  # Receive server data as props
```

## 🛡️ Prevention Measures

### ESLint Configuration
```javascript
// eslint.config.mjs
{
  files: ['**/*.tsx', '**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        {
          name: '@/services/worker-api-client',
          message: 'Server-only. Use route handler or server component.'
        },
        {
          name: '@/services/version-management',
          message: 'Server-only. Use route handler or server component.'
        }
      ]
    }]
  }
}
```

### Server-Only Markers
```typescript
import 'server-only'; // Top of each server service file
```

## 🎯 Success Criteria

### Build Time
- [ ] No "server code in client bundle" errors
- [ ] ESLint passes without server import violations
- [ ] TypeScript compilation clean

### Runtime
- [ ] No browser console errors
- [ ] Version history loads correctly
- [ ] Interactive features work
- [ ] Supabase SSR warning gone

### Architecture
- [ ] Clear separation of server/client code
- [ ] Proper data flow patterns
- [ ] Regression prevention in place

## 🚨 Risks & Mitigations

### Risk: Breaking Existing Functionality
**Mitigation**: Incremental rollout, test each component

### Risk: Performance Regression
**Mitigation**: Use React Query for client caching, server-side initial loading

### Risk: Complex State Management
**Mitigation**: Keep server data simple, use proven patterns

## 📊 Implementation Priority

### High Priority (Must Fix)
1. Remove server imports from client code
2. Fix Supabase SSR configuration
3. Add prevention measures

### Medium Priority (Should Fix)
1. Create server data loaders
2. Add route handlers
3. Refactor main components

### Low Priority (Nice to Have)
1. Optimize bundle size
2. Advanced caching strategies
3. Performance monitoring

## 🔄 Rollback Plan

If issues arise:
1. **Phase 1**: Revert ESLint rules
2. **Phase 2**: Restore original imports (temporary)
3. **Phase 3**: Fix specific issues incrementally

Current band-aid solution remains as emergency fallback.

## 📅 Timeline

- **Day 1 Morning**: Analysis & setup (Phases 1)
- **Day 1 Afternoon**: Server data loaders (Phase 2.1)
- **Day 2 Morning**: Route handlers (Phase 3)
- **Day 2 Afternoon**: Component refactoring (Phase 4)
- **Day 3**: Testing & validation (Phase 5)

## 📞 Dependencies

- Next.js 13+ App Router patterns
- React Query for client state
- Supabase SSR package
- ESLint configuration access

## 🚀 Expert Feedback Integration

### ✅ Expert Validation
**Expert Assessment**: *"This plan is 💯 the right direction"* - confirms we're fixing both root causes correctly.

### 🔧 Expert Improvements (Incorporated)

#### 1. Prevent Barrel Import Issues ⭐ HIGH PRIORITY
```typescript
// Move server services to dedicated path
src/server/services/
├── worker-api-client.ts
├── version-management.ts
└── ai-time-billing.ts

// Updated ESLint config
{
  files: ["**/*.tsx", "**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      patterns: [
        { group: ["@/server/*"], message: "Server-only. Use RSC or route handlers." }
      ]
    }]
  }
}
```

#### 2. Route Handler Production Settings ⭐ HIGH PRIORITY
```typescript
// app/api/worker/versions/[projectId]/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// or: export const revalidate = 0;

export async function GET(req, { params }) {
  const data = await getWorkerClient().getVersionHistory(params.projectId);
  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
```

#### 3. Proper Supabase SSR Usage ⭐ HIGH PRIORITY
```typescript
// lib/server/supabase.ts - Fixed Implementation
export function getSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: name => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options),
        remove: (name, options) => cookieStore.set({ name, value: '', ...options, expires: new Date(0) }),
        setAll: (list) => list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );
}
```

#### 4. Hydrate React Query from RSC ⭐ RECOMMENDED
```typescript
// ClientWorkspace.tsx
const qc = useQueryClient();
useEffect(() => {
  qc.setQueryData(['versions', projectId], initialVersions);
}, [projectId, initialVersions, qc]);
```

#### 5. Centralized Fetch Utility ⭐ RECOMMENDED
```typescript
// lib/client/api-fetch.ts
export async function apiFetch(url: string, init?: RequestInit) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000); // 10s default
  try {
    const res = await fetch(url, { ...init, signal: ac.signal, credentials: 'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally { clearTimeout(t); }
}
```

#### 6. Regression Prevention Tests ⭐ RECOMMENDED
```typescript
// Bundle analysis test
test('client bundle does not include server-only code', () => {
  const clientBundle = fs.readFileSync('.next/static/chunks/main.js', 'utf8');
  expect(clientBundle).not.toContain('worker-api-client');
});
```

### 🤔 Expert Suggestions - Assessment for Our Case

#### ✅ Fully Agree & Will Implement
1. **Barrel import prevention** - Critical for avoiding accidental server imports
2. **Route handler caching flags** - Essential for dynamic data
3. **Proper Supabase SSR** - Fixes our second root issue
4. **React Query hydration** - Prevents double fetching
5. **Centralized fetch utility** - Much cleaner than scattered retry logic
6. **Regression tests** - Critical for maintainability

#### 🟡 Good but Maybe Over-Engineered for Now
7. **POST for user-specific endpoints** - Good practice, but GET with proper cache headers might suffice initially
8. **Zod validation at every boundary** - Excellent practice, but could add incrementally as we scale
9. **Full src/server/ restructure** - Great long-term, but could do gradually to avoid massive file moves

#### 📋 Context-Dependent 
10. **Suspense boundaries** - Depends on how much server fetching we add
11. **SSE proxy considerations** - Only needed if we implement streaming features

### 🎯 Updated Implementation Priority

#### Phase 1: Critical Fixes (Day 1)
- [x] Analysis completed
- [ ] Add server-only imports + ESLint rules (Expert #1, #2)
- [ ] Fix Supabase SSR configuration (Expert #3)
- [ ] Create centralized fetch utility (Expert #5)

#### Phase 2: Architecture Changes (Day 1-2)  
- [ ] Move services to src/server/ structure (Expert feedback)
- [ ] Create route handlers with proper caching (Expert #2)
- [ ] Add React Query hydration (Expert #4)

#### Phase 3: Polish & Testing (Day 2-3)
- [ ] Add regression prevention tests (Expert #6)
- [ ] Refactor components to proper patterns
- [ ] Validate no server code in client bundles

#### Phase 4: Future Enhancements (Post-Launch)
- [ ] Consider POST endpoints for sensitive operations
- [ ] Add Zod validation at boundaries
- [ ] Implement Suspense boundaries where beneficial

## 📝 What We're Deferring (Not Over-Engineering)

### Zod Boundary Validation
**Expert's Point**: *"Define zod schemas for route handler responses"*
**Our Take**: Great practice, but let's nail the architecture first, then add comprehensive validation

### POST for User-Specific Data  
**Expert's Point**: *"Use POST for anything user-specific to avoid caching"*
**Our Take**: Valid concern, but proper Cache-Control headers + credentials should handle this initially

### Complete src/server/ Restructure
**Expert's Point**: *"Keep WorkerAPIClient under src/server/…"*  
**Our Take**: Excellent long-term structure, but let's move incrementally to avoid massive file relocations

The expert's feedback transforms our good plan into a **production-ready, regression-proof solution**. Ready to implement with their enhancements!

## 📝 Implementation Notes & Discoveries

## 🎉 Implementation Complete!

### Summary of Changes

#### Phase 1-2: Server Infrastructure ✅
- Created `/src/server/services/` directory with all server-only services
- Added `import 'server-only'` to prevent client-side usage
- Configured ESLint rules to block client imports of server modules
- Created centralized `apiFetch` utility with retry logic and error handling
- Set up proper Supabase SSR client with cookie handling

#### Phase 3: API Routes ✅
- `/api/worker/versions/[projectId]` - Version history endpoint
- `/api/worker/projects/[projectId]/status` - Project status endpoint
- `/api/worker/projects/[projectId]/update` - Project update endpoint
- `/api/worker/versions/publish` - Version publishing endpoint

#### Phase 4: Component Refactoring ✅
- **Hooks Updated:**
  - `use-version-history.ts` - Now uses API routes
  - `use-project-status.ts` - Now uses API routes
  - `use-version-management.ts` - Now uses API routes
- **Components Fixed:**
  - `workspace-core.tsx` - No longer imports server services
  - `builder-chat-interface.tsx` - Uses API routes for updates
  - `responsive-workspace-content-simple.tsx` - Uses API routes
  - `chat-interface.tsx` - Cleaned up unused imports

#### Additional Work Done:
- Created shared types file `/src/types/version-management.ts` for client-safe types
- Migrated `project-export.ts` to server directory for consistency
- Cleaned up leftover code from previous implementations

### Discoveries During Implementation

1. **Server-Only Import Works Well**: The `import 'server-only'` pattern effectively prevents client-side usage at build time, making the `typeof window` checks redundant in server modules.

2. **Existing Worker Proxy Route**: Found `/api/worker/[...path]/route.ts` which provides a generic proxy. We can leverage this for some operations but specific routes are better for type safety.

3. **Project Export Service**: Found `project-export.ts` which also needs migration but wasn't in our initial scope. Added to server services for consistency.

4. **Build Events Publisher**: The import path for `build-events-publisher` needed adjustment after moving to server directory structure.

### Improvements Outside Current Scope

1. **Type Safety for API Routes**: 
   - Could create shared types between API routes and client hooks
   - Consider using tRPC or similar for end-to-end type safety

2. **API Route Testing**:
   - Need comprehensive tests for all new API routes
   - Consider using MSW for mocking Worker API responses

3. **Rate Limiting**:
   - API routes should implement rate limiting to prevent abuse
   - Could use Vercel's edge rate limiting or custom Redis solution

4. **Caching Strategy**:
   - While we're using `no-store` for now, could implement smart caching
   - React Query on client + proper cache headers could reduce Worker API calls

5. **Error Monitoring**:
   - Should add Sentry or similar to track API route errors
   - Need better error categorization for debugging

6. **WebSocket/SSE for Real-time**:
   - Build events could use Server-Sent Events instead of polling
   - Would reduce load and improve real-time feel

### Technical Debt to Address Later

1. **Legacy Service Files**: Original service files in `/src/services/` should be removed after full migration
2. **Test Updates**: All tests referencing old service paths need updating
3. **Documentation**: Need to document the new architecture for team members
4. **Migration Guide**: Should create a guide for migrating other services to this pattern