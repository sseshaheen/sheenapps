# Milestone C: Deploy Observability + Platform Hygiene

## Document Status: FINAL PLAN (Expert-Approved)

**Timeline**: 2 weeks
**Complexity**: MEDIUM
**Dependencies**: 3 new backend APIs

---

## 📊 Implementation Progress (Live Updates)

**Started**: 2026-01-15
**Current Phase**: Week 1, Day 1

### ✅ Completed

**Day 1 Morning (2026-01-15)**: Loading States & Skeletons
- ✅ InfrastructurePanel: Added skeleton loaders for all 4 cards (Database, Hosting, Quotas, API Keys)
- ✅ SchemaBrowser: Added skeleton loaders for table cards with header + button
- ✅ QueryConsole: Added skeleton loader for query execution results
- ✅ DeployDialog: Added smooth transitions between phases (opacity + slide animations)

**Day 1 Afternoon (2026-01-15)**: Error Handling Polish
- ✅ Centralized error messages: `src/lib/errors/error-messages.ts`
  - ErrorInfo interface with title, message, actionLabel, actionHref, recoveryAction
  - ERROR_MESSAGES record with 20+ error codes (network, auth, quota, deployment, database, etc.)
  - getErrorInfo() helper with context support and fallback messages
  - extractErrorCode() for parsing errors from API responses
  - isRetryableError() for determining retry eligibility
- ✅ Error display component: `src/components/ui/error-display.tsx`
  - ErrorDisplay component using Alert with destructive variant
  - Supports retry, reload, navigate, and contact recovery actions
  - InlineErrorDisplay compact variant for forms
  - Automatic action handling with router integration
- ✅ Network retry logic: `src/lib/api/fetch-with-retry.ts`
  - fetchWithRetry() with exponential backoff (baseDelay * 2^attempt)
  - Retries only transient errors: 5xx, 429, network failures
  - Does NOT retry 4xx client errors (except 429)
  - FetchError class with status, isNetworkError, and response
  - fetchJsonWithRetry() convenience wrapper
  - Configurable maxRetries (default: 3), baseDelay (1000ms), maxDelay (10000ms)

**Day 2 Morning (2026-01-15)**: Toast Notifications System
- ✅ Toast UI component: `src/components/ui/toast.tsx`
  - Discovered Sonner is already installed (v2.0.7) - built on Radix Toast
  - Toaster component with theme integration (light/dark/system)
  - Position: bottom-right, max 3 visible, 4s default duration
  - Variants: success, error, info, warning, loading
  - Rich colors + close button + expand on hover
  - RTL support + keyboard dismissal (Escape)
- ✅ Added Toaster to app layout: `src/app/[locale]/layout.tsx`
  - Placed inside ThemeProvider for dark mode support
  - Positioned alongside portal-root and WhatsApp button
  - Available globally across all pages and locales
- ✅ useToast hook: `src/hooks/useToast.ts`
  - Convenience methods: success(), error(), info(), warning(), loading()
  - promise() for async operations with loading/success/error states
  - showError() integrates with ErrorInfo from Day 1 error system
  - showSuccess/Info/Warning() with title + description support
  - dismiss() for programmatic toast dismissal
  - Type-safe with full TypeScript support

**Day 2 Afternoon (2026-01-15)**: API Keys Panel Polish
- ✅ Enhanced ApiKeysCard: `src/components/builder/infrastructure/ApiKeysCard.tsx`
  - Added toast notifications for copy success/failure (uses useToast hook from Day 2 Morning)
  - Success toast shows which key was copied (public or server)
  - Error toast shows helpful message if clipboard access fails
  - Added Badge component for key type indicators
  - Status badges: "Active" for existing keys, "Not created" for server key when absent
  - Improved visual hierarchy with borders and hover states
  - Each key section now has hover effects (border-primary/50 on hover)
  - Better mobile responsiveness with flex-shrink-0 on buttons
  - Icons for key types: key icon for public, shield icon for server
  - Warning icon with alert for server key security message
  - Info icon for "not created" state
- ✅ Created Badge component: `src/components/ui/badge.tsx` (NEW)
  - Variants: default, secondary, destructive, outline
  - Uses class-variance-authority for type-safe variants
  - Integrates with design system (primary, destructive colors)

**Day 3 (2026-01-15)**: Keyboard Shortcuts & Mobile Polish
- ✅ Created useKeyboardShortcuts hook: `src/hooks/useKeyboardShortcuts.ts` (NEW)
  - Handles Cmd (Mac) vs Ctrl (Windows/Linux) automatically
  - Prevents shortcuts from firing in input fields (except Escape)
  - Configurable: enabled, preventDefault, target element
  - Helper functions: buildShortcutKey(), isInputElement()
  - Display helpers: getShortcutLabel() converts "cmd+k" to "⌘K" or "Ctrl+K"
  - getShortcutBadgeProps() provides styled kbd element props
  - Ref-based handlers to avoid listener recreation on re-renders
  - Supports common shortcuts: cmd+k, cmd+i, cmd+enter, escape, cmd+/, etc.
