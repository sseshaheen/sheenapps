# Deployed Project Loading Fix

## Problem
When opening a project workspace with a deployed build:
1. Build progress showed "Processing" in the chat
2. Version badge showed "Processing..." spinner
3. Chat was disabled with "Build in progress..." message

All of these issues occurred even though the project's `buildStatus` was 'deployed'.

## Root Causes

### 1. Global Build State Initialization
In `responsive-workspace-content-simple.tsx`, the code was setting ANY project buildId as the current active buildId:
```typescript
// BEFORE - Set buildId for all projects
if (project?.buildId && !currentBuildId) {
  setGlobalBuildId(project.buildId, projectId, 'project-initial-load')
}
```

This caused completed builds to be treated as active, triggering polling.

### 2. Build Progress Message Creation
In `builder-chat-interface.tsx`, the build progress message was created whenever there was a buildId, regardless of build status:
```typescript
// BEFORE - Show progress for any buildId
if (!buildId || !userId || cleanEvents.length === 0) return
```

## Solutions

### 1. Only Set Active BuildIds
```typescript
// AFTER - Only set buildId for actively building projects
const isActivelyBuilding = project?.status === 'building' || project?.status === 'queued'

if (project?.buildId && !currentBuildId && isActivelyBuilding) {
  setGlobalBuildId(project.buildId, projectId, 'project-initial-load')
}
```

### 2. Only Show Progress for Active Builds
```typescript
// AFTER - Only show progress for active builds
const isActivelyBuilding = buildId && !isCompleted && (isBuilding || cleanEvents.length > 0)

if (!buildId || !userId || !isActivelyBuilding) return
```

### 3. Fix Chat Disable Logic
```typescript
// Changed from: disabled={buildId != null && !hasDeployCompleted}
// To: disabled={isBuilding && !hasDeployCompleted}
```

## Impact
- Deployed projects no longer trigger build event polling
- Version badge shows actual version instead of "Processing..."
- Chat is enabled for completed projects
- Build progress only shows for actively building projects

## Key Learnings
1. **Distinguish active vs historical builds**: Not all buildIds represent active builds
2. **Check build status before polling**: Avoid unnecessary API calls for completed builds
3. **Use loading states appropriately**: Only show loading indicators during actual loading