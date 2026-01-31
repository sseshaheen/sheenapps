-- Migration 031: Add artifact_sha256 column for integrity verification
-- Expert recommendation: Better drift detection and security validation
-- IDEMPOTENT: Safe to run multiple times

-- Add artifact SHA256 column for integrity verification (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'project_versions_metadata' 
                   AND column_name = 'artifact_sha256') THEN
        ALTER TABLE project_versions_metadata
          ADD COLUMN artifact_sha256 VARCHAR(64);
    END IF;
END $$;

-- Create index for performance when looking up artifacts by hash (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes 
                   WHERE tablename = 'project_versions_metadata' 
                   AND indexname = 'idx_artifact_sha256') THEN
        CREATE INDEX idx_artifact_sha256 ON project_versions_metadata(artifact_sha256) 
          WHERE artifact_sha256 IS NOT NULL;
    END IF;
END $$;

-- Update comment for documentation (always safe to run)
COMMENT ON COLUMN project_versions_metadata.artifact_sha256 IS 
  'SHA256 hash of the artifact ZIP file for integrity verification and drift detection. Used by .sheenapps-project/active-artifact marker system.';