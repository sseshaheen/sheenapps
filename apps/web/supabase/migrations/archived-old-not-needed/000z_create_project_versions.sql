-- Migration: Create project_versions table for build versioning
-- Date: 2025-07-19

CREATE TABLE IF NOT EXISTS project_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    version_id TEXT NOT NULL UNIQUE, -- ULID/UUID format
    prompt TEXT NOT NULL,
    parent_version_id TEXT,
    preview_url TEXT,
    artifact_url TEXT, -- link to the zip in R2
    framework TEXT,
    build_duration_ms INTEGER,
    install_duration_ms INTEGER,
    deploy_duration_ms INTEGER,
    output_size_bytes INTEGER,
    claude_json JSONB, -- raw CLI result
    status TEXT NOT NULL CHECK (status IN ('building', 'deployed', 'failed')),
    needs_rebuild BOOLEAN DEFAULT FALSE,
    base_snapshot_id TEXT, -- for diff tracking
    cf_deployment_id TEXT, -- for webhook mapping
    node_version TEXT, -- for deterministic rebuilds
    pnpm_version TEXT, -- for deterministic rebuilds
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_project_versions_user_project ON project_versions(user_id, project_id);
CREATE INDEX idx_project_versions_project_version ON project_versions(project_id, version_id);
CREATE INDEX idx_project_versions_user_project_created ON project_versions(user_id, project_id, created_at DESC);
CREATE INDEX idx_project_versions_cf_deployment ON project_versions(cf_deployment_id) WHERE cf_deployment_id IS NOT NULL;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_project_versions_updated_at BEFORE UPDATE
ON project_versions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE project_versions IS 'Stores all build versions for projects with their deployment metadata';
COMMENT ON COLUMN project_versions.version_id IS 'ULID/UUID to avoid race conditions';
COMMENT ON COLUMN project_versions.artifact_url IS 'R2/S3 URL for the zipped build output';
COMMENT ON COLUMN project_versions.needs_rebuild IS 'Flag for marking stale versions that need rebuilding';
COMMENT ON COLUMN project_versions.base_snapshot_id IS 'Reference to base version for diff tracking';
COMMENT ON COLUMN project_versions.cf_deployment_id IS 'Cloudflare Pages deployment ID for webhook mapping';