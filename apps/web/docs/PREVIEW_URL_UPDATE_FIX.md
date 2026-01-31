# Preview URL Update Fix

## Problem
When a new build completed with a new preview URL (e.g., `https://f3499886.sheenapps-preview.pages.dev`), the live preview iframe was not updating to show the new URL.

## Root Cause
The `SimpleIframePreview` component was checking `projectBuildStatus` to determine whether to poll for build events. When a new build started:
1. The `projectBuildStatus` was still 'deployed' (from the previous state)
2. This made `isCompletedBuild = true`
3. So it passed `null` to `useCleanBuildEvents` instead of the buildId
4. Without polling, it never received the new preview URL from build events

## Solution
Changed the logic to poll for events whenever there's a buildId, regardless of `projectBuildStatus`:

```typescript
// BEFORE: Based on stale projectBuildStatus
const isCompletedBuild = projectBuildStatus === 'deployed' || projectBuildStatus === 'failed';
const buildData = useCleanBuildEvents(
  isCompletedBuild ? null : (buildId || null),
  userId,
  cleanEventsOptions
);

// AFTER: Based on presence of buildId
const shouldPollForEvents = !!buildId;
const buildData = useCleanBuildEvents(
  shouldPollForEvents ? buildId : null,
  userId,
  cleanEventsOptions
);
```

## Key Insight
The `projectBuildStatus` can be stale when a new build starts. It might still show 'deployed' from the previous build while a new build is already in progress. Using the presence of a buildId is a more reliable indicator that we should be polling for build events.

## Benefits
- Preview URL updates immediately when build completes
- No reliance on potentially stale status values
- Simpler logic: if there's a buildId, poll for its events
- Works correctly for both new builds and resumed builds

## Testing
1. Start with a deployed project → Preview shows correctly
2. Start a new build → Preview shows "Building..." 
3. Build completes with new URL → Preview updates automatically
4. The new preview URL from events is displayed immediately