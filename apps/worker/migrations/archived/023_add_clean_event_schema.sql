-- Migration 023: Add Clean Event Schema for NextJS Team API UX Improvements
-- Date: 2025-07-30
-- Purpose: Implement structured event schema with security filtering

BEGIN;

-- Add new columns for clean event structure
ALTER TABLE project_build_events 
ADD COLUMN IF NOT EXISTS user_visible BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS internal_data JSONB,
ADD COLUMN IF NOT EXISTS event_phase VARCHAR(20),
ADD COLUMN IF NOT EXISTS event_title VARCHAR(200),
ADD COLUMN IF NOT EXISTS event_description TEXT,
ADD COLUMN IF NOT EXISTS overall_progress DECIMAL(3,2) CHECK (overall_progress >= 0.0 AND overall_progress <= 1.0),
ADD COLUMN IF NOT EXISTS finished BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS preview_url TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds DECIMAL(8,2);

-- Create index for user-visible events filtering
CREATE INDEX IF NOT EXISTS idx_build_events_user_visible 
ON project_build_events(build_id, user_visible, id) 
WHERE user_visible = true;

-- Create index for phase-based queries
CREATE INDEX IF NOT EXISTS idx_build_events_phase 
ON project_build_events(build_id, event_phase, id);

-- Add comments
COMMENT ON COLUMN project_build_events.user_visible IS 'Whether this event should be visible to end users (vs internal only)';
COMMENT ON COLUMN project_build_events.internal_data IS 'Sensitive internal data for debugging (file paths, system details, etc.)';
COMMENT ON COLUMN project_build_events.event_phase IS 'Build phase: setup, development, dependencies, build, deploy';
COMMENT ON COLUMN project_build_events.event_title IS 'Clean, user-friendly event title (no emojis or technical details)';
COMMENT ON COLUMN project_build_events.event_description IS 'User-friendly description of what is happening';
COMMENT ON COLUMN project_build_events.overall_progress IS 'Overall build progress from 0.0 to 1.0 for progress bar';
COMMENT ON COLUMN project_build_events.finished IS 'Whether this event represents completion of the entire build';
COMMENT ON COLUMN project_build_events.preview_url IS 'Preview URL when build is completed';
COMMENT ON COLUMN project_build_events.error_message IS 'Clean, user-friendly error message (no stack traces)';
COMMENT ON COLUMN project_build_events.duration_seconds IS 'How long this step took in seconds';

COMMIT;