-- Migration: 118_connectors_rls_fix
-- Description: Fix RLS + view conflict and add additional constraints
-- Based on expert code review round 2
-- Created: 2026-01-26

-- ============================================================================
-- 1. FIX: Connectors view + RLS conflict (CRITICAL)
--
-- Problem: Views don't bypass RLS. If we drop authenticated SELECT policy,
-- the view returns zero rows because RLS is still enforced.
--
-- Solution: Keep RLS policy for row access, REVOKE column privileges for secrets.
-- ============================================================================

-- 1a) Re-create authenticated row access policy (allows row visibility)
DO $$
BEGIN
  ALTER TABLE inhouse_connections ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS inhouse_connections_user_policy ON inhouse_connections;
  CREATE POLICY inhouse_connections_user_policy ON inhouse_connections
    FOR SELECT
    TO authenticated
    USING (
      project_id IN (
        SELECT id FROM projects WHERE owner_id = auth.uid()
        UNION
        SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
      )
    );

  RAISE NOTICE 'Created inhouse_connections_user_policy for authenticated users';
EXCEPTION
  WHEN undefined_function THEN
    -- auth.uid() not available in non-Supabase environments
    RAISE NOTICE 'Skipping authenticated RLS policy: auth.uid() not available';
  WHEN others THEN
    RAISE NOTICE 'RLS policy creation failed: %', SQLERRM;
END $$;

-- 1b) Revoke SELECT on sensitive columns from authenticated
-- This prevents credential leakage while still allowing row access
DO $$
BEGIN
  -- Revoke sensitive column access
  REVOKE SELECT (encrypted_credentials, credentials_iv) ON inhouse_connections FROM authenticated;
  RAISE NOTICE 'Revoked SELECT on encrypted_credentials and credentials_iv from authenticated';
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Revoke skipped (role or columns not found): %', SQLERRM;
  WHEN others THEN
    RAISE NOTICE 'Revoke failed: %', SQLERRM;
END $$;

-- 1c) Ensure view exists and is granted to authenticated
-- The view provides a clean API without sensitive columns
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT ON inhouse_connections_public TO authenticated;
    RAISE NOTICE 'Granted SELECT on inhouse_connections_public to authenticated';
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    RAISE NOTICE 'Grant skipped (view or role not found): %', SQLERRM;
END $$;

-- ============================================================================
-- 2. JSON shape constraints (prevent invalid data)
-- ============================================================================

-- 2a) Flags rules must be an array
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_feature_flags_rules_is_array') THEN
    ALTER TABLE inhouse_feature_flags
      ADD CONSTRAINT inhouse_feature_flags_rules_is_array
      CHECK (rules IS NULL OR jsonb_typeof(rules) = 'array');
    RAISE NOTICE 'Added rules array constraint to inhouse_feature_flags';
  END IF;
END $$;

-- 2b) Connections metadata must be an object
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_connections_metadata_is_object') THEN
    ALTER TABLE inhouse_connections
      ADD CONSTRAINT inhouse_connections_metadata_is_object
      CHECK (metadata IS NULL OR jsonb_typeof(metadata) = 'object');
    RAISE NOTICE 'Added metadata object constraint to inhouse_connections';
  END IF;
END $$;

-- 2c) OAuth states state_data must be an object (if not null)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_oauth_states_state_data_is_object') THEN
    ALTER TABLE inhouse_oauth_states
      ADD CONSTRAINT inhouse_oauth_states_state_data_is_object
      CHECK (state_data IS NULL OR jsonb_typeof(state_data) = 'object');
    RAISE NOTICE 'Added state_data object constraint to inhouse_oauth_states';
  END IF;
END $$;

-- 2d) Set typed defaults explicitly
ALTER TABLE inhouse_feature_flags
  ALTER COLUMN rules SET DEFAULT '[]'::jsonb;

ALTER TABLE inhouse_connections
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

-- ============================================================================
-- 3. Connector type normalization (consistency with flags)
-- ============================================================================

CREATE OR REPLACE FUNCTION normalize_inhouse_connector_type()
RETURNS TRIGGER AS $$
BEGIN
  NEW.connector_type = lower(trim(NEW.connector_type));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_inhouse_connections_connector_type_normalize') THEN
    CREATE TRIGGER trigger_inhouse_connections_connector_type_normalize
      BEFORE INSERT OR UPDATE OF connector_type ON inhouse_connections
      FOR EACH ROW EXECUTE FUNCTION normalize_inhouse_connector_type();
    RAISE NOTICE 'Created connector_type normalization trigger on inhouse_connections';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_inhouse_oauth_states_connector_type_normalize') THEN
    CREATE TRIGGER trigger_inhouse_oauth_states_connector_type_normalize
      BEFORE INSERT OR UPDATE OF connector_type ON inhouse_oauth_states
      FOR EACH ROW EXECUTE FUNCTION normalize_inhouse_connector_type();
    RAISE NOTICE 'Created connector_type normalization trigger on inhouse_oauth_states';
  END IF;
END $$;

-- ============================================================================
-- 4. OAuth state TTL: align to 10 minutes (not 15)
-- ============================================================================

-- 4a) Drop the 15-minute constraint if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_oauth_states_ttl') THEN
    ALTER TABLE inhouse_oauth_states DROP CONSTRAINT inhouse_oauth_states_ttl;
    RAISE NOTICE 'Dropped old TTL constraint';
  END IF;
END $$;

-- 4b) Add expires_at > created_at constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_oauth_states_expires_after_created') THEN
    ALTER TABLE inhouse_oauth_states
      ADD CONSTRAINT inhouse_oauth_states_expires_after_created
      CHECK (expires_at > created_at);
    RAISE NOTICE 'Added expires_at > created_at constraint';
  END IF;
END $$;

-- 4c) Add 10-minute TTL constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_oauth_states_ttl_10min') THEN
    ALTER TABLE inhouse_oauth_states
      ADD CONSTRAINT inhouse_oauth_states_ttl_10min
      CHECK (expires_at <= created_at + INTERVAL '10 minutes');
    RAISE NOTICE 'Added 10-minute TTL constraint';
  END IF;
END $$;

-- ============================================================================
-- Summary:
--
-- CRITICAL FIX:
--   - Re-created authenticated RLS policy on inhouse_connections (row access)
--   - Revoked SELECT on encrypted_credentials, credentials_iv from authenticated
--   - View now works correctly (RLS allows rows, columns are hidden)
--
-- JSON CONSTRAINTS:
--   - rules must be array
--   - metadata must be object
--   - state_data must be object
--   - Typed defaults set explicitly
--
-- NORMALIZATION:
--   - connector_type auto-lowercased and trimmed on insert/update
--
-- TTL FIX:
--   - OAuth states: expires_at must be > created_at and <= created_at + 10min
-- ============================================================================
