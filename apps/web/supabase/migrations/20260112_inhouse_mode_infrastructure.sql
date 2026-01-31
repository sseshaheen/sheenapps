-- =============================================================================
-- In-House Mode Infrastructure
-- Part of "Everything In-House" Phase 1 implementation
-- =============================================================================

-- =============================================================================
-- 1. INFRASTRUCTURE MODE ENUM & COLUMN
-- =============================================================================

-- Infrastructure mode: easy (managed by SheenApps) vs pro (BYOI)
CREATE TYPE public.infrastructure_mode AS ENUM ('easy', 'pro');

COMMENT ON TYPE public.infrastructure_mode IS
'Infrastructure mode for projects: easy = SheenApps managed, pro = Bring Your Own Infrastructure';

-- Add infrastructure_mode column to projects table
ALTER TABLE public.projects
ADD COLUMN infra_mode public.infrastructure_mode NOT NULL DEFAULT 'pro';

COMMENT ON COLUMN public.projects.infra_mode IS
'Infrastructure mode: easy = SheenApps managed hosting/db/cms, pro = external integrations (Supabase/Vercel/Sanity)';

-- Add inhouse-specific columns to projects
ALTER TABLE public.projects
ADD COLUMN inhouse_subdomain VARCHAR(63),
ADD COLUMN inhouse_custom_domain VARCHAR(255),
ADD COLUMN inhouse_schema_name VARCHAR(63),
ADD COLUMN inhouse_build_id VARCHAR(64),
ADD COLUMN inhouse_deployed_at TIMESTAMPTZ,
ADD COLUMN inhouse_quota_db_bytes BIGINT DEFAULT 0,
ADD COLUMN inhouse_quota_storage_bytes BIGINT DEFAULT 0,
ADD COLUMN inhouse_quota_requests_today INT DEFAULT 0,
ADD COLUMN inhouse_quota_reset_at TIMESTAMPTZ;

COMMENT ON COLUMN public.projects.inhouse_subdomain IS
'Subdomain for Easy Mode projects: {subdomain}.sheenapps.com';

COMMENT ON COLUMN public.projects.inhouse_custom_domain IS
'Custom domain for Easy Mode projects (Pro tier feature)';

COMMENT ON COLUMN public.projects.inhouse_schema_name IS
'PostgreSQL schema name for Easy Mode project data isolation';

COMMENT ON COLUMN public.projects.inhouse_build_id IS
'Current deployed build ID for Easy Mode hosting';

COMMENT ON COLUMN public.projects.inhouse_deployed_at IS
'Last deployment timestamp for Easy Mode hosting';

