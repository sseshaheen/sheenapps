-- Quota System Fixes v2 - Fixed column references
-- This version properly handles the subscription/customer relationship

-- Fix 1: Add missing RPC function for users near quota limit
CREATE OR REPLACE FUNCTION get_users_near_quota_limit(
  p_threshold_percentage INTEGER DEFAULT 80
)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  metric TEXT,
  usage_percent NUMERIC,
  remaining INTEGER,
  plan_name TEXT
) 
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH user_quotas AS (
    SELECT 
      ut.user_id,
      ut.metric_name as metric,
      COALESCE(ut.usage_amount, 0) as current_usage,
      CASE 
        WHEN pl.plan_name IS NULL THEN 
          CASE ut.metric_name
            WHEN 'ai_generations' THEN 10
            WHEN 'exports' THEN 1
            WHEN 'projects' THEN 3
          END
        WHEN ut.metric_name = 'ai_generations' THEN pl.max_ai_generations_per_month
        WHEN ut.metric_name = 'exports' THEN pl.max_exports_per_month
        WHEN ut.metric_name = 'projects' THEN pl.max_projects
      END as limit_amount,
      COALESCE(pl.plan_name, 'free') as plan_name
    FROM usage_tracking ut
    LEFT JOIN customers c ON c.user_id = ut.user_id
    LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'trialing')
    LEFT JOIN plan_limits pl ON pl.plan_name = s.plan_name
    WHERE ut.period_start = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  )
  SELECT 
    uq.user_id,
    u.email,
    uq.metric,
    CASE 
      WHEN uq.limit_amount = -1 THEN 0
      ELSE ROUND((uq.current_usage::NUMERIC / NULLIF(uq.limit_amount, 0) * 100)::NUMERIC, 2)
    END as usage_percent,
    CASE 
      WHEN uq.limit_amount = -1 THEN 999999
      ELSE GREATEST(0, uq.limit_amount - uq.current_usage)
    END as remaining,
    uq.plan_name
  FROM user_quotas uq
  JOIN auth.users u ON u.id = uq.user_id
  WHERE 
    uq.limit_amount != -1 AND
    (uq.current_usage::NUMERIC / NULLIF(uq.limit_amount, 0) * 100) >= p_threshold_percentage
  ORDER BY usage_percent DESC;
END;
$$ LANGUAGE plpgsql;

