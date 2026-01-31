-- 150_fix_workflow_idempotency_scope.sql
-- Purpose: Fix workflow_runs idempotency constraint to include action_id
-- Bug: (project_id, idempotency_key) is too broad - reusing a key for different actions returns wrong run
-- Fix: Change to (project_id, action_id, idempotency_key)

BEGIN;

-- Drop old constraint
ALTER TABLE workflow_runs
  DROP CONSTRAINT IF EXISTS workflow_runs_idempotency;

-- Create new constraint with action_id included
ALTER TABLE workflow_runs
  ADD CONSTRAINT workflow_runs_idempotency
  UNIQUE (project_id, action_id, idempotency_key);

COMMIT;

-- Update documentation
COMMENT ON CONSTRAINT workflow_runs_idempotency ON workflow_runs IS
  'Ensures idempotency keys are scoped to (project, action) - prevents wrong-action deduplication';
