-- Integration Status System Database Schema Extensions
-- Extends project_integrations table and adds action tracking support

BEGIN;

-- Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- Extend integration_type ENUM to include github and vercel
-- =============================================================================

DO $$
BEGIN
  -- Add github and vercel to integration_type ENUM if they don't exist
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'github' AND enumtypid = 'integration_type'::regtype) THEN
    ALTER TYPE integration_type ADD VALUE 'github';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'vercel' AND enumtypid = 'integration_type'::regtype) THEN
    ALTER TYPE integration_type ADD VALUE 'vercel';
  END IF;
END $$;

-- =============================================================================
-- Extend project_integrations table with status caching and circuit breaker support
-- =============================================================================

-- Use native IF NOT EXISTS for safer column additions
ALTER TABLE project_integrations
  ADD COLUMN IF NOT EXISTS last_status_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_cache JSONB,
  ADD COLUMN IF NOT EXISTS circuit_breaker_state JSONB
    DEFAULT jsonb_build_object(
      'state', 'closed',
      'failure_count', 0,
      'success_count', 0,
      'last_failure_time', NULL,
      'last_success_time', NULL
    ),
  ADD COLUMN IF NOT EXISTS last_good_status JSONB,
  ADD COLUMN IF NOT EXISTS cache_expires_at TIMESTAMPTZ;

-- =============================================================================
-- Create integration_actions table for action tracking and idempotency
-- =============================================================================

CREATE TABLE IF NOT EXISTS integration_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider integration_type NOT NULL,
  action TEXT NOT NULL,
  idempotency_key UUID NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  result JSONB,
  error_message TEXT,
  requested_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Create indexes for optimal query performance (expert-reviewed)
-- =============================================================================

-- Core project integrations lookup
CREATE INDEX IF NOT EXISTS idx_proj_integ_project_provider
ON project_integrations(project_id, type);

-- Status queries with connected filter
CREATE INDEX IF NOT EXISTS idx_proj_integ_status_check
ON project_integrations(project_id, type, last_status_check)
WHERE status = 'connected';

-- Cache expiration cleanup (partial index)
CREATE INDEX IF NOT EXISTS idx_proj_integ_cache_expires
ON project_integrations(cache_expires_at)
WHERE cache_expires_at IS NOT NULL;

-- Circuit breaker JSONB queries (if needed)
CREATE INDEX IF NOT EXISTS idx_proj_integ_cb_gin
ON project_integrations USING GIN (circuit_breaker_state);

-- Integration actions - common query patterns
CREATE INDEX IF NOT EXISTS idx_actions_project_status_created
ON integration_actions(project_id, status, created_at DESC);

-- Unique index for idempotency enforcement
CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_actions_idempotency
ON integration_actions(idempotency_key);

-- Provider-specific action queries
CREATE INDEX IF NOT EXISTS idx_actions_provider_created
ON integration_actions(provider, created_at DESC);

-- Project + idempotency lookups (expert suggestion)
CREATE INDEX IF NOT EXISTS idx_actions_project_idem
ON integration_actions(project_id, idempotency_key);

-- =============================================================================
-- Create integration_status_events table for SSE event persistence
-- =============================================================================

CREATE TABLE IF NOT EXISTS integration_status_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sequence_number BIGINT GENERATED ALWAYS AS IDENTITY,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  integration_key integration_type,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events table indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_status_events_project_seq
ON integration_status_events(project_id, sequence_number);

CREATE INDEX IF NOT EXISTS idx_status_events_project_created
ON integration_status_events(project_id, created_at DESC);

-- Index for cleanup (32-day retention)
CREATE INDEX IF NOT EXISTS idx_status_events_cleanup
ON integration_status_events(created_at);

-- =============================================================================
-- Add constraints and validation rules
-- =============================================================================

-- Ensure one row per integration per project (uq_project_type already exists in schema)
-- This constraint is already present: CONSTRAINT uq_project_type UNIQUE (project_id, type)

-- Ensure circuit breaker state has required fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_integrations_circuit_breaker_valid') THEN
    ALTER TABLE project_integrations ADD CONSTRAINT project_integrations_circuit_breaker_valid
    CHECK (
      circuit_breaker_state IS NULL OR (
        circuit_breaker_state ? 'state' AND
        circuit_breaker_state ? 'failure_count' AND
        circuit_breaker_state ? 'success_count'
      )
    );
  END IF;
END $$;

-- Add idempotency key validation (not all-zero UUID)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'integration_actions_idempotency_valid') THEN
    ALTER TABLE integration_actions ADD CONSTRAINT integration_actions_idempotency_valid
    CHECK (idempotency_key != '00000000-0000-0000-0000-000000000000'::uuid);
  END IF;
END $$;

-- =============================================================================
-- Create functions for integration status management
-- =============================================================================