-- Fix 2: Update check_and_consume_quota to handle subscription lookup correctly
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
  v_plan_limit INTEGER;
  v_current_usage INTEGER;
  v_bonus_available INTEGER;
  v_total_available INTEGER;
  v_period_start TIMESTAMPTZ;
  v_base_remaining INTEGER;
  v_bonus_needed INTEGER;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM usage_events 
      WHERE user_id = p_user_id 
      AND idempotency_key = p_idempotency_key
    ) THEN
      RETURN QUERY SELECT true, 0, 0, 0, true;
      RETURN;
    END IF;
  END IF;

  -- Start transaction with appropriate isolation
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- Get current period
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Get plan limit with proper fallbacks (fixed to use customer relationship)
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
        WHEN p_metric = 'projects' THEN 
          CASE 
            WHEN pl.max_projects = -1 THEN 999999
            ELSE pl.max_projects
          END
      END,
      -- Free plan defaults
      CASE p_metric
        WHEN 'ai_generations' THEN 10
        WHEN 'exports' THEN 1
        WHEN 'projects' THEN 3
        ELSE 0
      END
    ) INTO v_plan_limit
  FROM auth.users u
  LEFT JOIN customers c ON c.user_id = u.id
  LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'trialing')
  LEFT JOIN plan_limits pl ON pl.plan_name = s.plan_name
  WHERE u.id = p_user_id;
  
  -- Get current usage and lock the row
  INSERT INTO usage_tracking (user_id, metric_name, usage_amount, period_start)
  VALUES (p_user_id, p_metric, 0, v_period_start)
  ON CONFLICT (user_id, metric_name, period_start) DO NOTHING;
  
  SELECT COALESCE(usage_amount, 0) INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id 
  AND metric_name = p_metric
  AND period_start = v_period_start
  FOR UPDATE;
  
  -- Get available bonus
  SELECT COALESCE(SUM(amount - used_amount), 0) INTO v_bonus_available
  FROM user_bonuses
  WHERE user_id = p_user_id
  AND metric = p_metric
  AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
  
  -- Calculate what's available from base quota
  v_base_remaining := GREATEST(0, v_plan_limit - v_current_usage);
  
  -- Calculate total available
  v_total_available := v_base_remaining + v_bonus_available;
  
  -- Check if allowed
  IF v_total_available >= p_amount THEN
    -- Consume quota
    UPDATE usage_tracking 
    SET 
      usage_amount = usage_amount + p_amount,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id 
    AND metric_name = p_metric
    AND period_start = v_period_start;
    
    -- Track event with idempotency
    INSERT INTO usage_events (
      user_id, metric, amount, 
      idempotency_key, metadata
    ) VALUES (
      p_user_id, p_metric, p_amount,
      p_idempotency_key, jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'plan_limit', v_plan_limit,
        'usage_before', v_current_usage,
        'base_remaining', v_base_remaining,
        'bonus_available', v_bonus_available
      )
    );
    
    -- Calculate bonus needed (only what exceeds base quota)
    v_bonus_needed := GREATEST(0, p_amount - v_base_remaining);
    
    -- Consume bonus if needed
    IF v_bonus_needed > 0 THEN
      -- Use CTE to consume bonus in order of expiration
      WITH bonus_consumption AS (
        SELECT 
          id,
          amount - used_amount as available,
          SUM(amount - used_amount) OVER (ORDER BY expires_at NULLS LAST, created_at) as running_total
        FROM user_bonuses
        WHERE user_id = p_user_id 
        AND metric = p_metric
        AND used_amount < amount
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        FOR UPDATE
      )
      UPDATE user_bonuses b
      SET used_amount = used_amount + 
        CASE 
          WHEN bc.running_total - bc.available < v_bonus_needed 
          THEN LEAST(bc.available, v_bonus_needed - (bc.running_total - bc.available))
          ELSE 0
        END
      FROM bonus_consumption bc
      WHERE b.id = bc.id
      AND bc.running_total - bc.available < v_bonus_needed;
    END IF;
    
    -- Log successful consumption to audit trail
    INSERT INTO quota_audit_log (
      user_id, metric, attempted_amount,
      success, reason, context
    ) VALUES (
      p_user_id, p_metric, p_amount,
      true, CASE 
        WHEN v_bonus_needed > 0 THEN 'bonus_consumed'
        ELSE 'success'
      END,
      jsonb_build_object(
        'plan_limit', v_plan_limit,
        'usage_before', v_current_usage,
        'usage_after', v_current_usage + p_amount,
        'bonus_used', v_bonus_needed,
        'idempotency_key', p_idempotency_key
      )
    );
    
    RETURN QUERY SELECT 
      true AS allowed,
      v_total_available - p_amount AS remaining,
      v_plan_limit AS limit_amount,
      v_bonus_needed AS bonus_used,
      false AS already_processed;
  ELSE
    -- Log denial to audit trail
    INSERT INTO quota_audit_log (
      user_id, metric, attempted_amount, 
      success, reason, context
    ) VALUES (
      p_user_id, p_metric, p_amount,
      false, 'quota_exceeded', jsonb_build_object(
        'plan_limit', v_plan_limit,
        'current_usage', v_current_usage,
        'bonus_available', v_bonus_available,
        'total_available', v_total_available,
        'requested', p_amount
      )
    );
    
    RETURN QUERY SELECT 
      false AS allowed,
      v_total_available AS remaining,
      v_plan_limit AS limit_amount,
      0 AS bonus_used,
      false AS already_processed;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fix 3: Add helper function to get user quota status (used by frontend)
