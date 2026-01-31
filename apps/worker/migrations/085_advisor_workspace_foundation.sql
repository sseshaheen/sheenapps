-- Advisor Workspace Foundation - Phase 1 Implementation
-- Production-ready foundation for advisor workspace feature
-- Expert-validated schema with proper constraints and indexing

BEGIN;

-- Create workspace session status enum for stronger typing
DO $$ BEGIN
  CREATE TYPE workspace_session_status AS ENUM ('active','idle','disconnected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Advisor workspace sessions table for real-time presence tracking
CREATE TABLE IF NOT EXISTS advisor_workspace_sessions (
  session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status workspace_session_status NOT NULL DEFAULT 'active',
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);

-- Note: Unique constraint replaced with partial index below for session history support

-- Workspace audit log for security and compliance tracking
CREATE TABLE IF NOT EXISTS advisor_workspace_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES advisor_workspace_sessions(session_id) ON DELETE SET NULL,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'session_start', 'session_end', 'file_read', 'log_stream_start', 
    'log_stream_end', 'path_blocked', 'rate_limit_hit'
  )),
  resource_path TEXT, -- File path or log stream identifier
  client_ip INET,
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB DEFAULT '{}'
);

-- Workspace rate limiting for token bucket implementation
CREATE TABLE IF NOT EXISTS advisor_workspace_rate_limits (
  advisor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket_key TEXT NOT NULL, -- e.g., 'file_access', 'log_stream'
  tokens_remaining INTEGER NOT NULL DEFAULT 100,
  last_refill TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (advisor_id, bucket_key)
);

-- Indexes for efficient workspace operations

-- Session lookup by project and advisor
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_project_advisor
  ON advisor_workspace_sessions(project_id, advisor_id);

-- Session activity tracking for cleanup
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_activity
  ON advisor_workspace_sessions(last_activity)
  WHERE status = 'active';

-- Partial unique index: allow session history but prevent multiple active/idle sessions
CREATE UNIQUE INDEX IF NOT EXISTS ux_advisor_workspace_active_idx
  ON advisor_workspace_sessions(project_id, advisor_id)
  WHERE status IN ('active','idle');

-- Audit log time-series queries
CREATE INDEX IF NOT EXISTS idx_workspace_audit_timestamp
  ON advisor_workspace_audit_log(timestamp DESC);

-- Audit log by advisor and project
CREATE INDEX IF NOT EXISTS idx_workspace_audit_advisor_project
  ON advisor_workspace_audit_log(advisor_id, project_id, timestamp DESC);

-- Rate limiting lookup
CREATE INDEX IF NOT EXISTS idx_workspace_rate_limits_advisor
  ON advisor_workspace_rate_limits(advisor_id, bucket_key);

-- Row Level Security (RLS) policies

-- Enable RLS on all workspace tables
ALTER TABLE advisor_workspace_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_workspace_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE advisor_workspace_rate_limits ENABLE ROW LEVEL SECURITY;

-- Sessions: Advisors can only see their own sessions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_workspace_sessions_self_access') THEN
    CREATE POLICY advisor_workspace_sessions_self_access ON advisor_workspace_sessions
      FOR ALL TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Audit log: Advisors can only read their own audit entries (append-only, service-managed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_workspace_audit_self_access') THEN
    CREATE POLICY advisor_workspace_audit_self_access ON advisor_workspace_audit_log
      FOR SELECT TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Rate limits: Advisors can only read their own rate limit data (service-managed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'advisor_workspace_rate_limits_self_access') THEN
    CREATE POLICY advisor_workspace_rate_limits_self_access ON advisor_workspace_rate_limits
      FOR SELECT TO authenticated
      USING (advisor_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- Admin policies for workspace management (if app_admin role exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    -- Admin can see all workspace sessions
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_workspace_sessions_full_access') THEN
      CREATE POLICY admin_workspace_sessions_full_access ON advisor_workspace_sessions
        FOR ALL TO app_admin
        USING (true);
    END IF;
    
    -- Admin can see all audit logs
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_workspace_audit_full_access') THEN
      CREATE POLICY admin_workspace_audit_full_access ON advisor_workspace_audit_log
        FOR ALL TO app_admin
        USING (true);
    END IF;
    
    -- Admin can see all rate limits
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'admin_workspace_rate_limits_full_access') THEN
      CREATE POLICY admin_workspace_rate_limits_full_access ON advisor_workspace_rate_limits
        FOR ALL TO app_admin
        USING (true);
    END IF;
  END IF;
END $$;


-- Triggers for automatic session management

-- Function to update session activity timestamp
CREATE OR REPLACE FUNCTION update_workspace_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update activity on session updates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'workspace_session_activity_update' 
                 AND tgrelid = 'advisor_workspace_sessions'::regclass) THEN
    CREATE TRIGGER workspace_session_activity_update
      BEFORE UPDATE ON advisor_workspace_sessions
      FOR EACH ROW EXECUTE FUNCTION update_workspace_session_activity();
  END IF;
END $$;

-- Function for session cleanup (stale sessions older than 30 minutes)
CREATE OR REPLACE FUNCTION cleanup_stale_workspace_sessions()
RETURNS INTEGER AS $$
DECLARE
  cleanup_count INTEGER;
BEGIN
  UPDATE advisor_workspace_sessions
  SET status = 'disconnected'
  WHERE status IN ('active', 'idle')
    AND last_activity < now() - INTERVAL '30 minutes';
    
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  
  -- Also delete very old disconnected sessions (older than 24 hours)
  DELETE FROM advisor_workspace_sessions
  WHERE status = 'disconnected'
    AND last_activity < now() - INTERVAL '24 hours';
    
  RETURN cleanup_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON advisor_workspace_sessions TO authenticated;
-- Audit logs: SELECT only (service-managed writes)
GRANT SELECT ON advisor_workspace_audit_log TO authenticated;
-- Rate limits: SELECT only (service-managed writes)  
GRANT SELECT ON advisor_workspace_rate_limits TO authenticated;

-- Enhanced workspace permissions in existing project_advisors table
-- Add workspace-specific permissions and tracking
ALTER TABLE project_advisors ADD COLUMN IF NOT EXISTS workspace_permissions JSONB DEFAULT '{
  "view_code": true,
  "view_logs": true
}'::jsonb;
ALTER TABLE project_advisors ADD COLUMN IF NOT EXISTS workspace_granted_by UUID REFERENCES auth.users(id);
ALTER TABLE project_advisors ADD COLUMN IF NOT EXISTS workspace_granted_at TIMESTAMPTZ DEFAULT now();

