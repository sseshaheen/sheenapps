-- Migration: Add version columns to project_build_events
-- Purpose: Persist version info so it survives refresh/polling (currently only on bus)
-- Date: 2026-01-12

BEGIN;

-- Add version_id column for API operations (e.g., rollback)
ALTER TABLE project_build_events
ADD COLUMN IF NOT EXISTS version_id TEXT;

-- Add version_name column for human-readable display
ALTER TABLE project_build_events
ADD COLUMN IF NOT EXISTS version_name TEXT;

-- Add comment for documentation
COMMENT ON COLUMN project_build_events.version_id IS 'Version identifier for API operations (populated on build completion events)';
COMMENT ON COLUMN project_build_events.version_name IS 'Human-readable version name for UI display (populated on build completion events)';

-- Index for version lookups (optional - only if we query by version)
-- CREATE INDEX IF NOT EXISTS idx_build_events_version ON project_build_events(version_id) WHERE version_id IS NOT NULL;

COMMIT;
