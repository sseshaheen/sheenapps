# React Hook Violation Diagnostic Report

## Executive Summary
Persistent "Rendered fewer hooks than expected" error occurring in production workspace component, despite multiple architectural fixes. The error manifests during component initialization with rapid Hook instance creation/destruction cycles.

## Current Symptoms

### Primary Error
```
Error: Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
```

### Observable Patterns
1. **Hook Instance Cycling**: Multiple instances created (`hook-1` through `hook-8`) with ownership transfers
2. **Multiple Initializations**: `initializeProject` called repeatedly
3. **Build State Updates**: Global build state updating from null to valid ID
4. **Component Remounting**: Components appear to unmount/remount during initialization

### Console Log Pattern
```
[Warning] PRIMARY OWNERSHIP TRANSFERRED: hook-2 is now primary for 01K2315T...
[Warning] Primary instance hook-1 unmounted - ownership transferred
[Warning] PRIMARY OWNERSHIP TRANSFERRED: hook-3 is now primary for 01K2315T...
[Warning] Primary instance hook-2 unmounted - ownership transferred
... (continues through hook-8)
```

## Component Architecture

### Key Components Involved
1. **ResponsiveWorkspaceContentSimple** (`/src/components/builder/responsive-workspace-content-simple.tsx`)
   - Main workspace container
   - Handles responsive layout switching
   - Contains BuilderChatInterface and preview components

2. **BuilderChatInterface** (`/src/components/builder/builder-chat-interface.tsx`)
   - Uses `useCleanBuildEvents` Hook
   - Uses `usePostBuildRecommendations` Hook
   - Multiple `useState` and `useEffect` Hooks

3. **SimpleIframePreview** (`/src/components/builder/preview/simple-iframe-preview.tsx`)
   - Uses `useCleanBuildEvents` Hook
   - Multiple state Hooks

4. **useCleanBuildEvents** (`/src/hooks/use-clean-build-events.ts`)
   - Custom Hook with singleton pattern
   - Uses React Query
   - Manages shared state across instances

## Attempted Fixes (All Unsuccessful)

### 1. Conditional Rendering Elimination
**Problem**: Components conditionally rendered based on `showMobileUI`
**Fix Applied**: Always render both mobile/desktop layouts with CSS visibility
**Result**: ❌ Error persists

### 2. Tab Switching Stabilization
**Problem**: Mobile tabs conditionally rendering content
**Fix Applied**: Always render both tabs, use CSS visibility
**Result**: ❌ Error persists

### 3. Hook Dependency Stabilization
**Problem**: Unstable objects in dependency arrays
**Fix Applied**: Used `useMemo` for all options objects
**Result**: ❌ Error persists

### 4. Early Return Elimination
**Problem**: Early returns before Hook calls
**Fix Applied**: Moved all early returns after Hook calls
**Result**: ❌ Error persists

### 5. React Element Duplication Fix
**Problem**: Same element instance rendered in multiple locations
**Fix Applied**: Changed to function creating new instances
**Result**: ❌ Error persists

## Hypothesis of Root Causes

### 1. SSR/Hydration Mismatch
- Server and client rendering different component trees
- Hydration causing component remounts
- Next.js App Router specific behavior

### 2. Async Boundary Issues
- React Suspense boundaries causing remounts
- Data fetching triggering component recreation
- Race conditions in initialization

### 3. Component Tree Restructuring
- Parent components changing structure during initialization
- Dynamic imports causing tree changes
- Layout detection (`useResponsive`) causing restructures

### 4. Singleton Pattern Conflicts
- `useCleanBuildEvents` singleton pattern conflicting with React's expectations
- Shared state management causing Hook order violations
- Multiple instances competing for ownership

## Code Locations to Investigate

### Critical Files
```
/src/components/builder/responsive-workspace-content-simple.tsx (Lines 34-318)
/src/components/builder/builder-chat-interface.tsx (Lines 34-640)
/src/hooks/use-clean-build-events.ts (Lines 1-400+)
/src/components/builder/preview/simple-iframe-preview.tsx (Lines 19-308)
/src/store/build-state-store.ts (Global state management)
```

### Suspicious Patterns
1. **Multiple BuilderChatInterface Renders**:
   - Line 219: Hidden render in waiting state
   - Line 277: Mobile layout render
   - Line 303: Desktop layout render

2. **ResizableSplitter Always Rendered**:
   - Desktop ResizableSplitter component always mounted even when hidden
   - Might be causing layout calculations triggering remounts

3. **Build State Synchronization**:
   - Multiple `useLayoutEffect` and `useEffect` for buildId sync
   - Could be causing render cycles

## Recommended Investigation Steps

### 1. Component Mount Tracking
Add logging to track mount/unmount cycles:
```typescript
useEffect(() => {
  console.log(`Component ${name} mounted`);
  return () => console.log(`Component ${name} unmounted`);
}, []);
```

### 2. Hook Call Order Tracking
Add Hook call tracking to identify order changes:
```typescript
if (typeof window !== 'undefined') {
  window.__hookCallOrder = window.__hookCallOrder || [];
  window.__hookCallOrder.push(`${componentName}-${hookName}`);
}
```

