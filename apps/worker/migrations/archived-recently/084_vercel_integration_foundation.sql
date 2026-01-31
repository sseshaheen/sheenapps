-- Migration: 084_vercel_integration_foundation.sql
-- Purpose: Add Vercel integration support with OAuth, project mappings, and deployment tracking
-- Author: SheenApps
-- Date: 2025-09-08

BEGIN;

-- =============================================================================
-- 0. CREATE ENUMS FOR TYPE SAFETY
-- =============================================================================
DO $$ BEGIN
  CREATE TYPE vercel_deploy_state AS ENUM ('QUEUED','INITIALIZING','BUILDING','READY','ERROR','CANCELED');
  CREATE TYPE vercel_deploy_type AS ENUM ('PREVIEW','PRODUCTION');
  CREATE TYPE vercel_env_target AS ENUM ('production','preview','development');
  CREATE TYPE vercel_connection_status AS ENUM ('connected','disconnected','error','revoked','expired');
  CREATE TYPE vercel_environment AS ENUM ('production','preview','development','staging');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 1. VERCEL CONNECTIONS TABLE
-- =============================================================================
-- Stores authenticated Vercel connections for users/teams
CREATE TABLE IF NOT EXISTS vercel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  integration_connection_id UUID, -- Future FK to unified platform
  
  -- Vercel account information
  team_id VARCHAR(255),
  team_name VARCHAR(255),
  account_type VARCHAR(50) CHECK (account_type IN ('personal', 'team')),
  installation_id VARCHAR(255),
  user_email VARCHAR(255),
  
  -- OAuth tokens (encrypted with GCM auth tags)
  access_token TEXT NOT NULL CHECK (char_length(access_token) > 0),
  access_token_iv VARCHAR(255) NOT NULL,
  access_token_auth_tag VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  refresh_token_iv VARCHAR(255),
  refresh_token_auth_tag VARCHAR(255),
  token_expires_at TIMESTAMPTZ,
  
  -- Permissions and metadata
  scopes TEXT[],
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Status tracking with enum
  status vercel_connection_status DEFAULT 'connected',
  error_message TEXT,
  
  -- Circuit breaker state
  circuit_breaker_state JSONB DEFAULT '{"consecutive_failures": 0, "is_open": false, "last_failure_at": null, "open_until": null}'::JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ
  
  -- Note: Unique constraints handled by partial indexes below due to NULL team_id handling
);

-- =============================================================================
-- 2. VERCEL PROJECT MAPPINGS TABLE
-- =============================================================================
-- Maps local projects to Vercel projects
CREATE TABLE IF NOT EXISTS vercel_project_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vercel_connection_id UUID NOT NULL REFERENCES vercel_connections(id) ON DELETE CASCADE,
  
  -- Vercel project details
  vercel_project_id VARCHAR(255) NOT NULL,
  vercel_project_name VARCHAR(255),
  
  -- Build configuration
  framework VARCHAR(100),
  node_version VARCHAR(50),
  build_command TEXT,
  output_directory VARCHAR(255),
  install_command TEXT,
  dev_command TEXT,
  root_directory VARCHAR(255),
  
  -- Deployment settings with enum array
  environment_target vercel_env_target[],
  auto_deploy BOOLEAN DEFAULT true,
  deployment_hooks_enabled BOOLEAN DEFAULT false,
  deployment_branch_patterns TEXT[], -- e.g., ['main', 'develop', 'feature/*']
  git_repository JSONB, -- {type: 'github', repo: 'owner/repo', branch: 'main'}
  
  -- Additional configuration
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Prevent same Vercel project linked via multiple connections
  CONSTRAINT unique_project_vercel_mapping UNIQUE(project_id, vercel_project_id),
  CONSTRAINT unique_vercel_project_per_connection UNIQUE(vercel_connection_id, vercel_project_id)
);

