# Advisor Workspace Provisioning - Deployment Guide

## 🚀 Full Rollout (100%) - Production Deployment

**Feature:** Automatic workspace access provisioning when advisor matches are finalized.

**Status:** All expert reviews completed, production-ready.

---

## Pre-Deployment Checklist

### 1. Verify Files Are in Place

```bash
# Check migration exists
ls -la migrations/096_workspace_provisioning_system.sql

# Check service exists
ls -la src/services/advisorWorkspaceService.ts

# Check worker exists
ls -la src/workers/workspaceProvisioningWorker.ts

# Verify ChatBroadcastService has publishAdvisorEvent
grep -n "publishAdvisorEvent" src/services/chatBroadcastService.ts

# Verify server.ts has worker integration
grep -n "workspaceProvisioningWorker" src/server.ts
```

Expected output: All files exist with no errors.

### 2. Review Migration SQL

```bash
# Review the migration (should show ~245 lines)
wc -l migrations/096_workspace_provisioning_system.sql

# Check for expert fixes
grep -n "EXPERT" migrations/096_workspace_provisioning_system.sql
```

Should show expert fixes for:
- NULL-safe constraint (IS DISTINCT FROM)
- Optimized indexes (pending_ready, rollback)
- State invariants (attempts, locks)
- RLS disabled
- ANALYZE statements

---

## Deployment Steps

### Step 1: Run Database Migration

```bash
# Run migration
npm run migrate:up

# Or manually with psql:
psql $DATABASE_URL -f migrations/096_workspace_provisioning_system.sql
```

**Expected output:**
```
BEGIN
ALTER TABLE
ALTER TABLE
CREATE TABLE
ALTER TABLE
ALTER TABLE
CREATE FUNCTION
CREATE TRIGGER
[... more output ...]
ANALYZE
COMMIT
```

### Step 2: Verify Migration Success

```bash
# Check tables created
psql $DATABASE_URL -c "\d workspace_provisioning_queue"

# Check user_id is now nullable
psql $DATABASE_URL -c "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'project_chat_log_minimal' AND column_name = 'user_id';"

# Check triggers created
psql $DATABASE_URL -c "SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_match_prev_status', 'trg_queue_updated_at', 'trg_project_advisors_updated_at');"

# Check indexes created
psql $DATABASE_URL -c "SELECT indexname FROM pg_indexes WHERE tablename = 'workspace_provisioning_queue';"

# Test project_bucket function
psql $DATABASE_URL -c "SELECT project_bucket(gen_random_uuid()) as bucket FROM generate_series(1, 10);"
```

**Expected results:**
- `user_id` shows `is_nullable = YES`
- 3 triggers exist
- 6 indexes exist on queue table
- project_bucket returns values 0-9

### Step 3: Enable Feature Flag

Add to environment variables (`.env` or deployment config):

```bash
# Enable automatic workspace provisioning
ADVISOR_AUTO_PROVISION=true
```

**Alternative values that work:**
- `ADVISOR_AUTO_PROVISION=1`
- `ADVISOR_AUTO_PROVISION=TRUE`

### Step 4: Restart Server

```bash
# Development
npm run dev

# Production (depends on deployment method)
pm2 restart sheenapps-api
# or
systemctl restart sheenapps
# or
kubectl rollout restart deployment/sheenapps-api
```

**Expected log output:**
```
[WorkspaceProvisioningWorker] Starting with ID: worker-12345-a1b2c3d4
✅ Workspace provisioning worker started
```

### Step 5: Monitor Initial Operation

```bash
# Check worker is running
tail -f logs/server.log | grep WorkspaceProvisioningWorker

# Monitor queue table
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM workspace_provisioning_queue GROUP BY status;"
```

**Healthy state:**
- Worker logs show startup message
- Queue is empty or has only `completed` rows
- No errors in logs

---

## Monitoring Queries

### Queue Health Check

```sql
-- Overall queue status
SELECT
  status,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM workspace_provisioning_queue
GROUP BY status
ORDER BY count DESC;
```

### Success Rate (Last 24 Hours)

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / COUNT(*) as success_rate_pct,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
  COUNT(*) FILTER (WHERE status = 'processing') as processing_count,
  COUNT(*) as total
