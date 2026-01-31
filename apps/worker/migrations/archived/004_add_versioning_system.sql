-- Migration: Add smart versioning system
-- Date: 2025-07-24
-- Purpose: Implement intelligent version management with classification and rollback support

-- Create the project versions metadata table
CREATE TABLE IF NOT EXISTS project_versions_metadata (
  -- Identifiers
  version_id CHAR(26) PRIMARY KEY,        -- ULID checkpoint (exactly 26 chars)
  project_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  
  -- Semantic versioning
  major_version INT NOT NULL DEFAULT 1,
  minor_version INT NOT NULL DEFAULT 0,
  patch_version INT NOT NULL DEFAULT 0,
  prerelease VARCHAR(50),                 -- For -rc1, -beta2, etc.
  
  -- Metadata
  version_name VARCHAR(100),              -- "Added Product Search"
  version_description TEXT,               -- Longer description
  change_type VARCHAR(10) NOT NULL,       -- patch/minor/major/rollback
  breaking_risk VARCHAR(10),              -- none/low/medium/high
  
  -- Classification
  auto_classified BOOLEAN DEFAULT true,
  classification_confidence DECIMAL(3,2), -- 0.00 to 1.00
  classification_reasoning TEXT,          -- Claude's explanation
  
  -- Relationships
  parent_version_id CHAR(26),
  base_version_id CHAR(26),               -- For updates/branches
  from_recommendation_id INT,             -- If created from recommendation
  
  -- Statistics
  files_changed INT DEFAULT 0,
  lines_added INT DEFAULT 0,
  lines_removed INT DEFAULT 0,
  build_duration_ms INT,
  total_files INT,
  
  -- Git metadata
  git_commit_sha VARCHAR(40),
  git_tag VARCHAR(50),                    -- "v2.1.7"
  
  -- Schema versioning
  schema_version INT DEFAULT 1,           -- For future migrations
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  deployed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  FOREIGN KEY (project_id) REFERENCES projects(project_id),
  FOREIGN KEY (parent_version_id) REFERENCES project_versions_metadata(version_id)
);

-- Create indexes separately (PostgreSQL best practice)
CREATE INDEX IF NOT EXISTS idx_project_history ON project_versions_metadata(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_version_semver ON project_versions_metadata(project_id, major_version, minor_version, patch_version);
CREATE INDEX IF NOT EXISTS idx_version_type ON project_versions_metadata(change_type);
CREATE INDEX IF NOT EXISTS idx_git_tag ON project_versions_metadata(git_tag);

-- Add version tracking to existing project_versions table
ALTER TABLE project_versions 
  ADD COLUMN IF NOT EXISTS version_metadata_id CHAR(26),
  ADD CONSTRAINT fk_version_metadata FOREIGN KEY (version_metadata_id) REFERENCES project_versions_metadata(version_id);

-- Comments for documentation
COMMENT ON TABLE project_versions_metadata IS 'Stores semantic versioning and classification data for project versions';
COMMENT ON COLUMN project_versions_metadata.version_id IS 'ULID checkpoint identifier for instant rollback';
COMMENT ON COLUMN project_versions_metadata.change_type IS 'Version bump type: patch (fixes), minor (features), major (breaking), rollback';
COMMENT ON COLUMN project_versions_metadata.auto_classified IS 'True if Claude classified, false if user overrode';
COMMENT ON COLUMN project_versions_metadata.breaking_risk IS 'Risk assessment: none, low (config), medium (deps), high (API/schema)';

-- Backfill existing versions (optional, can be run separately)
-- This creates version 1.0.0, 1.0.1, 1.0.2... for existing versions
INSERT INTO project_versions_metadata (
  version_id,
  project_id,
  user_id,
  major_version,
  minor_version,
  patch_version,
  version_name,
  change_type,
  created_at
)
SELECT 
  pv.version_id,
  pv.project_id,
  pv.user_id,
  1, -- Default major
  0, -- Default minor  
  ROW_NUMBER() OVER (PARTITION BY pv.project_id ORDER BY pv.created_at) - 1, -- Sequential patches
  'Legacy Version',
  'patch',
  pv.created_at
FROM project_versions pv
WHERE NOT EXISTS (
  SELECT 1 FROM project_versions_metadata pvm
  WHERE pvm.version_id = pv.version_id
)
ON CONFLICT (version_id) DO NOTHING;

-- Update project_versions to link to metadata
UPDATE project_versions pv
SET version_metadata_id = pv.version_id
WHERE version_metadata_id IS NULL
AND EXISTS (
  SELECT 1 FROM project_versions_metadata pvm
  WHERE pvm.version_id = pv.version_id
);