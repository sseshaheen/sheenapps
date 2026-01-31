# Build Status Fix: Two-Phase Update Solution

## Problem Summary

Project build status updates are failing due to database constraint violations, leaving projects stuck in 'queued' status instead of progressing to 'building'.

### Constraint Violations:
1. **`projects_build_timing_logical`**: Old completion time conflicts with new start time
2. **`projects_current_build_fk`**: Build ID referenced before metrics record creation

## Solution: Two-Phase Update Approach

### Phase 1: Clear Previous Build State (Safe Update)
When a build starts, immediately update project to clear previous build completion:
```typescript
await updateProjectConfig(projectId, {
  status: 'building',
  lastBuildStarted: new Date(),
  lastBuildCompleted: null,  // ✅ Clear old completion time
  // DON'T set buildId yet - will cause FK violation
});
```

### Phase 2: Set Build ID After Metrics Creation
After `project_build_metrics` record is created, update with build ID:
```typescript
await updateProjectConfig(projectId, {
  buildId: buildId,  // ✅ Now safe - metrics record exists
});
```

## Implementation Changes

### 1. StreamWorker Update (`src/workers/streamWorker.ts`)
```typescript
// PHASE 1: Clear previous state (lines 143-149)
await updateProjectConfig(projectId, {
  status: 'building',
  framework: framework || undefined,
  lastBuildStarted: new Date(),
  lastBuildCompleted: null,  // Critical: clear old completion time
});

// Start metrics recording...
await metricsService.recordBuildStart(metrics);

// PHASE 2: Set build ID after metrics exist
await updateProjectConfig(projectId, {
  buildId: buildId,  // Now safe - metrics record created
});
```

### 2. Enhanced Error Handling
Add retry logic for constraint violations:
```typescript
async function safeProjectConfigUpdate(projectId: string, config: Partial<ProjectConfig>, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await updateProjectConfig(projectId, config);
      return;
    } catch (error) {
      if (isConstraintViolation(error) && attempt < retries) {
        console.log(`[ProjectConfig] Constraint violation, retrying ${attempt}/${retries}`);
        await delay(100 * attempt); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}
```

### 3. Project Config Service Enhancement
Add constraint violation detection:
```typescript
function isConstraintViolation(error: any): boolean {
  return error.code === '23514' || // Check constraint violation
         error.code === '23503';   // Foreign key violation
}
```

## Migration Requirements

### Option A: No Migration (Recommended)
- Fix is purely application logic
- No schema changes needed
- Backward compatible

### Option B: Enhanced Constraints (Future)
```sql
-- Make constraint more flexible for build transitions
ALTER TABLE projects DROP CONSTRAINT projects_build_timing_logical;
ALTER TABLE projects ADD CONSTRAINT projects_build_timing_logical 
  CHECK (
    (last_build_completed IS NULL) OR 
    (last_build_started IS NULL) OR 
    (last_build_completed >= last_build_started) OR
    (build_status IN ('queued', 'building'))  -- Allow during active builds
  );
```

## Testing Strategy

### 1. Unit Tests
- Test two-phase update sequence
- Test constraint violation handling
- Test retry mechanism

### 2. Integration Tests
```bash
# Test concurrent project updates
for i in {1..5}; do
  curl -X POST /v1/update-project \
    -H "x-sheen-signature: $SIG" \
    -d '{"projectId":"test","prompt":"update test"}' &
done
wait
```

### 3. Database Constraint Verification
```sql
-- Verify timing constraints are respected
SELECT project_id, last_build_started, last_build_completed,
       CASE 
         WHEN last_build_completed IS NULL THEN 'OK'
         WHEN last_build_started IS NULL THEN 'OK'  
         WHEN last_build_completed >= last_build_started THEN 'OK'
         ELSE 'VIOLATION'
       END as timing_check
FROM projects 
WHERE timing_check = 'VIOLATION';
```

## Rollback Plan

If the fix causes issues:
1. Revert StreamWorker changes
2. Add temporary constraint bypass:
```sql
ALTER TABLE projects DISABLE TRIGGER ALL;
-- Fix data inconsistencies
ALTER TABLE projects ENABLE TRIGGER ALL;
```

## Success Metrics

- ✅ Project status changes from 'queued' to 'building' successfully
- ✅ No constraint violation errors in logs
- ✅ Build timing data remains consistent
- ✅ No race conditions in concurrent updates

## Implementation Priority

1. **High**: Two-phase update in StreamWorker
2. **Medium**: Enhanced error handling and retries  
3. **Low**: Constraint improvements (future enhancement)

---

**Status**: Design Complete  
**Next**: Implementation  
**Risk Level**: Low (application-only changes)