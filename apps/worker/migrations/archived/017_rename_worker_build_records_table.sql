-- Migration: Rename worker_build_records table to project_build_records
-- Date: 2025-07-25
-- Description: Rename table to better reflect that builds are project-specific, not worker-specific

BEGIN;

-- Rename the table
ALTER TABLE worker_build_records RENAME TO project_build_records;

-- Add comment to explain the table's purpose
COMMENT ON TABLE project_build_records IS 'Stores build records for each project, tracking build attempts, status, and associated metadata';

COMMIT;