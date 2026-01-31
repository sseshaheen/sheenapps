# Convert to Build Debugging Guide

## Issue Analysis

The convert-to-build flow is successfully initiating builds but the project `build_status` is not updating in the database, even though logs show successful updates.

## Enhanced Logging Added

### 1. ProjectConfigService
- Query execution logging
- Value logging
- Row count verification
- Post-update verification query

### 2. ChatPlanService.convertToBuild
- Project existence verification before starting
- Current status logging

### 3. BuildInitiationService
- Project verification at start
- Step-by-step status logging
- Post-update verification

## Flow Sequence

1. **convertToBuild called** → Verify project exists
2. **initiateBuild called** → 
   - STEP 1: Update status to 'queued'
   - STEP 2: Track plan conversion (if applicable)
   - STEP 3: Queue the job
   - STEP 4: Update status to 'building'
3. **Worker picks up job** → Updates status to 'building' again

## Debugging Steps

### 1. Check Project ID Format
```sql
-- Verify the project exists
SELECT id, build_status, updated_at 
FROM projects 
WHERE id = '1d712582-cb89-4e13-9d16-88d1c2f7422b';
```

### 2. Monitor Real-time Status
```sql
-- Watch for status changes
SELECT id, build_status, updated_at, last_build_started, last_build_completed
FROM projects 
WHERE id = '1d712582-cb89-4e13-9d16-88d1c2f7422b'
ORDER BY updated_at DESC;
```

### 3. Check for Constraint Violations
```sql
-- Check if there are timing constraint issues
SELECT 
  id, 
  build_status,
  last_build_started,
  last_build_completed,
  CASE 
    WHEN last_build_completed IS NOT NULL 
      AND last_build_started IS NOT NULL 
      AND last_build_completed < last_build_started 
    THEN 'VIOLATION'
    ELSE 'OK'
  END as timing_check
FROM projects 
WHERE id = '1d712582-cb89-4e13-9d16-88d1c2f7422b';
```

## Common Issues

### 1. UUID Format Mismatch
- Ensure project IDs are proper UUIDs
- Check for case sensitivity issues

### 2. Transaction Rollback
- Updates might be rolled back if part of a failed transaction
- Check for any transaction management in the calling code

### 3. Constraint Violations
- `projects_build_timing_logical` constraint requires completion > start time
- Solution: Set `lastBuildCompleted: null` when starting a new build

### 4. Foreign Key Issues
- `projects_current_build_fk` requires build_id to exist in metrics table
- Solution: Create metrics record before updating project

## Testing the Fix

Run the test with enhanced logging:
```bash
npm test -- --grep "convert.*build"
```

Watch the logs for:
1. ✅ Project verified messages
2. 🔄 Status update attempts
3. ✅ Verification of status changes
4. ❌ Any mismatch or error messages

## Expected Log Output

Success case:
```
[ChatPlanService] 🚀 convertToBuild called with: {...}
[ChatPlanService] ✓ Project found, current status: deployed
[BuildInitiation] 🎯 Starting build initiation: {...}
[BuildInitiation] ✓ Project verified, current status: deployed
[BuildInitiation] 🔄 STEP 1: Updating project status to queued...
[ProjectConfig] Executing query: UPDATE projects SET build_status = $1, ...
[ProjectConfig] ✅ Successfully updated project ... - 1 rows affected
[ProjectConfig] ✓ Verified build_status is now: queued
[BuildInitiation] ✅ STEP 1 Complete: Status should now be queued
[BuildInitiation] 🔄 STEP 4: Updating project status to building...
[ProjectConfig] ✓ Verified build_status is now: building
[BuildInitiation] ✅ STEP 4 Complete: Status should now be building
```

Failure indicators:
- `❌ Project ... NOT FOUND in database!`
- `⚠️ Project ... not found - NO ROWS UPDATED`
- `❌ MISMATCH: Expected status ... but got ...`
- `❌ VERIFICATION FAILED: Project ... not found!`