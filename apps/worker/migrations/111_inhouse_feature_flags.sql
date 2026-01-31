-- Migration: 111_inhouse_feature_flags
-- Description: Create tables for @sheenapps/flags SDK
-- Created: 2026-01-26

-- Feature flags table
CREATE TABLE IF NOT EXISTS inhouse_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key VARCHAR(100) NOT NULL,
    name TEXT,
    description TEXT,
    enabled BOOLEAN DEFAULT true,
    default_value BOOLEAN DEFAULT false,
    rules JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, key)
);

-- Per-user flag overrides
CREATE TABLE IF NOT EXISTS inhouse_flag_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    flag_id UUID NOT NULL REFERENCES inhouse_feature_flags(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    value BOOLEAN NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(project_id, flag_id, user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inhouse_flags_project_id ON inhouse_feature_flags(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_flags_key ON inhouse_feature_flags(project_id, key);
CREATE INDEX IF NOT EXISTS idx_inhouse_flags_enabled ON inhouse_feature_flags(project_id, enabled);

CREATE INDEX IF NOT EXISTS idx_inhouse_flag_overrides_flag ON inhouse_flag_overrides(flag_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_flag_overrides_user ON inhouse_flag_overrides(project_id, user_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_flag_overrides_expires ON inhouse_flag_overrides(expires_at) WHERE expires_at IS NOT NULL;

-- Trigger to update updated_at on flag changes
CREATE OR REPLACE FUNCTION update_inhouse_flags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_inhouse_flags_updated_at ON inhouse_feature_flags;
CREATE TRIGGER trigger_inhouse_flags_updated_at
    BEFORE UPDATE ON inhouse_feature_flags
    FOR EACH ROW
    EXECUTE FUNCTION update_inhouse_flags_updated_at();

-- Comment on tables
COMMENT ON TABLE inhouse_feature_flags IS 'Feature flags for @sheenapps/flags SDK - enables gradual rollouts and A/B testing';
COMMENT ON TABLE inhouse_flag_overrides IS 'Per-user overrides for feature flags - for beta testers or debugging';

-- RLS policies (if RLS is enabled)
DO $$
BEGIN
    -- Enable RLS if not already enabled
    ALTER TABLE inhouse_feature_flags ENABLE ROW LEVEL SECURITY;
    ALTER TABLE inhouse_flag_overrides ENABLE ROW LEVEL SECURITY;

    -- Create policy for service role (full access)
    DROP POLICY IF EXISTS inhouse_flags_service_policy ON inhouse_feature_flags;
    CREATE POLICY inhouse_flags_service_policy ON inhouse_feature_flags
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);

    DROP POLICY IF EXISTS inhouse_flag_overrides_service_policy ON inhouse_flag_overrides;
    CREATE POLICY inhouse_flag_overrides_service_policy ON inhouse_flag_overrides
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true);

    -- Create policy for authenticated users (project-scoped access)
    DROP POLICY IF EXISTS inhouse_flags_user_policy ON inhouse_feature_flags;
    CREATE POLICY inhouse_flags_user_policy ON inhouse_feature_flags
        FOR SELECT
        TO authenticated
        USING (
            project_id IN (
                SELECT id FROM projects WHERE owner_id = auth.uid()
                UNION
                SELECT project_id FROM project_collaborators WHERE user_id = auth.uid()
            )
        );

    DROP POLICY IF EXISTS inhouse_flag_overrides_user_policy ON inhouse_flag_overrides;
    CREATE POLICY inhouse_flag_overrides_user_policy ON inhouse_flag_overrides
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
