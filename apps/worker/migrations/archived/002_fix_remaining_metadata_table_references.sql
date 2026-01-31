-- Migration 002: Fix Remaining project_versions_metadata Table References
-- Created: 2025-08-04
-- Purpose: Complete the table consolidation by ensuring all database functions
--          use the consolidated project_versions table instead of the old
--          project_versions_metadata table that was removed in migration 001.

-- Migration Summary:
-- This migration documents the code-level fixes applied to eliminate
-- all remaining references to project_versions_metadata table.

-- IMPORTANT: This is a code-level migration, not a schema migration.
-- All changes have been applied to the TypeScript codebase.

-- Files Modified:
-- 1. src/services/databaseWrapper.ts - Fixed getLatestVersionMetadata, getProjectVersionMetadata, 
--    getVersionBySemver, createVersionMetadata, updateVersionMetadata, getProjectVersionHistory
-- 2. src/services/database.ts - Fixed getVersionByDeploymentId to use consolidated table
-- 3. src/services/versionService.ts - Fixed type compatibility for consolidated table approach

-- Database Verification Query:
-- Confirm that the consolidated table has all necessary columns
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'project_versions' 
  AND column_name IN (
    'version_name', 'version_description', 'change_type',
    'major_version', 'minor_version', 'patch_version', 'prerelease',
    'breaking_risk', 'auto_classified', 'classification_confidence', 
    'classification_reasoning', 'is_published', 'published_at', 
    'published_by_user_id', 'user_comment'
  )
ORDER BY column_name;

-- Expected Result: All 15 version metadata columns should be present
-- If any columns are missing, run migration 001 first.

-- Performance Test Query:
-- Verify that single-table queries work correctly
SELECT 
  version_id,
  version_name,
  CONCAT(major_version, '.', minor_version, '.', patch_version) as computed_semver,
  change_type,
  created_at
FROM project_versions 
WHERE project_id = 'test-project-id'
  AND version_name IS NOT NULL
ORDER BY created_at DESC 
LIMIT 5;

-- Rollback Instructions:
-- If this migration needs to be reversed:
-- 1. Revert the TypeScript code changes in the modified files
-- 2. Restore references to project_versions_metadata table
-- 3. Ensure the metadata table still exists or recreate it
-- Note: This should not be necessary as the consolidated approach is more reliable

-- Post-Migration Steps:
-- 1. Test version creation and metadata population
-- 2. Verify API endpoints return complete version data
-- 3. Monitor database query performance (should be faster)
-- 4. Check that no errors reference missing project_versions_metadata table

-- Additional Notes:
-- - All functions now use the consolidated project_versions table
-- - Removed complex JOINs between project_versions and project_versions_metadata
-- - Enhanced error handling for null version metadata
-- - Maintained backward compatibility for existing API contracts
-- - Deprecated functions now redirect to consolidated table operations

-- Status: COMPLETED
-- All database function references to project_versions_metadata have been fixed.
-- The codebase now fully uses the consolidated project_versions table.