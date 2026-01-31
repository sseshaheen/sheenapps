-- ============================================================================
-- Migration: 119_inhouse_edge_functions.sql
-- Description: Edge Functions infrastructure for Easy Mode
-- ============================================================================

-- ============================================================================
-- MAIN FUNCTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_edge_functions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(63) NOT NULL,
    routes JSONB DEFAULT '[]'::jsonb,
    schedule VARCHAR(100),
    cf_script_name VARCHAR(255) NOT NULL,
    env_vars JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(20) DEFAULT 'deploying',
    active_version INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inhouse_edge_functions_project_name_unique UNIQUE(project_id, name),
    CONSTRAINT inhouse_edge_functions_name_format CHECK (name ~ '^[a-z][a-z0-9-]{0,62}$'),
    CONSTRAINT inhouse_edge_functions_status_valid CHECK (status IN ('deploying', 'active', 'error', 'deleted')),
    CONSTRAINT inhouse_edge_functions_routes_array CHECK (jsonb_typeof(routes) = 'array'),
    CONSTRAINT inhouse_edge_functions_env_vars_object CHECK (jsonb_typeof(env_vars) = 'object')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_functions_project
    ON inhouse_edge_functions(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_functions_status
    ON inhouse_edge_functions(status);
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_functions_project_status
    ON inhouse_edge_functions(project_id, status);

-- ============================================================================
-- VERSIONS TABLE (for rollback support)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_edge_function_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_id UUID NOT NULL REFERENCES inhouse_edge_functions(id) ON DELETE CASCADE,
    version INT NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    code_snapshot TEXT NOT NULL,
    env_vars_snapshot JSONB DEFAULT '{}'::jsonb,
    cf_script_version VARCHAR(255),
    is_active BOOLEAN DEFAULT false,
    deployed_at TIMESTAMPTZ DEFAULT NOW(),
    deployed_by UUID,

    -- Constraints
    CONSTRAINT inhouse_edge_function_versions_unique UNIQUE(function_id, version),
    CONSTRAINT inhouse_edge_function_versions_env_object CHECK (jsonb_typeof(env_vars_snapshot) = 'object')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_function_versions_function
    ON inhouse_edge_function_versions(function_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_function_versions_active
    ON inhouse_edge_function_versions(function_id, is_active)
    WHERE is_active = true;

-- ============================================================================
-- LOGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_edge_function_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    function_id UUID REFERENCES inhouse_edge_functions(id) ON DELETE CASCADE,
    version INT,
    request_id VARCHAR(100),
    status INT,
    duration_ms INT,
    cpu_time_ms INT,
    logs JSONB DEFAULT '[]'::jsonb,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inhouse_edge_function_logs_logs_array CHECK (jsonb_typeof(logs) = 'array')
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_function_logs_function
    ON inhouse_edge_function_logs(function_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_function_logs_created
    ON inhouse_edge_function_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_function_logs_request
    ON inhouse_edge_function_logs(request_id);

-- Cleanup index for log retention (7 days)
CREATE INDEX IF NOT EXISTS idx_inhouse_edge_function_logs_cleanup
    ON inhouse_edge_function_logs(created_at);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'update_inhouse_edge_functions_updated_at'
    ) THEN
        CREATE TRIGGER update_inhouse_edge_functions_updated_at
            BEFORE UPDATE ON inhouse_edge_functions
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE inhouse_edge_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_edge_function_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_edge_function_logs ENABLE ROW LEVEL SECURITY;

-- Functions: Users can manage their own project functions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'inhouse_edge_functions_owner_access'
    ) THEN
        CREATE POLICY inhouse_edge_functions_owner_access ON inhouse_edge_functions
            FOR ALL
            TO authenticated
            USING (
                project_id IN (
                    SELECT id FROM projects WHERE owner_id = auth.uid()
                )
            );
    END IF;
END $$;

-- Versions: Users can access versions of their functions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'inhouse_edge_function_versions_owner_access'
    ) THEN
        CREATE POLICY inhouse_edge_function_versions_owner_access ON inhouse_edge_function_versions
            FOR ALL
            TO authenticated
            USING (
                function_id IN (
                    SELECT ef.id FROM inhouse_edge_functions ef
                    JOIN projects p ON p.id = ef.project_id
                    WHERE p.owner_id = auth.uid()
                )
            );
    END IF;
END $$;

-- Logs: Users can read logs for their functions
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'inhouse_edge_function_logs_owner_access'
    ) THEN
        CREATE POLICY inhouse_edge_function_logs_owner_access ON inhouse_edge_function_logs
            FOR SELECT
            TO authenticated
            USING (
                function_id IN (
                    SELECT ef.id FROM inhouse_edge_functions ef
                    JOIN projects p ON p.id = ef.project_id
                    WHERE p.owner_id = auth.uid()
                )
            );
    END IF;
END $$;

-- ============================================================================
-- SERVICE ROLE ACCESS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- Service role full access for functions
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy WHERE polname = 'inhouse_edge_functions_service_access'
        ) THEN
            CREATE POLICY inhouse_edge_functions_service_access ON inhouse_edge_functions
                FOR ALL
                TO service_role
                USING (true);
        END IF;

        -- Service role full access for versions
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy WHERE polname = 'inhouse_edge_function_versions_service_access'
        ) THEN
            CREATE POLICY inhouse_edge_function_versions_service_access ON inhouse_edge_function_versions
                FOR ALL
                TO service_role
                USING (true);
        END IF;

        -- Service role full access for logs
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy WHERE polname = 'inhouse_edge_function_logs_service_access'
        ) THEN
            CREATE POLICY inhouse_edge_function_logs_service_access ON inhouse_edge_function_logs
                FOR ALL
                TO service_role
                USING (true);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE inhouse_edge_functions IS 'Edge functions deployed to Cloudflare Workers for Platforms';
COMMENT ON TABLE inhouse_edge_function_versions IS 'Version history for edge functions (supports rollback)';
COMMENT ON TABLE inhouse_edge_function_logs IS 'Execution logs for edge functions';

COMMENT ON COLUMN inhouse_edge_functions.cf_script_name IS 'Cloudflare Workers script name in dispatch namespace';
COMMENT ON COLUMN inhouse_edge_functions.env_vars IS 'Environment variables (may contain secret-ref: prefixes)';
COMMENT ON COLUMN inhouse_edge_function_versions.code_snapshot IS 'Full source code for rollback capability';
COMMENT ON COLUMN inhouse_edge_function_versions.env_vars_snapshot IS 'Env vars at time of deployment (for rollback)';