-- =============================================================================
-- 3. VERCEL DEPLOYMENTS TABLE (with partitioning ready)
-- =============================================================================
-- Tracks deployment history and status (partitioned)
CREATE TABLE IF NOT EXISTS vercel_deployments (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  vercel_project_mapping_id UUID REFERENCES vercel_project_mappings(id) ON DELETE SET NULL,
  
  -- Deployment identifiers
  deployment_id VARCHAR(255) NOT NULL,
  deployment_url TEXT,
  alias_urls TEXT[], -- Production aliases
  
  -- Deployment status with enums
  deployment_state vercel_deploy_state NOT NULL DEFAULT 'QUEUED',
  deployment_type vercel_deploy_type NOT NULL,
  
  -- Source information with structured git data
  created_by VARCHAR(255),
  git_source JSONB NOT NULL DEFAULT '{}'::JSONB, -- {provider: 'github'|'gitlab'|'bitbucket', org, repo, branch, commitSha, commitMsg, prNumber?}
  
  correlation_id VARCHAR(36), -- Request tracing across OAuth/API/webhooks
  
  -- Build information
  build_logs_url TEXT,
  environment vercel_environment,
  runtime_version VARCHAR(50),
  build_duration_ms INT,
  
  -- Error tracking
  error_message TEXT,
  error_code VARCHAR(100),
  error_step VARCHAR(50), -- 'BUILD', 'DEPLOY', 'CHECK'
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Composite primary key required for partitioned tables
  PRIMARY KEY (id, created_at),
  UNIQUE(deployment_id, created_at)
) PARTITION BY RANGE (created_at);

-- Create initial partitions
CREATE TABLE IF NOT EXISTS vercel_deployments_default PARTITION OF vercel_deployments DEFAULT;

-- Create current month's partition
DO $$
DECLARE
  current_month_start DATE;
  next_month_start DATE;
  table_name TEXT;
BEGIN
  current_month_start := DATE_TRUNC('month', CURRENT_DATE);
  next_month_start := current_month_start + INTERVAL '1 month';
  table_name := 'vercel_deployments_' || TO_CHAR(current_month_start, 'YYYY_MM');
  
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF vercel_deployments 
     FOR VALUES FROM (%L) TO (%L)',
    table_name, current_month_start, next_month_start
  );
END $$;

-- =============================================================================
-- 4. VERCEL ENVIRONMENT SYNC CONFIGURATIONS
-- =============================================================================
-- Manages environment variable synchronization settings
CREATE TABLE IF NOT EXISTS vercel_env_sync_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vercel_project_mapping_id UUID NOT NULL REFERENCES vercel_project_mappings(id) ON DELETE CASCADE,
  
  -- Sync configuration
  sync_direction VARCHAR(50) CHECK (sync_direction IN ('to_vercel', 'from_vercel', 'bidirectional')),
  env_targets vercel_env_target[], -- Using enum array
  
  -- Filter patterns
  include_patterns TEXT[],
  exclude_patterns TEXT[],
  sensitive_keys TEXT[], -- Keys that should never be synced
  
  -- Security: store hashes for change detection (never values)
  env_var_hashes JSONB DEFAULT '{}'::JSONB, -- {key: sha256(value)}
  
  -- Sync status
  last_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(50),
  last_sync_error TEXT,
  sync_frequency_minutes INT DEFAULT 0, -- 0 = manual only
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One config per project mapping with guardrails
  CONSTRAINT unique_env_sync_config UNIQUE(vercel_project_mapping_id),
  CONSTRAINT env_targets_not_empty CHECK (env_targets IS NULL OR cardinality(env_targets) > 0)
);

-- =============================================================================
-- 4A. WEBHOOK DEDUPLICATION TABLE
-- =============================================================================
-- Prevents duplicate webhook processing
CREATE TABLE IF NOT EXISTS vercel_webhook_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255),
  deployment_id VARCHAR(255),
  payload_hash VARCHAR(64) NOT NULL, -- SHA256 of raw body
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id),
  UNIQUE(deployment_id, payload_hash) -- Fallback dedup when event_id missing
);

-- TTL cleanup index for webhook dedup (7 day retention)
CREATE INDEX IF NOT EXISTS idx_webhook_dedup_cleanup 
  ON vercel_webhook_dedup(processed_at);

