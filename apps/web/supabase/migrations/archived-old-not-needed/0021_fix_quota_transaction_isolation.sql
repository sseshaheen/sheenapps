-- Fix transaction isolation issue in check_and_consume_quota
-- The SET TRANSACTION ISOLATION LEVEL must be called before any query,
-- but since RPC functions are already wrapped in transactions, we can't set it inside the function

CREATE OR REPLACE FUNCTION check_and_consume_quota(
  p_user_id UUID,
  p_metric TEXT,
  p_amount INTEGER DEFAULT 1,
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  limit_amount INTEGER,
  bonus_used INTEGER,
  already_processed BOOLEAN
) AS $$
DECLARE
  v_limit INTEGER;
  v_current_usage INTEGER;
  v_bonus_available INTEGER := 0;
  v_bonus_to_use INTEGER := 0;
  v_period_start DATE;
  v_metric_column TEXT;
  v_metric_name TEXT;
  v_plan_name TEXT;
BEGIN
  -- Normalize metric name
  v_metric_name := CASE 
    WHEN p_metric = 'projects' THEN 'projects_created'
    ELSE p_metric
  END;
  
  -- Map metric to usage_tracking column
  v_metric_column := CASE v_metric_name
    WHEN 'ai_generations' THEN 'ai_generations'
    WHEN 'projects_created' THEN 'projects_created'
    WHEN 'exports' THEN 'exports'
    ELSE v_metric_name
  END;
  
  -- Check idempotency if key provided
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM usage_events 
      WHERE user_id = p_user_id 
      AND idempotency_key = p_idempotency_key
    ) THEN
      -- Already processed
      allowed := true;
      remaining := 0;
      limit_amount := 0;
      bonus_used := 0;
      already_processed := true;
      RETURN NEXT;
      RETURN;
    END IF;
  END IF;

  -- REMOVED: SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  -- This was causing the error as it must be the first statement in a transaction
  
  -- Get current period
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Get plan limit with proper fallbacks
  SELECT 
    COALESCE(
      CASE 
        WHEN v_metric_name = 'ai_generations' THEN 
          CASE 
            WHEN pl.max_ai_generations_per_month = -1 THEN 999999 
            ELSE pl.max_ai_generations_per_month 
          END
        WHEN v_metric_name = 'exports' THEN 
          CASE 
            WHEN pl.max_exports_per_month = -1 THEN 999999 
            ELSE pl.max_exports_per_month 
          END
        WHEN v_metric_name = 'projects_created' THEN 
          CASE 
            WHEN pl.max_projects = -1 THEN 999999 
            ELSE pl.max_projects 
          END
        ELSE 50 -- Default fallback
      END,
      50 -- Final fallback for free tier
    ),
    COALESCE(s.plan_name, 'free')
  INTO v_limit, v_plan_name
  FROM auth.users u
  LEFT JOIN customers c ON c.user_id = u.id
  LEFT JOIN subscriptions s ON s.customer_id = c.stripe_customer_id 
    AND s.status IN ('active', 'trialing')
  LEFT JOIN plan_limits pl ON pl.plan_name = COALESCE(s.plan_name, 'free')
  WHERE u.id = p_user_id;
  
  -- Default to free plan if not found
  IF v_limit IS NULL THEN
    v_limit := CASE v_metric_name
      WHEN 'ai_generations' THEN 50
      WHEN 'exports' THEN 10  
      WHEN 'projects_created' THEN 3
      ELSE 50
    END;
  END IF;
  
  -- Get or create usage tracking record
  INSERT INTO usage_tracking (
    user_id, period_start, metric_name, metric_value
  ) VALUES (
    p_user_id, v_period_start, v_metric_column, 0
  )
  ON CONFLICT (user_id, period_start) 
  DO UPDATE SET updated_at = CURRENT_TIMESTAMP
  RETURNING 
    CASE v_metric_column
      WHEN 'ai_generations' THEN ai_generations
      WHEN 'projects_created' THEN projects_created
      WHEN 'exports' THEN exports
      ELSE 0
    END INTO v_current_usage;
  
  -- Get available bonus quota
  SELECT COALESCE(SUM(amount - used_amount), 0)
  INTO v_bonus_available
  FROM user_bonuses
  WHERE user_id = p_user_id
    AND metric = p_metric
    AND expires_at > CURRENT_TIMESTAMP
    AND used_amount < amount;
  
  -- Check if allowed
  IF v_current_usage + p_amount <= v_limit THEN
    -- Within plan limits
    allowed := true;
    remaining := v_limit - (v_current_usage + p_amount);
    bonus_used := 0;
  ELSIF v_current_usage < v_limit AND (v_current_usage + p_amount) <= (v_limit + v_bonus_available) THEN
    -- Using bonus quota
    allowed := true;
    v_bonus_to_use := (v_current_usage + p_amount) - v_limit;
    remaining := 0;
    bonus_used := v_bonus_to_use;
  ELSE
    -- Quota exceeded
    allowed := false;
    remaining := GREATEST(0, v_limit - v_current_usage);
    bonus_used := 0;
    
    -- Log denial
    INSERT INTO quota_audit_log (
      user_id, metric, requested_amount, limit_amount, 
      current_usage, success, reason
    ) VALUES (
      p_user_id, p_metric, p_amount, v_limit,
      v_current_usage, false, 'quota_exceeded'
    );
    
    limit_amount := v_limit;
    already_processed := false;
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Consume quota
  UPDATE usage_tracking
  SET 
    ai_generations = CASE WHEN v_metric_column = 'ai_generations' THEN ai_generations + p_amount ELSE ai_generations END,
    projects_created = CASE WHEN v_metric_column = 'projects_created' THEN projects_created + p_amount ELSE projects_created END,
    exports = CASE WHEN v_metric_column = 'exports' THEN exports + p_amount ELSE exports END,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id AND period_start = v_period_start;
  
  -- Use bonus quota if needed
  IF v_bonus_to_use > 0 THEN
    -- Update bonus usage (simplified - would need proper distribution logic)
    -- Using a subquery to limit the update to one row
    UPDATE user_bonuses
    SET used_amount = used_amount + v_bonus_to_use
    WHERE id = (
      SELECT id FROM user_bonuses
      WHERE user_id = p_user_id
        AND metric = p_metric
        AND expires_at > CURRENT_TIMESTAMP
        AND used_amount < amount
      ORDER BY expires_at ASC
      LIMIT 1
    );
  END IF;
  
  -- Record usage event
  INSERT INTO usage_events (
    user_id, metric, amount, idempotency_key
  ) VALUES (
    p_user_id, p_metric, p_amount, p_idempotency_key
  );
  
  -- Log success
  INSERT INTO quota_audit_log (
    user_id, metric, requested_amount, limit_amount,
    current_usage, success, remaining_quota, bonus_used
  ) VALUES (
    p_user_id, p_metric, p_amount, v_limit,
    v_current_usage, true, remaining, v_bonus_to_use
  );
  
  -- Return results
  limit_amount := v_limit;
  already_processed := false;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION check_and_consume_quota TO authenticated;

-- Add comment
COMMENT ON FUNCTION check_and_consume_quota IS 'Atomic quota consumption without transaction isolation setting';