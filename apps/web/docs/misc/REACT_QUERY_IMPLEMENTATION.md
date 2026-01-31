# React Query Implementation Guide

## Overview
This codebase uses React Query (TanStack Query) for server state management, replacing manual cache-busting hacks with proper cache invalidation.

## Architecture

### Provider Setup
The `QueryClientProvider` is placed in the root `/src/app/layout.tsx` (NOT in `[locale]/layout.tsx`) to ensure cache persists across locale switches.

```typescript
// src/components/providers/query-provider.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,      // Data fresh for 1 minute
      gcTime: 5 * 60_000,     // Cache for 5 minutes
      retry: 3,               // Retry failed requests
      refetchOnWindowFocus: true,
    },
  },
})
```

## Query Keys Pattern

Always use array-form keys, never string concatenation:

```typescript
// ✅ Correct
['projects']
['projects', userId]
['project', projectId]

// ❌ Wrong
`projects-${userId}`
'projects' + userId
```

### Query Key Constants (Recommended)

For larger projects, centralize query keys to prevent typos and improve maintainability:

```typescript
// src/lib/query-keys.ts
export const queryKeys = {
  all: ['projects'] as const,
  lists: () => [...queryKeys.all, 'list'] as const,
  list: (userId: string) => [...queryKeys.lists(), userId] as const,
  details: () => [...queryKeys.all, 'detail'] as const,
  detail: (id: string) => [...queryKeys.details(), id] as const,
} as const

// Usage
import { queryKeys } from '@/lib/query-keys'

// In queries
useQuery({
  queryKey: queryKeys.list(userId),
  queryFn: () => fetchProjects(userId),
})

// In mutations
queryClient.invalidateQueries({ queryKey: queryKeys.all })
```

## Hooks Usage

### Data Fetching
```typescript
// src/hooks/use-projects-query.ts
const { data: projects, isLoading, error } = useProjectsQuery(userId)
```

### Mutations with Optimistic Updates
```typescript
const { updateProject } = useProjectMutations()

// Usage with optimistic updates
await updateProject.mutateAsync({
  id: projectId,
  name: newName
})
```

### Optimistic Update Pattern
```typescript
const updateMutation = useMutation({
  mutationFn: updateProject,
  onMutate: async (variables) => {
    // Cancel in-flight queries
    await queryClient.cancelQueries(['projects'])

    // Snapshot previous value
    const prev = queryClient.getQueryData<Project[]>(['projects'])

    // Optimistically update
    queryClient.setQueryData(['projects'], old =>
      old?.map(p => p.id === variables.id ? {...p, ...variables} : p)
    )

    return { prev }
  },
  onError: (err, vars, context) => {
    // Rollback on error
    queryClient.setQueryData(['projects'], context?.prev)
  },
  onSettled: () => {
    // Always refetch after mutation
    queryClient.invalidateQueries(['projects'])
  }
})
```

## Migration from Old Patterns

### Before (Manual Cache Busting)
```typescript
// ❌ Old way
fetch(`/api/projects?t=${Date.now()}`, {
  headers: { 'Cache-Control': 'no-cache' }
})
```

### After (React Query)
```typescript
// ✅ New way
const { data } = useProjectsQuery(userId)
// Cache handled automatically
```

## Dashboard Implementation

The dashboard uses React Query for all CRUD operations:

```typescript
// src/components/dashboard/dashboard-content.tsx
const { data: projects, isLoading } = useProjectsQuery(user?.id)
const { createProject, updateProject, duplicateProject } = useProjectMutations()

// Archive project example
await updateProject.mutateAsync({
  id: projectId,
  config: { ...project.config, archived: true }
})
```

## Error Handling

### Global Error Handler

Configure a global error handler for consistent error handling across all queries:

```typescript
// src/components/providers/query-provider.tsx
import { QueryCache, MutationCache } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast'

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Something went wrong',
        variant: 'destructive',
      })
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save changes',
        variant: 'destructive',
      })
    },
  }),
  defaultOptions: {
    // ... existing options
  },
})
```

### Per-Query Error Handling

Override global handler for specific queries:

