# Project Creation Race Condition Fix

## Issue Summary

During testing on August 5, 2025, we encountered a critical race condition in project creation that causes database constraint violations:

```
📝 ERROR: Failed to create project {
  code: '23505',
  details: null,
  hint: null,
  message: 'duplicate key value violates unique constraint "projects_pkey"'
}
```

## Root Cause Analysis

### The Problem

1. **Architectural Boundary Violation**: Both the Worker service and NextJS application were attempting to create the same project simultaneously
2. **Non-Idempotent Database Function**: The `create_project_for_build` stored procedure was not designed to handle concurrent creation attempts
3. **Race Condition Timing**: 
   - Worker calls `createCompleteProject()` → succeeds
   - NextJS simultaneously calls `POST /api/projects` → fails with constraint violation
   - Stream Worker recovery logic gets confused by missing version records

### Evidence from Logs

```log
[Create Preview] Created project atomically (req_1754388361085_aumq3f7k5): {
  projectId: 'f8ecf996-4ae8-489b-a683-1ce813a8ec6d',
  versionId: 'H7X3VW1K10NDCVSHDKX85M1AMZ',
  buildId: 'H7X3VW1K10084EK6NG16GBXS86',
}

// Later...
🚨 [NextJS API Route] EXIT POINT - POST /api/projects: {
  method: 'POST',
  status: 500,
  timestamp: '2025-08-05T10:06:04.048Z',
  success: false
}
```

## Solution Implementation

### Migration 006: Make Project Creation Idempotent

**File**: `migrations/006_fix_project_creation_race_condition.sql`

**Key Changes**:

1. **Race Condition Detection**:
   ```sql
   SELECT id INTO existing_project_id
   FROM projects 
   WHERE owner_id = p_user_id 
     AND name = p_name
     AND framework = p_framework
     AND created_at > NOW() - INTERVAL '10 seconds'  -- Recent creation indicates race condition
   ```

2. **Idempotent Insert**:
   ```sql
   INSERT INTO projects (...)
   VALUES (...)
   ON CONFLICT (id) DO NOTHING;
   ```

3. **Advisory Lock Enhancement**:
   ```sql
   PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || coalesce(p_prompt, 'default')));
   ```

4. **Graceful Recovery**: If race condition detected, return existing project info instead of failing

## Architecture Impact

This fix addresses a critical issue identified in the **Worker Pre-Ship Gaps Analysis**:

> **Responsibility Boundary Violations** 🔴 **LAUNCH BLOCKER**
> - **Issue**: Worker handling user billing, payment logic, and business preferences
> - **Impact**: Tight coupling prevents independent scaling, violates microservice principles
> - **Required**: Move billing and user management to NextJS application

### Short-term Fix (This Migration)
- Makes the database layer resilient to race conditions
- Prevents constraint violations from breaking the user experience
- Allows both services to attempt project creation safely

### Long-term Solution Required
- **Move project creation logic to NextJS**: Only NextJS should create projects
- **Worker becomes execution-only**: Worker receives pre-created project IDs
- **Clear API boundaries**: Eliminate overlap between service responsibilities

## Testing Validation

After applying this migration:

1. **Idempotency Test**: Multiple concurrent calls to `create_project_for_build` should not fail
2. **Race Condition Handling**: When both Worker and NextJS attempt creation, one should succeed gracefully
3. **Data Consistency**: All related records (projects, versions, metrics) should remain consistent

## Monitoring

Watch for these metrics post-deployment:
- **Reduced 500 errors** on project creation endpoints
- **Elimination of constraint violation logs**
- **Consistent project creation success rates**

## Related Documentation

- **Worker Pre-Ship Gaps Analysis**: `docs/WORKER_PRE_SHIP_GAPS_AND_VALIDATION_PLAN.md`
- **Project ID Generation Plan**: `docs/project-id-generation-hardening-plan.md`
- **Architectural Boundaries Analysis**: Section in Pre-Ship Gaps document

---

**Status**: ✅ **IMPLEMENTED**  
**Migration Applied**: August 5, 2025  
**Next Step**: Plan architectural separation to eliminate root cause