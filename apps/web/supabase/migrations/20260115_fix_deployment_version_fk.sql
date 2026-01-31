-- =============================================================================
-- FIX: Deployment version_id FK type mismatch
-- Date: 2026-01-15
-- Priority: P0 (Blocker - prevents infrastructure migration from running)
-- =============================================================================

-- Problem: inhouse_deployments.version_id is UUID but project_versions.version_id is TEXT
-- Solution: Change version_id to TEXT to match the referenced column

-- This migration should run BEFORE 20260112_inhouse_mode_infrastructure.sql
-- Or as a standalone fix if infrastructure migration already failed

-- Drop the table if it exists (safe since infrastructure migration failed)
DROP TABLE IF EXISTS public.inhouse_deployments CASCADE;

-- Recreate with correct type
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

COMMENT ON COLUMN public.inhouse_deployments.version_id IS
'Reference to project_versions.version_id (TEXT type, not UUID)';

-- Indexes
CREATE INDEX idx_inhouse_deployments_project ON public.inhouse_deployments(project_id);
CREATE INDEX idx_inhouse_deployments_status ON public.inhouse_deployments(status);
CREATE INDEX idx_inhouse_deployments_created ON public.inhouse_deployments(created_at DESC);

-- RLS
ALTER TABLE public.inhouse_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_deployments FORCE ROW LEVEL SECURITY;

-- RLS Policy
CREATE POLICY "Users can view their deployments"
ON public.inhouse_deployments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = project_id AND p.owner_id = auth.uid()
    )
);

-- =============================================================================
-- MIGRATION NOTES
-- =============================================================================
--
-- This fixes the type mismatch that causes:
-- ERROR: 42804: foreign key constraint "inhouse_deployments_version_id_fkey" 
-- cannot be implemented
-- DETAIL: Key columns "version_id" and "version_id" are of incompatible types: 
-- uuid and text.
--
-- Root cause: project_versions has both:
--   - id UUID (primary key)
--   - version_id TEXT (the actual version identifier)
--
-- The FK should reference version_id (TEXT), not id (UUID)
--
-- =============================================================================