### 3. Conditional Hook Detection
Search for any remaining conditional Hooks:
```bash
grep -r "if.*use[A-Z]" src/components/builder/
grep -r ".*\? use[A-Z]" src/components/builder/
grep -r ".*&& use[A-Z]" src/components/builder/
```

### 4. Parent Component Analysis
Check parent components for conditional rendering:
- `/src/app/[locale]/dashboard/website-builder/[id]/workspace/page.tsx`
- `/src/components/builder/enhanced-workspace-page.tsx`
- `/src/components/builder/workspace/adaptive-workspace-layout.tsx`

## Expert Questions

1. **Is there a React Suspense boundary** above these components that might be causing remounts?

2. **Are there any HOCs (Higher Order Components)** wrapping these components that might conditionally inject props?

3. **Is the `useResponsive()` Hook** stable or does it cause remounts when viewport changes?

4. **Could the ResizableSplitter component** be causing layout thrashing that triggers React to remount?

5. **Is there a race condition** between SSR data and client-side data fetching?

## Temporary Workarounds to Consider

1. **Disable SSR for this page**:
   ```typescript
   export const dynamic = 'force-dynamic'
   export const revalidate = 0
   ```

2. **Wrap in Error Boundary**:
   ```typescript
   <ErrorBoundary fallback={<WorkspaceFallback />}>
     <ResponsiveWorkspaceContentSimple />
   </ErrorBoundary>
   ```

3. **Delay Responsive Detection**:
   ```typescript
   const [isReady, setIsReady] = useState(false);
   useEffect(() => {
     setTimeout(() => setIsReady(true), 0);
   }, []);
   if (!isReady) return <Loading />;
   ```

## Required Information from Expert

1. Full React DevTools Profiler trace during error occurrence
2. Network waterfall showing API calls during initialization
3. React component tree structure from DevTools
4. Any custom React plugins or middleware in use
5. Next.js version and configuration details

## Expert Analysis (Received 2025-08-08)

### Root Cause Identified ✅

The expert correctly identified that the issue is **NOT conditional rendering** but rather:

1. **Conditional Hook paths inside `useCleanBuildEvents`** based on primary/secondary instance status
2. **Multiple concurrent mounts** of BuilderChatInterface competing for "primary" ownership
3. **Different Hook execution paths** for primary vs secondary instances violating React's Rules of Hooks

### Key Findings

The `useCleanBuildEvents` hook violates React's Rules by:
- Line 357: `shouldRunQuery` depends on primary status
- Line 410: Query only enabled for primary instances
- Line 598-599: Different return paths for primary vs secondary
- Lines 255-304: Registration effect with early returns

## Action Plan

### 1. Fix `useCleanBuildEvents` Hook (PRIORITY 1)

**Problem**: Hook has conditional execution paths based on primary/secondary status

**Solution**: Make the hook's call graph invariant
```typescript
// ❌ Current (BAD)
const shouldRunQuery = hookInstance?.isPrimary || false
// Different behavior for primary vs secondary

// ✅ Fixed (GOOD)
// ALWAYS call same hooks, guard INSIDE effects
useEffect(() => {
  if (!isPrimary) return; // Guard inside, not around
  // Primary work here
}, [deps])
```

**Implementation Steps**:
1. Remove all conditional Hook paths
2. Always call `useQuery` with same parameters
3. Move primary/secondary logic inside effect bodies
4. Use `useSyncExternalStore` for shared state

### 2. Single BuilderChatInterface Mount (PRIORITY 2)

**Problem**: Multiple instances mounted simultaneously (lines 219, 277, 303)

**Solution**: Mount exactly ONE instance
```typescript
// ❌ Current (BAD)
{renderChatInterface()} // Line 219 - Hidden
{renderChatInterface()} // Line 277 - Mobile
{renderChatInterface()} // Line 303 - Desktop

// ✅ Fixed (GOOD)
<BuilderChatInterface
  variant={showMobileUI ? 'mobile' : 'desktop'}
  isWaiting={isWaitingForBuild}
  isHidden={activeTab !== 'chat'}
/>
```

### 3. Controller Pattern Implementation (PRIORITY 3)

**Create a module-level controller** (`/src/controllers/build-events-controller.ts`):
```typescript
class BuildEventsController {
  private listeners = new Set<() => void>();
  private snapshot: BuildEventsSnapshot = {};
  private primaryToken: string | null = null;

  // Deterministic API
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  
  // Primary management (internal)
  claimPrimary(token: string) {
    if (!this.primaryToken) this.primaryToken = token;
  }
  isPrimary(token: string) {
    return this.primaryToken === token;
  }
}
```

