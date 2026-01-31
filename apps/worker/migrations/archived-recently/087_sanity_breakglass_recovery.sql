-- Migration: Sanity Breakglass Recovery
-- Always-on plaintext token storage for emergency access scenarios
-- Auto-created for every Sanity connection as failsafe

BEGIN;

-- Sanity breakglass recovery (SECURITY RISK - stores plaintext tokens)
-- Always enabled as emergency failsafe for encrypted token failures
CREATE TABLE IF NOT EXISTS public.sanity_breakglass_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.sanity_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Plaintext tokens (SECURITY RISK - only for emergencies)
  auth_token_plaintext TEXT NOT NULL,
  robot_token_plaintext TEXT,
  webhook_secret_plaintext TEXT,
  
  -- Sanity project details (for quick recovery)
  sanity_project_id VARCHAR(255) NOT NULL,
  dataset_name VARCHAR(100) NOT NULL,
  project_title TEXT,
  api_version VARCHAR(20) DEFAULT '2023-05-03',
  
  -- Security & audit tracking
  created_by_admin_id UUID REFERENCES auth.users(id),
  reason TEXT NOT NULL DEFAULT 'automatic_on_connection_create',
  justification TEXT,
  
  -- Access control and expiry (24 hour default)
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  -- Emergency access restrictions
  access_restricted_until TIMESTAMPTZ,
  max_access_count INTEGER DEFAULT 10,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_tokens CHECK (auth_token_plaintext IS NOT NULL AND char_length(auth_token_plaintext) > 0),
  CONSTRAINT valid_project_id CHECK (char_length(sanity_project_id) = 8),
  CONSTRAINT reasonable_access_count CHECK (access_count >= 0 AND access_count <= max_access_count),
  
  -- One breakglass entry per connection (replace on token rotation)
  UNIQUE(connection_id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sanity_breakglass_user_active ON public.sanity_breakglass_recovery(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sanity_breakglass_connection ON public.sanity_breakglass_recovery(connection_id);
CREATE INDEX IF NOT EXISTS idx_sanity_breakglass_expires ON public.sanity_breakglass_recovery(expires_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_sanity_breakglass_project ON public.sanity_breakglass_recovery(sanity_project_id, dataset_name);

-- Updated at trigger
CREATE TRIGGER t_sanity_breakglass_updated BEFORE UPDATE ON public.sanity_breakglass_recovery
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Row Level Security (critical for breakglass security)
ALTER TABLE sanity_breakglass_recovery ENABLE ROW LEVEL SECURITY;

-- Service policy for system access
CREATE POLICY sanity_breakglass_service ON public.sanity_breakglass_recovery 
  FOR ALL TO service_role USING (true);

-- Admin-only access policy (super restrictive)
CREATE POLICY sanity_breakglass_admin_only ON public.sanity_breakglass_recovery
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users 
      WHERE id = current_setting('app.current_user_id', true)::uuid 
      AND (role = 'super_admin' OR role = 'breakglass_admin')
    )
  );

-- Comments for security awareness
COMMENT ON TABLE sanity_breakglass_recovery IS 'SECURITY RISK: Stores plaintext Sanity tokens for emergency recovery. Always created as failsafe for encrypted token failures.';
COMMENT ON COLUMN sanity_breakglass_recovery.auth_token_plaintext IS 'PLAINTEXT Sanity auth token - extreme security risk';
COMMENT ON COLUMN sanity_breakglass_recovery.robot_token_plaintext IS 'PLAINTEXT Sanity robot token - extreme security risk';
COMMENT ON COLUMN sanity_breakglass_recovery.webhook_secret_plaintext IS 'PLAINTEXT webhook secret - extreme security risk';

COMMIT;