-- Migration: Add enhanced prompt tracking
-- Date: 2025-07-25
-- Purpose: Store the enhanced prompt sent to Claude alongside the original user prompt

-- Add column to store the enhanced prompt that was actually sent to Claude
ALTER TABLE project_versions 
  ADD COLUMN IF NOT EXISTS enhanced_prompt TEXT;

-- Add column to track prompt metadata
ALTER TABLE project_versions 
  ADD COLUMN IF NOT EXISTS prompt_metadata JSONB;

-- Comments for documentation
COMMENT ON COLUMN project_versions.enhanced_prompt IS 'The full enhanced prompt sent to Claude (includes technical instructions)';
COMMENT ON COLUMN project_versions.prompt_metadata IS 'Metadata about the prompt (type, attempt number, is_update, etc.)';