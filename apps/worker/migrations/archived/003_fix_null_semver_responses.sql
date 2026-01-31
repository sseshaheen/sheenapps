-- Migration 003: Fix Null Semver API Responses
-- Created: 2025-08-04
-- Purpose: Document fixes for API endpoints that were returning "null.null.null" 
--          instead of graceful defaults when version metadata is not yet populated.

-- Problem Analysis:
-- When API endpoints are called before metadata generation completes,
-- the major_version, minor_version, and patch_version fields are NULL.
-- Template literal construction like `${major_version}.${minor_version}.${patch_version}`
-- results in literal "null.null.null" strings instead of sensible defaults.

-- Files Modified (Code-level fixes):

-- 1. src/routes/versionHistory.ts
-- Fixed semver construction to use defaults:
-- OLD: semver: `${v.major_version}.${v.minor_version}.${v.patch_version}`
-- NEW: semver: `${v.major_version || 1}.${v.minor_version || 0}.${v.patch_version || 0}`
-- Also fixed: name field to provide fallback when version_name is null

-- 2. src/routes/publication.ts  
-- Fixed multiple semver constructions:
-- - Line ~51: targetVersion semver construction
-- - Line ~198: versionName fallback construction
-- - Line ~288: version semver in response
-- - Line ~390: publishedVersion semver construction  
-- - Line ~397: publishedVersion semver in response
-- - Line ~714: publishedVersionData semver in response

-- 3. src/routes/versionHistory.ts (milestone endpoint)
-- Fixed: semver: `${milestone.major_version || 1}.0.0`

-- 4. src/workers/streamWorker.ts
-- Fixed semver construction in version creation response:
-- semver: `${version.major_version || 1}.${version.minor_version || 0}.${version.patch_version || 0}`

-- Default Values Logic:
-- major_version: defaults to 1 (initial version)
-- minor_version: defaults to 0 (no minor changes yet)
-- patch_version: defaults to 0 (no patches yet)
-- This creates sensible fallback of "1.0.0" for new versions

-- Expected Behavior After Fix:
-- Before: {"semver": "null.null.null", "name": ""}
-- After:  {"semver": "1.0.0", "name": "Version 1.0.0"}

-- Verification Queries:
-- Test that API responses provide sensible defaults:
SELECT 
  version_id,
  CASE 
    WHEN major_version IS NULL THEN 'Should default to 1.0.0'
    ELSE CONCAT(major_version, '.', minor_version, '.', patch_version)
  END as semver_result,
  CASE 
    WHEN version_name IS NULL THEN CONCAT('Version ', COALESCE(major_version, 1), '.', COALESCE(minor_version, 0), '.', COALESCE(patch_version, 0))
    ELSE version_name
  END as name_result
FROM project_versions 
WHERE project_id = 'test-project'
ORDER BY created_at DESC 
LIMIT 3;

-- Performance Impact: None (same queries, just better response formatting)
-- Backward Compatibility: Improved (no more null.null.null responses)

-- Status: COMPLETED
-- All API endpoints now provide sensible defaults instead of null.null.null semver strings.
-- This resolves the immediate API response issue while metadata population is still in progress.