/**
 * Migration 151: workflow_sends cooldown tracking
 *
 * Tracks individual email sends per workflow run to enable:
 * 1. Per-recipient cooldown (don't email same person for same action within X hours)
 * 2. Send history for audit/debugging
 * 3. Exclusion in buildRecipients() queries
 */

BEGIN;

-- Track individual email sends per workflow execution
CREATE TABLE IF NOT EXISTS workflow_sends (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  action_id     text NOT NULL,
  email         text NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  status        text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'suppressed'))
);

-- Primary lookup: "was this email sent for this action recently?"
-- Used by buildRecipients() NOT EXISTS subquery for cooldown enforcement
CREATE INDEX IF NOT EXISTS idx_workflow_sends_cooldown
  ON workflow_sends (project_id, action_id, email, sent_at DESC);

-- Secondary: list sends for a specific run (audit/debugging)
CREATE INDEX IF NOT EXISTS idx_workflow_sends_by_run
  ON workflow_sends (workflow_run_id);

-- RLS
ALTER TABLE workflow_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_sends FORCE ROW LEVEL SECURITY;

-- Service role can do everything
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'workflow_sends_service_all') THEN
    CREATE POLICY workflow_sends_service_all ON workflow_sends FOR ALL
      USING (true) WITH CHECK (true);
  END IF;
END $$;

COMMIT;
