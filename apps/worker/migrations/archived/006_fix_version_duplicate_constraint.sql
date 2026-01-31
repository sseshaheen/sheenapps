-- Migration: Fix Version Duplicate Constraint Error
-- Purpose: Handle duplicate version creation attempts gracefully with UPSERT logic
-- Date: 2025-08-05

-- Replace the problematic create_version_on_success function with defensive logic
CREATE OR REPLACE FUNCTION create_version_on_success(
  p_project_id UUID,
  p_version_id TEXT,
  p_user_id UUID,
  p_prompt TEXT,
  p_framework VARCHAR(16),
  p_ai_session_id TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  -- Use INSERT ... ON CONFLICT to handle duplicate version_id gracefully
  INSERT INTO project_versions (user_id, project_id, version_id, prompt, 
                               framework, status, ai_session_id, ai_session_created_at, ai_session_last_used_at)
  VALUES (p_user_id, p_project_id, p_version_id, p_prompt, 
          p_framework, 'deployed', p_ai_session_id, 
          CASE WHEN p_ai_session_id IS NOT NULL THEN NOW() ELSE NULL END,
          CASE WHEN p_ai_session_id IS NOT NULL THEN NOW() ELSE NULL END)
  ON CONFLICT (version_id) DO NOTHING;
          
  -- Update project to point to this successful version (idempotent)
  UPDATE projects 
  SET current_version_id = p_version_id,
      build_status = 'deployed',
      last_build_completed = NOW()
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql;

-- Add improved comment
COMMENT ON FUNCTION create_version_on_success IS 'Creates version record with conflict handling and updates project only when build completes successfully';