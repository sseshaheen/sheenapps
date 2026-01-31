-- Fix quota_audit_log table to match what the function expects
-- The function uses different column names than what exists in the table

-- Add missing columns to quota_audit_log table
ALTER TABLE quota_audit_log 
ADD COLUMN IF NOT EXISTS requested_amount INTEGER,
ADD COLUMN IF NOT EXISTS limit_amount INTEGER,
ADD COLUMN IF NOT EXISTS current_usage INTEGER,
ADD COLUMN IF NOT EXISTS remaining_quota INTEGER,
ADD COLUMN IF NOT EXISTS bonus_used INTEGER;

-- Copy data from attempted_amount to requested_amount if it exists
UPDATE quota_audit_log 
SET requested_amount = attempted_amount 
WHERE requested_amount IS NULL AND attempted_amount IS NOT NULL;

-- Drop the old column
ALTER TABLE quota_audit_log 
DROP COLUMN IF EXISTS attempted_amount;

-- Update the function to use consistent column naming
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
  v_plan_name TEXT;
BEGIN
  -- Normalize metric name for the column
  v_metric_column := CASE 
    WHEN p_metric = 'projects' THEN 'projects_created'
    WHEN p_metric = 'ai_generations' THEN 'ai_generations'
    WHEN p_metric = 'exports' THEN 'exports'
    ELSE p_metric
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
  
  -- Get current period (month)
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Get plan limit with proper fallbacks
  SELECT 
    COALESCE(
      CASE 
        WHEN p_metric = 'ai_generations' THEN 
          CASE 
            WHEN pl.max_ai_generations_per_month = -1 THEN 999999 
            ELSE pl.max_ai_generations_per_month 
          END
        WHEN p_metric = 'exports' THEN 
          CASE 
            WHEN pl.max_exports_per_month = -1 THEN 999999 
            ELSE pl.max_exports_per_month 
          END
        WHEN p_metric = 'projects' OR p_metric = 'projects_created' THEN 
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
  LEFT JOIN subscriptions s ON s.customer_id::text = c.stripe_customer_id::text 
    AND s.status IN ('active', 'trialing')
  LEFT JOIN plan_limits pl ON pl.plan_name = COALESCE(s.plan_name, 'free')
  WHERE u.id = p_user_id;
  
  -- Default to free plan limits if not found
  IF v_limit IS NULL THEN
    v_limit := CASE v_metric_column
      WHEN 'ai_generations' THEN 50
      WHEN 'exports' THEN 10  
      WHEN 'projects_created' THEN 3
      ELSE 50
    END;
  END IF;
  
  -- Get or create usage tracking record with denormalized columns
  INSERT INTO usage_tracking (
    user_id, 
    period_start,
    ai_generations,
    projects_created,
    exports,
    storage_mb
  ) VALUES (
    p_user_id, 
    v_period_start,
    0,  -- ai_generations
    0,  -- projects_created
    0,  -- exports
    0   -- storage_mb
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
    
    -- Log denial (simplified to only required columns)
    BEGIN
      INSERT INTO quota_audit_log (
        user_id, metric, requested_amount, limit_amount, 
        current_usage, success, reason, remaining_quota, bonus_used
      ) VALUES (
        p_user_id, p_metric, p_amount, v_limit,
        v_current_usage, false, 'quota_exceeded', remaining, 0
      );
    EXCEPTION WHEN others THEN
      -- If insert fails, just log and continue
      RAISE NOTICE 'Failed to log quota denial: %', SQLERRM;
    END;
    
    limit_amount := v_limit;
    already_processed := false;
    RETURN NEXT;
    RETURN;
  END IF;
  
  -- Consume quota by updating the specific column
  UPDATE usage_tracking
  SET 
    ai_generations = CASE WHEN v_metric_column = 'ai_generations' THEN ai_generations + p_amount ELSE ai_generations END,
    projects_created = CASE WHEN v_metric_column = 'projects_created' THEN projects_created + p_amount ELSE projects_created END,
    exports = CASE WHEN v_metric_column = 'exports' THEN exports + p_amount ELSE exports END,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = p_user_id AND period_start = v_period_start;
  
  -- Use bonus quota if needed
  IF v_bonus_to_use > 0 THEN
    -- Update bonus usage
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
  
  -- Record usage event (if this table exists)
  BEGIN
    INSERT INTO usage_events (
      user_id, metric, amount, idempotency_key
    ) VALUES (
      p_user_id, p_metric, p_amount, p_idempotency_key
    );
  EXCEPTION WHEN undefined_table THEN
    -- Table doesn't exist, skip
    NULL;
  END;
  
  -- Log success (simplified)
  BEGIN
    INSERT INTO quota_audit_log (
      user_id, metric, requested_amount, limit_amount,
      current_usage, success, reason, remaining_quota, bonus_used
    ) VALUES (
      p_user_id, p_metric, p_amount, v_limit,
      v_current_usage, true, 'success', remaining, v_bonus_to_use
    );
  EXCEPTION WHEN others THEN
    -- If insert fails, just log and continue
    RAISE NOTICE 'Failed to log quota success: %', SQLERRM;
  END;
  
  -- Return results
  limit_amount := v_limit;
  already_processed := false;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure proper permissions
GRANT EXECUTE ON FUNCTION check_and_consume_quota TO authenticated;

-- Add comment
COMMENT ON FUNCTION check_and_consume_quota IS 'Atomic quota consumption with error handling for audit logging';