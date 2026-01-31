-- Migration 036: Supabase OAuth Integration (Fixed)
-- Adds complete OAuth integration with encrypted token storage and breakglass recovery
-- This version handles missing users/projects tables gracefully

-- Core OAuth connections table with encrypted token storage
CREATE TABLE IF NOT EXISTS supabase_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, -- FK to auth.users(id) - Supabase's built-in auth table
  project_id UUID NOT NULL, -- FK to projects(id) - will be added later if table exists
  access_token_encrypted JSONB NOT NULL, -- {encrypted, iv, authTag}
  refresh_token_encrypted JSONB NOT NULL, -- {encrypted, iv, authTag}
  token_expires_at TIMESTAMPTZ NOT NULL,
  connection_status VARCHAR(20) DEFAULT 'active' CHECK (connection_status IN ('active', 'expired', 'revoked', 'disconnected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_user_project UNIQUE (user_id, project_id)
);

-- Account discovery cache
CREATE TABLE IF NOT EXISTS supabase_account_discovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES supabase_connections(id) ON DELETE CASCADE,
  discovery_data JSONB NOT NULL, -- Cached project list and metadata
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_connection_discovery UNIQUE (connection_id)
);

-- OAuth state management (CSRF protection)
CREATE TABLE IF NOT EXISTS oauth_state_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nonce VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL, -- FK to auth.users(id) - Supabase's built-in auth table
  project_id UUID NOT NULL, -- FK to projects(id) - will be added later if table exists
  code_verifier VARCHAR(255), -- PKCE code verifier
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '10 minutes',
  consumed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_nonce UNIQUE (nonce)
);

-- OAuth exchange idempotency (prevents double-processing)
CREATE TABLE IF NOT EXISTS oauth_exchange_idempotency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key VARCHAR(255) NOT NULL,
  user_id UUID NOT NULL, -- FK to auth.users(id) - Supabase's built-in auth table
  project_id UUID NOT NULL, -- FK to projects(id) - will be added later if table exists
  result JSONB NOT NULL, -- Cached successful result
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '1 hour',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_idempotency_key UNIQUE (idempotency_key)
);

-- Breakglass recovery (EXTREME SECURITY RISK - stores plaintext tokens)
-- Only enable if ENABLE_BREAKGLASS_RECOVERY=true
CREATE TABLE IF NOT EXISTS supabase_breakglass_recovery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES supabase_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, -- FK to auth.users(id) - Supabase's built-in auth table
  project_id UUID NOT NULL, -- FK to projects(id) - will be added later if table exists
  access_token_plaintext TEXT NOT NULL, -- 🚨 SECURITY RISK: PLAINTEXT STORAGE
  refresh_token_plaintext TEXT NOT NULL, -- 🚨 SECURITY RISK: PLAINTEXT STORAGE
  supabase_project_ref VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  created_by_admin_id UUID,
  reason TEXT NOT NULL,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  is_active BOOLEAN DEFAULT TRUE,
  access_restricted_until TIMESTAMPTZ,
  CONSTRAINT uq_breakglass_connection UNIQUE (connection_id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_supabase_connections_user_project ON supabase_connections(user_id, project_id);
CREATE INDEX IF NOT EXISTS idx_supabase_connections_status ON supabase_connections(connection_status) WHERE connection_status = 'active';
CREATE INDEX IF NOT EXISTS idx_oauth_nonces_expires ON oauth_state_nonces(expires_at) WHERE consumed = FALSE;
CREATE INDEX IF NOT EXISTS idx_oauth_idempotency_expires ON oauth_exchange_idempotency(expires_at);
CREATE INDEX IF NOT EXISTS idx_breakglass_active ON supabase_breakglass_recovery(user_id, project_id) WHERE is_active = TRUE;

-- Cleanup function for expired data
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_data()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER := 0;
  current_deleted INTEGER := 0;
BEGIN
  -- Clean up expired state nonces
  DELETE FROM oauth_state_nonces WHERE expires_at < NOW();
  GET DIAGNOSTICS current_deleted = ROW_COUNT;
  deleted_count := deleted_count + current_deleted;
  
  -- Clean up expired idempotency keys
  DELETE FROM oauth_exchange_idempotency WHERE expires_at < NOW();
  GET DIAGNOSTICS current_deleted = ROW_COUNT;
  deleted_count := deleted_count + current_deleted;
  
  -- Clean up expired breakglass entries
  DELETE FROM supabase_breakglass_recovery WHERE expires_at < NOW() OR is_active = FALSE;
  GET DIAGNOSTICS current_deleted = ROW_COUNT;
  deleted_count := deleted_count + current_deleted;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Try to add foreign key constraints if the referenced tables exist
-- This will silently fail if tables don't exist, which is fine
DO $$
BEGIN
  -- Add foreign key for auth.users table (Supabase's built-in auth table)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users') THEN
    BEGIN
      ALTER TABLE supabase_connections ADD CONSTRAINT fk_supabase_connections_user 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
    
    BEGIN
      ALTER TABLE oauth_state_nonces ADD CONSTRAINT fk_oauth_nonces_user 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
    
    BEGIN
      ALTER TABLE oauth_exchange_idempotency ADD CONSTRAINT fk_oauth_idempotency_user 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
    
    BEGIN
      ALTER TABLE supabase_breakglass_recovery ADD CONSTRAINT fk_breakglass_user 
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
  END IF;

  -- Add foreign key for projects table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'projects') THEN
    BEGIN
      ALTER TABLE supabase_connections ADD CONSTRAINT fk_supabase_connections_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
    
    BEGIN
      ALTER TABLE oauth_state_nonces ADD CONSTRAINT fk_oauth_nonces_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
    
    BEGIN
      ALTER TABLE oauth_exchange_idempotency ADD CONSTRAINT fk_oauth_idempotency_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
    
    BEGIN
      ALTER TABLE supabase_breakglass_recovery ADD CONSTRAINT fk_breakglass_project 
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- Constraint already exists, ignore
    END;
  END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE supabase_connections IS 'OAuth connections to Supabase with encrypted token storage';
COMMENT ON COLUMN supabase_connections.access_token_encrypted IS 'AES-GCM encrypted access token as JSONB {encrypted, iv, authTag}';
COMMENT ON COLUMN supabase_connections.refresh_token_encrypted IS 'AES-GCM encrypted refresh token as JSONB {encrypted, iv, authTag}';
COMMENT ON TABLE supabase_breakglass_recovery IS '🚨 SECURITY RISK: Stores plaintext tokens for emergency access';
COMMENT ON COLUMN supabase_breakglass_recovery.access_token_plaintext IS '🚨 PLAINTEXT STORAGE - extreme security risk';
COMMENT ON COLUMN supabase_breakglass_recovery.refresh_token_plaintext IS '🚨 PLAINTEXT STORAGE - extreme security risk';