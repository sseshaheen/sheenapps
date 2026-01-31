-- Migration: Admin Panel Foundation - Metrics Layer
-- Implements system metrics storage with cardinality guards
-- Foundation for system health dashboard, SLO tracking, and alerting

BEGIN;

-- ============================================================================
-- PART 1: System Metrics Hourly Table
-- ============================================================================
-- Stores aggregated metrics for dashboard queries
-- Direct instrumentation preferred, log-derived metrics as fallback

CREATE TABLE IF NOT EXISTS system_metrics_hourly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hour TIMESTAMPTZ NOT NULL,
  metric_name TEXT NOT NULL,
  dimensions JSONB DEFAULT '{}',
  value NUMERIC NOT NULL,

  -- Metadata
  source TEXT DEFAULT 'instrumentation', -- 'instrumentation' or 'log_derived'
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(hour, metric_name, dimensions)
);

-- ============================================================================
-- PART 2: Cardinality Guard Trigger
-- ============================================================================
-- Prevents dimension explosion by whitelisting allowed dimension keys
-- Without this, arbitrary dimensions could DoS the database

CREATE OR REPLACE FUNCTION check_metric_dimensions()
RETURNS TRIGGER AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY[
    'route',        -- Normalized API route (e.g., '/api/users/:id')
    'status_code',  -- HTTP status code
    'provider',     -- External provider (stripe, supabase, etc.)
    'queue',        -- Job queue name
    'plan',         -- Subscription plan
    'status',       -- Generic status (success, failed, etc.)
    'type',         -- Generic type discriminator
    'service'       -- Service name
  ];
  actual_keys TEXT[];
BEGIN
  -- Extract keys from dimensions JSONB
  SELECT array_agg(key) INTO actual_keys
  FROM jsonb_object_keys(NEW.dimensions) AS key;

  -- Allow empty dimensions
  IF actual_keys IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check all keys are in allowlist
  IF NOT (actual_keys <@ allowed_keys) THEN
    RAISE EXCEPTION 'Invalid metric dimension key. Allowed: %. Got: %',
      allowed_keys, actual_keys;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_metric_dimension_keys'
    AND tgrelid = 'system_metrics_hourly'::regclass
  ) THEN
    CREATE TRIGGER enforce_metric_dimension_keys
      BEFORE INSERT ON system_metrics_hourly
      FOR EACH ROW EXECUTE FUNCTION check_metric_dimensions();
  END IF;
END $$;

-- ============================================================================
-- PART 3: Indexes for Fast Queries
-- ============================================================================

-- Primary lookup: metric + time range
CREATE INDEX IF NOT EXISTS idx_metrics_lookup
  ON system_metrics_hourly(metric_name, hour DESC);

-- For time-series queries: BRIN index is efficient for time-ordered data
-- (small index size, good for range scans on append-mostly tables)
CREATE INDEX IF NOT EXISTS idx_metrics_hour_brin
  ON system_metrics_hourly USING BRIN(hour);

-- For dashboard queries by specific dimensions
CREATE INDEX IF NOT EXISTS idx_metrics_dimensions
  ON system_metrics_hourly USING GIN(dimensions);

-- ============================================================================
-- PART 4: SLO Definitions Table
-- ============================================================================
-- Stores SLO targets for dashboard display and alerting

CREATE TABLE IF NOT EXISTS slo_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  metric_name TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  target_operator TEXT NOT NULL CHECK (target_operator IN ('gt', 'gte', 'lt', 'lte', 'eq')),
  window_hours INT NOT NULL DEFAULT 168, -- 7 days default
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default SLOs
INSERT INTO slo_definitions (name, description, metric_name, target_value, target_operator, window_hours)
VALUES
  ('API Availability', 'Percentage of successful API requests', 'api_success_rate', 99.9, 'gte', 168),
  ('Build Success Rate', 'Percentage of successful builds', 'build_success_rate', 95.0, 'gte', 168),
  ('API Latency P95', '95th percentile API response time (ms)', 'api_latency_p95', 500, 'lte', 168),
  ('Webhook Delivery Rate', 'Percentage of webhooks delivered successfully', 'webhook_delivery_rate', 99.5, 'gte', 168)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- PART 5: Service Status Table
