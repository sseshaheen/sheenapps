-- Quota Security Hardening - Based on Expert Feedback
-- Addresses: DoS vectors, plan change edge cases, idempotency collision logging

-- Fix 1: Add rate limiting table for DoS protection
CREATE TABLE IF NOT EXISTS quota_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier TEXT NOT NULL, -- IP address or user_id
    identifier_type TEXT NOT NULL CHECK (identifier_type IN ('ip', 'user')),
    request_count INTEGER NOT NULL DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Composite index for fast lookups
    UNIQUE(identifier, identifier_type, window_start)
);

-- Add index for rate limit lookups (hot path)
CREATE INDEX IF NOT EXISTS idx_quota_rate_limits_lookup 
ON quota_rate_limits(identifier, identifier_type, window_start DESC);

-- Fix 2: Enhanced idempotency collision logging
ALTER TABLE usage_events 
ADD COLUMN IF NOT EXISTS collision_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS collision_metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for collision analysis
CREATE INDEX IF NOT EXISTS idx_usage_events_collisions 
ON usage_events(collision_detected, created_at DESC)
WHERE collision_detected = true;

-- Fix 3: Plan change tracking table
CREATE TABLE IF NOT EXISTS plan_change_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    old_plan TEXT,
    new_plan TEXT NOT NULL,
    change_reason TEXT, -- 'upgrade', 'downgrade', 'trial_end', 'admin'
    effective_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    usage_preserved JSONB DEFAULT '{}'::jsonb, -- Snapshot of usage at time of change
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Index for plan change lookups
CREATE INDEX IF NOT EXISTS idx_plan_change_log_user_time 
ON plan_change_log(user_id, effective_date DESC);

-- Fix 4: Enhanced check_and_consume_quota with collision detection and plan change handling
CREATE OR REPLACE FUNCTION public.check_and_consume_quota_v2(
  p_user_id uuid,
  p_metric text,
  p_amount integer DEFAULT 1,
  p_idempotency_key text DEFAULT NULL::text,
  p_client_ip inet DEFAULT NULL
)
RETURNS TABLE(
  allowed boolean,
  remaining integer,
  limit_amount integer,
  bonus_used integer,
  already_processed boolean,
  rate_limited boolean,
  plan_changed boolean
)
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
  v_rate_limit_exceeded BOOLEAN := FALSE;
  v_existing_event_id UUID;
  v_plan_changed BOOLEAN := FALSE;
  v_current_plan TEXT;
  v_last_plan_check TIMESTAMPTZ;
BEGIN
  -- Rate limiting check (IP-based)
  IF p_client_ip IS NOT NULL THEN
    -- Check requests in last minute
    WITH rate_check AS (
      INSERT INTO quota_rate_limits (identifier, identifier_type, window_start)
      VALUES (p_client_ip::text, 'ip', date_trunc('minute', CURRENT_TIMESTAMP))
      ON CONFLICT (identifier, identifier_type, window_start)
      DO UPDATE SET 
        request_count = quota_rate_limits.request_count + 1,
        created_at = CURRENT_TIMESTAMP
      RETURNING request_count
    )
    SELECT request_count > 20 INTO v_rate_limit_exceeded -- 20 req/minute limit
    FROM rate_check;
    
    IF v_rate_limit_exceeded THEN
      -- Log rate limit violation
      INSERT INTO quota_audit_log (
        user_id, metric, attempted_amount,
        success, reason, context
      ) VALUES (
        p_user_id, p_metric, p_amount,
        false, 'rate_limited', jsonb_build_object(
          'client_ip', p_client_ip,
          'timestamp', CURRENT_TIMESTAMP
        )
      );
      
      RETURN QUERY SELECT false, 0, 0, 0, false, true, false;
      RETURN;
    END IF;
  END IF;

  -- Map metric names for usage_tracking compatibility
  v_metric_name := CASE 
    WHEN p_metric = 'projects' THEN 'projects_created'
    ELSE p_metric
  END;

  -- Enhanced idempotency check with collision detection
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_event_id
    FROM usage_events 
    WHERE user_id = p_user_id 
    AND idempotency_key = p_idempotency_key;
    
    IF FOUND THEN
      -- Check if this is a potential collision (different request details)
      IF EXISTS (
        SELECT 1 FROM usage_events 
        WHERE id = v_existing_event_id
        AND (
          metric != p_metric OR 
          amount != p_amount OR
          ABS(EXTRACT(EPOCH FROM (created_at - CURRENT_TIMESTAMP))) > 300 -- More than 5 minutes apart
        )
      ) THEN
        -- Log potential collision
        INSERT INTO quota_audit_log (
          user_id, metric, attempted_amount,
          success, reason, context
        ) VALUES (
          p_user_id, p_metric, p_amount,
          false, 'idempotency_collision', jsonb_build_object(
            'idempotency_key', p_idempotency_key,
            'original_event_id', v_existing_event_id,
            'collision_details', 'Different request parameters with same key'
          )
        );
        
        -- Update original event to mark collision
        UPDATE usage_events 
        SET 
          collision_detected = true,
          collision_metadata = jsonb_build_object(
            'collision_time', CURRENT_TIMESTAMP,
            'collision_details', 'Key reused with different parameters'
          )
        WHERE id = v_existing_event_id;
      END IF;
      
      RETURN QUERY SELECT true, 0, 0, 0, true, false, false;
      RETURN;
    END IF;
  END IF;

  -- Start transaction with appropriate isolation
  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  
  -- Get current period
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Check for recent plan changes
  SELECT 
    new_plan,
    effective_date
  INTO v_current_plan, v_last_plan_check
  FROM plan_change_log
  WHERE user_id = p_user_id
  ORDER BY effective_date DESC
  LIMIT 1;
  
  -- If plan changed in current period, mark for special handling
  IF v_last_plan_check IS NOT NULL AND v_last_plan_check >= v_period_start THEN
    v_plan_changed := TRUE;
  END IF;
  
  -- Get plan limit with proper subscription lookup
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
  
  -- Ensure usage_tracking record exists
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
  ON CONFLICT (user_id, period_start) 
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
    -- Consume quota
    UPDATE usage_tracking 
    SET 
      usage_amount = usage_amount + p_amount,
      metric_value = usage_amount + p_amount,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id 
    AND metric_name = v_metric_name
    AND period_start = v_period_start;
    
    -- Track event with enhanced metadata
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
        'bonus_available', v_bonus_available,
        'plan_changed_in_period', v_plan_changed,
        'client_ip', p_client_ip
      )
    );
    
    -- Calculate and consume bonus if needed
    v_bonus_needed := GREATEST(0, p_amount - v_base_remaining);
    
    IF v_bonus_needed > 0 THEN
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
    
    -- Enhanced audit logging
    INSERT INTO quota_audit_log (
      user_id, metric, attempted_amount,
      success, reason, context
    ) VALUES (
      p_user_id, p_metric, p_amount,
      true, CASE 
        WHEN v_bonus_needed > 0 THEN 'bonus_consumed'
        WHEN v_plan_changed THEN 'success_plan_changed'
        ELSE 'success'
      END,
      jsonb_build_object(
        'plan_limit', v_plan_limit,
        'usage_before', v_current_usage,
        'usage_after', v_current_usage + p_amount,
        'bonus_used', v_bonus_needed,
        'plan_changed_in_period', v_plan_changed,
        'idempotency_key', p_idempotency_key,
        'client_ip', p_client_ip
      )
    );
    
    RETURN QUERY SELECT 
      true AS allowed,
      v_total_available - p_amount AS remaining,
      v_plan_limit AS limit_amount,
      v_bonus_needed AS bonus_used,
      false AS already_processed,
      false AS rate_limited,
      v_plan_changed AS plan_changed;
  ELSE
    -- Enhanced denial logging
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
        'requested', p_amount,
        'plan_changed_in_period', v_plan_changed,
        'client_ip', p_client_ip
      )
    );
    
    RETURN QUERY SELECT 
      false AS allowed,
      v_total_available AS remaining,
      v_plan_limit AS limit_amount,
      0 AS bonus_used,
      false AS already_processed,
      false AS rate_limited,
      v_plan_changed AS plan_changed;
  END IF;
