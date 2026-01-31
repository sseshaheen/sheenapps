-- 148_project_digest_columns.sql
-- Purpose: Run Hub Phase 4 - Proactive digest scheduling
-- Part of: Run Hub daily digest feature

-- =============================================================================
-- Add digest columns to projects table
-- =============================================================================
-- Scheduler-driven approach: compute next send time once and store it.
-- Avoids per-project timezone math on every hourly job run.

-- Add digest_next_at column (when the next digest should be sent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'digest_next_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN digest_next_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add digest_last_sent_at column (when the last digest was sent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'digest_last_sent_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN digest_last_sent_at TIMESTAMPTZ;
  END IF;
END $$;

-- =============================================================================
-- Index for scheduler query
-- =============================================================================
-- Hourly job query: SELECT * FROM projects WHERE digest_next_at <= now() LIMIT 200
-- Partial index only includes projects with digest enabled (non-null digest_next_at)

CREATE INDEX IF NOT EXISTS idx_projects_digest_due
  ON projects (digest_next_at)
  WHERE digest_next_at IS NOT NULL;

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON COLUMN projects.digest_next_at IS 'UTC timestamp when next daily digest should be sent. NULL means digest disabled.';
COMMENT ON COLUMN projects.digest_last_sent_at IS 'UTC timestamp when last daily digest was sent. NULL means never sent.';
