-- ============================================================================
-- Migration: 142_inhouse_advanced_support.sql
-- Purpose: Sprint 5 Advanced Support Features - Database Inspector, Impersonation, Replay
-- ============================================================================

BEGIN;

-- =============================================================================
-- 1) READ-ONLY ROLE FOR DATABASE INSPECTOR
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inhouse_admin_readonly') THEN
    -- Explicit security attributes to prevent any privilege escalation
    CREATE ROLE inhouse_admin_readonly WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION;
    -- Password set via ALTER ROLE in deployment scripts (not in migration)
    -- Consider: certificate auth or IAM auth if available
  END IF;
END $$;

-- Role-level safety defaults (defense-in-depth, doesn't replace SET LOCAL in app)
-- These reduce blast radius if app code forgets proper transaction setup
ALTER ROLE inhouse_admin_readonly SET default_transaction_read_only = on;
ALTER ROLE inhouse_admin_readonly SET statement_timeout = '5s';
ALTER ROLE inhouse_admin_readonly SET lock_timeout = '1s';
ALTER ROLE inhouse_admin_readonly SET idle_in_transaction_session_timeout = '5s';

-- Grant connect to current database (works across all environments)
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO inhouse_admin_readonly', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO inhouse_admin_readonly;

-- Grant SELECT on activity/usage tables for diagnostics
GRANT SELECT ON TABLE public.inhouse_activity_log TO inhouse_admin_readonly;
GRANT SELECT ON TABLE public.inhouse_usage_events TO inhouse_admin_readonly;

-- NOTE: Per-project schema grants happen at PROJECT CREATION TIME
-- in InhouseProjectService.createProject(), not dynamically at inspection time.
-- This avoids needing elevated privileges at runtime.

-- =============================================================================
-- 2) ADMIN QUERY AUDIT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_admin_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No FK to auth.users - preserves audit history if admin is deleted
  -- Admin email can be resolved at query time via JOIN if needed
  admin_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  schema_name TEXT NOT NULL,
  query_text TEXT NOT NULL,
  query_hash TEXT NOT NULL,  -- SHA256 of normalized query for deduplication
  result_rows INTEGER,
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  explain_plan JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_queries_admin
  ON inhouse_admin_queries(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_queries_project
  ON inhouse_admin_queries(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_queries_created
  ON inhouse_admin_queries(created_at);

-- =============================================================================
-- 3) IMPERSONATION SESSIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- No FK to auth.users - preserves audit history if admin/owner is deleted
  admin_id UUID NOT NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'ended', 'expired')),
  -- Tokens stored HASHED (HMAC-SHA256 with server secret), never plaintext
  confirmation_token_hash TEXT,
  session_token_hash TEXT,
  allowed_routes TEXT[] NOT NULL DEFAULT '{}',
  -- Binding for soft verification (log mismatches, don't block)
  bound_ip INET,
  bound_user_agent TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  end_reason TEXT  -- 'manual', 'expired', 'admin_logout', 'ip_mismatch'
);

-- Unique hashed confirmation token for pending sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_confirmation_hash
  ON inhouse_impersonation_sessions(confirmation_token_hash)
  WHERE confirmation_token_hash IS NOT NULL AND status = 'pending';

-- Unique hashed session token for active sessions
CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_session_hash
  ON inhouse_impersonation_sessions(session_token_hash)
  WHERE session_token_hash IS NOT NULL AND status = 'active';

-- Prevent concurrent active sessions per admin
CREATE UNIQUE INDEX IF NOT EXISTS idx_impersonation_one_active_per_admin
  ON inhouse_impersonation_sessions(admin_id)
  WHERE status IN ('pending', 'active');

-- Audit indexes
CREATE INDEX IF NOT EXISTS idx_impersonation_admin_created
  ON inhouse_impersonation_sessions(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_impersonation_project
  ON inhouse_impersonation_sessions(project_id);

-- For expiry sweeper
CREATE INDEX IF NOT EXISTS idx_impersonation_expires
  ON inhouse_impersonation_sessions(expires_at)
  WHERE status IN ('pending', 'active');

-- =============================================================================
-- 4) REQUEST REPLAY PAYLOADS (Separate storage with shorter TTL)
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_replay_payloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UNIQUE creates implicit index, no separate index needed
  correlation_id TEXT NOT NULL UNIQUE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  request_body JSONB,  -- Scrubbed body, max 8KB enforced at application level
  request_headers JSONB,  -- Only safe headers (content-type, locale)
  response_status INTEGER,
  response_body JSONB,  -- Truncated if > 8KB
  error_code TEXT,
  error_message TEXT,
  replayable BOOLEAN NOT NULL DEFAULT true,
  side_effects TEXT NOT NULL DEFAULT 'none' CHECK (side_effects IN ('none', 'low', 'high')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- TTL: 7-30 days, configurable via cleanup job
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '14 days'
);

CREATE INDEX IF NOT EXISTS idx_replay_payloads_project
  ON inhouse_replay_payloads(project_id, created_at DESC);

-- No idx_replay_payloads_correlation needed - UNIQUE constraint creates implicit index

-- For TTL cleanup (no WHERE predicate - expires_at is NOT NULL)
CREATE INDEX IF NOT EXISTS idx_replay_payloads_expires
  ON inhouse_replay_payloads(expires_at);

-- =============================================================================
-- 5) OBSERVABILITY CONFIG
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_observability_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tool TEXT NOT NULL UNIQUE CHECK (tool IN ('posthog', 'grafana', 'logs')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  dashboard_slug TEXT,
  project_filter_param TEXT,
  time_filter_param TEXT,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Base URLs come from env vars, not this table
INSERT INTO inhouse_observability_config (tool, project_filter_param, time_filter_param)
VALUES
  ('posthog', 'project_id', 'date_from'),
  ('grafana', 'var-project', 'from'),
  ('logs', 'project', 'start')
ON CONFLICT (tool) DO NOTHING;

-- =============================================================================
-- 6) REQUEST REPLAY AUDIT INDEX
-- =============================================================================

-- Replays logged to inhouse_admin_audit with action = 'request_replay'
-- Using IF NOT EXISTS - table guaranteed to exist from earlier migration
CREATE INDEX IF NOT EXISTS idx_admin_audit_replays
  ON inhouse_admin_audit(created_at DESC)
  WHERE action = 'request_replay';

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE inhouse_admin_queries IS
  'Audit log of admin database queries. Cleaned up by scheduled job after 90 days.';

COMMENT ON TABLE inhouse_impersonation_sessions IS
  'Tracks admin impersonation sessions. Tokens stored hashed with HMAC-SHA256.';

COMMENT ON TABLE inhouse_replay_payloads IS
  'Request payloads for replay feature. Shorter retention (7-30 days) than main audit log.';

COMMENT ON TABLE inhouse_observability_config IS
  'Configuration for external observability tool links. Base URLs from env vars.';

COMMIT;
