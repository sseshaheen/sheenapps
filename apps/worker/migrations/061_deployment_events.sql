-- Migration: 061_deployment_events.sql
-- Creates deployment events table for live deployment logs
-- INHOUSE_MODE_REMAINING.md Task 5: Live Deployment Logs with Hybrid SSE

BEGIN;

-- Create deployment events table
CREATE TABLE IF NOT EXISTS inhouse_deployment_events (
  id BIGSERIAL PRIMARY KEY,
  deployment_id VARCHAR(64) NOT NULL REFERENCES inhouse_deployments(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  level TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error')),
  step TEXT NOT NULL,  -- 'upload_assets' | 'deploy_worker' | 'update_kv' | 'activate' | 'done' | 'error'
  message TEXT NOT NULL,
  meta JSONB
);

-- Index for efficient event retrieval by deployment and id (for cursor-based streaming)
CREATE INDEX IF NOT EXISTS idx_deploy_events_deploy_id_id
ON inhouse_deployment_events(deployment_id, id);

-- Comment for documentation
COMMENT ON TABLE inhouse_deployment_events IS 'Stores deployment progress events for live logging. Retention: 14 days.';
COMMENT ON COLUMN inhouse_deployment_events.step IS 'Deployment step: upload_assets, deploy_worker, update_kv, activate, done, error';
COMMENT ON COLUMN inhouse_deployment_events.level IS 'Log level: info (normal progress), warn (non-fatal issues), error (fatal issues)';
COMMENT ON COLUMN inhouse_deployment_events.meta IS 'Optional metadata like asset counts, byte sizes, etc.';

COMMIT;