```typescript
// Custom error handling for specific mutation
const deleteMutation = useMutation({
  mutationFn: deleteProject,
  onError: (error, variables) => {
    if (error.code === 'FORBIDDEN') {
      toast.error(`You don't have permission to delete ${variables.name}`)
    } else {
      // Fallback to global handler
      throw error
    }
  },
})
```

## DevTools

React Query DevTools are available in development:
- Shows cache state
- Query status
- Manual query invalidation
- Network request timeline

### Implementation Options

#### Static Import (Simple)
```typescript
// Already implemented in query-provider.tsx
{process.env.NODE_ENV === 'development' && <ReactQueryDevtools />}
```

#### Dynamic Import (Reduces Bundle Size)
```typescript
// src/components/providers/query-provider.tsx
import { lazy, Suspense } from 'react'

const ReactQueryDevtools = lazy(() =>
  import('@tanstack/react-query-devtools').then((mod) => ({
    default: mod.ReactQueryDevtools,
  }))
)

// In component
{process.env.NODE_ENV === 'development' && (
  <Suspense fallback={null}>
    <ReactQueryDevtools initialIsOpen={false} />
  </Suspense>
)}

## Prefetching

Prefetch data for instant navigation or hover interactions:

```typescript
// Prefetch on hover
const handleMouseEnter = async (projectId: string) => {
  await queryClient.prefetchQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
    staleTime: 10 * 1000, // Consider fresh for 10s
  })
}

// Prefetch next page
const prefetchNextPage = async (page: number) => {
  await queryClient.prefetchQuery({
    queryKey: ['projects', { page: page + 1 }],
    queryFn: () => fetchProjects({ page: page + 1 }),
  })
}

// In component
<Link
  href={`/project/${project.id}`}
  onMouseEnter={() => handleMouseEnter(project.id)}
>
  {project.name}
</Link>
```

## Performance Benefits

1. **Automatic Deduplication** - Multiple components requesting same data share one request
2. **Background Refetching** - Stale data shown instantly while fetching fresh data
3. **Smart Caching** - Data cached for 5 minutes, fresh for 1 minute
4. **Optimistic Updates** - UI updates immediately, rollback on error
5. **Request Cancellation** - In-flight requests cancelled when data changes
6. **Prefetching** - Load data before user navigates for instant UI

## Testing

Wrap components with QueryClient in tests:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false }
  }
})

render(
  <QueryClientProvider client={queryClient}>
    <YourComponent />
  </QueryClientProvider>
)
```

## Troubleshooting

### Data Not Updating
- Check query key consistency
- Verify `onSettled` calls `invalidateQueries`
- Use DevTools to inspect cache

### Optimistic Updates Not Working
- Ensure `onMutate` returns context with previous data
- Check rollback logic in `onError`
- Verify query keys match exactly

### SSR Hydration Issues
- Consider using `dehydrate/hydrate` for server-rendered pages
- Set appropriate `staleTime` to prevent immediate refetch

## SSR/SSG with Next.js

### Server-Side Rendering (App Router)

For Next.js 13+ App Router with server components:

```typescript
// app/[locale]/dashboard/page.tsx
import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query'
import { DashboardContent } from '@/components/dashboard/dashboard-content'

export default async function DashboardPage({ params }) {
  const queryClient = new QueryClient()

  // Prefetch data on server
  await queryClient.prefetchQuery({
    queryKey: ['projects', params.userId],
    queryFn: () => fetchProjects(params.userId),
  })

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardContent />
    </HydrationBoundary>
  )
}
```

### Static Site Generation (Pages Router)

For Next.js Pages Router:

```typescript
// pages/dashboard.tsx
import { dehydrate, QueryClient } from '@tanstack/react-query'

export async function getStaticProps(context) {
  const queryClient = new QueryClient()

  await queryClient.prefetchQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  return {
    props: {
      dehydratedState: dehydrate(queryClient),
    },
    revalidate: 60, // ISR: revalidate every minute
  }
}

// In _app.tsx
import { Hydrate } from '@tanstack/react-query'

