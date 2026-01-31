-- Fix race condition in project creation by making create_project_for_build idempotent
-- This addresses the architectural boundary violation where both Worker and NextJS
-- try to create the same project simultaneously

DROP FUNCTION IF EXISTS create_project_for_build(uuid, character varying, text, text);

CREATE OR REPLACE FUNCTION create_project_for_build(
  p_user_id UUID,
  p_framework CHARACTER VARYING DEFAULT 'react',
  p_prompt TEXT DEFAULT NULL,
  p_name TEXT DEFAULT 'Untitled Project'
) RETURNS TABLE(project_id UUID, version_id TEXT, build_id TEXT, build_metrics_id INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  new_project_id UUID;
  new_version_id TEXT;
  new_build_id TEXT;
  new_metrics_id INTEGER;
  existing_project_id UUID;
BEGIN
  -- Advisory lock prevents accidental double-click project creation
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text || coalesce(p_prompt, 'default')));
  
  -- Check if a project with similar characteristics already exists for this user
  -- This helps detect race conditions between Worker and NextJS
  SELECT id INTO existing_project_id
  FROM projects 
  WHERE owner_id = p_user_id 
    AND name = p_name
    AND framework = p_framework
    AND created_at > NOW() - INTERVAL '10 seconds'  -- Recent creation indicates race condition
  LIMIT 1;
  
  IF existing_project_id IS NOT NULL THEN
    -- Race condition detected - return existing project info
    -- Get the associated build info
    SELECT p.id, pbm.version_id, pbm.build_id, pbm.id
    INTO new_project_id, new_version_id, new_build_id, new_metrics_id
    FROM projects p
    LEFT JOIN project_build_metrics pbm ON p.current_build_id = pbm.build_id
    WHERE p.id = existing_project_id;
    
    -- If no build metrics found, this might be from NextJS - create them
    IF new_build_id IS NULL THEN
      new_version_id := generate_ulid();
      new_build_id := generate_ulid();
      
      -- Create build metrics for existing project
      INSERT INTO project_build_metrics (build_id, version_id, project_id, user_id,
                                       is_initial_build, status, started_at, framework)
      VALUES (new_build_id, new_version_id, existing_project_id, p_user_id,
              true, 'started', NOW(), p_framework)
      RETURNING id INTO new_metrics_id;
      
      -- Update project with build info
      UPDATE projects 
      SET current_build_id = new_build_id, 
          build_status = 'building',
          last_build_started = NOW()
      WHERE id = existing_project_id;
    END IF;
    
    RETURN QUERY SELECT existing_project_id, new_version_id, new_build_id, new_metrics_id;
    RETURN;
  END IF;
  
  -- Generate all IDs server-side
  new_project_id := gen_random_uuid();
  new_version_id := generate_ulid();
  new_build_id := generate_ulid();
  
  -- Create project with initial build state (use INSERT ... ON CONFLICT for idempotency)
  INSERT INTO projects (id, owner_id, name, framework, created_by_service,
                       build_status, current_build_id, last_build_started)
  VALUES (new_project_id, p_user_id, p_name, p_framework, 'worker-service',
          'building', new_build_id, NOW())
  ON CONFLICT (id) DO NOTHING;
  
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
$$;

COMMENT ON FUNCTION create_project_for_build IS 'Creates project with build metrics (idempotent) - handles race conditions between Worker and NextJS services';