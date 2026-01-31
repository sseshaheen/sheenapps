-- Migration 153: Add unique constraint to workflow_sends
-- Purpose: Prevent duplicate send records when a workflow run is retried
-- Date: 2026-01-30
--
-- The WorkflowExecutionService.recordSend() now uses ON CONFLICT DO UPDATE
-- to handle retries gracefully instead of creating duplicate rows.

BEGIN;

-- Add unique constraint for (workflow_run_id, email)
-- This prevents recording the same recipient twice for the same run
CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_sends_run_email_unique
  ON workflow_sends (workflow_run_id, email);

COMMIT;