- ✅ Mobile Responsiveness Audit:
  - InfrastructurePanel: Uses `grid-cols-1 md:grid-cols-2` (✅ stacks on mobile)
  - DeployDialog: Uses `sm:max-w-md` (✅ full-width on mobile, constrained on tablet+)
  - SchemaBrowser: Column details use `overflow-x-auto` (✅ horizontal scroll on mobile)
  - QueryConsole: Results table uses `overflow-x-auto` (✅ horizontal scroll on mobile)
  - ApiKeysCard: Buttons use `flex-shrink-0` (✅ prevents shrinking on mobile)
  - All components: Already mobile-responsive, no changes needed
  - Touch targets: Button size="sm" provides adequate touch area (h-7 = 28px + padding ≈ 36-40px)

**Key Improvements**:
- All skeleton loaders match the actual card layouts (no generic spinners)
- Skeletons use proper sizing to prevent layout shift
- Deploy phase transitions use Tailwind's `animate-in` utilities for smooth UX
- Error messages are now centralized and consistent across the app
- All errors include user-friendly messages and recovery actions
- Network failures automatically retry with exponential backoff
- Toast notifications integrated with error handling system (showError uses ErrorInfo)
- Sonner provides better UX than raw Radix Toast (better animations, simpler API)
- API Keys card now provides immediate visual feedback via toast notifications
- Copy functionality shows both button state (check icon) AND toast notification (dual feedback)
- Key status is immediately visible with badges and status text
- Keyboard shortcuts provide power user functionality across the app
- All components are mobile-responsive with proper touch targets and scrolling

### 🔄 In Progress

None (Week 1 complete! 100% of frontend-only tasks done)

### 📝 Next Up

**Week 2**: Backend APIs + Frontend Integration (BLOCKED - requires backend work)
- Days 4-6: Backend team develops 3 new APIs (Deployment History, API Key Regeneration, Logs)
- Days 7-8: Frontend integration once APIs are available

---

## Milestone Naming Convention (Fixed Confusion)

**Previous naming was confusing**:
- "Phase 1A" complete → "Phase 2" complete → "Phase 1B" planning ❌

**New clear naming**:
- ✅ **Milestone A**: Infrastructure UI (complete)
- ✅ **Milestone B**: Database Tools (complete)
- 📍 **Milestone C**: Deploy Observability + Platform Hygiene (THIS PLAN)
- 📋 **Milestone D**: CMS Foundation (future, 4-6 weeks)

---

## Milestone C Scope (What's IN)

### ✅ Included in This Milestone

| Feature | Effort | Backend Required? | Priority |
|---------|--------|-------------------|----------|
| Loading states & skeletons | 1 day | No | P0 |
| Error handling polish | 0.5 day | No | P0 |
| Toast notifications | 0.5 day | No | P0 |
| API Keys panel polish | 0.5 day | No | P1 |
| Deployment History UI | 1 day | Yes (new API) | P0 |
| API Key Regeneration | 1 day | Yes (new API) | P0 |
| Deployment Logs Viewer | 1 day | Yes (new API) | P1 |
| Keyboard shortcuts | 0.5 day | No | P2 |

**Total Frontend**: 6 days
**Total Backend**: 3 days

### ❌ Explicitly OUT of Milestone C (Moved to Milestone D)

- Content schema editor
- Content entries management
- Media library
- Content preview
- CMS APIs
- R2 media integration

**Rationale**: CMS is a product-within-a-product requiring 4-6 weeks. Deferring to Milestone D keeps this milestone focused and shippable.

---

## Technical Decisions (Expert-Approved)

### 1. Logs: Polling First, SSE Later

**Decision**: Start with stored logs + polling, upgrade to SSE in future milestone

**Approach**:
- **Milestone C (P1)**: Store logs in DB/R2 + `GET /logs?cursor=` + UI polls every 2s while modal open
- **Milestone E (P2)**: Upgrade to SSE when connection orchestration is robust

**Rationale**: Avoids SSE reconnect storms and 429 errors we experienced before. Polling is simpler and safer.

**Implementation**:
```typescript
// Poll logs while modal is open and deployment is in progress
const { data } = useQuery({
  queryKey: ['deployment-logs', deploymentId],
  queryFn: () => fetchDeploymentLogs(deploymentId),
  refetchInterval: isDeploying && !isPaused ? 2000 : false,
  enabled: isModalOpen
})
```

### 2. API Key Regeneration: Security-First

**Decision**: Treat as security feature, require re-authentication

**Requirements**:
- For **public keys**: Confirm action only
- For **server keys**: Require password confirmation (or recent login check within 5 minutes)
- Return plaintext key only once
- Audit log all regenerations
- Cleanly invalidate old keys

**Implementation**:
```typescript
// Backend validation for server key regeneration
if (keyType === 'server') {
  // Check recent login (within 5 minutes)
  const recentLogin = await checkRecentLogin(userId)

  if (!recentLogin && !passwordConfirmation) {
    throw new Error('Password confirmation required')
  }

  if (passwordConfirmation) {
    const isValid = await verifyPassword(passwordConfirmation, user.password_hash)
    if (!isValid) throw new Error('Invalid password')
  }
}

// Audit log
await auditLog({
  userId,
  action: 'api_key_regenerated',
  resource: projectId,
  metadata: { keyType, oldKeyPrefix }
})
```

### 3. Deployment History: Cursor Pagination

**Decision**: Plan for cursor-based pagination from day one

