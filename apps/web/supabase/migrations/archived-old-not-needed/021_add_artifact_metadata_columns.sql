-- Migration 021: Add artifact metadata columns
-- Date: July 27, 2025
-- Purpose: Add artifact size and checksum tracking for enhanced integrity and monitoring

BEGIN;

-- Add artifact metadata columns to project_versions table
ALTER TABLE project_versions 
ADD COLUMN IF NOT EXISTS artifact_size BIGINT,
ADD COLUMN IF NOT EXISTS artifact_checksum VARCHAR(64);

-- Add comments for documentation
COMMENT ON COLUMN project_versions.artifact_size IS 'Size of the R2 artifact in bytes';
COMMENT ON COLUMN project_versions.artifact_checksum IS 'SHA256 checksum of the R2 artifact (hex-encoded)';

-- Add index for size-based queries (monitoring large artifacts)
CREATE INDEX IF NOT EXISTS idx_project_versions_artifact_size 
ON project_versions(artifact_size) 
WHERE artifact_size IS NOT NULL;

-- Add index for checksum lookups (integrity verification)
CREATE INDEX IF NOT EXISTS idx_project_versions_artifact_checksum 
ON project_versions(artifact_checksum) 
WHERE artifact_checksum IS NOT NULL;

-- Add constraint to ensure checksum is valid SHA256 format (64 hex characters)
ALTER TABLE project_versions 
ADD CONSTRAINT chk_artifact_checksum_format 
CHECK (artifact_checksum IS NULL OR (artifact_checksum ~ '^[a-fA-F0-9]{64}$'));

-- Add constraint for reasonable artifact sizes (max 2GB)
ALTER TABLE project_versions 
ADD CONSTRAINT chk_artifact_size_limit 
CHECK (artifact_size IS NULL OR (artifact_size >= 0 AND artifact_size <= 2147483648));

COMMIT;