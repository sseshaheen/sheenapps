-- Migration: Add session tracking to project_versions table
-- Date: 2025-07-26
-- Description: Add columns to track Claude session IDs for session resumption functionality

BEGIN;

-- Add session tracking columns to project_versions
ALTER TABLE project_versions 
ADD COLUMN ai_session_id TEXT,
ADD COLUMN ai_session_created_at TIMESTAMP,
ADD COLUMN ai_session_last_used_at TIMESTAMP;

-- Create index for session lookups
CREATE INDEX idx_project_versions_session ON project_versions(ai_session_id);

-- Add comment to explain the columns
COMMENT ON COLUMN project_versions.ai_session_id IS 'Most recent Claude session ID for this version (changes with every Claude operation)';
COMMENT ON COLUMN project_versions.ai_session_created_at IS 'When the first session was created for this version';
COMMENT ON COLUMN project_versions.ai_session_last_used_at IS 'When the session was last used or updated';

-- Add session health tracking to project_ai_session_metrics
ALTER TABLE project_ai_session_metrics 
ADD COLUMN IF NOT EXISTS is_resumable BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS resume_failure_count INTEGER DEFAULT 0;

COMMIT;