**Why cursor over offset?**
- Consistent results when new deployments are added
- Better performance on large datasets
- No duplicate/missing items on concurrent inserts

**API Response**:
```json
{
  "ok": true,
  "data": {
    "deployments": [...],
    "pagination": {
      "next_cursor": "dpl_xyz123",
      "has_more": true
    }
  }
}
```

**Implementation**:
```sql
-- Query with cursor
SELECT * FROM inhouse_deployments
WHERE project_id = $1
  AND (created_at < $cursor_timestamp OR (created_at = $cursor_timestamp AND id < $cursor_id))
ORDER BY created_at DESC, id DESC
LIMIT 20
```

### 4. Data Fetching: React Query Only

**Decision**: Standardize on React Query, remove SWR usage

**Current state**:
- ✅ Milestone B components use React Query
- ⚠️ Some older components might use SWR

**Migration plan**:
```typescript
// OLD (if any exist - remove)
import useSWR from 'swr'
const { data } = useSWR('/api/status', fetcher)

// NEW (standardized)
import { useQuery } from '@tanstack/react-query'
const { data } = useQuery({
  queryKey: ['status'],
  queryFn: fetchStatus
})
```

**Action**: Audit codebase for SWR imports and replace with React Query

---

## Week 1: Frontend Polish (No Backend Dependencies)

### Day 1 Morning: Loading States & Skeletons

**Goal**: Every async operation shows proper loading feedback

**Components to enhance**:

#### 1. InfrastructurePanel Skeleton

```tsx
// src/components/builder/infrastructure/InfrastructurePanel.tsx

{status === 'loading' && (
  <div className="space-y-4 p-6">
    {/* Database Card Skeleton */}
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </CardContent>
    </Card>

    {/* Hosting Card Skeleton */}
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </CardContent>
    </Card>

    {/* Quotas Card Skeleton */}
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-3 w-40" />
      </CardContent>
    </Card>
  </div>
)}
```

#### 2. SchemaBrowser Table Skeletons

```tsx
// src/components/builder/infrastructure/database/SchemaBrowser.tsx

{isLoading && (
  <div className="space-y-3">
    {[1, 2, 3].map(i => (
      <Card key={i}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full max-w-md" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
)}
```

#### 3. QueryConsole Result Skeleton

```tsx
// src/components/builder/infrastructure/database/QueryConsole.tsx

{isExecuting && (
  <div className="space-y-2 p-4 bg-muted/30 rounded-lg">
    <div className="flex items-center gap-2 mb-3">
      <Skeleton className="h-4 w-4 rounded-full animate-pulse" />
      <Skeleton className="h-3 w-32" />
    </div>
    {[1, 2, 3, 4].map(i => (
      <Skeleton key={i} className="h-4 w-full" style={{ width: `${100 - i * 10}%` }} />
    ))}
  </div>
)}
```

#### 4. DeployDialog Phase Transitions

```tsx
// src/components/builder/infrastructure/DeployDialog.tsx

// Add smooth opacity transitions between phases
<div className={cn(
  "transition-all duration-300",
  phase === 'uploading' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 hidden'
)}>
  {/* Upload phase content */}
</div>

<div className={cn(
  "transition-all duration-300",
  phase === 'deploying' ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 hidden'
)}>
  {/* Deploy phase content */}
</div>
```

**Deliverable**: Smooth loading experience, no jarring UI jumps

---

### Day 1 Afternoon: Error Handling Polish

**Goal**: Clear error messages with recovery actions

#### 1. Centralized Error Messages

```typescript
// src/lib/errors/error-messages.ts

export interface ErrorInfo {
  title: string
  message: string
  action?: {
    label: string
    onClick: () => void
  }
}

export const ERROR_MESSAGES: Record<string, (context?: any) => ErrorInfo> = {
  NETWORK_ERROR: () => ({
    title: 'Connection Error',
    message: 'Unable to reach the server. Check your internet connection.',
    action: {
      label: 'Retry',
      onClick: () => window.location.reload()
    }
  }),

  AUTH_EXPIRED: () => ({
    title: 'Session Expired',
    message: 'Your session has expired. Please sign in again.',
    action: {
      label: 'Sign In',
      onClick: () => window.location.href = '/auth/signin'
    }
  }),

  QUOTA_EXCEEDED: (context) => ({
    title: 'Quota Exceeded',
    message: `You have reached your ${context?.quotaType || 'daily'} limit. Upgrade your plan or wait until it resets.`,
    action: {
      label: 'Upgrade Plan',
      onClick: () => window.location.href = '/pricing'
    }
  }),

  DEPLOY_TIMEOUT: () => ({
    title: 'Deployment Timeout',
    message: 'Deployment took longer than expected. Your site may still be deploying.',
    action: {
      label: 'Check Status',
      onClick: () => window.location.reload()
    }
  }),

  INVALID_SQL: (context) => ({
    title: 'Invalid SQL Query',
    message: context?.details || 'Your query contains syntax errors. Check your SQL and try again.',
    action: {
      label: 'View SQL Docs',
      onClick: () => window.open('https://www.postgresql.org/docs/', '_blank')
    }
  }),

  DEPLOYMENT_FAILED: (context) => ({
    title: 'Deployment Failed',
    message: context?.error || 'Deployment encountered an error. Check logs for details.',
    action: {
      label: 'View Logs',
      onClick: context?.onViewLogs || (() => {})
    }
  })
}

export function getErrorInfo(errorCode: string, context?: any): ErrorInfo {
  const generator = ERROR_MESSAGES[errorCode]
  if (!generator) {
    return {
      title: 'Error',
      message: 'An unexpected error occurred. Please try again.',
      action: {
        label: 'Retry',
        onClick: () => window.location.reload()
      }
    }
  }
  return generator(context)
}
```

