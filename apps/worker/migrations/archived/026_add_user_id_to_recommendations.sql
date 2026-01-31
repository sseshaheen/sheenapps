-- Migration: Add user_id to project_recommendations table
-- Date: 2025-01-30
-- Purpose: Enable direct user-based filtering for frontend recommendations

-- Add user_id column to project_recommendations table
ALTER TABLE project_recommendations 
ADD COLUMN IF NOT EXISTS user_id VARCHAR(255);

-- Create index for fast user-based lookups
CREATE INDEX IF NOT EXISTS idx_recommendations_user_id 
ON project_recommendations(user_id) 
WHERE user_id IS NOT NULL;

-- Create composite index for user + build_id lookups (most common frontend query)
CREATE INDEX IF NOT EXISTS idx_recommendations_user_build 
ON project_recommendations(user_id, build_id) 
WHERE user_id IS NOT NULL AND build_id IS NOT NULL;

-- Create composite index for user + project lookups
CREATE INDEX IF NOT EXISTS idx_recommendations_user_project 
ON project_recommendations(user_id, project_id) 
WHERE user_id IS NOT NULL;

-- Populate user_id from project_versions table for existing records
UPDATE project_recommendations 
SET user_id = pv.user_id
FROM project_versions pv
WHERE project_recommendations.version_id = pv.version_id 
AND project_recommendations.project_id = pv.project_id
AND project_recommendations.user_id IS NULL;

-- Add comment explaining the new column
COMMENT ON COLUMN project_recommendations.user_id IS 'User ID for direct user-based filtering and security isolation';