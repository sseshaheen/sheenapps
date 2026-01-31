-- Function for atomic commit + branch update (prevents lost updates)
CREATE OR REPLACE FUNCTION create_commit_and_update_branch(
  p_project_id UUID,
  p_author_id UUID,
  p_tree_hash TEXT,
  p_message TEXT,
  p_payload_size INTEGER,
  p_branch_name TEXT DEFAULT 'main'
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_commit_id UUID;
  v_parent_ids UUID[];
  v_branch_updated_at TIMESTAMPTZ;
BEGIN
  -- Set serializable isolation for this transaction
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- Get current head and updated_at for optimistic locking
  SELECT head_id, updated_at INTO v_parent_ids[1], v_branch_updated_at
  FROM branches 
  WHERE project_id = p_project_id AND name = p_branch_name;
  
  -- Create commit
  INSERT INTO commits (
    project_id, author_id, parent_ids, tree_hash, message, payload_size
  ) VALUES (
    p_project_id, p_author_id, COALESCE(v_parent_ids, '{}'), p_tree_hash, p_message, p_payload_size
  ) RETURNING id INTO v_commit_id;
  
  -- Update branch head atomically (prevents lost updates)
  UPDATE branches 
  SET head_id = v_commit_id, updated_at = NOW()
  WHERE project_id = p_project_id 
    AND name = p_branch_name
    AND updated_at = v_branch_updated_at;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Branch was updated by another process. Please retry.';
  END IF;
  
  RETURN v_commit_id;
END;
$$;