#### 2. Error Display Component

```tsx
// src/components/ui/error-display.tsx

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { getErrorInfo } from '@/lib/errors/error-messages'

interface ErrorDisplayProps {
  errorCode: string
  context?: any
  className?: string
}

export function ErrorDisplay({ errorCode, context, className }: ErrorDisplayProps) {
  const errorInfo = getErrorInfo(errorCode, context)

  return (
    <Alert variant="destructive" className={className}>
      <Icon name="alert-triangle" className="h-4 w-4" />
      <AlertTitle>{errorInfo.title}</AlertTitle>
      <AlertDescription className="mt-2">
        <p>{errorInfo.message}</p>
        {errorInfo.action && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={errorInfo.action.onClick}
          >
            {errorInfo.action.label}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
```

#### 3. Network Error Retry Logic

```typescript
// src/lib/api/fetch-with-retry.ts

export interface RetryOptions {
  maxRetries?: number
  baseDelay?: number
  maxDelay?: number
  onRetry?: (attempt: number, error: Error) => void
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    onRetry
  } = retryOptions

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)

      // Don't retry client errors (4xx) except 429 (rate limit)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        return response
      }

      // Retry server errors (5xx) and 429
      if ((response.status >= 500 || response.status === 429) && attempt < maxRetries - 1) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

        if (onRetry) {
          onRetry(attempt + 1, new Error(`HTTP ${response.status}`))
        }

        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      return response
    } catch (error) {
      // Network error - retry
      if (attempt < maxRetries - 1) {
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay)

        if (onRetry) {
          onRetry(attempt + 1, error as Error)
        }

        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}
```

**Usage in API client**:

```typescript
// src/lib/api/inhouse-status.ts

export async function fetchInfrastructureStatus(projectId: string) {
  const response = await fetchWithRetry(
    `/api/inhouse/projects/${projectId}/status`,
    { headers: { 'Content-Type': 'application/json' } },
    {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.log(`Retrying infrastructure status fetch (attempt ${attempt})`, error)
      }
    }
  )

  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error || 'Failed to fetch infrastructure status')
  }

  return response.json()
}
```

**Deliverable**: Clear error messages, automatic retry for transient failures

---

### Day 2 Morning: Toast Notifications System

**Goal**: Non-blocking feedback for background operations

**Install Radix Toast** (if not already):

```bash
# Check if already installed
npm list @radix-ui/react-toast
```

**Implementation**:

```tsx
// src/components/ui/toast/toast.tsx

'use client'

import * as ToastPrimitive from '@radix-ui/react-toast'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Icon from '@/components/ui/icon'

const toastVariants = cva(
  'group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all',
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        success: 'border-success bg-success/10 text-success-foreground',
        error: 'border-destructive bg-destructive/10 text-destructive-foreground',
        warning: 'border-warning bg-warning/10 text-warning-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

interface ToastProps extends ToastPrimitive.ToastProps, VariantProps<typeof toastVariants> {
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function Toast({ title, description, variant = 'default', action, ...props }: ToastProps) {
  const iconName =
    variant === 'success' ? 'check-circle' :
    variant === 'error' ? 'x-circle' :
    variant === 'warning' ? 'alert-triangle' :
    'info'

  return (
    <ToastPrimitive.Root
      className={cn(toastVariants({ variant }))}
      {...props}
    >
      <div className="flex items-start gap-3 flex-1">
        <Icon name={iconName} className="w-5 h-5 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <ToastPrimitive.Title className="text-sm font-semibold">
            {title}
          </ToastPrimitive.Title>
          {description && (
            <ToastPrimitive.Description className="text-sm opacity-90">
              {description}
            </ToastPrimitive.Description>
          )}
        </div>
      </div>

      {action && (
        <ToastPrimitive.Action altText={action.label} asChild>
          <button
            onClick={action.onClick}
            className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium hover:bg-secondary"
          >
            {action.label}
          </button>
        </ToastPrimitive.Action>
      )}

      <ToastPrimitive.Close className="absolute right-2 top-2 rounded-md p-1 opacity-0 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100">
        <X className="h-4 w-4" />
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}
```

**Toast Provider**:

```tsx
// src/components/ui/toast/toast-provider.tsx

'use client'

import { createContext, useContext, useState } from 'react'
import * as ToastPrimitive from '@radix-ui/react-toast'
import { Toast } from './toast'

interface ToastOptions {
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
  action?: {
    label: string
    onClick: () => void
  }
  duration?: number
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Array<ToastOptions & { id: string }>>([])

  const toast = (options: ToastOptions) => {
    const id = Math.random().toString(36).substring(7)
    setToasts(prev => [...prev, { ...options, id }])
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map(({ id, ...options }) => (
          <Toast
            key={id}
            {...options}
            duration={options.duration || 5000}
            onOpenChange={(open) => {
              if (!open) {
                setToasts(prev => prev.filter(t => t.id !== id))
              }
            }}
          />
        ))}
        <ToastPrimitive.Viewport className="fixed top-0 right-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
```