-- =============================================================================
-- 5. VERCEL WEBHOOK EVENTS
-- =============================================================================
-- Stores and tracks webhook events from Vercel
CREATE TABLE IF NOT EXISTS vercel_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR(255) UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  
  -- Related entities
  vercel_project_id VARCHAR(255),
  deployment_id VARCHAR(255),
  team_id VARCHAR(255),
  user_id VARCHAR(255),
  
  -- Event data
  payload JSONB NOT NULL,
  signature VARCHAR(255),
  
  -- Processing status
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  retry_count INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. OAUTH STATE MANAGEMENT (if not exists)
-- =============================================================================
-- Reuse existing oauth_state_nonces table or create if needed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_state_nonces') THEN
    CREATE TABLE oauth_state_nonces (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nonce VARCHAR(255) NOT NULL UNIQUE,
      user_id UUID REFERENCES auth.users(id),
      provider VARCHAR(50) NOT NULL,
      redirect_url TEXT,
      metadata JSONB DEFAULT '{}'::JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes'
    );
  END IF;
END $$;

-- =============================================================================
-- 7. UPDATE PROJECT INTEGRATIONS ENUM
-- =============================================================================
-- Add vercel to the integration types if not already present
DO $$
BEGIN
  -- Check if vercel is already in the enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'vercel' 
    AND enumtypid = (
      SELECT oid FROM pg_type WHERE typname = 'integration_type'
    )
  ) THEN
    -- We can't alter enum in transaction, so we'll use a different approach
    -- Just ensure the project_integrations table can handle 'vercel' as text
    NULL; -- Placeholder since we're handling this differently
  END IF;
END $$;

-- =============================================================================
-- 8. OPTIMIZED INDEXES FOR PERFORMANCE
-- =============================================================================

-- Vercel connections - partial unique indexes for proper NULL handling
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vc_user_personal 
  ON vercel_connections(user_id) WHERE team_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vc_user_team 
  ON vercel_connections(user_id, team_id) WHERE team_id IS NOT NULL;

