-- Migration: Advisor Workspace Auto-Provisioning System
-- Implements expert-validated queue-first pattern with retry logic
-- Fixes 3 production-blocking bugs identified in expert review

BEGIN;

-- ============================================================================
-- PART 1: CRITICAL FIX #3 - Make user_id nullable for system messages
-- ============================================================================
-- Current: user_id uuid NOT NULL causes 500 errors when inserting system messages
-- Fix: Make nullable with constraint to ensure non-system messages have user_id

ALTER TABLE project_chat_log_minimal
  ALTER COLUMN user_id DROP NOT NULL;

-- EXPERT FIX: NULL-safe constraint (message_type can be NULL)
-- Using IS DISTINCT FROM instead of != to handle NULL properly
ALTER TABLE project_chat_log_minimal
  ADD CONSTRAINT chk_system_user_id CHECK (
    (message_type = 'system' AND user_id IS NULL) OR
    (message_type IS DISTINCT FROM 'system' AND user_id IS NOT NULL)
  );

-- Update RLS policies to handle NULL user_id for system messages
-- (Existing policies should gracefully handle NULL, but verify post-migration)

-- ============================================================================
-- PART 2: Create workspace_provisioning_queue table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_provisioning_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Match context
  match_id UUID NOT NULL REFERENCES advisor_match_requests(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id),

  -- Status tracking
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'rollback_needed')),
  attempt_count INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,

  -- Multi-instance safety (EXPERT FIX #1, #4)
  locked_at TIMESTAMPTZ,
  locked_by TEXT,  -- Instance ID for debugging

  -- Error tracking
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  error_history JSONB DEFAULT '[]',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),  -- EXPERT FIX #8

  -- Idempotency constraint
  CONSTRAINT ux_queue_match_id UNIQUE (match_id)
);

-- ============================================================================
-- PART 3: Add previous_status to advisor_match_requests (EXPERT FIX #6)
-- ============================================================================

ALTER TABLE advisor_match_requests
  ADD COLUMN IF NOT EXISTS previous_status match_status;

-- ============================================================================
-- PART 4: Add updated_at to project_advisors
-- ============================================================================

-- Check if column exists first
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'project_advisors' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE project_advisors ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ============================================================================
-- PART 5: Create triggers (EXPERT FIX #6, #8)
-- ============================================================================

-- Trigger 1: Auto-capture previous_status on advisor_match_requests
CREATE OR REPLACE FUNCTION capture_prev_status()
RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.previous_status := OLD.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_match_prev_status'
  ) THEN
    CREATE TRIGGER trg_match_prev_status
    BEFORE UPDATE OF status ON advisor_match_requests
    FOR EACH ROW EXECUTE FUNCTION capture_prev_status();
  END IF;
END $$;

-- Trigger 2: Auto-update updated_at on workspace_provisioning_queue
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_queue_updated_at'
  ) THEN
    CREATE TRIGGER trg_queue_updated_at
    BEFORE UPDATE ON workspace_provisioning_queue
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Trigger 3: Auto-update updated_at on project_advisors
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_advisors_updated_at'
  ) THEN
    CREATE TRIGGER trg_project_advisors_updated_at
    BEFORE UPDATE ON project_advisors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- PART 5B: Add state invariant constraints (EXPERT RECOMMENDATION)
-- ============================================================================

-- EXPERT: Defensive constraints to catch invalid states early
ALTER TABLE workspace_provisioning_queue
  ADD CONSTRAINT chk_attempts_nonneg CHECK (attempt_count >= 0),
  ADD CONSTRAINT chk_max_attempts CHECK (max_attempts BETWEEN 1 AND 10),
  ADD CONSTRAINT chk_processing_lock CHECK (
    (status = 'processing') = (locked_at IS NOT NULL AND locked_by IS NOT NULL)
  );

-- EXPERT: Explicit RLS control (this table is for backend workers only)
ALTER TABLE workspace_provisioning_queue DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 6: Create indexes (EXPERT OPTIMIZED)
-- ============================================================================

-- EXPERT OPTIMIZATION: More selective index for pending jobs
-- Targets the hot path: worker fetching pending jobs by time
CREATE INDEX IF NOT EXISTS idx_queue_pending_ready
  ON workspace_provisioning_queue(next_retry_at)
  WHERE status = 'pending';

-- EXPERT OPTIMIZATION: Separate index for rollback queue
CREATE INDEX IF NOT EXISTS idx_queue_rollback
  ON workspace_provisioning_queue(updated_at)
  WHERE status = 'rollback_needed';

-- Index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_queue_created
  ON workspace_provisioning_queue(created_at DESC);

-- Index for match_id lookups (idempotency checks)
CREATE INDEX IF NOT EXISTS idx_queue_match_id
  ON workspace_provisioning_queue(match_id);

-- Index for locked job debugging (reaper logic)
CREATE INDEX IF NOT EXISTS idx_queue_locked
  ON workspace_provisioning_queue(locked_at, locked_by)
  WHERE status = 'processing';

-- Index for cleanup queries (completed jobs)
CREATE INDEX IF NOT EXISTS idx_queue_cleanup
  ON workspace_provisioning_queue(updated_at)
  WHERE status = 'completed';

-- ============================================================================
-- PART 7: Create helper function for gradual rollout (EXPERT FIX #5)
-- ============================================================================

-- Hash-based bucketing for UUIDs (modulo doesn't work on UUIDs)
CREATE OR REPLACE FUNCTION project_bucket(project_id UUID)
RETURNS INT AS $$
BEGIN
  RETURN (('x' || right(md5(project_id::text), 8))::bit(32)::int % 10);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Usage:
-- 10%:  WHERE project_bucket(project_id) = 0
-- 50%:  WHERE project_bucket(project_id) <= 4
-- 100%: no filter

-- ============================================================================
-- PART 8: Add advisor_matching log type to server_logs (if needed)
-- ============================================================================

-- Note: This assumes server_logs table exists with a log_type field
-- If log types are enum-based, this may need adjustment
-- For now, document that 'advisor_matching' should be used as log_type

-- ============================================================================
-- PART 9: Post-Migration Statistics Update (EXPERT RECOMMENDATION)
-- ============================================================================

-- EXPERT: Update table statistics so planner uses new indexes immediately
ANALYZE workspace_provisioning_queue;
ANALYZE project_chat_log_minimal;
ANALYZE advisor_match_requests;
ANALYZE project_advisors;

COMMIT;

-- ============================================================================
-- Post-Migration Verification Queries
-- ============================================================================

-- Verify user_id is now nullable
-- SELECT column_name, is_nullable FROM information_schema.columns
-- WHERE table_name = 'project_chat_log_minimal' AND column_name = 'user_id';

-- Verify queue table created
-- SELECT COUNT(*) FROM workspace_provisioning_queue;

-- Verify triggers created
-- SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_match_prev_status', 'trg_queue_updated_at', 'trg_project_advisors_updated_at');

-- Verify indexes created
-- SELECT indexname FROM pg_indexes WHERE tablename = 'workspace_provisioning_queue';

-- Test project_bucket function
-- SELECT project_bucket(gen_random_uuid()) as bucket FROM generate_series(1, 10);