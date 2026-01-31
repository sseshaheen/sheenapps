-- Migration: Add display version for immediate user feedback
-- This enables showing version numbers (v1, v2, v3) immediately after deployment
-- without waiting for metadata generation

-- Add display version column
ALTER TABLE project_versions 
ADD COLUMN IF NOT EXISTS display_version_number INTEGER;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_project_display_version 
ON project_versions(project_id, display_version_number DESC);

-- Backfill existing versions (assigns v1, v2, v3... based on creation order)
WITH numbered_versions AS (
  SELECT 
    id,
    version_id,
    project_id,
    version_name,
    ROW_NUMBER() OVER (
      PARTITION BY project_id 
      ORDER BY created_at ASC
    ) as version_num
  FROM project_versions
  WHERE status = 'deployed'
)
UPDATE project_versions pv
SET 
  display_version_number = nv.version_num,
  -- Always set version_name to display version format for consistency
  -- Unless it already has a custom name (not in semantic version format)
  version_name = CASE 
    WHEN nv.version_name IS NULL OR nv.version_name ~ '^\d+\.\d+\.\d+' 
    THEN 'v' || nv.version_num
    ELSE nv.version_name  -- Keep custom names if they exist
  END
FROM numbered_versions nv
WHERE pv.id = nv.id;

-- Add comment for documentation
COMMENT ON COLUMN project_versions.display_version_number IS 
'User-facing version number (v1, v2, v3...) assigned immediately on deployment for instant user feedback';