**Refactor the Hook** to be deterministic:
```typescript
export function useCleanBuildEvents(buildId: string) {
  const controller = useMemo(() => getController(buildId), [buildId]);
  const token = useId();
  
  // ALWAYS call same hooks
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  
  // ALWAYS register (guard inside)
  useEffect(() => {
    controller.claimPrimary(token);
    return () => controller.releasePrimary(token);
  }, [controller, token]);
  
  // ALWAYS setup polling (guard inside)
  useEffect(() => {
    if (!controller.isPrimary(token)) return;
    // Polling logic here
  }, [controller, token]);
  
  return state; // ALWAYS same return
}
```

### 4. Quick Validation Tests

1. **Test 1**: Replace `useCleanBuildEvents` with stub that calls same hooks
2. **Test 2**: Comment out 2 of 3 BuilderChatInterface renders
3. **Test 3**: Wrap page in `dynamic(() => import(...), { ssr: false })`

### 5. Additional Fixes

- **Remove ResizableSplitter** from hidden desktop layout
- **Stabilize `useResponsive()`** to prevent remounts
- **Add `key` prop** to BuilderChatInterface for stability
- **Use `useSyncExternalStore`** for build-state-store

## Expert's Second Analysis (2025-08-08)

### The Immediate Crashing Bug ✅

**Found it!** Mid-hook early return in `useCleanBuildEvents` (lines 598-601):
```typescript
// Secondary instances: Use shared data if available
if (!shouldRunQuery && sharedData) {
  logger.debug(...);
  return sharedData;  // ❌ VIOLATION: Early return breaks hook call invariants
}
```

This causes "Rendered fewer hooks than expected" because:
- First render: No `sharedData` yet → runs hooks below this line
- Later renders: Has `sharedData` → returns early, skipping hooks below
- React detects different hook count = crash

### The Fix (Minimal & Safe)

```typescript
// Don't return early - decide output but keep calling hooks
const outputData = (!shouldRunQuery && sharedData) ? sharedData : returnData

// ... keep all the effects that were below this point exactly as-is ...

// Single return at the end
return outputData
```

## Additional Issues Found

### 1. Multiple Chat Interface Mounts (Amplifies Remounts)

In `responsive-workspace-content-simple.tsx`:
- Line 219: Hidden `<BuilderChatInterface />` during waiting state
- Line 277: Mobile `<BuilderChatInterface />`
- Line 303: Desktop `<BuilderChatInterface />`

**Solution**: Mount ONE instance with variant prop:
```typescript
const variant = showMobileUI ? 'mobile' : 'desktop'
<BuilderChatInterface variant={variant} ... />
```

### 2. Smaller Cleanups

- **Effect deps**: Using `hookInstanceIdRef.current` in deps array won't trigger updates
- **Unused option**: `initialInterval` is defined but never used
- **Registration delay**: Creates extra render cycle (not a bug, just churn)

## What We Agree With ✅

1. **The mid-hook early return is THE bug** - This is absolutely correct
2. **Multiple chat mounts cause problems** - Yes, this amplifies the issue
3. **The minimal fix is safe** - Just removing the early return should work
4. **Effect deps with refs are problematic** - Good catch on reliability

## What We Disagree With / Consider Overkill ❌

### 1. Controller Pattern with `useSyncExternalStore` (From First Analysis)
**Our Take**: Overkill for this use case. The singleton pattern with React Query already works well. Adding `useSyncExternalStore` would be a major refactor with minimal benefit.

### 2. Complete Architectural Refactor
**Our Take**: The expert's minimal fix (remove early return) is sufficient. No need for a complete rewrite when a 3-line change fixes the crash.

### 3. "Possible duplicate singletons" in chat-header.tsx
**Our Take**: This file doesn't exist. The expert may have been confused by the report structure.

### 4. Removing the waiting state hidden mount
**Our Take**: While not ideal, this is a minor optimization. The real issue is the early return.

## Implementation Plan (Updated)

### Priority 1: Fix the Early Return (5 minutes) ✅
```diff
- if (!shouldRunQuery && sharedData) {
-   return sharedData
- }
+ const outputData = (!shouldRunQuery && sharedData) ? sharedData : returnData
// ... all effects stay the same ...
- return returnData
+ return outputData
```

### Priority 2: Single Chat Mount (Optional, 30 minutes)
Only if the early return fix isn't sufficient:
1. Refactor to mount one `BuilderChatInterface`
2. Pass `variant` prop for mobile/desktop
3. Remove hidden waiting state mount

### Priority 3: Clean Up Effect Dependencies (Optional, 10 minutes)
Replace ref-based deps with state-based ones.

## Quick Validation

1. Apply the no-early-return patch
2. Run the app and trigger a build
3. Verify:
   - No "Rendered fewer hooks" crash ✅
   - Ownership transfer logs stop flapping ✅
   - DevTools shows stable renders ✅

## Summary

The expert found the smoking gun: **a mid-hook early return violating React's Rules of Hooks**. The fix is trivial - don't return early, decide the output and return once at the end. Everything else (controller patterns, architectural refactors) is optional optimization.

**Confidence level**: 95% (the early return is clearly the bug)
**Fix complexity**: Trivial (3-line change)
**Time to fix**: 5 minutes

---

*Report updated: 2025-08-08*
*Expert consultation: Completed*
*Status: Implementing minimal fix*