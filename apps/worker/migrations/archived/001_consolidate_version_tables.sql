-- Migration: Consolidate project_versions and project_versions_metadata tables
-- Date: 2025-01-04
-- Description: Add version metadata columns to project_versions table to eliminate two-table race conditions

-- =====================================================================================
-- PHASE 1: BACKUP EXISTING DATA
-- =====================================================================================

-- Create backups of existing tables before migration
CREATE TABLE IF NOT EXISTS project_versions_backup AS SELECT * FROM project_versions;
CREATE TABLE IF NOT EXISTS project_versions_metadata_backup AS SELECT * FROM project_versions_metadata;

-- =====================================================================================
-- PHASE 2: ADD NEW COLUMNS TO PROJECT_VERSIONS TABLE
-- =====================================================================================

-- Add 15 essential metadata columns to existing project_versions table
-- Note: build_duration_ms, user_id, project_id, parent_version_id, created_at, prompt_metadata already exist
ALTER TABLE public.project_versions
ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS published_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS published_by_user_id text,
ADD COLUMN IF NOT EXISTS user_comment text,
ADD COLUMN IF NOT EXISTS version_name character varying(100),
ADD COLUMN IF NOT EXISTS version_description text,
ADD COLUMN IF NOT EXISTS change_type character varying(10),
ADD COLUMN IF NOT EXISTS major_version integer,
ADD COLUMN IF NOT EXISTS minor_version integer,
ADD COLUMN IF NOT EXISTS patch_version integer,
ADD COLUMN IF NOT EXISTS prerelease text,
ADD COLUMN IF NOT EXISTS breaking_risk text,
ADD COLUMN IF NOT EXISTS auto_classified boolean,
ADD COLUMN IF NOT EXISTS classification_confidence numeric(3,2),
ADD COLUMN IF NOT EXISTS classification_reasoning text;

-- =====================================================================================
-- PHASE 3: POPULATE NEW COLUMNS FROM EXISTING METADATA TABLE
-- =====================================================================================

-- Populate new columns from existing metadata table (excluding duplicates)
-- Only update rows where metadata exists
UPDATE project_versions pv
SET
    version_name = pvm.version_name,
    version_description = pvm.version_description,
    change_type = pvm.change_type,
    major_version = pvm.major_version,
    minor_version = pvm.minor_version,
    patch_version = pvm.patch_version,
    prerelease = pvm.prerelease,
    breaking_risk = pvm.breaking_risk,
    auto_classified = pvm.auto_classified,
    classification_confidence = pvm.classification_confidence,
    classification_reasoning = pvm.classification_reasoning
    -- Note: is_published, published_at, published_by_user_id, user_comment don't exist in metadata table yet
FROM project_versions_metadata pvm
WHERE pv.version_id = pvm.version_id;

-- =====================================================================================
-- PHASE 4: ADD INDEXES FOR PERFORMANCE
-- =====================================================================================

-- Add indexes for common query patterns in versions API
CREATE INDEX IF NOT EXISTS idx_project_versions_project_published 
ON project_versions (project_id, is_published, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_versions_change_type 
ON project_versions (project_id, change_type) 
WHERE change_type IN ('minor', 'major');

-- =====================================================================================
-- MIGRATION VERIFICATION QUERIES
-- =====================================================================================

-- Verify migration success
-- Check that all existing versions have the new columns available
SELECT COUNT(*) as total_versions,
       COUNT(version_name) as versions_with_names,
       COUNT(major_version) as versions_with_semver
FROM project_versions;

-- Check if any data was migrated from metadata table
SELECT 'Migration completed successfully' as status,
       (SELECT COUNT(*) FROM project_versions_backup) as original_versions,
       (SELECT COUNT(*) FROM project_versions) as current_versions,
       (SELECT COUNT(*) FROM project_versions WHERE version_name IS NOT NULL) as versions_with_metadata;

-- =====================================================================================
-- ROLLBACK INSTRUCTIONS (for reference only - do not execute)
-- =====================================================================================

/*
-- To rollback this migration if needed:

-- 1. Remove added columns
ALTER TABLE project_versions
DROP COLUMN IF EXISTS is_published,
DROP COLUMN IF EXISTS published_at,
DROP COLUMN IF EXISTS published_by_user_id,
DROP COLUMN IF EXISTS user_comment,
DROP COLUMN IF EXISTS version_name,
DROP COLUMN IF EXISTS version_description,
DROP COLUMN IF EXISTS change_type,
DROP COLUMN IF EXISTS major_version,
DROP COLUMN IF EXISTS minor_version,
DROP COLUMN IF EXISTS patch_version,
DROP COLUMN IF EXISTS prerelease,
DROP COLUMN IF EXISTS breaking_risk,
DROP COLUMN IF EXISTS auto_classified,
DROP COLUMN IF EXISTS classification_confidence,
DROP COLUMN IF EXISTS classification_reasoning;

-- 2. Drop indexes
DROP INDEX IF EXISTS idx_project_versions_project_published;
DROP INDEX IF EXISTS idx_project_versions_change_type;

-- 3. Restore from backup if needed
-- TRUNCATE project_versions;
-- INSERT INTO project_versions SELECT * FROM project_versions_backup;

-- 4. Clean up backup tables
-- DROP TABLE project_versions_backup;
-- DROP TABLE project_versions_metadata_backup;
*/