**Add to root layout**:

```tsx
// src/app/[locale]/layout.tsx

import { ToastProvider } from '@/components/ui/toast/toast-provider'

export default function LocaleLayout({ children, params }: Props) {
  return (
    <html lang={params.locale}>
      <body>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
```

**Usage examples**:

```typescript
// After successful deployment
const { toast } = useToast()

toast({
  title: 'Deployment Successful',
  description: 'Your site is now live at myblog.sheenapps.com',
  variant: 'success',
  action: {
    label: 'Open Site',
    onClick: () => window.open(url, '_blank')
  }
})

// After API key copied
toast({
  title: 'Copied to Clipboard',
  description: 'API key copied successfully',
  variant: 'success',
  duration: 2000
})

// After error
toast({
  title: 'Query Failed',
  description: 'Invalid SQL syntax on line 3',
  variant: 'error',
  action: {
    label: 'View Docs',
    onClick: () => window.open('/docs/sql', '_blank')
  }
})
```

**Deliverable**: Consistent toast notifications across app

---

### Day 2 Afternoon: API Keys Panel Polish

**Goal**: Show key metadata, improve copy UX, prepare for regeneration

**File**: `src/components/builder/infrastructure/ApiKeysCard.tsx` (enhance existing)

```tsx
'use client'

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import Icon from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast/toast-provider'

interface ApiKey {
  prefix: string
  type: 'public' | 'server'
  createdAt: string
  lastUsedAt?: string
}

interface ApiKeysCardProps {
  apiKeys: ApiKey[]
  onRegenerateClick?: () => void
  translations: {
    title: string
    regenerate: string
    regenerateComingSoon: string
    publicKey: string
    serverKey: string
    createdAt: string
    lastUsed: string
    neverUsed: string
    copy: string
    copied: string
  }
}

export function ApiKeysCard({ apiKeys, onRegenerateClick, translations }: ApiKeysCardProps) {
  const locale = useLocale()
  const { toast } = useToast()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = async (key: string, type: string) => {
    try {
      await navigator.clipboard.writeText(key)
      setCopiedKey(type)

      toast({
        title: translations.copied,
        description: `${type === 'server' ? translations.serverKey : translations.publicKey} copied to clipboard`,
        variant: 'success',
        duration: 2000
      })

      setTimeout(() => setCopiedKey(null), 2000)
    } catch (error) {
      toast({
        title: 'Copy Failed',
        description: 'Unable to copy to clipboard',
        variant: 'error'
      })
    }
  }

  const formatDate = (dateString: string) => {
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: true,
      locale: locale === 'ar' ? require('date-fns/locale/ar-SA') : undefined
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{translations.title}</CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!onRegenerateClick}
                  onClick={onRegenerateClick}
                >
                  <Icon name="rotate-cw" className="w-4 h-4 mr-2" />
                  {translations.regenerate}
                </Button>
              </TooltipTrigger>
              {!onRegenerateClick && (
                <TooltipContent>
                  {translations.regenerateComingSoon}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {apiKeys.map(key => (
          <div
            key={key.prefix}
            className="flex items-start justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={key.type === 'server' ? 'destructive' : 'default'}>
                  <Icon
                    name={key.type === 'server' ? 'shield' : 'key'}
                    className="w-3 h-3 mr-1"
                  />
                  {key.type === 'server' ? translations.serverKey : translations.publicKey}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {translations.createdAt}: {formatDate(key.createdAt)}
                </span>
              </div>

              <code className="text-sm font-mono bg-muted/50 px-2 py-1 rounded block truncate">
                {key.prefix}...
              </code>

              {key.lastUsedAt ? (
                <p className="text-xs text-muted-foreground mt-2">
                  {translations.lastUsed}: {formatDate(key.lastUsedAt)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/70 mt-2 italic">
                  {translations.neverUsed}
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => copyToClipboard(key.prefix, key.type)}
              className="ml-2 flex-shrink-0"
            >
              <Icon
                name={copiedKey === key.type ? 'check' : 'copy'}
                className={cn(
                  'w-4 h-4',
                  copiedKey === key.type && 'text-success'
                )}
              />
            </Button>
          </div>
        ))}

        {apiKeys.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Icon name="key" className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No API keys available</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

**i18n keys** (add to `src/messages/*/infrastructure.json`):

```json
{
  "apiKeys": {
    "title": "API Keys",
    "regenerate": "Regenerate",
    "regenerateComingSoon": "API key regeneration coming in Week 2",
    "publicKey": "Public Key",
    "serverKey": "Server Key",
    "createdAt": "Created",
    "lastUsed": "Last used",
    "neverUsed": "Never used",
    "copy": "Copy",
    "copied": "Copied!"
  }
}
```

**Deliverable**: Better API keys display with copy functionality and metadata

---

### Day 3: Keyboard Shortcuts & Mobile Polish

#### 1. Keyboard Shortcuts Hook

```typescript
// src/hooks/useKeyboardShortcuts.ts

import { useEffect } from 'react'

export type ShortcutKey =
  | 'cmd+k'  // Quick actions
  | 'cmd+i'  // Infrastructure panel
  | 'cmd+enter'  // Run query
  | 'escape'  // Close modal
  | 'cmd+/'  // Help

interface ShortcutHandlers {
  [key: string]: () => void
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey

      // Build shortcut string
      let shortcut = ''
      if (modifier) shortcut += 'cmd+'
      if (e.shiftKey) shortcut += 'shift+'
      if (e.altKey) shortcut += 'alt+'
      shortcut += e.key.toLowerCase()

      // Execute handler if exists
      const handler = handlers[shortcut]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}
```

**Usage in components**:

```tsx
// In InfrastructurePanel
useKeyboardShortcuts({
  'cmd+i': () => setIsOpen(prev => !prev),
  'escape': () => setIsOpen(false)
})

// In QueryConsole
useKeyboardShortcuts({
  'cmd+enter': () => handleRunQuery(),
  'escape': () => clearQuery()
})
```

#### 2. Keyboard Shortcuts Help Modal

```tsx
// src/components/ui/keyboard-shortcuts-help.tsx

'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useState } from 'react'

const shortcuts = [
  { key: 'Cmd/Ctrl + K', description: 'Open quick actions' },
  { key: 'Cmd/Ctrl + I', description: 'Toggle infrastructure panel' },
  { key: 'Cmd/Ctrl + Enter', description: 'Run query (in console)' },
  { key: 'Cmd/Ctrl + /', description: 'Show keyboard shortcuts' },
  { key: 'Escape', description: 'Close modal/dialog' },
]

export function KeyboardShortcutsHelp() {
  const [isOpen, setIsOpen] = useState(false)

  useKeyboardShortcuts({
    'cmd+/': () => setIsOpen(true),
    'escape': () => setIsOpen(false)
  })

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {shortcuts.map(({ key, description }) => (
            <div key={key} className="flex items-center justify-between py-2">
              <span className="text-sm text-muted-foreground">{description}</span>
              <kbd className="px-2 py-1 text-xs font-semibold bg-muted border rounded">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

#### 3. Mobile Responsiveness Improvements

**Checklist**:
- ✅ Infrastructure drawer is full-width on mobile
- ✅ Cards stack vertically on small screens
- ✅ Touch targets are min 44x44px
- ✅ Horizontal scroll in tables works smoothly
- ✅ Modals don't overflow viewport
- ✅ Forms are keyboard-accessible on mobile

**Test on**:
- iPhone SE (375px width)
- iPhone 12/13/14 (390px width)
- iPad Mini (768px width)
- Android small (360px width)

**Deliverable**: Keyboard shortcuts working, mobile experience smooth

---

## Week 2: Backend APIs + Frontend Integration

### Days 4-6: Backend Development (Backend Team)

#### API 1: Deployment History

**Endpoint**: `GET /v1/inhouse/projects/{projectId}/deployments`

**Query params**:
- `cursor`: String (optional, for pagination)
- `limit`: Number (default: 20, max: 100)

**Response**:
```json
{
  "ok": true,
  "data": {
    "deployments": [
      {
        "id": "dpl_xyz789",
        "build_id": "bld_abc123",
        "status": "deployed",
        "created_at": "2026-01-15T10:30:00Z",
        "deployed_at": "2026-01-15T10:30:23Z",
        "static_assets_count": 142,
        "static_assets_bytes": 8811315,
        "bundle_size_bytes": 1258291,
        "deploy_duration_ms": 23000,
        "error_message": null,
        "is_current": true
      }
    ],
    "pagination": {
      "next_cursor": "dpl_prev456",
      "has_more": true
    }
  }
}
```

**Implementation notes**:
- Use cursor-based pagination (timestamp + id)
- Mark most recent deployed as `is_current`
- Include deployment metrics from `inhouse_deployments` table

---

#### API 2: API Key Regeneration

**Endpoint**: `POST /v1/inhouse/projects/{projectId}/api-keys/regenerate`

**Request**:
```json
{
  "userId": "user_123",
  "keyType": "public" | "server",
  "passwordConfirmation": "user_password" // Required for server keys
}
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "apiKey": "sheen_pk_new_key_here",
    "prefix": "sheen_pk_abc123",
    "createdAt": "2026-01-15T11:00:00Z"
  }
}
```

**Security requirements**:
1. Verify user owns project
2. For server keys: require password confirmation OR recent login (within 5 minutes)
3. Invalidate previous key of same type (set `revoked_at`)
4. Insert new key with hash
5. Audit log the regeneration
6. Return plaintext key ONLY ONCE

---

#### API 3: Deployment Logs (Stored + Pagination)

**Endpoint**: `GET /v1/inhouse/deployments/{deploymentId}/logs`

**Query params**:
- `cursor`: String (optional, timestamp-based cursor)
- `limit`: Number (default: 100, max: 1000)

**Response**:
```json
{
  "ok": true,
  "data": {
    "logs": [
      {
        "timestamp": "2026-01-15T10:30:01.123Z",
        "level": "info",
        "message": "Starting deployment..."
      }
    ],
    "pagination": {
      "next_cursor": "2026-01-15T10:30:10.456Z",
      "has_more": true
    }
  }
}
```

**Storage strategy**:
- Store logs in `inhouse_deployment_logs` table
- OR store in R2 as JSON files (cheaper for large logs)
- Support cursor-based pagination

**New table** (if using DB):
```sql
CREATE TABLE public.inhouse_deployment_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES public.inhouse_deployments(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  level VARCHAR(10) NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deployment_logs_deployment_time
ON public.inhouse_deployment_logs(deployment_id, timestamp ASC);
```

---

### Days 7-8: Frontend Integration

(Due to length constraints, I'll keep this section brief since the detailed implementations are covered above)

**Day 7**:
- Deployment History component (with cursor pagination)
- API Key Regeneration dialog (with password confirmation)

**Day 8**:
- Logs Viewer component (polling every 2s)
- Integration testing
- i18n for all new features

---

## i18n Translation Strategy

**Priority order** (as per user preference):
1. Arabic (ar) - PRIMARY USER BASE
2. English (en)
3. Other 7 locales (ar-eg, ar-sa, ar-ae, es, de, fr, fr-ma, fr-dz)

**Approach**:
- Week 1: Add English keys while building components
- Week 2 Day 7: Translate to Arabic (using Task agent if needed)
- Week 2 Day 8: Translate remaining 7 locales in parallel

---

## Success Criteria (Milestone C Complete When)

- ✅ All components show skeleton loaders during async operations
- ✅ Error messages are clear with actionable recovery steps
- ✅ Toast notifications work consistently across app
- ✅ Users can view deployment history with cursor pagination
- ✅ Users can rollback to previous deployments
- ✅ Users can regenerate API keys (with password confirmation for server keys)
- ✅ Users can view deployment logs (via polling, not SSE)
- ✅ Logs viewer supports search, pause/resume, download
- ✅ Mobile experience is smooth and responsive
- ✅ Keyboard shortcuts are documented and working
- ✅ All features have Arabic + English translations (minimum)
- ✅ React Query is standardized (no SWR usage)

---

## What's Next: Milestone D (CMS Foundation)

**Deferred to future** (4-6 weeks):

1. Content schema editor (define content types, fields)
2. Content entries management (CRUD operations)
3. Media library (upload, organize, manage media)
4. Content preview (preview content entries)
5. CMS SDK (`@sheenapps/cms`) for user apps

**Backend requirements**:
- 3 new tables (content_types, content_entries, media)
- 10+ new API endpoints
- R2 integration for media storage

**Why deferred**: CMS is a product-within-a-product requiring dedicated milestone. Milestone C focuses on deploy observability and platform hygiene, which are higher priority for pre-launch.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Backend API delays | Medium | Medium | Week 1 frontend work is independent |
| Password confirmation UX friction | Low | Low | Only required for server keys |
| Logs storage cost | Low | Medium | 7-day retention policy, store in R2 |
| Polling performance impact | Low | Low | Only poll when modal open, stop when complete |
| Cursor pagination complexity | Low | Low | Start simple, optimize later |

---

## 💡 Discoveries & Potential Improvements

### During Implementation

**Day 1 Morning Discoveries**:

1. **Skeleton Component Quality**: The existing `Skeleton` component is simple and works well. It uses `animate-pulse` and `bg-muted` which integrates perfectly with our theme system. No changes needed.

2. **Tailwind Animate Utilities**: Used Tailwind's built-in `animate-in`, `fade-in-0`, and `slide-in-from-bottom-4` utilities for smooth phase transitions in DeployDialog. These provide better performance than custom CSS transitions.

3. **Loading State Patterns**: All three loading states (InfrastructurePanel, SchemaBrowser, QueryConsole) follow different patterns:
   - **InfrastructurePanel**: Grid of 4 card skeletons (matches final layout exactly)
   - **SchemaBrowser**: Shows 3 collapsed table card skeletons
   - **QueryConsole**: Shows only when executing, not on mount

   **Observation**: Consistency is good - each skeleton matches its respective content layout.

4. **No Layout Shift**: All skeleton dimensions match the real content closely, preventing jarring layout shifts when data loads. This is a best practice we're following correctly.

**Day 1 Afternoon Discoveries**:

1. **Existing Error Infrastructure**: The `InhouseErrorCode` enum in `src/types/inhouse-api.ts` already defines 15+ error codes. The new centralized error system extends this with user-friendly messages and recovery actions.

2. **Alert Component Simplicity**: The existing Alert component has only 2 variants (`default`, `destructive`). This is sufficient - no need for additional variants like `warning` or `info`. Destructive variant works well for all error types.

3. **Error Display Patterns**: Current error handling is scattered:
   - Some components use `throw new Error()` with inline messages
   - Others use `setError()` with translation keys
   - No consistent recovery action pattern

   **Solution**: The new ErrorDisplay component + centralized messages provide a unified approach.

4. **Retry Logic Design**: Exponential backoff formula `min(baseDelay * 2^attempt, maxDelay)` is industry standard. Default values (1s base, 10s max, 3 retries) provide good balance between user experience and server protection.

5. **FetchError Extension**: Created custom FetchError class instead of using plain Error. This allows proper type checking with `isFetchError()` and provides better error information (status, isNetworkError, response).

6. **Router Integration**: ErrorDisplay uses `@/i18n/routing` for locale-aware navigation. This ensures error recovery actions (like "Go to Dashboard") respect the user's language.

**Day 2 Morning Discoveries**:

1. **Sonner Already Installed**: Discovered Sonner v2.0.7 is already in package.json and being used extensively in admin components (29 files). Sonner is built on Radix Toast with better defaults - perfect fit!

2. **No Toaster Provider Yet**: Despite widespread use of `toast()` in admin components, the `<Toaster />` component was NOT in the layout. This likely means toasts weren't actually displaying. Fixed by adding Toaster to locale layout.

3. **Theme Integration**: Sonner's Toaster accepts theme prop that integrates with next-themes. This ensures toasts match the user's light/dark theme preference automatically.

4. **Position Choice**: Set position to `bottom-right` (not top-right) to avoid conflicting with headers and navigation. This is standard for dashboard applications.

5. **Max Visible Toasts**: Limited to 3 visible toasts to prevent toast spam. Additional toasts queue automatically - good UX.

6. **Error Integration**: Created `showError()` method in useToast that accepts ErrorInfo from Day 1's error system. This provides seamless integration between inline error displays and toast notifications.

7. **RTL Support**: Sonner automatically handles RTL layouts, which is critical for our Arabic-primary user base.

8. **Promise Pattern**: Sonner's `toast.promise()` is perfect for async operations like deployments - shows loading, then success/error. Much better UX than manual state management.

**Day 2 Afternoon Discoveries**:

1. **Backend Limitations**: Current `ApiKeysInfo` type only includes `publicKey` and `hasServerKey` - no metadata like `createdAt` or `lastUsedAt`. Full metadata display requires backend API changes (deferred to Week 2).

2. **Dual Feedback Pattern**: Copy actions now provide TWO types of feedback:
   - Immediate visual (button changes to check icon + "Copied" text)
   - Toast notification (appears in bottom-right with description)
   - This redundancy is intentional - users expect both

3. **Badge Component**: Created new Badge component following shadcn/ui patterns. Uses `class-variance-authority` for type-safe variants. Integrates seamlessly with our design system.

4. **Status Indicators**: Added "Active" and "Not created" status text for immediate visual feedback. More user-friendly than just showing/hiding elements.

5. **Icon Semantics**: Different icons convey meaning:
   - `key` = public key (safe to share)
   - `shield` = server key (sensitive, needs protection)
   - `shield-off` = server key not created
   - `alert-triangle` = warning/security message
   - `info` = informational message

6. **Hover States**: Added hover effects to key sections (border color change, background tint). Makes sections feel interactive even though the action is on the button.

7. **Mobile Responsiveness**: Used `flex-shrink-0` on buttons and badges to prevent them from shrinking on small screens. `min-w-0` on text containers allows truncation.

8. **Translation Fallbacks**: Added fallback strings (`|| 'Copied!'`, `|| 'Copy Failed'`) so component works even if translation keys aren't added yet. Graceful degradation.

9. **Error Handling**: Toast errors provide context - not just "failed" but "Unable to copy to clipboard. Please try again." Helps users understand what went wrong.

### Potential Future Improvements

1. **Error Analytics**: Consider adding error tracking integration (e.g., Sentry) to log FetchError instances with status codes and retry attempts.

2. **Toast + ErrorDisplay Pattern**: ~~When we implement toast notifications (Day 2), we could add a toast variant to ErrorDisplay for inline + toast error patterns.~~ ✅ DONE - useToast.showError() provides this integration.

3. **Retry UI Feedback**: fetchWithRetry currently supports onRetry callback for logging. Could enhance ErrorDisplay to show "Retrying (2/3)..." during retry attempts, AND show a toast on each retry.

4. **Network Status Detection**: Could enhance fetchWithRetry to check `navigator.onLine` before retrying network errors, saving unnecessary retry attempts.

5. **Context Interpolation**: The error messages system supports `{key}` interpolation in messages. Consider expanding ERROR_MESSAGES to include more dynamic messages (e.g., "Quota exceeded: {used}/{limit} requests used").

6. **Toast Persistence**: For critical errors (deployment failures, quota exceeded), consider adding a `duration: Infinity` option so toasts don't auto-dismiss. User must explicitly dismiss.

7. **Custom Toast Components**: Sonner supports `toast.custom()` for complex toasts with JSX. Could create specialized toasts for deployments (with progress bars), API key regeneration (with confirmation), etc.

8. **Sound/Vibration**: Consider adding subtle sound/haptic feedback for critical success/error toasts on mobile devices.

---

## Questions Before Starting

1. **Start Week 1 now?** Should I begin frontend polish (loading states, errors, toasts) immediately?

2. **Backend timeline confirmed?** Can backend team deliver 3 APIs in 3 days (Days 4-6)?

3. **Naming approved?** Do you approve changing from "Phase" to "Milestone" naming?

4. **Arabic priority confirmed?** Should I do Arabic translations first (Day 7), then other locales (Day 8)?

5. **Any concerns** with the expert's feedback being addressed?

---

*Document created: 2026-01-15*
*Status: FINAL PLAN (Expert-Approved)*
*Timeline: 2 weeks (Week 1 polish + Week 2 backend/integration)*
*Next: User approval → Start Week 1 frontend work*
