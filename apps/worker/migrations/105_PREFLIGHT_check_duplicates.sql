-- Migration 105 PREFLIGHT CHECK: Find duplicate assistant replies
-- Purpose: Verify no duplicate assistant replies exist before creating unique index
-- Context: CREATE UNIQUE INDEX CONCURRENTLY will FAIL if duplicates exist
-- Date: 2026-01-13 (Expert Round 12)
--
-- ⚠️ CRITICAL: Run this BEFORE applying migration 105 or 105_PRODUCTION
--
-- Why this matters:
--   CREATE UNIQUE INDEX CONCURRENTLY builds the index in the background (no write lock),
--   but if duplicates exist, it will:
--   1. Build the index (takes time on large table)
--   2. Fail at the end with "could not create unique index"
--   3. Leave you WITHOUT the constraint (wasted time + still vulnerable to duplicates)
--
-- How to use:
--   1. Run this query in production
--   2. If it returns rows: clean up duplicates FIRST (see cleanup strategy below)
--   3. Re-run this query to verify 0 results
--   4. THEN apply migration 105 (or 105_PRODUCTION if using CONCURRENTLY)
--
-- ⸻

-- Find all assistant replies that have duplicates (same project + parent message)
SELECT
  project_id,
  parent_message_id,
  COUNT(*) AS duplicate_count,
  -- Show the IDs of the duplicates for cleanup
  ARRAY_AGG(id ORDER BY created_at DESC) AS message_ids,
  -- Show when they were created (helps understand the race condition)
  ARRAY_AGG(created_at ORDER BY created_at DESC) AS created_timestamps
FROM project_chat_log_minimal
WHERE actor_type = 'assistant'
  AND parent_message_id IS NOT NULL
GROUP BY project_id, parent_message_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, project_id;

-- ⸻
--
-- CLEANUP STRATEGY (if duplicates found):
--
-- Option A: Keep newest, delete older (recommended)
-- ⚠️ BACKUP FIRST! Run SELECT version to review before DELETE
--
-- Step 1: Review what will be deleted
-- SELECT id, seq, created_at, message_text
-- FROM project_chat_log_minimal
-- WHERE (project_id, parent_message_id) IN (
--   SELECT project_id, parent_message_id
--   FROM project_chat_log_minimal
--   WHERE actor_type = 'assistant' AND parent_message_id IS NOT NULL
--   GROUP BY project_id, parent_message_id
--   HAVING COUNT(*) > 1
-- )
-- AND actor_type = 'assistant'
-- ORDER BY project_id, parent_message_id, created_at DESC;
--
-- Step 2: Delete older duplicates (keep newest by created_at)
-- WITH duplicates AS (
--   SELECT id,
--          ROW_NUMBER() OVER (
--            PARTITION BY project_id, parent_message_id
--            ORDER BY created_at DESC
--          ) AS rn
--   FROM project_chat_log_minimal
--   WHERE actor_type = 'assistant' AND parent_message_id IS NOT NULL
-- )
-- DELETE FROM project_chat_log_minimal
-- WHERE id IN (
--   SELECT id FROM duplicates WHERE rn > 1
-- );
--
-- Option B: Soft delete (set is_deleted = true)
-- WITH duplicates AS (
--   SELECT id,
--          ROW_NUMBER() OVER (
--            PARTITION BY project_id, parent_message_id
--            ORDER BY created_at DESC
--          ) AS rn
--   FROM project_chat_log_minimal
--   WHERE actor_type = 'assistant' AND parent_message_id IS NOT NULL
-- )
-- UPDATE project_chat_log_minimal
-- SET is_deleted = true, updated_at = NOW()
-- WHERE id IN (
--   SELECT id FROM duplicates WHERE rn > 1
-- );
--
-- Option C: Manual review (if very few duplicates)
-- DELETE FROM project_chat_log_minimal
-- WHERE id IN ('uuid-of-duplicate-1', 'uuid-of-duplicate-2', ...);
--
-- ⸻
--
-- After cleanup:
--   1. Re-run the preflight check above to verify 0 results
--   2. Apply migration 105 (dev) or 105_PRODUCTION (prod with CONCURRENTLY)
--   3. Future duplicates will be prevented by the unique constraint
--   4. ChatWorker already handles 23505 gracefully (returns existing reply)
