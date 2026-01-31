# Infinite Loop Fix - Build Progress Cleanup

## Problem
"Maximum update depth exceeded" error occurring at line 596 of `builder-chat-interface.tsx`. The cleanup logic for build progress messages was causing an infinite render loop.

## Root Cause
The `useEffect` that handles build events had the following issues:
1. It included `isBuilding` in its dependency array
2. When cleaning up messages with `setMessages(prev => prev.filter())`, it could trigger state changes
3. These state changes could affect `isBuilding`, causing the effect to run again
4. This created an infinite loop of cleanup → state change → effect re-run → cleanup

## Solution
Added a `useRef` to track whether cleanup has already been performed:

```typescript
// Track if cleanup has been performed to prevent infinite loops
const cleanupPerformedRef = useRef(false)

// In the useEffect:
if ((projectBuildStatus === 'deployed' || projectBuildStatus === 'failed') && !cleanupPerformedRef.current) {
  cleanupPerformedRef.current = true
  setMessages(prev => {
    const filtered = prev.filter(m => m.type !== 'clean_build_events')
    // Only update if there's actually something to remove
    if (filtered.length !== prev.length) {
      return filtered
    }
    return prev
  })
}

// Reset cleanup flag when actively building
cleanupPerformedRef.current = false
```

## Key Changes
1. Added `useRef` import to the React imports
2. Created `cleanupPerformedRef` to track cleanup state
3. Only perform cleanup if the ref is `false`
4. Set ref to `true` after cleanup to prevent re-runs
5. Reset ref to `false` when actively building again
6. Added optimization to only update state if messages actually change

## Benefits
- Prevents infinite render loops
- Ensures cleanup only happens once per state transition
- Maintains proper cleanup of build progress messages
- More efficient state updates (only when needed)

## Testing
1. Open a deployed project → No infinite loop
2. Start a new build → Build progress shows correctly
3. Build completes → Progress cleaned up properly
4. No "Maximum update depth exceeded" errors