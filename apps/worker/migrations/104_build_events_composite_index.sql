-- Migration: Add composite index for build events query optimization
-- Purpose: Optimize the hot path query used by /api/builds/:buildId/events
-- Date: 2026-01-12
--
-- Query pattern:
--   WHERE build_id = ? AND user_id = ? AND user_visible = true AND id > ?
--   ORDER BY id
--   LIMIT 500
--
-- This composite index covers the filter conditions and sort order.

BEGIN;

-- Create composite index for the events polling query
-- Note: Not using CONCURRENTLY since migration tools wrap in transactions
-- For very large tables, run manually outside transaction with CONCURRENTLY
CREATE INDEX IF NOT EXISTS idx_build_events_polling
ON project_build_events (build_id, user_id, user_visible, id)
WHERE user_visible = true;

-- Note: This is a partial index (WHERE user_visible = true) which:
-- 1. Reduces index size by excluding non-visible events
-- 2. Exactly matches our query's filter pattern
-- 3. Provides optimal performance for the polling endpoint

COMMENT ON INDEX idx_build_events_polling IS 'Composite index for build events polling query (build_id, user_id, user_visible, id) with partial filter on user_visible=true';

COMMIT;
