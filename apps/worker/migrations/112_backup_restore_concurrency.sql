-- Migration: 112_backup_restore_concurrency.sql
-- Description: Add partial unique indexes to prevent concurrent backup/restore operations
-- This provides database-level atomicity for preventing race conditions
-- that the previous non-atomic SELECT + INSERT checks could not prevent.

BEGIN;

-- =============================================================================
-- PARTIAL UNIQUE INDEX: Only one in-flight backup per project
-- =============================================================================
-- This prevents the race condition where two backup requests both check
-- for existing backups, both find none, and both start creating one.

CREATE UNIQUE INDEX IF NOT EXISTS uq_inhouse_backups_inflight
ON inhouse_backups (project_id)
WHERE status IN ('pending', 'in_progress');

-- =============================================================================
-- PARTIAL UNIQUE INDEX: Only one in-flight restore per project
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_inhouse_restores_inflight
ON inhouse_restores (project_id)
WHERE status IN ('pending', 'downloading', 'creating_pre_restore_backup', 'restoring', 'validating', 'swapping');

COMMIT;

-- =============================================================================
-- NOTE: If the insert/update fails with a unique constraint violation,
-- the caller should handle it gracefully and return appropriate errors:
-- - BACKUP_ALREADY_RUNNING (409)
-- - RESTORE_ALREADY_RUNNING (409)
-- =============================================================================