-- Constraint: subdomain must be valid DNS label
ALTER TABLE public.projects
ADD CONSTRAINT projects_inhouse_subdomain_valid
CHECK (inhouse_subdomain IS NULL OR inhouse_subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');

-- Constraint: custom domain must look like a domain
ALTER TABLE public.projects
ADD CONSTRAINT projects_inhouse_custom_domain_valid
CHECK (inhouse_custom_domain IS NULL OR inhouse_custom_domain ~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(\.[a-z]{2,})+$');

-- Index for subdomain lookups (hostname routing)
CREATE UNIQUE INDEX idx_projects_inhouse_subdomain
ON public.projects(inhouse_subdomain)
WHERE inhouse_subdomain IS NOT NULL;

-- Index for custom domain lookups
CREATE UNIQUE INDEX idx_projects_inhouse_custom_domain
ON public.projects(inhouse_custom_domain)
WHERE inhouse_custom_domain IS NOT NULL;

-- =============================================================================
-- 2. IN-HOUSE PROJECT SCHEMAS (Tenant Data Isolation)
-- =============================================================================

-- Each Easy Mode project gets its own PostgreSQL schema
-- This table tracks metadata about the schema
CREATE TABLE public.inhouse_project_schemas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    schema_name VARCHAR(63) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Schema statistics
    table_count INT DEFAULT 0,
    row_count_estimate BIGINT DEFAULT 0,
    size_bytes BIGINT DEFAULT 0,
    last_migration_at TIMESTAMPTZ,
    migration_version INT DEFAULT 0,

    -- Status tracking
    status VARCHAR(20) NOT NULL DEFAULT 'active',

    CONSTRAINT inhouse_schemas_project_unique UNIQUE(project_id),
    CONSTRAINT inhouse_schemas_name_unique UNIQUE(schema_name),
    CONSTRAINT inhouse_schemas_status_valid CHECK (status IN ('active', 'suspended', 'deleted'))
);

COMMENT ON TABLE public.inhouse_project_schemas IS
'Metadata for PostgreSQL schemas created for Easy Mode projects';

-- Index for project lookups
CREATE INDEX idx_inhouse_schemas_project ON public.inhouse_project_schemas(project_id);

-- =============================================================================
-- 3. IN-HOUSE TABLES REGISTRY
-- =============================================================================

-- Registry of all tables created within project schemas
-- Used for query validation and allowlist enforcement
CREATE TABLE public.inhouse_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schema_id UUID NOT NULL REFERENCES public.inhouse_project_schemas(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    table_name VARCHAR(63) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Table metadata
    display_name VARCHAR(100),
    description TEXT,
    row_count_estimate BIGINT DEFAULT 0,
    size_bytes BIGINT DEFAULT 0,

    -- Access control
    is_system_table BOOLEAN DEFAULT FALSE,
    allow_client_read BOOLEAN DEFAULT TRUE,
    allow_client_write BOOLEAN DEFAULT TRUE,

    CONSTRAINT inhouse_tables_unique UNIQUE(schema_id, table_name)
);

COMMENT ON TABLE public.inhouse_tables IS
'Registry of tables in Easy Mode project schemas - used for query allowlist validation';

-- Index for schema lookups
CREATE INDEX idx_inhouse_tables_schema ON public.inhouse_tables(schema_id);
CREATE INDEX idx_inhouse_tables_project ON public.inhouse_tables(project_id);

-- =============================================================================
-- 4. IN-HOUSE COLUMNS REGISTRY
-- =============================================================================

-- Registry of columns within project tables
-- Used for query validation and column allowlist enforcement
CREATE TABLE public.inhouse_columns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID NOT NULL REFERENCES public.inhouse_tables(id) ON DELETE CASCADE,
    column_name VARCHAR(63) NOT NULL,
    data_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Column metadata
    display_name VARCHAR(100),
    description TEXT,
    is_nullable BOOLEAN DEFAULT TRUE,
    is_primary_key BOOLEAN DEFAULT FALSE,
    default_value TEXT,

    -- Access control
    is_sensitive BOOLEAN DEFAULT FALSE,
    allow_client_read BOOLEAN DEFAULT TRUE,
    allow_client_write BOOLEAN DEFAULT TRUE,

    CONSTRAINT inhouse_columns_unique UNIQUE(table_id, column_name)
);

COMMENT ON TABLE public.inhouse_columns IS
'Registry of columns in Easy Mode project tables - used for query allowlist validation';

-- Index for table lookups
CREATE INDEX idx_inhouse_columns_table ON public.inhouse_columns(table_id);

-- =============================================================================
-- 5. IN-HOUSE DEPLOYMENTS
-- =============================================================================

-- Track deployment history for Easy Mode projects
CREATE TABLE public.inhouse_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    build_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deployed_at TIMESTAMPTZ,

    -- Deployment metadata
    -- FIX: Changed from UUID to TEXT to match project_versions.version_id type
    version_id TEXT REFERENCES public.project_versions(version_id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Cloudflare deployment info
    cf_worker_name VARCHAR(255),
    cf_worker_version VARCHAR(64),

    -- Metrics
    bundle_size_bytes BIGINT,
    static_assets_count INT,
    static_assets_bytes BIGINT,
    deploy_duration_ms INT,

    -- Error tracking
    error_message TEXT,
    error_details JSONB,

    CONSTRAINT inhouse_deployments_status_valid
    CHECK (status IN ('pending', 'uploading', 'deploying', 'deployed', 'failed', 'rolled_back'))
);

COMMENT ON TABLE public.inhouse_deployments IS
'Deployment history for Easy Mode projects (Workers for Platforms)';

-- Indexes
CREATE INDEX idx_inhouse_deployments_project ON public.inhouse_deployments(project_id);
CREATE INDEX idx_inhouse_deployments_status ON public.inhouse_deployments(status);
CREATE INDEX idx_inhouse_deployments_created ON public.inhouse_deployments(created_at DESC);

-- =============================================================================
-- 6. IN-HOUSE API KEYS
-- =============================================================================