function MyApp({ Component, pageProps }) {
  return (
    <QueryProvider>
      <Hydrate state={pageProps.dehydratedState}>
        <Component {...pageProps} />
      </Hydrate>
    </QueryProvider>
  )
}
```

### Preventing Hydration Mismatches

Set appropriate `staleTime` to prevent immediate refetch after hydration:

```typescript
// Match server and client staleTime
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      gcTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})
```

## Configuration Strategy

### Environment-Specific Settings

The QueryClient uses different settings for development vs production:

**Development** (faster feedback):
- `staleTime`: 10 seconds
- `gcTime`: 2 minutes
- `retry`: false (fail fast)
- `refetchOnWindowFocus`: 'always'

**Production** (optimized performance):
- `staleTime`: 1 minute
- `gcTime`: 5 minutes
- `retry`: 3 attempts
- `refetchOnWindowFocus`: true (smart)

### Sensitive Data Configuration

For billing and payment data, override with stricter settings:

```typescript
useQuery({
  queryKey: billingKeys.info(userId),
  queryFn: fetchBillingInfo,
  staleTime: 0, // Always fresh
  refetchOnMount: 'always',
  refetchOnWindowFocus: 'always',
  refetchOnReconnect: 'always',
})
```

## Completed Migrations

### ✅ Billing System (`/src/hooks/use-billing-query.ts`)

**Completed**: June 2025

**Key Features**:
- Zero staleTime for payment-critical data
- Always refetches on mount/focus/reconnect
- Immediate refetch after checkout/portal actions
- 3 retries with exponential backoff
- Backward compatible with existing `useBilling()` hook

**Benefits Achieved**:
- Users always see current subscription status
- Usage limits are always accurate
- ~50 lines of state management removed
- Automatic error recovery

## Migration Opportunities

### High Priority Targets

#### 1. ~~**Billing Hook**~~ ✅ COMPLETED
**Current Issues:**
- Manual state management (`isLoading`, `error`, `subscription`)
- No automatic retry on payment data fetch failures
- Manual refetch implementation
- No cache invalidation strategy

**Benefits of Migration:**
- Critical payment data with automatic retry
- Cache subscription data across components
- Background refetch ensures fresh billing status

#### 2. **Builder Workspace Hooks**
- `/src/hooks/use-builder-workspace.ts`
- `/src/hooks/use-builder-workspace-supabase.ts`

**Current Issues:**
- Complex manual retry logic with counter (`MAX_RETRIES = 3`)
- LocalStorage fallback implemented manually
- Duplicate initialization prevention logic
- Manual polling for AI generation status

**Benefits of Migration:**
- Built-in retry with exponential backoff
- React Query persistence adapter for localStorage
- Automatic request deduplication
- `refetchInterval` for clean polling

#### 3. **AI Service Clients**
- `/src/services/ai/api-client.ts`
- `/src/services/ai/enhanced-ai-client.ts`

**Current Issues:**
```typescript
// Manual cache implementation
private cache = new Map<string, { data: any; timestamp: number }>()
private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes
```

**Benefits of Migration:**
- Replace 100+ lines of cache logic
- Automatic cache invalidation
- Better error boundaries for AI failures

### Medium Priority Targets

#### 4. **Preview Cache Manager** (`/src/services/preview/preview-cache-manager.ts`)
- Manual in-memory cache with timestamps
- No persistence across page reloads
- Would benefit from React Query's persistent cache

#### 5. **Web Vitals Monitoring** (`/src/components/monitoring/web-vitals.tsx`)
- Fire-and-forget fetch calls
- No retry for failed metric submissions
- Could use mutations for reliable metric tracking

### Migration Impact

**Code Reduction Estimates:**
- ~200 lines removed per hook
- ~50% reduction in error handling code
- Eliminate all manual retry logic
- Remove custom cache implementations

**Performance Gains:**
- Request deduplication saves network calls
- Background refetching improves perceived performance
- Optimistic updates for instant UI feedback
- Automatic garbage collection for memory efficiency

### Implementation Priority

1. **Start with Billing** - Payment-critical, user-facing
2. **Then Builder Workspace** - Core functionality with most complex retry logic
3. **Finally AI Services** - Significant cache benefits, better error handling

Each migration follows the same pattern established in the dashboard implementation, making the process straightforward and predictable.