END;
$function$;

-- Fix 5: Plan change handler function
CREATE OR REPLACE FUNCTION handle_plan_change(
  p_user_id UUID,
  p_old_plan TEXT,
  p_new_plan TEXT,
  p_change_reason TEXT DEFAULT 'upgrade'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_current_usage JSONB;
  v_period_start TIMESTAMPTZ;
BEGIN
  v_period_start := date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
  
  -- Capture current usage snapshot
  SELECT jsonb_object_agg(metric_name, usage_amount) INTO v_current_usage
  FROM usage_tracking
  WHERE user_id = p_user_id
  AND period_start = v_period_start;
  
  -- Log the plan change with usage preservation
  INSERT INTO plan_change_log (
    user_id,
    old_plan,
    new_plan,
    change_reason,
    usage_preserved
  ) VALUES (
    p_user_id,
    p_old_plan,
    p_new_plan,
    p_change_reason,
    COALESCE(v_current_usage, '{}'::jsonb)
  );
  
  -- Log audit event
  INSERT INTO quota_audit_log (
    user_id,
    metric,
    attempted_amount,
    success,
    reason,
    context
  ) VALUES (
    p_user_id,
    'plan_change',
    0,
    true,
    'plan_changed',
    jsonb_build_object(
      'old_plan', p_old_plan,
      'new_plan', p_new_plan,
      'change_reason', p_change_reason,
      'usage_at_change', v_current_usage,
      'timestamp', CURRENT_TIMESTAMP
    )
  );
  
  RETURN TRUE;
END;
$function$;

-- Fix 6: Cleanup old rate limiting data (run daily)
CREATE OR REPLACE FUNCTION cleanup_quota_rate_limits()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  -- Remove rate limit records older than 1 hour
  DELETE FROM quota_rate_limits 
  WHERE window_start < CURRENT_TIMESTAMP - INTERVAL '1 hour';
  
  -- Remove old collision logs (keep 30 days)
  UPDATE usage_events 
  SET 
    collision_detected = NULL,
    collision_metadata = '{}'::jsonb
  WHERE collision_detected = true 
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
END;
$function$;

-- Add helpful comments
COMMENT ON FUNCTION check_and_consume_quota_v2 IS 'Enhanced quota function with DoS protection, collision detection, and plan change handling';
COMMENT ON FUNCTION handle_plan_change IS 'Handles plan upgrades/downgrades while preserving usage counters';
COMMENT ON FUNCTION cleanup_quota_rate_limits IS 'Cleanup function for rate limit and collision data';

-- Create view for monitoring collision patterns
CREATE OR REPLACE VIEW quota_collision_analysis AS
SELECT 
  user_id,
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as collision_count,
  array_agg(DISTINCT idempotency_key) as collision_keys,
  array_agg(DISTINCT (metadata->>'client_ip')) as client_ips
FROM usage_events
WHERE collision_detected = true
  AND created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY user_id, DATE_TRUNC('hour', created_at)
ORDER BY collision_count DESC;