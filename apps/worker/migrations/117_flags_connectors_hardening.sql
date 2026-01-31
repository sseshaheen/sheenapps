-- Migration: 117_flags_connectors_hardening
-- Description: Security and integrity hardening for flags and connectors tables
-- Based on expert code review feedback
-- Created: 2026-01-26

-- ============================================================================
-- 1. FEATURE FLAGS: Key normalization + format constraints
-- ============================================================================

-- 1a) Enforce lowercase alphanumeric + underscore/hyphen format
-- This prevents "Flag Key Drift" (NewUI vs new_ui vs new-ui)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_feature_flags_key_format'
  ) THEN
    ALTER TABLE inhouse_feature_flags
      ADD CONSTRAINT inhouse_feature_flags_key_format
      CHECK (key ~ '^[a-z][a-z0-9_-]{0,99}$');
  END IF;
END $$;

-- 1b) Auto-normalize keys to lowercase on insert/update
CREATE OR REPLACE FUNCTION normalize_inhouse_flag_key()
RETURNS TRIGGER AS $$
BEGIN
  NEW.key = lower(NEW.key);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_inhouse_flags_key_normalize'
  ) THEN
    CREATE TRIGGER trigger_inhouse_flags_key_normalize
      BEFORE INSERT OR UPDATE OF key ON inhouse_feature_flags
      FOR EACH ROW
      EXECUTE FUNCTION normalize_inhouse_flag_key();
  END IF;
END $$;

-- ============================================================================
-- 2. FEATURE FLAGS OVERRIDES: Composite FK for project integrity
-- ============================================================================

-- 2a) Create unique index on (id, project_id) for composite FK reference
CREATE UNIQUE INDEX IF NOT EXISTS uq_inhouse_feature_flags_id_project
  ON inhouse_feature_flags (id, project_id);

-- 2b) Drop existing FK and add composite FK
-- This ensures flag_id must belong to the same project_id
DO $$
BEGIN
  -- Drop existing simple FK if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_flag_overrides_flag_id_fkey'
  ) THEN
    ALTER TABLE inhouse_flag_overrides
      DROP CONSTRAINT inhouse_flag_overrides_flag_id_fkey;
  END IF;

  -- Add composite FK if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inhouse_flag_overrides_flag_project_fkey'
  ) THEN
    ALTER TABLE inhouse_flag_overrides
      ADD CONSTRAINT inhouse_flag_overrides_flag_project_fkey
      FOREIGN KEY (flag_id, project_id)
      REFERENCES inhouse_feature_flags (id, project_id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 2c) Enforce expires_at is after created_at (if set)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_flag_overrides_expires_future'
  ) THEN
    ALTER TABLE inhouse_flag_overrides
      ADD CONSTRAINT inhouse_flag_overrides_expires_future
      CHECK (expires_at IS NULL OR expires_at > created_at);
  END IF;
END $$;

-- NOTE: We intentionally do NOT create a partial index with NOW() because
-- PostgreSQL doesn't allow non-immutable functions in partial index predicates.
-- The existing idx_inhouse_flag_overrides_expires index is sufficient.

-- ============================================================================
-- 3. CONNECTORS: Security hardening - redacted view for authenticated users
-- ============================================================================

-- 3a) Create a redacted view that excludes sensitive credential columns
CREATE OR REPLACE VIEW inhouse_connections_public AS
SELECT
  id,
  project_id,
  connector_type,
  display_name,
  external_account_id,
  status,
  scopes,
  metadata,
  connected_at,
  expires_at,
  created_at,
  updated_at
FROM inhouse_connections;

COMMENT ON VIEW inhouse_connections_public IS
  'Public view of connections without sensitive credential data. Use this for authenticated user access.';

-- 3b) Connector type format constraints (prevent trailing spaces, weird chars)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_connections_connector_type_format'
  ) THEN
    ALTER TABLE inhouse_connections
      ADD CONSTRAINT inhouse_connections_connector_type_format
      CHECK (connector_type ~ '^[a-z][a-z0-9_-]{0,49}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_oauth_states_connector_type_format'
  ) THEN
    ALTER TABLE inhouse_oauth_states
      ADD CONSTRAINT inhouse_oauth_states_connector_type_format
      CHECK (connector_type ~ '^[a-z][a-z0-9_-]{0,49}$');
  END IF;
END $$;

-- 3c) OAuth state: enforce TTL is within 10 minutes of creation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_oauth_states_ttl'
  ) THEN
    ALTER TABLE inhouse_oauth_states
      ADD CONSTRAINT inhouse_oauth_states_ttl
      CHECK (expires_at <= created_at + INTERVAL '15 minutes');
  END IF;
END $$;

-- ============================================================================
-- 4. RLS POLICY UPDATES: More specific exception handling
-- ============================================================================

-- 4a) Update flags RLS with better exception handling
DO $$
BEGIN
  -- Remove overly permissive authenticated policies on raw connector tables
  -- (The view should be used for authenticated access instead)
  DROP POLICY IF EXISTS inhouse_connections_user_policy ON inhouse_connections;
  DROP POLICY IF EXISTS inhouse_oauth_states_user_policy ON inhouse_oauth_states;

  RAISE NOTICE 'Removed authenticated SELECT policies from raw connector tables (use view instead)';

EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'RLS policy cleanup skipped (policy does not exist): %', SQLERRM;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'RLS policy cleanup skipped (insufficient privilege): %', SQLERRM;
END $$;

-- 4b) Grant SELECT on the public view to authenticated users
DO $$
BEGIN
  -- Only grant if the role exists
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON inhouse_connections_public TO authenticated;
    RAISE NOTICE 'Granted SELECT on inhouse_connections_public to authenticated';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Grant skipped (role does not exist): %', SQLERRM;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Grant skipped (insufficient privilege): %', SQLERRM;
END $$;

-- ============================================================================
-- 5. ADDITIONAL SAFETY: Default UUID for OAuth states
-- ============================================================================

-- The service already generates UUIDs, but this is belt-and-suspenders
ALTER TABLE inhouse_oauth_states
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- ============================================================================
-- Summary of changes:
--
-- FLAGS:
--   - Key normalized to lowercase automatically
--   - Key format constraint (^[a-z][a-z0-9_-]{0,99}$)
--   - Composite FK ensures overrides reference flags in same project
--   - expires_at must be after created_at
--
-- CONNECTORS:
--   - inhouse_connections_public view (excludes encrypted credentials)
--   - Removed authenticated SELECT on raw tables (use view instead)
--   - connector_type format constraint (^[a-z][a-z0-9_-]{0,49}$)
--   - OAuth state TTL constraint (max 15 min)
--   - OAuth state id defaults to random UUID
-- ============================================================================