-- Vercel connections - optimized for common queries
CREATE INDEX IF NOT EXISTS idx_vc_user_id 
  ON vercel_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_vc_project_id 
  ON vercel_connections(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vc_team_status 
  ON vercel_connections(team_id, status) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vc_circuit_breaker_open 
  ON vercel_connections((circuit_breaker_state->>'is_open')) WHERE (circuit_breaker_state->>'is_open')::boolean = true;
CREATE INDEX IF NOT EXISTS idx_vc_status 
  ON vercel_connections(status) WHERE status IN ('error', 'expired', 'revoked');

-- Project mappings - hot read paths
CREATE INDEX IF NOT EXISTS idx_vpm_project 
  ON vercel_project_mappings(project_id);
CREATE INDEX IF NOT EXISTS idx_vpm_vercel_project 
  ON vercel_project_mappings(vercel_project_id);
CREATE INDEX IF NOT EXISTS idx_vpm_connection 
  ON vercel_project_mappings(vercel_connection_id);

-- Deployments - time-series optimized
CREATE INDEX IF NOT EXISTS idx_vd_project_created 
  ON vercel_deployments(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vd_mapping_created 
  ON vercel_deployments(vercel_project_mapping_id, created_at DESC) WHERE vercel_project_mapping_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vd_state_created 
  ON vercel_deployments(deployment_state, created_at DESC) 
  WHERE deployment_state IN ('QUEUED','INITIALIZING','BUILDING');
CREATE INDEX IF NOT EXISTS idx_vd_deployment_id 
  ON vercel_deployments(deployment_id);
CREATE INDEX IF NOT EXISTS idx_vd_git_branch 
  ON vercel_deployments(project_id, (git_source->>'branch')) WHERE git_source ? 'branch';
CREATE INDEX IF NOT EXISTS idx_vd_correlation_id 
  ON vercel_deployments(correlation_id) WHERE correlation_id IS NOT NULL;

-- Webhook events indexes (if keeping webhook events table)
CREATE INDEX IF NOT EXISTS idx_vercel_webhook_events_processed 
  ON vercel_webhook_events(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_vercel_webhook_events_event_type 
  ON vercel_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_vercel_webhook_events_created_at 
  ON vercel_webhook_events(created_at DESC);

-- OAuth state nonces cleanup index (if table was created)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'oauth_state_nonces') THEN
    CREATE INDEX IF NOT EXISTS idx_oauth_state_nonces_expires_at 
      ON oauth_state_nonces(expires_at);
  END IF;
END $$;

-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on tables
ALTER TABLE vercel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE vercel_project_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE vercel_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vercel_env_sync_configs ENABLE ROW LEVEL SECURITY;

-- Policies for vercel_connections
DO $$
BEGIN
  -- User access policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_connections_owner_policy') THEN
    CREATE POLICY vercel_connections_owner_policy ON vercel_connections
      FOR ALL USING (user_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
  
  -- Service access policy for webhooks/workers (only if app_service role exists)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND 
     NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_connections_service_policy') THEN
    CREATE POLICY vercel_connections_service_policy ON vercel_connections
      FOR ALL TO app_service
      USING (true);
  END IF;
END $$;

-- Policies for vercel_project_mappings (based on project ownership)
DO $$
BEGIN
  -- User access policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_project_mappings_owner_policy') THEN
    CREATE POLICY vercel_project_mappings_owner_policy ON vercel_project_mappings
      FOR ALL USING (
        project_id IN (
          SELECT id FROM projects 
          WHERE owner_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;
  
  -- Service access policy (only if app_service role exists)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND 
     NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_project_mappings_service_policy') THEN
    CREATE POLICY vercel_project_mappings_service_policy ON vercel_project_mappings
      FOR ALL TO app_service
      USING (true);
  END IF;
END $$;

-- Policies for vercel_deployments (based on project ownership)
DO $$
BEGIN
  -- User access policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_deployments_owner_policy') THEN
    CREATE POLICY vercel_deployments_owner_policy ON vercel_deployments
      FOR ALL USING (
        project_id IN (
          SELECT id FROM projects 
          WHERE owner_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;
  
  -- Service access policy (only if app_service role exists)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND 
     NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_deployments_service_policy') THEN
    CREATE POLICY vercel_deployments_service_policy ON vercel_deployments
      FOR ALL TO app_service
      USING (true);
  END IF;
END $$;

-- Policies for vercel_env_sync_configs (based on project mapping ownership)
DO $$
BEGIN
  -- User access policy
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_env_sync_configs_owner_policy') THEN
    CREATE POLICY vercel_env_sync_configs_owner_policy ON vercel_env_sync_configs
      FOR ALL USING (
        vercel_project_mapping_id IN (
          SELECT vpm.id FROM vercel_project_mappings vpm
          JOIN projects p ON vpm.project_id = p.id
          WHERE p.owner_id = current_setting('app.current_user_id', true)::UUID
        )
      );
  END IF;
  
  -- Service access policy (only if app_service role exists)
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') AND 
     NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'vercel_env_sync_configs_service_policy') THEN
    CREATE POLICY vercel_env_sync_configs_service_policy ON vercel_env_sync_configs
      FOR ALL TO app_service
      USING (true);
  END IF;
END $$;

-- =============================================================================
-- 10. TRIGGERS FOR UPDATED_AT
-- =============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_vercel_connections_updated_at' 
    AND tgrelid = 'vercel_connections'::regclass
  ) THEN
    CREATE TRIGGER update_vercel_connections_updated_at
      BEFORE UPDATE ON vercel_connections
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_vercel_project_mappings_updated_at' 
    AND tgrelid = 'vercel_project_mappings'::regclass
  ) THEN
    CREATE TRIGGER update_vercel_project_mappings_updated_at
      BEFORE UPDATE ON vercel_project_mappings
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_vercel_env_sync_configs_updated_at' 
    AND tgrelid = 'vercel_env_sync_configs'::regclass
  ) THEN
    CREATE TRIGGER update_vercel_env_sync_configs_updated_at
      BEFORE UPDATE ON vercel_env_sync_configs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  
  -- Add updated_at trigger for deployments (helpful for dashboards)
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_vercel_deployments_updated_at' 
    AND tgrelid = 'vercel_deployments'::regclass
  ) THEN
    CREATE TRIGGER update_vercel_deployments_updated_at
      BEFORE UPDATE ON vercel_deployments
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- 11. SAMPLE DATA FOR DEVELOPMENT (commented out for production)
-- =============================================================================
-- Uncomment for development/testing purposes
/*
-- Sample Vercel connection
INSERT INTO vercel_connections (
  user_id,
  team_id,
  team_name,
  account_type,
  access_token,
  access_token_iv,
  scopes,
  status
) VALUES (
  (SELECT id FROM auth.users LIMIT 1),
  'team_test123',
  'Test Team',
  'team',
  'encrypted_token_here',
  'iv_here',
  ARRAY['user', 'project', 'deployment'],
  'connected'
);
*/

-- =============================================================================
-- 12. GRANT PERMISSIONS (adjust based on your app's requirements)
-- =============================================================================
-- Grant appropriate permissions to your application role
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO your_app_role;
-- GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO your_app_role;

COMMIT;

-- =============================================================================
-- ROLLBACK SCRIPT (save separately)
-- =============================================================================
/*
BEGIN;

-- Drop policies
DROP POLICY IF EXISTS vercel_connections_owner_policy ON vercel_connections;
DROP POLICY IF EXISTS vercel_connections_service_policy ON vercel_connections;
DROP POLICY IF EXISTS vercel_project_mappings_owner_policy ON vercel_project_mappings;
DROP POLICY IF EXISTS vercel_project_mappings_service_policy ON vercel_project_mappings;
DROP POLICY IF EXISTS vercel_deployments_owner_policy ON vercel_deployments;
DROP POLICY IF EXISTS vercel_deployments_service_policy ON vercel_deployments;
DROP POLICY IF EXISTS vercel_env_sync_configs_owner_policy ON vercel_env_sync_configs;
DROP POLICY IF EXISTS vercel_env_sync_configs_service_policy ON vercel_env_sync_configs;

-- Drop triggers
DROP TRIGGER IF EXISTS update_vercel_connections_updated_at ON vercel_connections;
DROP TRIGGER IF EXISTS update_vercel_project_mappings_updated_at ON vercel_project_mappings;
DROP TRIGGER IF EXISTS update_vercel_env_sync_configs_updated_at ON vercel_env_sync_configs;
DROP TRIGGER IF EXISTS update_vercel_deployments_updated_at ON vercel_deployments;

-- Drop unique indexes
DROP INDEX IF EXISTS uniq_vc_user_personal;
DROP INDEX IF EXISTS uniq_vc_user_team;

-- Drop indexes
DROP INDEX IF EXISTS idx_vc_user_id;
DROP INDEX IF EXISTS idx_vc_project_id;
DROP INDEX IF EXISTS idx_vc_team_status;
DROP INDEX IF EXISTS idx_vc_circuit_breaker_open;
DROP INDEX IF EXISTS idx_vc_status;
DROP INDEX IF EXISTS idx_vpm_project;
DROP INDEX IF EXISTS idx_vpm_vercel_project;
DROP INDEX IF EXISTS idx_vpm_connection;
DROP INDEX IF EXISTS idx_vd_project_created;
DROP INDEX IF EXISTS idx_vd_mapping_created;
DROP INDEX IF EXISTS idx_vd_state_created;
DROP INDEX IF EXISTS idx_vd_deployment_id;
DROP INDEX IF EXISTS idx_vd_git_branch;
DROP INDEX IF EXISTS idx_vd_correlation_id;
DROP INDEX IF EXISTS idx_vercel_webhook_events_processed;
DROP INDEX IF EXISTS idx_vercel_webhook_events_event_type;
DROP INDEX IF EXISTS idx_vercel_webhook_events_created_at;
DROP INDEX IF EXISTS idx_webhook_dedup_cleanup;

-- Drop functions
DROP FUNCTION IF EXISTS vercel_lock_deployment_promotion(UUID, VARCHAR);
DROP FUNCTION IF EXISTS create_vercel_deployments_partition(DATE);

-- Drop tables (partitioned table drops all partitions automatically)
DROP TABLE IF EXISTS vercel_webhook_dedup;
DROP TABLE IF EXISTS vercel_webhook_events;
DROP TABLE IF EXISTS vercel_env_sync_configs;
DROP TABLE IF EXISTS vercel_deployments;
DROP TABLE IF EXISTS vercel_project_mappings;
DROP TABLE IF EXISTS vercel_connections;

-- Drop enums
DROP TYPE IF EXISTS vercel_environment;
DROP TYPE IF EXISTS vercel_deploy_state;
DROP TYPE IF EXISTS vercel_deploy_type;
DROP TYPE IF EXISTS vercel_env_target;
DROP TYPE IF EXISTS vercel_connection_status;

COMMIT;
*/