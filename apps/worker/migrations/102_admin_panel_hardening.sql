-- Migration: 102_admin_panel_hardening.sql
-- Additional hardening for admin panel tables
--
-- Issues addressed:
-- 1. Add FORCE ROW LEVEL SECURITY to all admin tables (table owner bypass)
-- 2. Add hour bucket enforcement CHECK constraint
-- 3. Add dimension size guards (max key count, max JSON length)
-- 4. Fix constraint existence checks to include conrelid

BEGIN;

-- ============================================================================
-- FIX 1: Add FORCE ROW LEVEL SECURITY to all admin tables
-- ============================================================================
-- ENABLE RLS alone doesn't prevent table owner from bypassing.
-- FORCE RLS ensures even the table owner must comply with policies.
-- In Supabase, the postgres role is often the table owner.

ALTER TABLE system_metrics_hourly FORCE ROW LEVEL SECURITY;
ALTER TABLE slo_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE service_status FORCE ROW LEVEL SECURITY;
ALTER TABLE incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE incident_timeline FORCE ROW LEVEL SECURITY;
ALTER TABLE incident_postmortems FORCE ROW LEVEL SECURITY;
ALTER TABLE alert_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts_fired FORCE ROW LEVEL SECURITY;
-- feature_flags and feature_flag_audit already have FORCE from migration 100

-- ============================================================================
-- FIX 2: Add hour bucket enforcement CHECK constraint
-- ============================================================================
-- Ensures hour column is actually an hour bucket, not arbitrary timestamp.
-- Prevents data integrity issues with unique constraints and rollup semantics.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_metrics_hour_bucket'
      AND conrelid = 'system_metrics_hourly'::regclass
  ) THEN
    ALTER TABLE system_metrics_hourly
    ADD CONSTRAINT chk_metrics_hour_bucket
    CHECK (hour = date_trunc('hour', hour));
  END IF;
END $$;

-- ============================================================================
-- FIX 3: Add dimension size guards to check_metric_dimensions()
-- ============================================================================
-- Existing trigger validates allowed keys but not payload size.
-- This prevents "dimension payload DoS" with huge values.

CREATE OR REPLACE FUNCTION check_metric_dimensions()
RETURNS TRIGGER AS $$
DECLARE
  allowed_keys TEXT[] := ARRAY[
    'route',        -- Normalized API route (e.g., '/api/users/:id')
    'status_code',  -- HTTP status code category
    'provider',     -- External provider (stripe, supabase, etc.)
    'queue',        -- Job queue name
    'plan',         -- Subscription plan
    'status',       -- Generic status (success, failed, etc.)
    'type',         -- Generic type discriminator
    'service'       -- Service name
  ];
  actual_keys TEXT[];
  dimensions_text TEXT;
  key_count INT;
BEGIN
  -- Allow empty/null dimensions
  IF NEW.dimensions IS NULL OR NEW.dimensions = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- Ensure dimensions is an object (redundant with CHECK constraint but defensive)
  IF jsonb_typeof(NEW.dimensions) != 'object' THEN
    RAISE EXCEPTION 'dimensions must be a JSON object, got %', jsonb_typeof(NEW.dimensions);
  END IF;

  -- Check key count (max 8 keys)
  key_count := (SELECT COUNT(*) FROM jsonb_object_keys(NEW.dimensions));
  IF key_count > 8 THEN
    RAISE EXCEPTION 'Too many dimension keys (max 8, got %)', key_count;
  END IF;

  -- Check total JSON size (max 2KB to prevent bloat)
  dimensions_text := NEW.dimensions::text;
  IF length(dimensions_text) > 2048 THEN
    RAISE EXCEPTION 'Dimensions too large (max 2048 bytes, got %)', length(dimensions_text);
  END IF;

  -- Extract and validate keys are in allowlist
  SELECT array_agg(key) INTO actual_keys
  FROM jsonb_object_keys(NEW.dimensions) AS key;

  IF NOT (actual_keys <@ allowed_keys) THEN
    RAISE EXCEPTION 'Invalid metric dimension key. Allowed: %. Got: %',
      allowed_keys, actual_keys;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX 4: Fix constraint existence checks to include conrelid
-- ============================================================================
-- The constraints in 101 only checked by name. Re-check and add if missing
-- with proper table scoping.

-- 4a: system_metrics_hourly.dimensions must be object (re-verify with conrelid)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_metrics_dimensions_is_object'
      AND conrelid = 'system_metrics_hourly'::regclass
  ) THEN
    -- Check if constraint exists but wasn't found due to schema issues
    BEGIN
      ALTER TABLE system_metrics_hourly
      ADD CONSTRAINT chk_metrics_dimensions_is_object
      CHECK (jsonb_typeof(dimensions) = 'object');
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
      NULL;
    END;
  END IF;
END $$;

-- 4b: alert_rules.dimensions must be object
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_alert_dimensions_is_object'
      AND conrelid = 'alert_rules'::regclass
  ) THEN
    BEGIN
      ALTER TABLE alert_rules
      ADD CONSTRAINT chk_alert_dimensions_is_object
      CHECK (jsonb_typeof(dimensions) = 'object');
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- 4c: alert_rules.channels must be array
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_alert_channels_is_array'
      AND conrelid = 'alert_rules'::regclass
  ) THEN
    BEGIN
      ALTER TABLE alert_rules
      ADD CONSTRAINT chk_alert_channels_is_array
      CHECK (jsonb_typeof(channels) = 'array');
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- 4d: alerts_fired.firing_dimensions must be object
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_fired_dimensions_is_object'
      AND conrelid = 'alerts_fired'::regclass
  ) THEN
    BEGIN
      ALTER TABLE alerts_fired
      ADD CONSTRAINT chk_fired_dimensions_is_object
      CHECK (jsonb_typeof(firing_dimensions) = 'object');
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- Documentation: RLS and helper functions
-- ============================================================================
-- Note: The helper functions get_metric_avg() and get_slo_compliance() from
-- migration 097 read from tables with deny-all RLS policies.
--
-- These functions work correctly because:
-- 1. They are called server-side from the worker using service role
-- 2. Service role bypasses RLS by design
--
-- If you ever need to expose these via client-side RPC:
-- - Option A: Make them SECURITY DEFINER with safe search_path
-- - Option B: Create admin-role-specific RLS policies
-- - Option C: Create wrapper API endpoints in the worker (current approach)

COMMIT;

-- ============================================================================
-- Verification Queries (run manually after migration)
-- ============================================================================
-- Check FORCE RLS is enabled:
-- SELECT tablename, rowsecurity, forcerowsecurity
-- FROM pg_tables t
-- JOIN pg_class c ON t.tablename = c.relname
-- WHERE t.schemaname = 'public'
--   AND t.tablename IN ('system_metrics_hourly', 'incidents', 'feature_flags');
--
-- Test hour bucket constraint:
-- INSERT INTO system_metrics_hourly (hour, metric_name, value)
--   VALUES ('2026-01-09 12:37:00', 'test', 1); -- Should fail
-- INSERT INTO system_metrics_hourly (hour, metric_name, value)
--   VALUES ('2026-01-09 12:00:00', 'test', 1); -- Should succeed
--
-- Test dimension size guard:
-- INSERT INTO system_metrics_hourly (hour, metric_name, dimensions, value)
--   VALUES (date_trunc('hour', NOW()), 'test',
--     jsonb_build_object('route', repeat('x', 3000))::jsonb, 1); -- Should fail
