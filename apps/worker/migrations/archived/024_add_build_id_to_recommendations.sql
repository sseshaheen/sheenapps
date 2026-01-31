-- Migration: Add build_id to project_recommendations table
-- Date: 2025-01-30
-- Purpose: Allow direct buildId to recommendations lookup for NextJS frontend

-- Add build_id column to project_recommendations table
ALTER TABLE project_recommendations 
ADD COLUMN IF NOT EXISTS build_id VARCHAR(64);

-- Create index for fast buildId lookups
CREATE INDEX IF NOT EXISTS idx_recommendations_build_id 
ON project_recommendations(build_id) 
WHERE build_id IS NOT NULL;

-- Add comment explaining the new column
COMMENT ON COLUMN project_recommendations.build_id IS 'Build ID for direct lookup from frontend (temporary identifier during build process)';