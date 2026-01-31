-- Migration 106: Create project_build_operations table
-- Purpose: Track build operations for idempotency and audit trail
-- Context: Part of recommendation click fix implementation (V2.1 Final)
-- Date: 2026-01-13
-- Updated: 2026-01-13 (Expert Round 8) - Removed redundant index, renamed trigger function
-- Updated: 2026-01-13 (Expert Round 10) - Added version_id and job_id columns
--
-- CRITICAL: This table ensures same operationId always returns same buildId + versionId + jobId
-- This prevents duplicate builds when users click recommendations multiple times
-- or when network retries occur.
-- 🚨 EXPERT FIX (Round 10): Store version_id and job_id so duplicate operations return complete data

-- Track build operations for idempotency and audit trail
CREATE TABLE IF NOT EXISTS project_build_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  operation_id TEXT NOT NULL,
  build_id TEXT NOT NULL,
  version_id TEXT, -- 🚨 NEW: Store versionId to return on duplicate ops
  job_id TEXT,     -- 🚨 NEW: Store BullMQ jobId to return on duplicate ops
  status TEXT NOT NULL DEFAULT 'initiated',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, operation_id)
);

-- 🚨 EXPERT FIX: Removed redundant index
-- The UNIQUE(project_id, operation_id) constraint already creates a btree index
-- that satisfies our lookup pattern. Creating another index is dead weight.
-- OLD (removed): CREATE INDEX ... ON project_build_operations(project_id, operation_id);

-- 🚨 EXPERT FIX (Round 10): Add CHECK constraint for status values
-- Prevents garbage states from being inserted
-- 🚨 CRITICAL FIX (Round 11): Wrapped in DO block for idempotency
-- Postgres doesn't support ADD CONSTRAINT IF NOT EXISTS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_build_op_status'
      AND conrelid = 'project_build_operations'::regclass
  ) THEN
    ALTER TABLE project_build_operations
      ADD CONSTRAINT check_build_op_status
      CHECK (status IN ('initiated', 'queued', 'processing', 'completed', 'failed'));
  END IF;
END $$;

-- 🚨 EXPERT FIX (Round 10): Optional index for "find operation by build" queries
-- Useful for audit/debug: "which operations created this build?"
-- If you never query by build_id, you can skip this index
CREATE INDEX IF NOT EXISTS idx_build_ops_by_build
  ON project_build_operations(project_id, build_id);

-- 🚨 EXPERT FIX: Table-specific trigger function name to avoid conflicts
-- Generic names like update_updated_at_column() can overwrite functions used by other tables
-- or be overwritten by later migrations, breaking triggers
CREATE OR REPLACE FUNCTION update_build_ops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger for updated_at (only if it doesn't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_build_ops_updated_at'
    AND tgrelid = 'project_build_operations'::regclass
  ) THEN
    CREATE TRIGGER update_build_ops_updated_at
      BEFORE UPDATE ON project_build_operations
      FOR EACH ROW
      EXECUTE FUNCTION update_build_ops_updated_at();
  END IF;
END $$;

-- Note: This migration is idempotent and can be re-run safely
