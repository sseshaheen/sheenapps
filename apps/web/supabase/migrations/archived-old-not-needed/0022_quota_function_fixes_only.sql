-- Quota Function Fixes - Only fixes for existing functions
-- Based on analysis of postgres-functions-29-june-2025.sql

-- Fix 1: The check_and_consume_quota function has an issue with subscription lookup
-- It joins directly on s.user_id but subscriptions table has customer_id
CREATE OR REPLACE FUNCTION public.check_and_consume_quota(
  p_user_id uuid, 
  p_metric text, 
  p_amount integer DEFAULT 1, 
  p_idempotency_key text DEFAULT NULL::text
)
RETURNS TABLE(allowed boolean, remaining integer, limit_amount integer, bonus_used integer, already_processed boolean)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_plan_limit INTEGER;
  v_current_usage INTEGER;
  v_bonus_available INTEGER;
  v_total_available INTEGER;
  v_period_start TIMESTAMPTZ;
  v_base_remaining INTEGER;
  v_bonus_needed INTEGER;
  v_metric_name TEXT;
BEGIN
  -- Map metric names for usage_tracking compatibility
  v_metric_name := CASE 
    WHEN p_metric = 'projects' THEN 'projects_created'
    ELSE p_metric
  END;

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
  
  -- Get plan limit with FIXED subscription lookup via customers table
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
  LEFT JOIN customers c ON c.user_id = u.id -- Fixed: proper join through customers
  LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'trialing')
  LEFT JOIN plan_limits pl ON pl.plan_name = s.plan_name
  WHERE u.id = p_user_id;
  
  -- Ensure usage_tracking record exists with proper fields
  INSERT INTO usage_tracking (
    user_id, 
    metric_name, 
    metric_value,
    usage_amount, 
    period_start,
    period_end
  )
  VALUES (
    p_user_id, 
    v_metric_name, 
    0,
    0, 
    v_period_start,
    v_period_start + INTERVAL '1 month' - INTERVAL '1 second'
  )
  ON CONFLICT (user_id, period_start) -- Fixed: handle composite primary key
  DO NOTHING;
  
  -- Get current usage and lock the row
  SELECT COALESCE(usage_amount, 0) INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id 
  AND metric_name = v_metric_name
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
    -- Consume quota - update both columns for compatibility
    UPDATE usage_tracking 
    SET 
      usage_amount = usage_amount + p_amount,
      metric_value = usage_amount + p_amount, -- Keep both in sync
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id 
    AND metric_name = v_metric_name
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
$function$;

-- Fix 2: The get_users_near_quota_limit function also has subscription join issue
CREATE OR REPLACE FUNCTION public.get_users_near_quota_limit(
  p_threshold_percentage integer DEFAULT 80
)
RETURNS TABLE(user_id uuid, email text, metric text, usage_percent numeric, remaining integer, plan_name text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
            WHEN 'projects_created' THEN 3 -- Fixed: handle projects_created
          END
        WHEN ut.metric_name = 'ai_generations' THEN pl.max_ai_generations_per_month
        WHEN ut.metric_name = 'exports' THEN pl.max_exports_per_month
        WHEN ut.metric_name = 'projects_created' THEN pl.max_projects -- Fixed
      END as limit_amount,
      COALESCE(pl.plan_name, 'free') as plan_name
    FROM usage_tracking ut
    LEFT JOIN customers c ON c.user_id = ut.user_id -- Fixed: proper join
    LEFT JOIN subscriptions s ON s.customer_id = c.id AND s.status IN ('active', 'trialing')
    LEFT JOIN plan_limits pl ON pl.plan_name = s.plan_name
    WHERE ut.period_start = date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
  )
  SELECT 
    uq.user_id,
    u.email,
    -- Map back from internal metric names to API metric names
    CASE uq.metric 
      WHEN 'projects_created' THEN 'projects'
      ELSE uq.metric
    END as metric,
    CASE 
      WHEN uq.limit_amount = -1 OR uq.limit_amount IS NULL THEN 0
      ELSE ROUND((uq.current_usage::NUMERIC / NULLIF(uq.limit_amount, 0) * 100)::NUMERIC, 2)
    END as usage_percent,
    CASE 
      WHEN uq.limit_amount = -1 THEN 999999
      ELSE GREATEST(0, COALESCE(uq.limit_amount, 0) - uq.current_usage)
    END as remaining,
    uq.plan_name
  FROM user_quotas uq
  JOIN auth.users u ON u.id = uq.user_id
  WHERE 
    uq.limit_amount IS NOT NULL AND
    uq.limit_amount != -1 AND
    uq.limit_amount > 0 AND
    (uq.current_usage::NUMERIC / NULLIF(uq.limit_amount, 0) * 100) >= p_threshold_percentage
  ORDER BY usage_percent DESC;
