-- Migration 007: Add structured error handling columns
-- This enables error code taxonomy and internationalization support

BEGIN;

-- Add structured error columns to project_build_events
ALTER TABLE project_build_events 
ADD COLUMN error_code TEXT,
ADD COLUMN error_params JSONB,
ADD COLUMN user_error_message TEXT;

-- Add indexes for error analytics and filtering
CREATE INDEX idx_pbe_error_code ON project_build_events(error_code)
  WHERE error_code IS NOT NULL;

CREATE INDEX idx_project_build_events_user_error_message 
ON project_build_events(user_error_message) 
WHERE user_error_message IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN project_build_events.error_code IS 'Structured error code for internationalization (e.g., AI_LIMIT_REACHED, NETWORK_TIMEOUT)';
COMMENT ON COLUMN project_build_events.error_params IS 'JSON parameters for error context (e.g., {resetTime: 1754636400})';
COMMENT ON COLUMN project_build_events.user_error_message IS 'User-friendly error message for legacy clients (will be deprecated in favor of error_code)';

COMMIT;