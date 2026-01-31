-- Migration: Add deployment history index for efficient cursor-based pagination
-- Date: 2026-01-23
-- Task: Deployment History feature (INHOUSE_MODE_REMAINING.md)

-- This index optimizes the deployment history query:
-- SELECT * FROM inhouse_deployments
-- WHERE project_id = $1
--   AND (created_at, id) < ($cursor_created_at, $cursor_id)
-- ORDER BY created_at DESC, id DESC
-- LIMIT 20

-- The compound index (project_id, created_at DESC, id DESC) allows:
-- 1. Efficient filtering by project_id
-- 2. Sorted retrieval without a filesort
-- 3. Cursor-based pagination with tie-breaking on id

CREATE INDEX IF NOT EXISTS idx_inhouse_deployments_project_created
ON inhouse_deployments(project_id, created_at DESC, id DESC);

-- COMMENT: This migration is idempotent (IF NOT EXISTS).
-- For production, consider running without CONCURRENTLY inside a transaction,
-- or outside a transaction with CONCURRENTLY for zero-downtime.
