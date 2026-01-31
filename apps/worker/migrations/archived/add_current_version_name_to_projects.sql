-- Migration: Add current_version_name to projects table
-- Date: 2025-08-03
-- Purpose: Frontend team requested current_version_name field in projects table for their existing status endpoint

-- Add current_version_name column to projects table
ALTER TABLE projects 
ADD COLUMN current_version_name text;

-- Add comment explaining the column
COMMENT ON COLUMN projects.current_version_name IS 'Human-readable name of the current version (e.g., "v1.2.3" or custom name)';

-- IMPORTANT: After running this migration, create the index separately with:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_projects_current_version_name 
-- ON projects (current_version_name) WHERE current_version_name IS NOT NULL;
--
-- Why separate? CREATE INDEX CONCURRENTLY cannot run inside a transaction block,
-- but psql -f wraps commands in a transaction. Run the index command separately:
-- psql -c "CREATE INDEX CONCURRENTLY ..." 
--
-- ✅ This index has already been created successfully.