CREATE OR REPLACE FUNCTION get_user_quota_status(p_user_id UUID)
RETURNS TABLE (
  metric TEXT,
  current_usage INTEGER,
  plan_limit INTEGER,
  bonus_available INTEGER,
  remaining INTEGER,
  usage_percent NUMERIC,
  plan_name TEXT,
  next_reset TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  WITH user_plan AS (
    SELECT 
      COALESCE(pl.plan_name, 'free') as plan_name,
      pl.max_ai_generations_per_month,
      pl.max_exports_per_month,
      pl.max_projects
    FROM auth.users u
    LEFT JOIN customers c ON c.user_id = u.id
    LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'trialing')
    LEFT JOIN plan_limits pl ON pl.plan_name = s.plan_name
    WHERE u.id = p_user_id
    LIMIT 1
  ),
  metrics AS (
    SELECT 'ai_generations' as metric
    UNION ALL SELECT 'exports'
    UNION ALL SELECT 'projects'
  )
  SELECT 
    m.metric,
    COALESCE(ut.usage_amount, 0) as current_usage,
    CASE 
      WHEN m.metric = 'ai_generations' THEN COALESCE(up.max_ai_generations_per_month, 10)
      WHEN m.metric = 'exports' THEN COALESCE(up.max_exports_per_month, 1)
      WHEN m.metric = 'projects' THEN COALESCE(up.max_projects, 3)
    END as plan_limit,
    COALESCE((
      SELECT SUM(amount - used_amount)
      FROM user_bonuses ub
      WHERE ub.user_id = p_user_id
      AND ub.metric = m.metric
      AND (ub.expires_at IS NULL OR ub.expires_at > CURRENT_TIMESTAMP)
    ), 0)::INTEGER as bonus_available,
    CASE 
      WHEN m.metric = 'ai_generations' THEN GREATEST(0, COALESCE(up.max_ai_generations_per_month, 10) - COALESCE(ut.usage_amount, 0))
      WHEN m.metric = 'exports' THEN GREATEST(0, COALESCE(up.max_exports_per_month, 1) - COALESCE(ut.usage_amount, 0))
      WHEN m.metric = 'projects' THEN GREATEST(0, COALESCE(up.max_projects, 3) - COALESCE(ut.usage_amount, 0))
    END as remaining,
    CASE 
      WHEN m.metric = 'ai_generations' AND COALESCE(up.max_ai_generations_per_month, 10) > 0 
        THEN ROUND((COALESCE(ut.usage_amount, 0)::NUMERIC / COALESCE(up.max_ai_generations_per_month, 10) * 100), 2)
      WHEN m.metric = 'exports' AND COALESCE(up.max_exports_per_month, 1) > 0
        THEN ROUND((COALESCE(ut.usage_amount, 0)::NUMERIC / COALESCE(up.max_exports_per_month, 1) * 100), 2)
      WHEN m.metric = 'projects' AND COALESCE(up.max_projects, 3) > 0
        THEN ROUND((COALESCE(ut.usage_amount, 0)::NUMERIC / COALESCE(up.max_projects, 3) * 100), 2)
      ELSE 0
    END as usage_percent,
    up.plan_name,
    date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month' as next_reset
  FROM metrics m
  CROSS JOIN user_plan up
  LEFT JOIN usage_tracking ut ON 
    ut.user_id = p_user_id 
    AND ut.metric_name = m.metric
    AND ut.period_start = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
END;
$$ LANGUAGE plpgsql;

-- Add cleanup function for old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_quota_audit_logs()
RETURNS void AS $$
BEGIN
  DELETE FROM quota_audit_log 
  WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Add comments
COMMENT ON FUNCTION check_and_consume_quota IS 'Atomic quota consumption with customer/subscription relationship handling';
COMMENT ON FUNCTION get_users_near_quota_limit IS 'Get users approaching their quota limits for monitoring';
COMMENT ON FUNCTION get_user_quota_status IS 'Get complete quota status for a user across all metrics';