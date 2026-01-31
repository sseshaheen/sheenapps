# Chat Disabled State Fix

## Problem
When opening a project workspace with a completed build (buildStatus = 'deployed'), the chat was incorrectly disabled showing "Build in progress..." spinner.

## Root Cause
The chat disable logic was:
```typescript
disabled={buildId != null && !hasDeployCompleted}
```

When opening an existing workspace:
- `buildId` might be null (no active build)
- When `buildId` is null, `useCleanBuildEvents` returns default values with `hasDeployCompleted = false`
- This caused the condition to incorrectly evaluate as disabled

## Solution
Changed the disable logic to:
```typescript
disabled={isBuilding && !hasDeployCompleted}
```

Now the chat is only disabled when:
1. `isBuilding` is true (actively polling/loading build events)
2. AND deploy hasn't completed yet

## Benefits
- Chat is correctly enabled when opening a workspace with a completed build
- Chat is still properly disabled during active builds until deploy completes
- No false positives when `buildId` is null (no active build)

## Related Components
- `src/components/builder/builder-chat-interface.tsx` - Main chat interface
- `src/components/builder/chat/chat-input.tsx` - Shows spinner when disabled
- `src/hooks/use-clean-build-events.ts` - Returns build status including `isBuilding` flag