-- ============================================================================
-- Current status of each service for system health dashboard

CREATE TABLE IF NOT EXISTS service_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('operational', 'degraded', 'outage', 'unknown')),
  last_check_at TIMESTAMPTZ DEFAULT NOW(),
  last_healthy_at TIMESTAMPTZ,
  error_message TEXT,
  metrics JSONB DEFAULT '{}', -- Current metrics snapshot (p95, error_rate, etc.)
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default services
INSERT INTO service_status (service_name, display_name, status)
VALUES
  ('api', 'API Worker', 'unknown'),
  ('database', 'Database', 'unknown'),
  ('build_runner', 'Build Runner', 'unknown'),
  ('stripe', 'Stripe', 'unknown'),
  ('supabase', 'Supabase', 'unknown'),
  ('sanity', 'Sanity CMS', 'unknown')
ON CONFLICT (service_name) DO NOTHING;

-- Trigger for updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_service_status_updated_at'
    AND tgrelid = 'service_status'::regclass
  ) THEN
    CREATE TRIGGER trg_service_status_updated_at
      BEFORE UPDATE ON service_status
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ============================================================================
-- PART 6: Helper Functions
-- ============================================================================

-- Get metric value for a specific time range
CREATE OR REPLACE FUNCTION get_metric_avg(
  p_metric_name TEXT,
  p_hours INT DEFAULT 24
)
RETURNS NUMERIC AS $$
BEGIN
  RETURN (
    SELECT AVG(value)
    FROM system_metrics_hourly
    WHERE metric_name = p_metric_name
      AND hour > NOW() - (p_hours || ' hours')::INTERVAL
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Get SLO compliance percentage
CREATE OR REPLACE FUNCTION get_slo_compliance(p_slo_name TEXT)
RETURNS JSONB AS $$
DECLARE
  v_slo RECORD;
  v_current_value NUMERIC;
  v_is_compliant BOOLEAN;
BEGIN
  SELECT * INTO v_slo FROM slo_definitions WHERE name = p_slo_name;

  IF v_slo IS NULL THEN
    RETURN jsonb_build_object('error', 'SLO not found');
  END IF;

  v_current_value := get_metric_avg(v_slo.metric_name, v_slo.window_hours);

  v_is_compliant := CASE v_slo.target_operator
    WHEN 'gt' THEN v_current_value > v_slo.target_value
    WHEN 'gte' THEN v_current_value >= v_slo.target_value
    WHEN 'lt' THEN v_current_value < v_slo.target_value
    WHEN 'lte' THEN v_current_value <= v_slo.target_value
    WHEN 'eq' THEN v_current_value = v_slo.target_value
    ELSE FALSE
  END;

  RETURN jsonb_build_object(
    'name', v_slo.name,
    'target', v_slo.target_value,
    'current', COALESCE(v_current_value, 0),
    'operator', v_slo.target_operator,
    'compliant', v_is_compliant,
    'window_hours', v_slo.window_hours
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- PART 7: RLS Configuration
-- ============================================================================
-- These tables are for admin/backend use only

ALTER TABLE system_metrics_hourly DISABLE ROW LEVEL SECURITY;
ALTER TABLE slo_definitions DISABLE ROW LEVEL SECURITY;
ALTER TABLE service_status DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 8: Statistics Update
-- ============================================================================

ANALYZE system_metrics_hourly;
ANALYZE slo_definitions;
ANALYZE service_status;

COMMIT;

-- ============================================================================
-- Verification Queries (run manually after migration)
-- ============================================================================
-- SELECT COUNT(*) FROM system_metrics_hourly;
-- SELECT * FROM slo_definitions;
-- SELECT * FROM service_status;
-- Test cardinality guard:
-- INSERT INTO system_metrics_hourly (hour, metric_name, dimensions, value)
--   VALUES (NOW(), 'test', '{"invalid_key": "value"}'::jsonb, 1); -- Should fail
