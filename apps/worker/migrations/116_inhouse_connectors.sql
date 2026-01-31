-- Migration: 116_inhouse_connectors
-- Description: Create tables for @sheenapps/connectors SDK
-- Created: 2026-01-26

-- OAuth state storage (temporary, expires after 10 minutes)
CREATE TABLE IF NOT EXISTS inhouse_oauth_states (
    id UUID PRIMARY KEY, -- Also serves as the state parameter
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL,
    redirect_uri TEXT NOT NULL,
    scopes TEXT[] DEFAULT '{}',
    code_verifier TEXT, -- PKCE code verifier
    state_data JSONB, -- Custom data to preserve across redirect
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Connections table (stores connection info and encrypted credentials)
CREATE TABLE IF NOT EXISTS inhouse_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    connector_type VARCHAR(50) NOT NULL,
    display_name TEXT NOT NULL,
    external_account_id TEXT, -- Provider's account/user ID
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'connected', 'error', 'expired', 'revoked')),
    scopes TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    encrypted_credentials TEXT, -- AES-256-GCM encrypted JSON
    credentials_iv TEXT, -- Initialization vector for decryption
    connected_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- When tokens expire
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inhouse_oauth_states_project ON inhouse_oauth_states(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_oauth_states_expires ON inhouse_oauth_states(expires_at);

CREATE INDEX IF NOT EXISTS idx_inhouse_connections_project ON inhouse_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_connections_type ON inhouse_connections(project_id, connector_type);
CREATE INDEX IF NOT EXISTS idx_inhouse_connections_status ON inhouse_connections(project_id, status);
CREATE INDEX IF NOT EXISTS idx_inhouse_connections_created ON inhouse_connections(project_id, created_at DESC);

-- Trigger to update updated_at on connection changes
CREATE OR REPLACE FUNCTION update_inhouse_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inhouse_connections_updated_at ON inhouse_connections;
CREATE TRIGGER trigger_inhouse_connections_updated_at
    BEFORE UPDATE ON inhouse_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_inhouse_connections_updated_at();

-- Cleanup expired OAuth states (optional - can be handled by application or cron)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM inhouse_oauth_states WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on tables
COMMENT ON TABLE inhouse_oauth_states IS 'Temporary OAuth state storage for @sheenapps/connectors SDK - states expire after 10 minutes';
COMMENT ON TABLE inhouse_connections IS 'Third-party service connections for @sheenapps/connectors SDK - credentials are AES-256-GCM encrypted';

-- RLS policies
DO $$
BEGIN
    -- Enable RLS
    ALTER TABLE inhouse_oauth_states ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inhouse_connections ENABLE ROW LEVEL SECURITY;

    -- Service role policies (full access)
    DROP POLICY IF EXISTS inhouse_oauth_states_service_policy ON inhouse_oauth_states;
    CREATE POLICY inhouse_oauth_states_service_policy ON inhouse_oauth_states
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);

    DROP POLICY IF EXISTS inhouse_connections_service_policy ON inhouse_connections;
    CREATE POLICY inhouse_connections_service_policy ON inhouse_connections
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);

    -- Authenticated user policies (project-scoped read access)
    DROP POLICY IF EXISTS inhouse_oauth_states_user_policy ON inhouse_oauth_states;
    CREATE POLICY inhouse_oauth_states_user_policy ON inhouse_oauth_states
        FOR SELECT
        TO authenticated
        USING (
            project_id IN (
                SELECT id FROM projects WHERE owner_id = auth.uid()
                UNION
                SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
            )
        );

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

EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'RLS policies creation skipped: %', SQLERRM;
END;
$$;
