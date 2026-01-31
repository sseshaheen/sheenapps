-- Migration: Fix Version Creation Timing
-- Purpose: Prevent ghost version records by creating versions only on successful builds
-- Date: 2025-08-04

-- Drop the problematic function from migration 004
DROP FUNCTION IF EXISTS create_complete_project(UUID, VARCHAR(16), TEXT, TEXT);

-- Create improved function that delays version creation until build success
CREATE OR REPLACE FUNCTION create_project_for_build(
  p_user_id UUID,
  p_framework VARCHAR(16) DEFAULT 'react',
  p_prompt TEXT DEFAULT NULL,
  p_name TEXT DEFAULT 'Untitled Project'
) RETURNS TABLE(project_id UUID, version_id TEXT, build_id TEXT, build_metrics_id INTEGER) AS $$
DECLARE
  new_project_id UUID;
  new_version_id TEXT;
  new_build_id TEXT;
  new_metrics_id INTEGER;
BEGIN
  -- Advisory lock prevents accidental double-click project creation (automatic cleanup on transaction end)
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));
  
  -- Generate all IDs server-side
  new_project_id := gen_random_uuid();
  new_version_id := generate_ulid();
  new_build_id := generate_ulid();
  
  -- Create project with initial build state (no current_version_id yet - set on success)
  INSERT INTO projects (id, owner_id, name, framework, created_by_service,
                       build_status, current_build_id, last_build_started)
  VALUES (new_project_id, p_user_id, p_name, p_framework, 'worker-service',
          'building', new_build_id, NOW());
  
  -- IMPORTANT: Don't create project_versions record yet!
  -- StreamWorker will create it only when build succeeds to prevent ghost versions
  
  -- Create initial build metrics record
  INSERT INTO project_build_metrics (build_id, version_id, project_id, user_id,
                                   is_initial_build, status, started_at, framework)
  VALUES (new_build_id, new_version_id, new_project_id, p_user_id,
          true, 'started', NOW(), p_framework)
  RETURNING id INTO new_metrics_id;
  
  RETURN QUERY SELECT new_project_id, new_version_id, new_build_id, new_metrics_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to complete version creation on successful build
CREATE OR REPLACE FUNCTION create_version_on_success(
  p_project_id UUID,
  p_version_id TEXT,
  p_user_id UUID,
  p_prompt TEXT,
  p_framework VARCHAR(16),
  p_ai_session_id TEXT DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  -- Create version record only when build succeeds
  INSERT INTO project_versions (user_id, project_id, version_id, prompt, 
                               framework, status, ai_session_id, ai_session_created_at, ai_session_last_used_at)
  VALUES (p_user_id, p_project_id, p_version_id, p_prompt, 
          p_framework, 'deployed', p_ai_session_id, 
          CASE WHEN p_ai_session_id IS NOT NULL THEN NOW() ELSE NULL END,
          CASE WHEN p_ai_session_id IS NOT NULL THEN NOW() ELSE NULL END);
          
  -- Update project to point to this successful version
  UPDATE projects 
  SET current_version_id = p_version_id,
      build_status = 'deployed',
      last_build_completed = NOW()
  WHERE id = p_project_id;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION create_project_for_build IS 'Creates project with build metrics but delays version creation until build success to prevent ghost versions';
COMMENT ON FUNCTION create_version_on_success IS 'Creates version record and updates project only when build completes successfully';