FROM workspace_provisioning_queue
WHERE created_at >= now() - interval '24 hours';
```

**Target metrics:**
- Success rate: > 99%
- Failed count: < 1% of total
- Processing: Should be 0-10 (transient state)
- Pending: Should be 0 (or only jobs within 30s)

### Provisioning Performance

```sql
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - created_at))), 2) as avg_seconds,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (completed_at - created_at))
  ), 2) as p95_seconds
FROM workspace_provisioning_queue
WHERE status = 'completed'
  AND created_at >= now() - interval '24 hours';
```

**Target performance:**
- Average: < 2 seconds
- P95: < 5 seconds

### Recent Errors

```sql
SELECT
  id,
  match_id,
  project_id,
  advisor_id,
  attempt_count,
  last_error,
  last_error_at,
  status
FROM workspace_provisioning_queue
WHERE status IN ('failed', 'rollback_needed')
  AND created_at >= now() - interval '24 hours'
ORDER BY last_error_at DESC
LIMIT 10;
```

### Reaper Activity (Stale Locks)

```sql
-- Should be empty (no stuck processing jobs)
SELECT
  id,
  match_id,
  locked_by,
  locked_at,
  now() - locked_at as stuck_duration
FROM workspace_provisioning_queue
WHERE status = 'processing'
  AND locked_at < now() - interval '2 minutes'
ORDER BY locked_at;
```

---

## Testing the Feature

### Test 1: Manual Trigger (Optional)

If you want to test manually before waiting for real matches:

```sql
-- Create a test queue item (replace UUIDs with actual values from your DB)
INSERT INTO workspace_provisioning_queue (
  match_id, project_id, advisor_id, requested_by,
  status, attempt_count, next_retry_at
) VALUES (
  'YOUR-MATCH-UUID',
  'YOUR-PROJECT-UUID',
  'YOUR-ADVISOR-UUID',
  'YOUR-CLIENT-UUID',
  'pending', 0, now()
);

-- Worker will pick this up within 30 seconds
-- Watch logs: tail -f logs/server.log | grep "Workspace provisioning"
```

### Test 2: Monitor Real Match

When a real advisor match reaches `finalized` status:

```sql
-- Find recent finalized matches
SELECT
  id as match_id,
  project_id,
  matched_advisor_id,
  status,
  finalized_at
FROM advisor_match_requests
WHERE status = 'finalized'
  AND finalized_at >= now() - interval '1 hour'
ORDER BY finalized_at DESC
LIMIT 5;

-- Check if workspace was provisioned
SELECT
  q.id,
  q.match_id,
  q.status,
  q.attempt_count,
  q.created_at,
  q.completed_at,
  EXTRACT(EPOCH FROM (q.completed_at - q.created_at)) as duration_seconds
FROM workspace_provisioning_queue q
WHERE q.match_id = 'YOUR-MATCH-ID-FROM-ABOVE';

-- Check if advisor was added to project
SELECT *
FROM project_advisors
WHERE project_id = 'YOUR-PROJECT-ID'
  AND advisor_id = 'YOUR-ADVISOR-ID';

-- Check if chat session was created
SELECT *
FROM unified_chat_sessions
WHERE project_id = 'YOUR-PROJECT-ID'
  AND user_id = 'YOUR-ADVISOR-ID';

-- Check for system message
SELECT *
FROM project_chat_log_minimal
WHERE project_id = 'YOUR-PROJECT-ID'
  AND message_type = 'system'
  AND user_id IS NULL
  AND message_text LIKE '%Advisor has joined%'
ORDER BY created_at DESC
LIMIT 1;
```

---

## Troubleshooting

### Issue: Worker Not Starting

**Symptoms:** No worker logs, `WorkspaceProvisioningWorker` not found in logs

**Solutions:**
1. Check server.ts has worker import:
   ```bash
   grep "workspaceProvisioningWorker" src/server.ts
   ```
2. Rebuild TypeScript:
   ```bash
   npm run build
   ```
3. Restart server

### Issue: Jobs Stuck in Pending

**Symptoms:** Queue has many `pending` items older than 1 minute

**Diagnosis:**
```sql
SELECT id, match_id, attempt_count, last_error, next_retry_at
FROM workspace_provisioning_queue
WHERE status = 'pending'
  AND created_at < now() - interval '1 minute'