-- API keys for Easy Mode projects (used by @sheenapps/db SDK)
CREATE TABLE public.inhouse_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Key identification
    key_prefix VARCHAR(12) NOT NULL,  -- "sheen_pk_xxx" (visible part)
    key_hash VARCHAR(64) NOT NULL,     -- SHA-256 hash of full key
    key_type VARCHAR(20) NOT NULL DEFAULT 'public',

    -- Metadata
    name VARCHAR(100),
    description TEXT,

    -- Access control
    scopes TEXT[] DEFAULT ARRAY['read', 'write'],

    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    usage_count BIGINT DEFAULT 0,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,
    expires_at TIMESTAMPTZ,

    CONSTRAINT inhouse_api_keys_prefix_unique UNIQUE(key_prefix),
    CONSTRAINT inhouse_api_keys_type_valid CHECK (key_type IN ('public', 'server', 'admin')),
    CONSTRAINT inhouse_api_keys_status_valid CHECK (status IN ('active', 'revoked', 'expired'))
);

COMMENT ON TABLE public.inhouse_api_keys IS
'API keys for Easy Mode projects - used by @sheenapps/db SDK';

-- Indexes
CREATE INDEX idx_inhouse_api_keys_project ON public.inhouse_api_keys(project_id);
CREATE INDEX idx_inhouse_api_keys_hash ON public.inhouse_api_keys(key_hash);
CREATE INDEX idx_inhouse_api_keys_prefix ON public.inhouse_api_keys(key_prefix);

-- =============================================================================
-- 7. IN-HOUSE RATE LIMITS & QUOTAS
-- =============================================================================

-- Per-project rate limiting and quota tracking
CREATE TABLE public.inhouse_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

    -- Tier limits
    tier VARCHAR(20) NOT NULL DEFAULT 'free',

    -- Database limits
    db_size_limit_bytes BIGINT NOT NULL DEFAULT 104857600,  -- 100MB
    db_size_used_bytes BIGINT DEFAULT 0,

    -- Storage limits
    storage_size_limit_bytes BIGINT NOT NULL DEFAULT 524288000,  -- 500MB
    storage_size_used_bytes BIGINT DEFAULT 0,

    -- Request limits (daily)
    requests_limit_daily INT NOT NULL DEFAULT 10000,
    requests_used_today INT DEFAULT 0,
    requests_reset_at TIMESTAMPTZ,

    -- Bandwidth limits (monthly)
    bandwidth_limit_bytes BIGINT NOT NULL DEFAULT 1073741824,  -- 1GB
    bandwidth_used_bytes BIGINT DEFAULT 0,
    bandwidth_reset_at TIMESTAMPTZ,

    -- Build limits (monthly)
    builds_limit_monthly INT NOT NULL DEFAULT 100,
    builds_used_month INT DEFAULT 0,
    builds_reset_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT inhouse_quotas_project_unique UNIQUE(project_id),
    CONSTRAINT inhouse_quotas_tier_valid CHECK (tier IN ('free', 'starter', 'growth', 'scale', 'enterprise'))
);

COMMENT ON TABLE public.inhouse_quotas IS
'Quota tracking and rate limiting for Easy Mode projects';

-- Index
CREATE INDEX idx_inhouse_quotas_project ON public.inhouse_quotas(project_id);

-- =============================================================================
-- 8. IN-HOUSE REQUEST LOG (for rate limiting)
-- =============================================================================

-- Request log for rate limiting (partitioned by time for efficient cleanup)
CREATE TABLE public.inhouse_request_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL,
    api_key_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Request details
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,

    -- Response details
    status_code INT,
    response_size_bytes INT,
    duration_ms INT,

    -- Metadata
    client_ip INET,
    user_agent TEXT
);

COMMENT ON TABLE public.inhouse_request_log IS
'Request log for Easy Mode API Gateway - used for rate limiting and analytics';

-- Indexes for rate limiting queries
CREATE INDEX idx_inhouse_request_log_project_time
ON public.inhouse_request_log(project_id, created_at DESC);

-- Index for cleanup (will delete old entries periodically)
CREATE INDEX idx_inhouse_request_log_created
ON public.inhouse_request_log(created_at);

-- =============================================================================
-- 9. RLS POLICIES
-- =============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.inhouse_project_schemas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_project_schemas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_tables FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_columns FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_deployments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_api_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_quotas FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inhouse_request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_request_log FORCE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own project data

-- inhouse_project_schemas: owner can see their project's schema
CREATE POLICY "Users can view their project schemas"
ON public.inhouse_project_schemas FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their project schemas"
ON public.inhouse_project_schemas FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

-- inhouse_tables: owner can see their project's tables
CREATE POLICY "Users can view their project tables"
ON public.inhouse_tables FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their project tables"
ON public.inhouse_tables FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

