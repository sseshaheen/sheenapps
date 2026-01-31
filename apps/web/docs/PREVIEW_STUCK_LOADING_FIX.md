# Preview Stuck Loading Fix

## Problem
When opening a project workspace with a deployed build, the live preview was stuck showing "Loading your new version..." indefinitely.

## Root Cause
The `SimpleIframePreview` component was:
1. Receiving a buildId from a completed/deployed project
2. Passing that buildId to `useCleanBuildEvents` hook
3. The hook would try to poll for events but wouldn't receive any (build already complete)
4. This left the preview in a perpetual "checking" state

## Solution
Modified `SimpleIframePreview` to detect completed builds and handle them differently:

### 1. Detect Completed Builds
```typescript
const isCompletedBuild = projectBuildStatus === 'deployed' || projectBuildStatus === 'failed';
```

### 2. Skip Polling for Completed Builds
```typescript
const buildData = useCleanBuildEvents(
  isCompletedBuild ? null : (buildId || null), // Don't poll for completed builds
  userId,
  cleanEventsOptions
);
```

### 3. Go Straight to Ready State
```typescript
if (isCompletedBuild && projectPreviewUrl) {
  // For completed builds with a preview URL, go straight to ready
  setPreviewStatus('ready');
  setError(null);
  setIsLoading(false);
}
```

### 4. Pass Build Status to Preview
Updated `WorkspacePreview` to pass the project's build status to `SimpleIframePreview`:
```typescript
<SimpleIframePreview 
  projectId={projectId} 
  buildId={buildId}
  projectPreviewUrl={previewUrl}
  projectBuildStatus={buildStatus}
  className="h-full" 
/>
```

## Benefits
- Preview loads immediately for deployed projects
- No unnecessary API polling for completed builds
- Better performance and user experience
- Clear distinction between active and completed builds

## Testing
1. Open a workspace with a deployed project → Preview should load immediately
2. Open a workspace with an actively building project → Preview should show build progress
3. Start a new build → Preview should show "Building..." and update as build progresses