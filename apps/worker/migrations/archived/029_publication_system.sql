-- Migration 029: Publication-First Versioning System (Expert-Refined Final)
-- Created: August 2, 2025
-- Purpose: Implement publication-first architecture with expert-validated database design

BEGIN;

-- 1. Publication tracking on versions (Expert approach)
ALTER TABLE project_versions_metadata
  -- Core publication fields
  ADD COLUMN is_published BOOLEAN DEFAULT false NOT NULL,
  ADD COLUMN published_at TIMESTAMPTZ,
  ADD COLUMN published_by_user_id VARCHAR(255),
  ADD COLUMN soft_deleted_at TIMESTAMPTZ,
  
  -- UX tracking columns
  ADD COLUMN superseded_by_version_id CHAR(26),
  ADD COLUMN rollback_source_version_id CHAR(26),
  ADD COLUMN rollback_target_version_id CHAR(26),
  ADD COLUMN user_comment TEXT;

-- Add foreign key constraints with safe cascading
-- Note: published_by_user_id FK omitted due to UUID vs VARCHAR mismatch
ALTER TABLE project_versions_metadata
  ADD CONSTRAINT fk_superseded_by 
    FOREIGN KEY (superseded_by_version_id) 
    REFERENCES project_versions_metadata(version_id)
    ON DELETE SET NULL,
  ADD CONSTRAINT fk_rollback_source 
    FOREIGN KEY (rollback_source_version_id) 
    REFERENCES project_versions_metadata(version_id),
  ADD CONSTRAINT fk_rollback_target 
    FOREIGN KEY (rollback_target_version_id) 
    REFERENCES project_versions_metadata(version_id);
    
-- Add data integrity constraints
ALTER TABLE project_versions_metadata
  ADD CONSTRAINT unique_version_name_per_project 
    UNIQUE (project_id, version_name),
  ADD CONSTRAINT check_semver_format 
    CHECK (version_name ~ '^\\d+\\.\\d+\\.\\d+(-[a-z0-9]+)?$');

-- 2. Simplified publication constraint (Expert's approach)
CREATE UNIQUE INDEX idx_one_published_per_project
  ON project_versions_metadata(project_id)
  WHERE is_published = true AND soft_deleted_at IS NULL;

-- 3. Multi-domain support with composite PK (Expert's design)
CREATE TABLE project_published_domains (
  project_id VARCHAR(255) NOT NULL,
  domain_name VARCHAR(255) UNIQUE NOT NULL,
  domain_type VARCHAR(20) DEFAULT 'sheenapps',
  is_primary BOOLEAN DEFAULT false,
  ssl_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  PRIMARY KEY (project_id, domain_name)
  
  -- Note: FK constraint to projects(id) omitted due to UUID vs VARCHAR mismatch
  -- This will be addressed in a future schema normalization migration
);

-- Ensure only one primary domain per project
CREATE UNIQUE INDEX idx_one_primary_domain_per_project
  ON project_published_domains(project_id)
  WHERE is_primary = true;

-- 4. Denormalized performance column (Expert's approach)
ALTER TABLE projects
  ADD COLUMN published_version_id CHAR(26),
  ADD CONSTRAINT fk_published_version
    FOREIGN KEY (published_version_id)
    REFERENCES project_versions_metadata(version_id)
    ON DELETE SET NULL;

-- 5. Performance indexes
CREATE INDEX idx_published_versions 
  ON project_versions_metadata(project_id, published_at DESC) 
  WHERE is_published = true;

CREATE INDEX idx_superseded_versions 
  ON project_versions_metadata(superseded_by_version_id) 
  WHERE superseded_by_version_id IS NOT NULL;

CREATE INDEX idx_rollback_lineage 
  ON project_versions_metadata(rollback_source_version_id, rollback_target_version_id) 
  WHERE rollback_source_version_id IS NOT NULL;

CREATE INDEX idx_user_comments 
  ON project_versions_metadata(project_id) 
  WHERE user_comment IS NOT NULL;

-- 6. Metrics table for operational monitoring
CREATE TABLE versioning_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL,
  metric_type VARCHAR(50) NOT NULL,
  metric_value NUMERIC NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_versioning_metrics_project_type 
  ON versioning_metrics(project_id, metric_type, created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE project_published_domains IS 'Manages custom domains and sheenapps.com subdomains for published projects';
COMMENT ON TABLE versioning_metrics IS 'Operational metrics for publication system monitoring';
COMMENT ON COLUMN project_versions_metadata.is_published IS 'True if this version is currently published and live';
COMMENT ON COLUMN project_versions_metadata.published_at IS 'Timestamp when version was published';
COMMENT ON COLUMN project_versions_metadata.published_by_user_id IS 'User who published this version';
COMMENT ON COLUMN project_versions_metadata.user_comment IS 'Optional user comment explaining the version changes';
COMMENT ON COLUMN projects.published_version_id IS 'Denormalized reference to currently published version for fast queries';

COMMIT;

-- Migration completed successfully
-- Next steps: 
-- 1. Update API endpoints to support publication workflow
-- 2. Implement domain management and CNAME resolution  
-- 3. Add publication metrics collection