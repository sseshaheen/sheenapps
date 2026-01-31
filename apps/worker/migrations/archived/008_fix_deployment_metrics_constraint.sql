-- Migration: Fix project_deployment_metrics unique constraint
-- Date: 2025-07-25
-- Purpose: Allow multiple deployment attempts for the same build

-- Drop the unique constraint on build_id
ALTER TABLE project_deployment_metrics DROP CONSTRAINT IF EXISTS project_deployment_metrics_build_id_key;

-- Drop the existing constraint if it exists (for idempotency)
ALTER TABLE project_deployment_metrics DROP CONSTRAINT IF EXISTS project_deployment_metrics_build_id_created_at_key;

-- Add a unique constraint on build_id + created_at to allow multiple attempts
-- This ensures we can track multiple deployment attempts for the same build
ALTER TABLE project_deployment_metrics
  ADD CONSTRAINT project_deployment_metrics_build_id_created_at_key
  UNIQUE (build_id, created_at);

-- Add an attempt_number column to track deployment attempts
ALTER TABLE project_deployment_metrics
  ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;

-- Add an is_retry column to identify retry attempts
ALTER TABLE project_deployment_metrics
  ADD COLUMN IF NOT EXISTS is_retry BOOLEAN DEFAULT false;

-- Create an index on build_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_project_deployment_metrics_build_id_attempts
  ON project_deployment_metrics(build_id, attempt_number DESC);

-- Comment updates
COMMENT ON COLUMN project_deployment_metrics.attempt_number IS 'Deployment attempt number for this build';
COMMENT ON COLUMN project_deployment_metrics.is_retry IS 'Whether this is a retry deployment';
