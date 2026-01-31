-- =============================================================================
-- Migration: 115_inhouse_admin_hardening.sql
-- Purpose: Security hardening and data integrity for In-House Mode admin tables
-- Based on expert code review - addresses SECURITY DEFINER, CHECK constraints,
-- triggers, privileges, and indexing improvements.
-- =============================================================================

-- =============================================================================
-- 1) SECURITY DEFINER FUNCTIONS: Pin search_path + EXECUTE grants
-- Without search_path, attackers could hijack function calls via path manipulation.
-- =============================================================================

-- Recreate log_inhouse_admin_action with pinned search_path
CREATE OR REPLACE FUNCTION log_inhouse_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_project_id UUID DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO inhouse_admin_audit (
    admin_id, action, project_id, resource_type, resource_id,
    reason, metadata, ip_address, user_agent
  ) VALUES (
    p_admin_id, p_action, p_project_id, p_resource_type, p_resource_id,
    p_reason, p_metadata, p_ip_address, p_user_agent
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Recreate log_inhouse_activity with pinned search_path
CREATE OR REPLACE FUNCTION log_inhouse_activity(
  p_project_id UUID,
  p_service TEXT,
  p_action TEXT,
  p_status TEXT DEFAULT 'success',
  p_correlation_id TEXT DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'system',
  p_actor_id TEXT DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO inhouse_activity_log (
    project_id, service, action, status, correlation_id,
    actor_type, actor_id, resource_type, resource_id,
    metadata, duration_ms, error_code
  ) VALUES (
    p_project_id, p_service, p_action, p_status, p_correlation_id,
    p_actor_type, p_actor_id, p_resource_type, p_resource_id,
    p_metadata, p_duration_ms, p_error_code
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Revoke public access to these functions (only service_role should execute)
DO $$
BEGIN
  -- Only revoke if the functions exist (avoid errors if tables not yet created)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_inhouse_admin_action') THEN
    REVOKE ALL ON FUNCTION log_inhouse_admin_action(UUID,TEXT,UUID,TEXT,TEXT,TEXT,JSONB,INET,TEXT) FROM PUBLIC;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_inhouse_activity') THEN
    REVOKE ALL ON FUNCTION log_inhouse_activity(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INTEGER,TEXT) FROM PUBLIC;
  END IF;
END $$;

-- Grant execute only to service_role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_inhouse_admin_action') THEN
      GRANT EXECUTE ON FUNCTION log_inhouse_admin_action(UUID,TEXT,UUID,TEXT,TEXT,TEXT,JSONB,INET,TEXT) TO service_role;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'log_inhouse_activity') THEN
      GRANT EXECUTE ON FUNCTION log_inhouse_activity(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,INTEGER,TEXT) TO service_role;
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 2) CHECK CONSTRAINTS: Data integrity enforcement
-- =============================================================================

-- inhouse_usage_events: enforce actor rules
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_usage_events') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_usage_actor_type_check') THEN
      ALTER TABLE inhouse_usage_events
        ADD CONSTRAINT inhouse_usage_actor_type_check
        CHECK (actor_type IN ('system', 'admin'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_usage_admin_requires_reason') THEN
      ALTER TABLE inhouse_usage_events
        ADD CONSTRAINT inhouse_usage_admin_requires_reason
        CHECK (
          (actor_type = 'system' AND actor_id IS NULL)
          OR
          (actor_type = 'admin' AND actor_id IS NOT NULL AND reason IS NOT NULL AND length(trim(reason)) > 0)
        );
    END IF;
  END IF;
END $$;

-- inhouse_quota_overrides: sanity checks
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_quota_overrides') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_quota_metric_check') THEN
      ALTER TABLE inhouse_quota_overrides
        ADD CONSTRAINT inhouse_quota_metric_check
        CHECK (metric IN ('storage_bytes', 'email_sends', 'job_runs'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_quota_limits_check') THEN
      ALTER TABLE inhouse_quota_overrides
        ADD CONSTRAINT inhouse_quota_limits_check
        CHECK (original_limit >= 0 AND new_limit >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_quota_expires_after_create') THEN
      ALTER TABLE inhouse_quota_overrides
        ADD CONSTRAINT inhouse_quota_expires_after_create
        CHECK (expires_at IS NULL OR expires_at > created_at);
    END IF;
  END IF;
END $$;

-- inhouse_alert_rules: validate enums
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_alert_rules') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_alert_condition_check') THEN
      ALTER TABLE inhouse_alert_rules
        ADD CONSTRAINT inhouse_alert_condition_check
        CHECK (condition IN ('gt', 'lt', 'eq'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_alert_window_check') THEN
      ALTER TABLE inhouse_alert_rules
        ADD CONSTRAINT inhouse_alert_window_check
        CHECK (window_minutes > 0 AND window_minutes <= 1440);
    END IF;

    -- Validate channels is an array
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_alert_channels_is_array') THEN
      ALTER TABLE inhouse_alert_rules
        ADD CONSTRAINT inhouse_alert_channels_is_array
        CHECK (jsonb_typeof(channels) = 'array');
    END IF;
  END IF;
END $$;

-- inhouse_alerts: severity check
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_alerts') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_alert_severity_check') THEN
      ALTER TABLE inhouse_alerts
        ADD CONSTRAINT inhouse_alert_severity_check
        CHECK (severity IN ('info', 'warning', 'critical'));
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 3) UPDATED_AT TRIGGER: Auto-update timestamp on changes
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_alert_rules') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_inhouse_alert_rules_updated_at'
    ) THEN
      CREATE TRIGGER trg_inhouse_alert_rules_updated_at
        BEFORE UPDATE ON inhouse_alert_rules
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    END IF;
  END IF;
END $$;

-- =============================================================================
-- 4) PRIVILEGES: Defense in depth - explicit REVOKE/GRANT
-- Admin-only tables get no anon/authenticated access
-- Owner-visible tables get SELECT only (writes via service_role)
-- =============================================================================

DO $$
BEGIN
  -- Admin-only tables: no direct client access
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_admin_audit') THEN
    REVOKE ALL ON inhouse_admin_audit FROM anon, authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_alert_rules') THEN
    REVOKE ALL ON inhouse_alert_rules FROM anon, authenticated;
  END IF;

  -- Owner-visible tables: allow SELECT (RLS filters), block writes from clients
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_activity_log') THEN
    GRANT SELECT ON inhouse_activity_log TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON inhouse_activity_log FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_usage_events') THEN
    GRANT SELECT ON inhouse_usage_events TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON inhouse_usage_events FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_quota_overrides') THEN
    GRANT SELECT ON inhouse_quota_overrides TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON inhouse_quota_overrides FROM authenticated;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'inhouse_alerts') THEN
    GRANT SELECT ON inhouse_alerts TO authenticated;
    REVOKE INSERT, UPDATE, DELETE ON inhouse_alerts FROM authenticated;
  END IF;
END $$;

-- =============================================================================
-- 5) BRIN INDEX: Efficient indexing for append-only time-series data
-- BRIN indexes are tiny compared to B-tree for sequential timestamp columns.
-- =============================================================================

CREATE INDEX IF NOT EXISTS brin_inhouse_activity_created_at
  ON inhouse_activity_log USING brin (created_at);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON FUNCTION log_inhouse_admin_action IS
  'SECURITY DEFINER helper to log admin actions. search_path pinned to prevent hijacking.';
COMMENT ON FUNCTION log_inhouse_activity IS
  'SECURITY DEFINER helper to log service activity. search_path pinned to prevent hijacking.';