-- Function to update circuit breaker state
CREATE OR REPLACE FUNCTION update_circuit_breaker_state(
  p_project_id UUID,
  p_type TEXT,
  p_success BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  current_state JSONB;
  new_state JSONB;
BEGIN
  -- Get current circuit breaker state
  SELECT circuit_breaker_state INTO current_state
  FROM project_integrations
  WHERE project_id = p_project_id AND type = p_type;

  IF current_state IS NULL THEN
    current_state := '{
      "state": "closed",
      "failure_count": 0,
      "success_count": 0,
      "last_failure_time": null,
      "last_success_time": null
    }'::jsonb;
  END IF;

  -- Update state based on success/failure (using strict ISO-8601 timestamps)
  IF p_success THEN
    new_state := jsonb_set(
      jsonb_set(
        jsonb_set(current_state, '{success_count}',
          to_jsonb((current_state->>'success_count')::int + 1)
        ),
        '{last_success_time}', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      ),
      '{state}', '"closed"'
    );

    -- Reset failure count on success
    new_state := jsonb_set(new_state, '{failure_count}', '0');
  ELSE
    new_state := jsonb_set(
      jsonb_set(
        current_state,
        '{failure_count}',
        to_jsonb((current_state->>'failure_count')::int + 1)
      ),
      '{last_failure_time}', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    );

    -- Open circuit breaker if failure count >= 5
    IF (new_state->>'failure_count')::int >= 5 THEN
      new_state := jsonb_set(new_state, '{state}', '"open"');
    END IF;
  END IF;

  -- Update the table
  UPDATE project_integrations
  SET circuit_breaker_state = new_state,
      last_status_check = NOW()
  WHERE project_id = p_project_id AND type = p_type;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old events (called by cleanup job)
CREATE OR REPLACE FUNCTION cleanup_old_integration_events()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete events older than 32 days
  DELETE FROM integration_status_events
  WHERE created_at < NOW() - INTERVAL '32 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up completed actions (called by cleanup job)
CREATE OR REPLACE FUNCTION cleanup_old_integration_actions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete completed actions older than 180 days
  DELETE FROM integration_actions
  WHERE completed_at < NOW() - INTERVAL '180 days'
    AND status IN ('completed', 'failed');

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- OPERATIONAL NOTE: Schedule these cleanup functions via pg_cron or application cron:
-- SELECT cron.schedule('cleanup_integration_events', '0 2 * * *', 'SELECT cleanup_old_integration_events();');
-- SELECT cron.schedule('cleanup_integration_actions', '0 3 * * *', 'SELECT cleanup_old_integration_actions();');

-- =============================================================================
-- Create triggers for automatic cleanup and maintenance
-- =============================================================================

-- Trigger to automatically set completed_at for integration actions
CREATE OR REPLACE FUNCTION set_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed','failed') AND NEW.completed_at IS NULL THEN
    NEW.completed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_actions_completed' AND tgrelid = 'integration_actions'::regclass) THEN
    CREATE TRIGGER trg_actions_completed
      BEFORE INSERT OR UPDATE ON integration_actions
      FOR EACH ROW
      EXECUTE FUNCTION set_completed_at();
  END IF;
END $$;

-- Trigger to automatically clean up cache when it expires
CREATE OR REPLACE FUNCTION cleanup_expired_status_cache()
RETURNS TRIGGER AS $$
BEGIN
  -- Clear cache if it has expired
  IF NEW.cache_expires_at IS NOT NULL AND NEW.cache_expires_at < NOW() THEN
    NEW.status_cache := NULL;
    NEW.cache_expires_at := NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_cleanup_expired_cache' AND tgrelid = 'project_integrations'::regclass) THEN
    CREATE TRIGGER trigger_cleanup_expired_cache
      BEFORE UPDATE ON project_integrations
      FOR EACH ROW
      EXECUTE FUNCTION cleanup_expired_status_cache();
  END IF;
END $$;

-- =============================================================================
-- Insert initial data and configuration
-- =============================================================================

-- Update existing project_integrations with default circuit breaker state
UPDATE project_integrations
SET circuit_breaker_state = jsonb_build_object(
  'state', 'closed',
  'failure_count', 0,
  'success_count', 0,
  'last_failure_time', NULL,
  'last_success_time', NULL
)
WHERE circuit_breaker_state IS NULL;

COMMIT;

-- =============================================================================
-- Operational Queries for Monitoring (expert-suggested)
-- =============================================================================

-- How many rows are using stale cache?
-- SELECT count(*) FROM project_integrations
-- WHERE cache_expires_at IS NOT NULL AND cache_expires_at < now();

-- Action idempotency hit rate
-- SELECT provider, count(*) FILTER (WHERE status='completed') AS completed,
--        count(*) FILTER (WHERE status='pending') AS pending
-- FROM integration_actions
-- GROUP BY 1;

-- Event lag per project (for SSE resume)
-- SELECT project_id,
--        max(sequence_number) AS last_seq,
--        now() - max(created_at) AS lag
-- FROM integration_status_events
-- GROUP BY 1 ORDER BY lag DESC;
