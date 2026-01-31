-- Migration: 101_admin_panel_fixes.sql
-- Fixes for admin panel migrations (097, 098, 100)
--
-- Issues addressed:
-- 1. CRITICAL: NOW() in partial index (097) - will fail at creation
-- 2. CRITICAL: duration_minutes stale for open incidents (098)
-- 3. CRITICAL: Feature flags RLS allows everyone (100)
-- 4. Audit table not append-only (100)
-- 5. Dimension guard only on INSERT (097)
-- 6. Missing JSONB type checks (097, 098)
-- 7. RLS disabled on admin tables (097, 098)

BEGIN;

-- ============================================================================
-- FIX 1: Remove NOW() partial index (097)
-- ============================================================================
-- NOW() is STABLE, not IMMUTABLE - partial index with NOW() will fail.
-- Replace with simple index; time filtering happens in queries anyway.

DROP INDEX IF EXISTS idx_metrics_recent;

-- Use BRIN for time-series data (much smaller, good for range scans)
CREATE INDEX IF NOT EXISTS idx_metrics_hour_brin
  ON system_metrics_hourly USING BRIN(hour);

-- ============================================================================
-- FIX 2: Fix duration_minutes for open incidents (098)
-- ============================================================================
-- STORED generated columns compute at write time, not read time.
-- For open incidents, NOW() is captured at insert and never updates.
-- Solution: Only compute duration for resolved incidents, NULL otherwise.

-- Drop and recreate the column with correct definition
ALTER TABLE incidents DROP COLUMN IF EXISTS duration_minutes;
ALTER TABLE incidents ADD COLUMN duration_minutes INT GENERATED ALWAYS AS (
  CASE
    WHEN resolved_at IS NULL THEN NULL
    ELSE EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60
  END
) STORED;

COMMENT ON COLUMN incidents.duration_minutes IS 'Duration in minutes. Only computed for resolved incidents; use NOW() - created_at for live duration of open incidents.';

-- ============================================================================
-- FIX 3: Fix feature_flags RLS (100)
-- ============================================================================
-- USING(true) with FORCE ROW LEVEL SECURITY means anyone with SELECT
-- privilege can read. Change to deny-all pattern (service role bypasses).

-- Drop the permissive policies
DROP POLICY IF EXISTS admin_feature_flags_all ON feature_flags;
DROP POLICY IF EXISTS admin_feature_flag_audit_all ON feature_flag_audit;

-- Create deny-all policies (service role bypasses RLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'feature_flags_deny_all' AND polrelid = 'feature_flags'::regclass) THEN
    CREATE POLICY feature_flags_deny_all ON feature_flags
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'feature_flag_audit_deny_all' AND polrelid = 'feature_flag_audit'::regclass) THEN
    CREATE POLICY feature_flag_audit_deny_all ON feature_flag_audit
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- ============================================================================
-- FIX 4: Add audit table append-only enforcement (100)
-- ============================================================================
-- feature_flag_audit should be immutable like incident_timeline.

CREATE OR REPLACE FUNCTION deny_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'feature_flag_audit is append-only. Audit records cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_audit_update'
    AND tgrelid = 'feature_flag_audit'::regclass
  ) THEN
    CREATE TRIGGER prevent_audit_update
      BEFORE UPDATE ON feature_flag_audit
      FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_audit_delete'
    AND tgrelid = 'feature_flag_audit'::regclass
  ) THEN
    CREATE TRIGGER prevent_audit_delete
      BEFORE DELETE ON feature_flag_audit
      FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();
  END IF;
END $$;

-- ============================================================================
-- FIX 5: Add UPDATE to dimension guard trigger (097)
-- ============================================================================
-- Someone could UPDATE dimensions to bypass the allowlist check.

-- Drop old trigger
DROP TRIGGER IF EXISTS enforce_metric_dimension_keys ON system_metrics_hourly;

-- Create trigger for both INSERT and UPDATE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'enforce_metric_dimension_keys'
    AND tgrelid = 'system_metrics_hourly'::regclass
  ) THEN
    CREATE TRIGGER enforce_metric_dimension_keys
      BEFORE INSERT OR UPDATE OF dimensions ON system_metrics_hourly
      FOR EACH ROW EXECUTE FUNCTION check_metric_dimensions();
  END IF;
