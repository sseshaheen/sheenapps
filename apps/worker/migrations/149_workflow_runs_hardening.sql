-- 149_workflow_runs_hardening.sql
-- Purpose: Harden workflow_runs and workflow_attributions tables
-- Based on: Expert code review feedback (Jan 2026)
-- Changes:
--   1. Remove overly permissive RLS policies (worker uses service role anyway)
--   2. Add lifecycle constraints to prevent invalid states
--   3. Optimize queue-pickup index

-- =============================================================================
-- 1. FIX RLS POLICIES
-- =============================================================================
-- Remove permissive INSERT/UPDATE policies that allowed WITH CHECK (true)
-- Worker uses service role and bypasses RLS, so these policies are unnecessary
-- and dangerously permissive if any other role gains table access

DROP POLICY IF EXISTS workflow_runs_service_insert ON workflow_runs;
DROP POLICY IF EXISTS workflow_runs_service_update ON workflow_runs;
DROP POLICY IF EXISTS workflow_attributions_service_insert ON workflow_attributions;

-- Keep only the SELECT policy for project owners (safe read access)
-- INSERT/UPDATE will be done via service role (which bypasses RLS) through HMAC-authenticated API

-- =============================================================================
-- 2. ADD LIFECYCLE CONSTRAINTS
-- =============================================================================
-- Prevent invalid state combinations that would indicate bugs:
--   - status='running' must have started_at
--   - status='succeeded'/'failed' must have completed_at
--   - status='running' must have lease_expires_at (concurrency safety)

DO $$
BEGIN
  -- Constraint: running jobs must have started_at
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_runs_running_requires_started') THEN
    ALTER TABLE workflow_runs
      ADD CONSTRAINT workflow_runs_running_requires_started
      CHECK (status <> 'running' OR started_at IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  -- Constraint: completed jobs (succeeded/failed) must have completed_at
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_runs_done_requires_completed') THEN
    ALTER TABLE workflow_runs
      ADD CONSTRAINT workflow_runs_done_requires_completed
      CHECK (status NOT IN ('succeeded', 'failed') OR completed_at IS NOT NULL);
  END IF;
END $$;

DO $$
BEGIN
  -- Constraint: running jobs must have lease (prevents zombie runs)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_runs_running_requires_lease') THEN
    ALTER TABLE workflow_runs
      ADD CONSTRAINT workflow_runs_running_requires_lease
      CHECK (status <> 'running' OR lease_expires_at IS NOT NULL);
  END IF;
END $$;

-- =============================================================================
-- 3. OPTIMIZE QUEUE-PICKUP INDEX
-- =============================================================================
-- The old index had both (status, requested_at) but status is constant
-- in the partial index WHERE clause, making it redundant.
-- New index: just requested_at (for "oldest first" pickup)

DROP INDEX IF EXISTS idx_workflow_runs_queued;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_queued
  ON workflow_runs (requested_at)
  WHERE status = 'queued';

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON CONSTRAINT workflow_runs_running_requires_started ON workflow_runs
  IS 'Lifecycle constraint: running jobs must have started_at timestamp';

COMMENT ON CONSTRAINT workflow_runs_done_requires_completed ON workflow_runs
  IS 'Lifecycle constraint: completed jobs must have completed_at timestamp';

COMMENT ON CONSTRAINT workflow_runs_running_requires_lease ON workflow_runs
  IS 'Lifecycle constraint: running jobs must have lease_expires_at to prevent zombie runs';
