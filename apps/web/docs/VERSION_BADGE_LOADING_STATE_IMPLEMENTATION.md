# Version Badge Loading State Implementation

## Summary
Implemented automatic version badge loading state during metadata processing after deployment. The badge now shows a spinner while waiting for the version name to be generated, then automatically refreshes when the `BUILD_RECOMMENDATIONS_GENERATED` event arrives.

## Key Changes

### 1. Version Status Badge (`src/components/builder/version-status-badge.tsx`)
- **Added build event monitoring**: Badge now uses `useCleanBuildEvents` hook to monitor build status
- **Automatic loading state**: Shows spinner when deploy is complete but recommendations haven't been generated yet
- **Auto-refresh on completion**: Invalidates React Query caches when recommendations are generated to fetch fresh version info
- **Global build state integration**: Gets current buildId from `useBuildStateStore` to track active build

### 2. Build Events Hook (`src/hooks/use-clean-build-events.ts`)
- **Separated completion states**: 
  - `hasDeployCompleted`: true when deploy phase is done (preview URL available)
  - `hasRecommendationsGenerated`: true when metadata event with `BUILD_RECOMMENDATIONS_GENERATED` arrives
  - `isComplete`: true only when recommendations are generated OR build fails
- **Continuous polling**: Polling continues after deploy until recommendations event arrives

### 3. Implementation Details

#### Loading State Logic
```typescript
const isWaitingForVersion = !!(
  currentBuildId && 
  hasDeployCompleted && 
  !hasRecommendationsGenerated && 
  !isComplete
)
```

#### Auto-refresh Trigger
```typescript
useEffect(() => {
  if (hasRecommendationsGenerated && currentBuildId) {
    // Invalidate version queries to fetch fresh data
    queryClient.invalidateQueries({ queryKey: ['version-history', projectId] })
    queryClient.invalidateQueries({ queryKey: ['project-status', projectId] })
  }
}, [hasRecommendationsGenerated, currentBuildId, projectId, queryClient])
```

## User Experience Flow

1. **Build starts**: Version badge shows current version
2. **Deploy completes**: Version badge shows spinner with "Processing..." text
3. **Metadata processing**: Spinner continues while version name is being generated
4. **Recommendations generated**: 
   - Event `BUILD_RECOMMENDATIONS_GENERATED` arrives
   - Version queries are invalidated
   - Fresh version info is fetched
   - Badge updates to show new version name (e.g., "v1.2.3")

## Benefits

- **No manual refresh needed**: Version info updates automatically
- **Clear loading feedback**: Users know when version is being processed
- **Proper state management**: Uses global build state to avoid duplicate polling
- **Resilient to timing**: Works whether recommendations come before or after deploy

## Debugging

The implementation includes comprehensive logging:
- Version badge state changes logged with 🏷️ emoji
- Recommendations trigger logged with 📦 emoji
- All logs use 'version-badge' context for filtering

## Testing Checklist

- [ ] Start a new build and verify version badge shows current version
- [ ] When deploy completes, verify spinner appears
- [ ] When recommendations are generated, verify version updates
- [ ] Check console logs for proper state transitions
- [ ] Verify no duplicate polling or unnecessary API calls