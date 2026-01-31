-- Migration: Add unified chat preferences to projects table
-- Purpose: Support unified chat UI/UX with build mode toggle
-- Date: 2025-08-15
-- Fixed: Type compatibility with UUID columns

-- Add chat preferences column to store user's mode preference
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS 
  chat_preferences JSONB DEFAULT '{"buildImmediately": true}'::jsonb;

-- Add index for querying projects by chat mode preference
CREATE INDEX IF NOT EXISTS idx_projects_chat_preferences 
  ON public.projects((chat_preferences->>'buildImmediately'))
  WHERE chat_preferences IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.projects.chat_preferences IS 
  'User chat mode preferences including buildImmediately toggle';

-- Track unified chat sessions for analytics
CREATE TABLE IF NOT EXISTS public.unified_chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  mode_transitions INTEGER DEFAULT 0,
  messages_in_plan_mode INTEGER DEFAULT 0,
  messages_in_build_mode INTEGER DEFAULT 0,
  plans_converted_to_builds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Index for session analytics
CREATE INDEX IF NOT EXISTS idx_unified_sessions_project 
  ON public.unified_chat_sessions(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_unified_sessions_user 
  ON public.unified_chat_sessions(user_id, created_at DESC);

-- Function to update last_active timestamp
CREATE OR REPLACE FUNCTION update_unified_session_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_active = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update last_active
DROP TRIGGER IF EXISTS update_unified_session_activity_trigger ON public.unified_chat_sessions;
CREATE TRIGGER update_unified_session_activity_trigger
  BEFORE UPDATE ON public.unified_chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_unified_session_activity();

-- Add tracking for mode preferences in chat log
ALTER TABLE public.project_chat_log_minimal ADD COLUMN IF NOT EXISTS
  build_immediately BOOLEAN,
  ADD COLUMN IF NOT EXISTS mode_at_creation VARCHAR(10);

-- Grant permissions (if role exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON public.unified_chat_sessions TO authenticated;
  END IF;
END $$;

-- Add comment for the table
COMMENT ON TABLE public.unified_chat_sessions IS 
  'Tracks unified chat sessions for analytics and mode usage patterns';

-- Add comments for columns
COMMENT ON COLUMN public.unified_chat_sessions.mode_transitions IS 
  'Number of times user switched between plan and build modes';
COMMENT ON COLUMN public.unified_chat_sessions.messages_in_plan_mode IS 
  'Count of messages sent while in plan mode';
COMMENT ON COLUMN public.unified_chat_sessions.messages_in_build_mode IS 
  'Count of messages sent while in build mode';
COMMENT ON COLUMN public.unified_chat_sessions.plans_converted_to_builds IS 
  'Number of plans converted to actual builds';