ORDER BY created_at;
```

**Solutions:**
1. Check feature flag is enabled: `echo $ADVISOR_AUTO_PROVISION`
2. Check worker is running: `grep WorkspaceProvisioningWorker logs/server.log`
3. Check for errors: `tail -100 logs/server.log | grep "error"`
4. Manual retry (if needed):
   ```sql
   UPDATE workspace_provisioning_queue
   SET status = 'pending', next_retry_at = now()
   WHERE status = 'processing' AND locked_at < now() - interval '5 minutes';
   ```

### Issue: High Failure Rate

**Symptoms:** Many `failed` or `rollback_needed` items

**Diagnosis:**
```sql
SELECT last_error, COUNT(*)
FROM workspace_provisioning_queue
WHERE status IN ('failed', 'rollback_needed')
GROUP BY last_error
ORDER BY COUNT(*) DESC;
```

**Common errors and solutions:**

| Error | Cause | Solution |
|-------|-------|----------|
| `relation users does not exist` | Wrong schema | Fixed in code (uses `auth.users`) |
| `null value in column "user_id"` | Old constraint | Migration fixes this |
| `foreign_key_violation` | Advisor deleted | Expected - rollback happens automatically |
| `serialization_failure` | Concurrent updates | Expected - retry happens automatically |

### Issue: System Messages Not Appearing

**Symptoms:** Workspace provisioned but no welcome message in chat

**Diagnosis:**
```sql
SELECT
  project_id,
  user_id,
  message_type,
  message_text,
  created_at
FROM project_chat_log_minimal
WHERE project_id = 'YOUR-PROJECT-ID'
  AND message_type = 'system'
ORDER BY created_at DESC
LIMIT 5;
```

**Solutions:**
1. Check user_id is nullable:
   ```sql
   SELECT column_name, is_nullable FROM information_schema.columns
   WHERE table_name = 'project_chat_log_minimal' AND column_name = 'user_id';
   ```
2. Check constraint exists:
   ```sql
   SELECT conname, contype FROM pg_constraint
   WHERE conname = 'chk_system_user_id';
   ```
3. If constraint missing, re-run migration

---

## Rollback Plan (If Needed)

### Emergency Disable

```bash
# Option 1: Disable feature flag
export ADVISOR_AUTO_PROVISION=false

# Option 2: Stop worker only (keep code)
# Edit server.ts and comment out:
# startWorkspaceProvisioningWorker();

# Restart server
pm2 restart sheenapps-api
```

### Full Rollback (Undo Migration)

```sql
BEGIN;

-- Drop queue table
DROP TABLE IF EXISTS workspace_provisioning_queue CASCADE;

-- Drop helper function
DROP FUNCTION IF EXISTS project_bucket(uuid);

-- Drop triggers
DROP TRIGGER IF EXISTS trg_match_prev_status ON advisor_match_requests;
DROP TRIGGER IF EXISTS trg_queue_updated_at ON workspace_provisioning_queue;
DROP TRIGGER IF EXISTS trg_project_advisors_updated_at ON project_advisors;

-- Drop functions
DROP FUNCTION IF EXISTS capture_prev_status();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Remove previous_status column
ALTER TABLE advisor_match_requests DROP COLUMN IF EXISTS previous_status;

-- Remove updated_at column (if it was added)
-- ALTER TABLE project_advisors DROP COLUMN IF EXISTS updated_at;

-- Revert user_id constraint
ALTER TABLE project_chat_log_minimal DROP CONSTRAINT IF EXISTS chk_system_user_id;
ALTER TABLE project_chat_log_minimal ALTER COLUMN user_id SET NOT NULL;

COMMIT;
```

**Note:** Only rollback if critical issues found. Disabling feature flag is safer first step.

---

## Success Criteria

After 24 hours of operation:

- ✅ Success rate > 99%
- ✅ Average provisioning time < 2 seconds
- ✅ No stuck processing jobs (reaper working)
- ✅ Rollback rate < 0.1%
- ✅ No user-reported issues
- ✅ SSE events broadcasting correctly
- ✅ System messages appearing in chat

---

## Support Contacts

**For issues:**
1. Check troubleshooting section above
2. Review logs: `tail -100 logs/server.log | grep -i "workspace\|advisor"`
3. Check queue metrics with monitoring queries
4. Review expert feedback in `ADVISOR_WORKSPACE_PROVISIONING_PLAN.md`

**Documentation:**
- Implementation plan: `docs/ADVISOR_WORKSPACE_PROVISIONING_PLAN.md`
- Expert feedback analysis: `docs/EXPERT_FEEDBACK_ROUND2_ANALYSIS.md`
- Migration file: `migrations/096_workspace_provisioning_system.sql`