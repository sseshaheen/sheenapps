-- Migration: Add Supabase OAuth Integration Tables
-- Date: 2025-08-17
-- Description: Add tables for secure Supabase OAuth token storage, account discovery, and optional breakglass recovery

-- Main Supabase connections table with encrypted token storage
CREATE TABLE supabase_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Encrypted tokens using AES-GCM
  access_token_encrypted JSONB NOT NULL, -- {encrypted, iv, authTag}
  refresh_token_encrypted JSONB NOT NULL, -- {encrypted, iv, authTag}
  token_expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Connection metadata
  connection_status TEXT DEFAULT 'active' CHECK (connection_status IN ('active', 'expired', 'revoked')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one connection per user-project pair
  UNIQUE(user_id, project_id)
);

-- Account discovery data storage (non-sensitive project metadata)
CREATE TABLE supabase_account_discovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES supabase_connections(id) ON DELETE CASCADE,
  
  -- Store full discovery results as JSON
  discovery_data JSONB NOT NULL,
  discovered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- One discovery record per connection
  UNIQUE(connection_id)
);

-- Breakglass recovery table (EXTREME SECURITY RISK - stores plaintext tokens)
-- Only enable if ENABLE_BREAKGLASS_RECOVERY=true environment variable is set
CREATE TABLE supabase_breakglass_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES supabase_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,

  -- PLAINTEXT TOKENS (EXTREME SECURITY RISK)
  access_token_plaintext TEXT NOT NULL,
  refresh_token_plaintext TEXT NOT NULL,
  supabase_project_ref TEXT NOT NULL,

  -- Security metadata and audit trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  accessed_at TIMESTAMP WITH TIME ZONE,
  access_count INTEGER DEFAULT 0,
  created_by_admin_id UUID, -- Which admin created this entry
  reason TEXT NOT NULL, -- Justification for breakglass creation

  -- Auto-cleanup (tokens expire anyway, but clean up earlier)
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),

  -- Access controls
  is_active BOOLEAN DEFAULT TRUE,
  access_restricted_until TIMESTAMP WITH TIME ZONE,

  -- Ensure one breakglass entry per connection
  UNIQUE(connection_id)
);

-- OAuth state management for CSRF protection
CREATE TABLE oauth_state_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  code_verifier TEXT, -- PKCE code verifier
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 minutes'),
  consumed BOOLEAN DEFAULT FALSE
);

-- Idempotency tracking for OAuth exchange
CREATE TABLE oauth_exchange_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  project_id UUID NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Indexes for performance
CREATE INDEX idx_supabase_connections_user_project ON supabase_connections(user_id, project_id);
CREATE INDEX idx_supabase_connections_expires ON supabase_connections(token_expires_at);
CREATE INDEX idx_discovery_connection ON supabase_account_discovery(connection_id);
CREATE INDEX idx_breakglass_user_project ON supabase_breakglass_recovery(user_id, project_id);
CREATE INDEX idx_breakglass_expires ON supabase_breakglass_recovery(expires_at);
CREATE INDEX idx_breakglass_active ON supabase_breakglass_recovery(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_oauth_nonces_expires ON oauth_state_nonces(expires_at);
CREATE INDEX idx_oauth_nonces_consumed ON oauth_state_nonces(consumed) WHERE consumed = FALSE;
CREATE INDEX idx_oauth_idempotency_expires ON oauth_exchange_idempotency(expires_at);

-- Row Level Security for breakglass table (admin access only)
ALTER TABLE supabase_breakglass_recovery ENABLE ROW LEVEL SECURITY;

-- Policy: Only allow access to super_admin and breakglass_admin roles
-- Note: This assumes you have an admin role system in place
CREATE POLICY breakglass_admin_only ON supabase_breakglass_recovery
  FOR ALL
  USING (
    -- Allow if current user has admin privileges
    -- This will need to be adjusted based on your actual admin authentication system
    current_setting('app.current_user_role', true) IN ('super_admin', 'breakglass_admin')
  );

-- Add updated_at trigger for supabase_connections
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_supabase_connections_updated_at
    BEFORE UPDATE ON supabase_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cleanup function for expired records
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Clean up expired OAuth state nonces
    DELETE FROM oauth_state_nonces WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Clean up expired idempotency records
    DELETE FROM oauth_exchange_idempotency WHERE expires_at < NOW();
    
    -- Clean up expired/inactive breakglass entries
    DELETE FROM supabase_breakglass_recovery 
    WHERE expires_at < NOW() OR is_active = FALSE;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE supabase_connections IS 'Secure storage for Supabase OAuth tokens with AES-GCM encryption';
COMMENT ON TABLE supabase_account_discovery IS 'Non-sensitive account discovery data from Supabase Management API';
COMMENT ON TABLE supabase_breakglass_recovery IS 'SECURITY RISK: Plaintext token storage for emergency access scenarios';
COMMENT ON TABLE oauth_state_nonces IS 'OAuth state management with PKCE support for CSRF protection';
COMMENT ON TABLE oauth_exchange_idempotency IS 'Prevents duplicate OAuth token exchanges';

COMMENT ON COLUMN supabase_connections.access_token_encrypted IS 'AES-GCM encrypted access token with IV and auth tag';
COMMENT ON COLUMN supabase_connections.refresh_token_encrypted IS 'AES-GCM encrypted refresh token with IV and auth tag';
COMMENT ON COLUMN supabase_breakglass_recovery.access_token_plaintext IS 'SECURITY RISK: Plaintext access token for emergency scenarios';
COMMENT ON COLUMN supabase_breakglass_recovery.refresh_token_plaintext IS 'SECURITY RISK: Plaintext refresh token for emergency scenarios';