-- Voice Recordings: Add moderation columns for flag and soft delete
--
-- Phase 3 Enhancement: Moderation tools for admin panel
--
-- Features:
-- 1. Flag recordings for review (with reason and audit trail)
-- 2. Soft delete recordings (preserves data for audit, hides from normal queries)
--
-- Security:
-- - All moderation actions are logged to security_audit_log
-- - Admin permissions required (voice_analytics.moderate)
-- - Soft delete doesn't remove storage files (can be recovered)
--
-- Created: 2026-01-21
-- Updated: 2026-01-22 (removed FK constraints, improved indexes)
-- Status: READY FOR REVIEW

-- ============================================================================
-- 1. Add flagging columns
-- ============================================================================
-- Allows admins to flag recordings for review
-- NOTE: No FK to auth.users to avoid blocking admin deletion
--       Admin identity is preserved in security_audit_log

ALTER TABLE voice_recordings
  ADD COLUMN IF NOT EXISTS flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS flagged_by uuid,
  ADD COLUMN IF NOT EXISTS flag_reason text;

-- ============================================================================
-- 2. Add soft delete columns
-- ============================================================================
-- Soft delete preserves data for audit trail and potential recovery
-- NOTE: No FK to auth.users (same reasoning as above)

ALTER TABLE voice_recordings
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- ============================================================================
-- 3. Add indexes for efficient queries (optimized for actual query patterns)
-- ============================================================================

-- Primary admin list view: recent recordings, not deleted
-- This is the most common query pattern
CREATE INDEX IF NOT EXISTS idx_voice_recordings_created_at_not_deleted
  ON voice_recordings (created_at DESC)
  WHERE deleted_at IS NULL;

-- Flagged-only view: flagged + not deleted, sorted by recency
CREATE INDEX IF NOT EXISTS idx_voice_recordings_flagged_not_deleted
  ON voice_recordings (flagged_at DESC, created_at DESC)
  WHERE flagged_at IS NOT NULL AND deleted_at IS NULL;

-- Keep these for other analytics/admin needs
CREATE INDEX IF NOT EXISTS idx_voice_recordings_deleted_at
  ON voice_recordings (deleted_at)
  WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_recordings_flagged_at
  ON voice_recordings (flagged_at)
  WHERE flagged_at IS NOT NULL;

-- ============================================================================
-- 4. Add check constraint for flag consistency
-- ============================================================================
-- Ensure flagged_by is set together with flagged_at (flag_reason is optional)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_voice_recordings_flag_consistency'
  ) THEN
    ALTER TABLE voice_recordings ADD CONSTRAINT chk_voice_recordings_flag_consistency
      CHECK (
        (flagged_at IS NULL AND flagged_by IS NULL AND flag_reason IS NULL) OR
        (flagged_at IS NOT NULL AND flagged_by IS NOT NULL)
      );
  END IF;
END $$;

-- ============================================================================
-- 5. Add check constraint for soft delete consistency
-- ============================================================================
-- Ensure deleted_by is set when deleted_at is set

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_voice_recordings_delete_consistency'
  ) THEN
    ALTER TABLE voice_recordings ADD CONSTRAINT chk_voice_recordings_delete_consistency
      CHECK (
        (deleted_at IS NULL AND deleted_by IS NULL) OR
        (deleted_at IS NOT NULL AND deleted_by IS NOT NULL)
      );
  END IF;
END $$;

-- ============================================================================
-- 6. Add check constraint for flag_reason length
-- ============================================================================
-- Prevents DB bloat from excessively long reasons (max 500 chars)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_voice_recordings_flag_reason_len'
  ) THEN
    ALTER TABLE voice_recordings ADD CONSTRAINT chk_voice_recordings_flag_reason_len
      CHECK (flag_reason IS NULL OR length(flag_reason) <= 500);
  END IF;
END $$;

-- ============================================================================
-- Notes:
-- ============================================================================
--
-- Why no FK to auth.users:
-- - Admin deletion from auth.users would be blocked by FK constraint
-- - Admin identity is already captured in security_audit_log with email
-- - This is a common pattern for audit columns
--
-- Moderation workflow:
-- 1. Admin flags recording → sets flagged_at, flagged_by, flag_reason
-- 2. Admin unflag recording → sets all flag columns to NULL
-- 3. Admin deletes recording → sets deleted_at, deleted_by (soft delete)
--
-- Query patterns (with matching indexes):
-- - Normal queries: WHERE deleted_at IS NULL ORDER BY created_at DESC
--   → Uses idx_voice_recordings_created_at_not_deleted
-- - Flagged recordings: WHERE flagged_at IS NOT NULL AND deleted_at IS NULL
--   → Uses idx_voice_recordings_flagged_not_deleted
-- - Include deleted: no WHERE filter (admin only)
--
-- Storage files are NOT deleted on soft delete:
-- - Allows recovery if needed
-- - Storage cleanup can be done separately via background job
-- - Files should be purged after retention period (e.g., 90 days)
--
-- Permission required: voice_analytics.moderate
--
