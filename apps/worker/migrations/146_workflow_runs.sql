-- 146_workflow_runs.sql
-- Purpose: Run Hub Phase 4 - Workflow execution tracking
-- Part of: Run Hub Actions → Outcomes loop

-- =============================================================================
-- workflow_runs table
-- =============================================================================
-- Tracks workflow execution requests and their status.
-- Uses idempotent insert pattern with (project_id, idempotency_key) unique constraint.

CREATE TABLE IF NOT EXISTS workflow_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  action_id             TEXT NOT NULL,  -- 'recover_abandoned', 'send_promo', 'onboard_users', etc.
  status                TEXT NOT NULL DEFAULT 'queued',  -- queued | running | succeeded | failed

  -- Timing (requested_at = server truth, client_requested_at = diagnostics only)
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_requested_at   TIMESTAMPTZ,          -- Optional client timestamp for debugging
  started_at            TIMESTAMPTZ,          -- When worker began processing
  completed_at          TIMESTAMPTZ,          -- When worker finished

  -- Idempotency (for safe retries + double-click dedup)
  idempotency_key       TEXT NOT NULL,        -- UUID from client

  -- Workflow parameters (content, segmentation, etc. - essential for debugging/retries)
  params                JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_count_estimate INT,               -- From preview/dry-run

  -- Retry & Concurrency Safety
  attempts              INT NOT NULL DEFAULT 0,         -- Retry counter
  lease_expires_at      TIMESTAMPTZ,                    -- Worker must complete before this or job is stale
  last_heartbeat_at     TIMESTAMPTZ,                    -- For long-running jobs

  -- Results
  result                JSONB,                -- { total_recipients, successful, failed, error_summary }

  -- Audit
  triggered_by          UUID NOT NULL REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Idempotency constraint
  CONSTRAINT workflow_runs_idempotency UNIQUE (project_id, idempotency_key)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Query pattern: List runs by project and status (for dashboard)
CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_status
  ON workflow_runs (project_id, status);

-- Query pattern: List runs by project and action (for action card "last run")
CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_action
  ON workflow_runs (project_id, action_id, created_at DESC);

-- Query pattern: Find stale running jobs (for worker cleanup)
CREATE INDEX IF NOT EXISTS idx_workflow_runs_stale_detection
  ON workflow_runs (status, lease_expires_at)
  WHERE status = 'running';

-- Query pattern: Find queued jobs for worker pickup
CREATE INDEX IF NOT EXISTS idx_workflow_runs_queued
  ON workflow_runs (status, requested_at)
  WHERE status = 'queued';

-- =============================================================================
-- RLS Policies (idempotent)
-- =============================================================================

ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs FORCE ROW LEVEL SECURITY;

-- Project owner can read their workflow runs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'workflow_runs_owner_select') THEN
    CREATE POLICY workflow_runs_owner_select ON workflow_runs
      FOR SELECT
      USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Service role can insert/update workflow runs (worker operations)
-- Note: Worker uses service role and bypasses RLS. HMAC + API auth is the real gate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'workflow_runs_service_insert') THEN
    CREATE POLICY workflow_runs_service_insert ON workflow_runs
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'workflow_runs_service_update') THEN
    CREATE POLICY workflow_runs_service_update ON workflow_runs
      FOR UPDATE
      USING (true);
  END IF;
END $$;

-- =============================================================================
-- Status check constraint
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_runs_status_check') THEN
    ALTER TABLE workflow_runs
      ADD CONSTRAINT workflow_runs_status_check
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed'));
  END IF;
END $$;

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE workflow_runs IS 'Tracks Run Hub workflow execution requests and their status';
COMMENT ON COLUMN workflow_runs.action_id IS 'Action identifier from ACTION_REGISTRY (e.g., recover_abandoned, send_promo)';
COMMENT ON COLUMN workflow_runs.idempotency_key IS 'Client-generated UUID for deduplication and safe retries';
COMMENT ON COLUMN workflow_runs.params IS 'Action-specific parameters (subject, content, segmentation, etc.)';
COMMENT ON COLUMN workflow_runs.attempts IS 'Number of execution attempts (for retry tracking)';
COMMENT ON COLUMN workflow_runs.lease_expires_at IS 'Worker must complete or renew lease before this time';
COMMENT ON COLUMN workflow_runs.result IS 'Execution result: { total_recipients, successful, failed, error_summary }';
