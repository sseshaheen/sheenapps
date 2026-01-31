-- Migration: Add AI session tracking to projects table
-- Purpose: Store last AI session ID for context continuity in chat plan mode
-- Date: 2025-01-09

-- Add columns to projects table for session tracking
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS last_ai_session_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS last_ai_session_updated_at TIMESTAMP WITH TIME ZONE;

-- Create index for session lookup performance
CREATE INDEX IF NOT EXISTS idx_projects_last_ai_session_id 
  ON public.projects(last_ai_session_id) 
  WHERE last_ai_session_id IS NOT NULL;

-- Create index for finding stale sessions (if needed for cleanup)
CREATE INDEX IF NOT EXISTS idx_projects_last_ai_session_updated_at 
  ON public.projects(last_ai_session_updated_at) 
  WHERE last_ai_session_updated_at IS NOT NULL;

-- Update trigger to set updated_at when session changes
CREATE OR REPLACE FUNCTION update_ai_session_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_ai_session_id IS DISTINCT FROM OLD.last_ai_session_id THEN
    NEW.last_ai_session_updated_at = CURRENT_TIMESTAMP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp update
DROP TRIGGER IF EXISTS update_ai_session_timestamp_trigger ON public.projects;
CREATE TRIGGER update_ai_session_timestamp_trigger
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_session_timestamp();

-- Add comment for documentation
COMMENT ON COLUMN public.projects.last_ai_session_id IS 'Last AI (Claude CLI) session ID for context continuity';
COMMENT ON COLUMN public.projects.last_ai_session_updated_at IS 'Timestamp when AI session was last updated';