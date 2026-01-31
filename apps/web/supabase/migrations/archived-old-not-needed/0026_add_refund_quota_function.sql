-- Add function to refund quota when a project is deleted
CREATE OR REPLACE FUNCTION refund_project_quota(
  p_user_id UUID,
  p_project_id UUID
) RETURNS TABLE (
  success BOOLEAN,
  previous_usage INTEGER,
  new_usage INTEGER,
  message TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_period_start TIMESTAMPTZ;
  v_current_usage INTEGER;
  v_project_exists BOOLEAN;
BEGIN
  -- Check if the project exists and belongs to the user
  SELECT EXISTS(
    SELECT 1 FROM projects 
    WHERE id = p_project_id AND user_id = p_user_id
  ) INTO v_project_exists;
  
  -- If project doesn't exist or doesn't belong to user, return early
  IF NOT v_project_exists THEN
    RETURN QUERY SELECT 
      FALSE AS success,
      0 AS previous_usage,
      0 AS new_usage,
      'Project not found or does not belong to user' AS message;
    RETURN;
  END IF;
  
  -- Get the current billing period start
  v_period_start := date_trunc('month', NOW());
  
  -- Get current usage
  SELECT projects_created INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id AND period_start = v_period_start;
  
  -- If no usage tracking record exists, nothing to refund
  IF v_current_usage IS NULL THEN
    RETURN QUERY SELECT 
      TRUE AS success,
      0 AS previous_usage,
      0 AS new_usage,
      'No usage to refund for current period' AS message;
    RETURN;
  END IF;
  
  -- If usage is already 0, nothing to refund
  IF v_current_usage <= 0 THEN
    RETURN QUERY SELECT 
      TRUE AS success,
      0 AS previous_usage,
      0 AS new_usage,
      'Usage already at zero' AS message;
    RETURN;
  END IF;
  
  -- Decrement the projects_created count
  UPDATE usage_tracking
  SET 
    projects_created = GREATEST(0, projects_created - 1),
    updated_at = NOW()
  WHERE user_id = p_user_id AND period_start = v_period_start
  RETURNING projects_created INTO v_current_usage;
  
  -- Log the refund in quota_audit_log
  INSERT INTO quota_audit_log (
    user_id,
    metric,
    success,
    reason,
    context,
    requested_amount,
    current_usage,
    created_at
  ) VALUES (
    p_user_id,
    'projects_created',
    TRUE,
    'project_deletion_refund',
    jsonb_build_object(
      'project_id', p_project_id,
      'operation', 'refund',
      'previous_usage', v_current_usage + 1,
      'new_usage', v_current_usage
    ),
    -1,
    v_current_usage,
    NOW()
  );
  
  RETURN QUERY SELECT 
    TRUE AS success,
    v_current_usage + 1 AS previous_usage,
    v_current_usage AS new_usage,
    'Quota refunded successfully' AS message;
END;
$$;

-- Add index for better performance on quota audit log refunds
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_refunds 
ON quota_audit_log(user_id, reason, created_at DESC)
WHERE reason = 'project_deletion_refund';

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION refund_project_quota TO authenticated;
GRANT EXECUTE ON FUNCTION refund_project_quota TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION refund_project_quota IS 'Refunds project creation quota when a project is deleted. Decrements the projects_created counter in usage_tracking for the current billing period.';