-- Migration: Add project_recommendations table
-- Date: 2025-07-24
-- Purpose: Store AI-generated recommendations for project improvements

-- Create the recommendations table
CREATE TABLE IF NOT EXISTS project_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id VARCHAR(255) NOT NULL,
  version_id VARCHAR(32) NOT NULL,
  recommendations JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(project_id, version_id)
);

-- Index for fast lookups by project
CREATE INDEX IF NOT EXISTS idx_recommendations_project ON project_recommendations(project_id);

-- Index for fast lookups by version
CREATE INDEX IF NOT EXISTS idx_recommendations_version ON project_recommendations(version_id);

-- Also fix the buildId field length issue found during testing
-- VARCHAR(64) needed for compound IDs like "ULID-recommendations" (43 chars)
ALTER TABLE project_build_events ALTER COLUMN build_id TYPE VARCHAR(64);

-- Comments
COMMENT ON TABLE project_recommendations IS 'Stores AI-generated recommendations for next features to add to projects';
COMMENT ON COLUMN project_recommendations.recommendations IS 'Array of recommendation objects with title, description, prompt, complexity, impact, etc';