END;
$function$;

-- Fix 3: The get_user_quota_status function needs similar fixes
CREATE OR REPLACE FUNCTION public.get_user_quota_status(p_user_id uuid)
RETURNS TABLE(metric text, plan_limit integer, current_usage integer, remaining integer, usage_percent numeric, bonus_available integer, last_reset timestamp with time zone, next_reset timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT 
      date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') as period_start,
      date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + INTERVAL '1 month' as period_end
  ),
  user_plan AS (
    SELECT 
      COALESCE(s.plan_name, 'free') as plan_name
    FROM customers c
    LEFT JOIN subscriptions s ON s.customer_id = c.id -- Fixed: customers relationship
    WHERE c.user_id = p_user_id
      AND (s.status IS NULL OR s.status IN ('active', 'trialing'))
    ORDER BY s.created_at DESC NULLS LAST
    LIMIT 1
  ),
  metrics AS (
    SELECT 
      'ai_generations' as metric_api,
      'ai_generations' as metric_db
    UNION ALL 
    SELECT 'exports', 'exports'
    UNION ALL 
    SELECT 'projects', 'projects_created' -- Map API name to DB name
  )
  SELECT 
    m.metric_api as metric, -- Return API-friendly names
    CASE m.metric_api
      WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
      WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
      WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
    END as plan_limit,
    COALESCE(ut.usage_amount, 0) as current_usage,
    GREATEST(0, 
      CASE m.metric_api
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END - COALESCE(ut.usage_amount, 0)
    ) + COALESCE(bonus.available, 0) as remaining,
    CASE 
      WHEN CASE m.metric_api
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END = 0 THEN 0
      ELSE ROUND(100.0 * COALESCE(ut.usage_amount, 0) / CASE m.metric_api
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END, 2)
    END as usage_percent,
    COALESCE(bonus.available, 0) as bonus_available,
    cp.period_start as last_reset,
    cp.period_end as next_reset
  FROM metrics m
  CROSS JOIN current_period cp
  LEFT JOIN user_plan up ON true
  LEFT JOIN plan_limits pl ON pl.plan_name = COALESCE(up.plan_name, 'free')
  LEFT JOIN usage_tracking ut ON ut.user_id = p_user_id 
    AND ut.metric_name = m.metric_db -- Use DB metric name for lookup
    AND ut.period_start = cp.period_start
  LEFT JOIN LATERAL (
    SELECT SUM(amount - used_amount)::INTEGER as available
    FROM user_bonuses
    WHERE user_id = p_user_id 
      AND metric = m.metric_api -- Use API metric name for bonuses
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  ) bonus ON true;
END;
$function$;

-- Add comments explaining the fixes
COMMENT ON FUNCTION public.check_and_consume_quota IS 'Fixed subscription lookup via customers table and metric name mapping';
COMMENT ON FUNCTION public.get_users_near_quota_limit IS 'Fixed subscription lookup and projects_created metric handling';
COMMENT ON FUNCTION public.get_user_quota_status IS 'Fixed subscription lookup and metric name mapping for API compatibility';