END $$;

-- ============================================================================
-- FIX 6: Add JSONB type checks (097, 098)
-- ============================================================================
-- jsonb_object_keys() errors on arrays/strings. Add CHECK constraints.

-- 6a: system_metrics_hourly.dimensions must be object
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_metrics_dimensions_is_object'
  ) THEN
    ALTER TABLE system_metrics_hourly
    ADD CONSTRAINT chk_metrics_dimensions_is_object
    CHECK (jsonb_typeof(dimensions) = 'object');
  END IF;
END $$;

-- 6b: alert_rules.dimensions must be object
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_alert_dimensions_is_object'
  ) THEN
    ALTER TABLE alert_rules
    ADD CONSTRAINT chk_alert_dimensions_is_object
    CHECK (jsonb_typeof(dimensions) = 'object');
  END IF;
END $$;

-- 6c: alert_rules.channels must be array
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_alert_channels_is_array'
  ) THEN
    ALTER TABLE alert_rules
    ADD CONSTRAINT chk_alert_channels_is_array
    CHECK (jsonb_typeof(channels) = 'array');
  END IF;
END $$;

-- 6d: alerts_fired.firing_dimensions must be object
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_fired_dimensions_is_object'
  ) THEN
    ALTER TABLE alerts_fired
    ADD CONSTRAINT chk_fired_dimensions_is_object
    CHECK (jsonb_typeof(firing_dimensions) = 'object');
  END IF;
END $$;

-- ============================================================================
-- FIX 7: Standardize RLS to deny-all pattern (097, 098)
-- ============================================================================
-- Enable RLS with deny-all policies. Service role bypasses automatically.

-- 7a: system_metrics_hourly
ALTER TABLE system_metrics_hourly ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'metrics_deny_all' AND polrelid = 'system_metrics_hourly'::regclass) THEN
    CREATE POLICY metrics_deny_all ON system_metrics_hourly
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 7b: slo_definitions
ALTER TABLE slo_definitions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'slo_deny_all' AND polrelid = 'slo_definitions'::regclass) THEN
    CREATE POLICY slo_deny_all ON slo_definitions
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 7c: service_status
ALTER TABLE service_status ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'service_status_deny_all' AND polrelid = 'service_status'::regclass) THEN
    CREATE POLICY service_status_deny_all ON service_status
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 7d: incidents
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'incidents_deny_all' AND polrelid = 'incidents'::regclass) THEN
    CREATE POLICY incidents_deny_all ON incidents
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 7e: incident_timeline
ALTER TABLE incident_timeline ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'incident_timeline_deny_all' AND polrelid = 'incident_timeline'::regclass) THEN
    CREATE POLICY incident_timeline_deny_all ON incident_timeline
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 7f: incident_postmortems
ALTER TABLE incident_postmortems ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'postmortems_deny_all' AND polrelid = 'incident_postmortems'::regclass) THEN
    CREATE POLICY postmortems_deny_all ON incident_postmortems
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 7g: alert_rules
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alert_rules_deny_all' AND polrelid = 'alert_rules'::regclass) THEN
    CREATE POLICY alert_rules_deny_all ON alert_rules
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- 7h: alerts_fired
ALTER TABLE alerts_fired ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'alerts_fired_deny_all' AND polrelid = 'alerts_fired'::regclass) THEN
    CREATE POLICY alerts_fired_deny_all ON alerts_fired
      FOR ALL
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================

ANALYZE system_metrics_hourly;
ANALYZE incidents;
ANALYZE feature_flags;
ANALYZE feature_flag_audit;

COMMIT;

-- ============================================================================
-- Verification Queries (run manually after migration)
-- ============================================================================
-- Check BRIN index exists:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'system_metrics_hourly';
--
-- Check duration_minutes is NULL for open incidents:
-- SELECT id, status, duration_minutes FROM incidents WHERE status != 'resolved' LIMIT 5;
--
-- Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public' AND tablename IN ('system_metrics_hourly', 'feature_flags', 'incidents');
--
-- Test append-only on audit:
-- INSERT INTO feature_flag_audit (flag_name, action, reason) VALUES ('test', 'test', 'test');
-- UPDATE feature_flag_audit SET action = 'modified' WHERE flag_name = 'test'; -- Should fail
