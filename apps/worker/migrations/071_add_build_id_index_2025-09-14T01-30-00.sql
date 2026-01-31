-- Add index for buildId lookups on project_build_metrics
-- This optimizes frontend queries for build metadata replacement

BEGIN;

-- Add index for buildId lookups (primary frontend use case)
CREATE INDEX IF NOT EXISTS idx_build_metrics_build_id 
ON project_build_metrics (build_id);

COMMIT;