-- inhouse_columns: inherit from table access
CREATE POLICY "Users can view their table columns"
ON public.inhouse_columns FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.inhouse_tables t
        JOIN public.projects p ON p.id = t.project_id
        WHERE t.id = table_id AND p.owner_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their table columns"
ON public.inhouse_columns FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.inhouse_tables t
        JOIN public.projects p ON p.id = t.project_id
        WHERE t.id = table_id AND p.owner_id = auth.uid()
    )
);

-- inhouse_deployments: owner can see their deployments
CREATE POLICY "Users can view their deployments"
ON public.inhouse_deployments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

-- inhouse_api_keys: owner can manage their keys
CREATE POLICY "Users can view their API keys"
ON public.inhouse_api_keys FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their API keys"
ON public.inhouse_api_keys FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

-- inhouse_quotas: owner can view their quotas
CREATE POLICY "Users can view their quotas"
ON public.inhouse_quotas FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

-- inhouse_request_log: no direct user access (system only)
-- Request logs are accessed via aggregate APIs, not directly

-- =============================================================================
-- 10. HELPER FUNCTIONS
-- =============================================================================

-- Generate a unique subdomain for a project
CREATE OR REPLACE FUNCTION public.generate_inhouse_subdomain(project_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_subdomain TEXT;
    final_subdomain TEXT;
    counter INT := 0;
BEGIN
    -- Normalize: lowercase, replace spaces/special chars with hyphens
    base_subdomain := LOWER(REGEXP_REPLACE(project_name, '[^a-z0-9]+', '-', 'gi'));
    -- Trim leading/trailing hyphens
    base_subdomain := TRIM(BOTH '-' FROM base_subdomain);
    -- Truncate to 50 chars to leave room for counter
    base_subdomain := LEFT(base_subdomain, 50);

    -- Start with base
    final_subdomain := base_subdomain;

    -- Check for conflicts and append counter if needed
    WHILE EXISTS (
        SELECT 1 FROM public.projects
        WHERE inhouse_subdomain = final_subdomain
    ) LOOP
        counter := counter + 1;
        final_subdomain := base_subdomain || '-' || counter::TEXT;
    END LOOP;

    RETURN final_subdomain;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.generate_inhouse_subdomain IS
'Generate a unique subdomain for Easy Mode projects based on project name';

-- Generate a unique schema name for a project
CREATE OR REPLACE FUNCTION public.generate_inhouse_schema_name(project_id UUID)
RETURNS TEXT AS $$
BEGIN
    -- Schema name format: project_{short_uuid}
    RETURN 'project_' || REPLACE(project_id::TEXT, '-', '')::VARCHAR(32);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.generate_inhouse_schema_name IS
'Generate a PostgreSQL schema name for Easy Mode project data isolation';

-- =============================================================================
-- 11. TRIGGER: Auto-create quota record when project switches to Easy Mode
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_project_infra_mode_change()
RETURNS TRIGGER AS $$
BEGIN
    -- If switching to easy mode, create quota record if not exists
    IF NEW.infra_mode = 'easy' AND (OLD.infra_mode IS NULL OR OLD.infra_mode != 'easy') THEN
        INSERT INTO public.inhouse_quotas (project_id, tier)
        VALUES (NEW.id, 'free')
        ON CONFLICT (project_id) DO NOTHING;

        -- Generate subdomain if not set
        IF NEW.inhouse_subdomain IS NULL THEN
            NEW.inhouse_subdomain := public.generate_inhouse_subdomain(NEW.name);
        END IF;

        -- Generate schema name if not set
        IF NEW.inhouse_schema_name IS NULL THEN
            NEW.inhouse_schema_name := public.generate_inhouse_schema_name(NEW.id);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_project_infra_mode_change
BEFORE INSERT OR UPDATE OF infra_mode ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.handle_project_infra_mode_change();

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
--
-- This migration adds:
-- 1. infra_mode column to projects (easy vs pro)
-- 2. In-house specific columns to projects (subdomain, custom domain, etc.)
-- 3. Tables for tracking Easy Mode project schemas and tables
-- 4. Deployment tracking for Workers for Platforms
-- 5. API key management for @sheenapps/db SDK
-- 6. Quota and rate limiting infrastructure
-- 7. Request logging for analytics
-- 8. RLS policies for all new tables
-- 9. Helper functions for subdomain/schema generation
--
-- All existing projects default to 'pro' mode (no change to current behavior).
-- New projects can choose 'easy' mode to use SheenApps managed infrastructure.
-- =============================================================================