-- Validate JSONB structure for workspace permissions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_workspace_permissions_keys') THEN
    ALTER TABLE project_advisors
      ADD CONSTRAINT chk_workspace_permissions_keys
      CHECK (jsonb_typeof(workspace_permissions) = 'object'
             AND (workspace_permissions ? 'view_code')
             AND (workspace_permissions ? 'view_logs'));
  END IF;
END $$;

-- Project workspace settings for client control over advisor access
CREATE TABLE IF NOT EXISTS project_workspace_settings (
  project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  advisor_code_access BOOLEAN DEFAULT true,
  advisor_log_access BOOLEAN DEFAULT true,
  restricted_paths TEXT[] DEFAULT ARRAY[]::TEXT[],
  allowed_log_tiers log_tier[] DEFAULT ARRAY['build', 'deploy', 'lifecycle']::log_tier[],
  settings JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure at least one tier is allowed
  CONSTRAINT chk_allowed_log_tiers_nonempty CHECK (array_length(allowed_log_tiers, 1) >= 1)
);

-- Enable RLS on project workspace settings
ALTER TABLE project_workspace_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Project owners can manage their workspace settings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_workspace_settings_owner_access') THEN
    CREATE POLICY project_workspace_settings_owner_access ON project_workspace_settings
      FOR ALL TO authenticated
      USING (owner_id = current_setting('app.current_user_id', true)::UUID)
      WITH CHECK (owner_id = current_setting('app.current_user_id', true)::UUID);
  END IF;
END $$;

-- RLS Policy: Advisors can read workspace settings for projects they're assigned to
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'project_workspace_settings_advisor_read') THEN
    CREATE POLICY project_workspace_settings_advisor_read ON project_workspace_settings
      FOR SELECT TO authenticated
      USING (project_id IN (
        SELECT project_id FROM project_advisors 
        WHERE advisor_id = current_setting('app.current_user_id', true)::UUID
        AND status = 'active'
      ));
  END IF;
END $$;

-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_advisors_workspace_active
  ON project_advisors(project_id, advisor_id)
  WHERE status = 'active' AND workspace_permissions IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workspace_settings_project
  ON project_workspace_settings(project_id);

-- Function to automatically create workspace settings for new projects
CREATE OR REPLACE FUNCTION create_default_workspace_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_workspace_settings (project_id, owner_id)
  VALUES (NEW.id, NEW.owner_id)
  ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to create workspace settings when project is created
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'create_workspace_settings_on_project_create' 
                 AND tgrelid = 'projects'::regclass) THEN
    CREATE TRIGGER create_workspace_settings_on_project_create
      AFTER INSERT ON projects
      FOR EACH ROW EXECUTE FUNCTION create_default_workspace_settings();
  END IF;
END $$;

-- Service role bypass policies for background operations (cleanup, heartbeats, etc.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    -- Service can manage all workspace sessions
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'service_workspace_sessions_all') THEN
      CREATE POLICY service_workspace_sessions_all ON advisor_workspace_sessions
        FOR ALL TO service_role 
        USING (true) WITH CHECK (true);
    END IF;
    
    -- Service can write audit logs
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'service_workspace_audit_all') THEN
      CREATE POLICY service_workspace_audit_all ON advisor_workspace_audit_log
        FOR ALL TO service_role 
        USING (true) WITH CHECK (true);
    END IF;
    
    -- Service can manage rate limits
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'service_workspace_rate_limits_all') THEN
      CREATE POLICY service_workspace_rate_limits_all ON advisor_workspace_rate_limits
        FOR ALL TO service_role 
        USING (true) WITH CHECK (true);
    END IF;
    
    -- Service can manage workspace settings
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'service_workspace_settings_all') THEN
      CREATE POLICY service_workspace_settings_all ON project_workspace_settings
        FOR ALL TO service_role 
        USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- Grant necessary permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON project_workspace_settings TO authenticated;

COMMIT;