-- Create missing tables first

-- Usage events table (for tracking individual usage)
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  metric TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_idempotency_key UNIQUE (user_id, idempotency_key)
);

-- User bonuses table (for additional quota grants)
CREATE TABLE IF NOT EXISTS user_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  metric TEXT NOT NULL,
  amount INTEGER NOT NULL,
  used_amount INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Export logs table (for tracking exports)
CREATE TABLE IF NOT EXISTS export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  format TEXT NOT NULL,
  exported_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_metric ON usage_events(metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_bonuses_user ON user_bonuses(user_id, metric);
CREATE INDEX IF NOT EXISTS idx_export_logs_project ON export_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_export_logs_user ON export_logs(user_id);

-- Update usage_tracking table to support the new system
ALTER TABLE usage_tracking 
ADD COLUMN IF NOT EXISTS usage_amount INTEGER DEFAULT 0,
ALTER COLUMN metric_value SET DEFAULT 0;

-- Atomic quota check and consume function
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
  
  -- Get plan limit based on metric type
  SELECT 
    CASE p_metric
      WHEN 'ai_generations' THEN 
        CASE WHEN pl.max_ai_generations_per_month = -1 THEN 999999 ELSE pl.max_ai_generations_per_month END
      WHEN 'exports' THEN 
        CASE WHEN pl.max_exports_per_month = -1 THEN 999999 ELSE pl.max_exports_per_month END
      WHEN 'projects' THEN 
        CASE WHEN pl.max_projects = -1 THEN 999999 ELSE pl.max_projects END
      ELSE 999999  -- Default to unlimited for unknown metrics
    END INTO v_plan_limit
  FROM plan_limits pl
  JOIN subscriptions s ON s.plan_name = pl.plan_name
  JOIN customers c ON c.id = s.customer_id
  WHERE c.user_id = p_user_id 
  AND s.status IN ('active', 'trialing')
  LIMIT 1;  -- Ensure we only get one result
  
  -- Default to free plan if no subscription found
  IF v_plan_limit IS NULL THEN
    SELECT 
      CASE p_metric
        WHEN 'ai_generations' THEN max_ai_generations_per_month
        WHEN 'exports' THEN max_exports_per_month
        WHEN 'projects' THEN max_projects
        ELSE 0
      END INTO v_plan_limit
    FROM plan_limits
    WHERE plan_name = 'free';
  END IF;
  
  -- Get current usage and lock the row
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
  
  -- Calculate total available
  v_total_available := GREATEST(0, v_plan_limit - v_current_usage) + v_bonus_available;
  
  -- Check if allowed
  IF v_total_available >= p_amount THEN
    -- Consume quota
    INSERT INTO usage_tracking (user_id, metric_name, usage_amount, period_start)
    VALUES (p_user_id, p_metric, p_amount, v_period_start)
    ON CONFLICT (user_id, metric_name, period_start)
    DO UPDATE SET 
      usage_amount = usage_tracking.usage_amount + p_amount,
      updated_at = CURRENT_TIMESTAMP;
    
    -- Track event with idempotency
    INSERT INTO usage_events (
      user_id, metric, amount, 
      idempotency_key, metadata
    ) VALUES (
      p_user_id, p_metric, p_amount,
      p_idempotency_key, jsonb_build_object(
        'timestamp', CURRENT_TIMESTAMP,
        'plan_limit', v_plan_limit,
        'usage_before', v_current_usage
      )
    );
    
    -- Consume bonus if needed
    IF v_current_usage + p_amount > v_plan_limit THEN
      -- Update bonus usage (simplified for brevity)
      UPDATE user_bonuses 
      SET used_amount = used_amount + LEAST(p_amount, amount - used_amount)
      WHERE user_id = p_user_id 
      AND metric = p_metric
      AND used_amount < amount
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);
    END IF;
    
    -- Log successful consumption to audit trail
    INSERT INTO quota_audit_log (
      user_id, metric, attempted_amount,
      success, reason, context
    ) VALUES (
      p_user_id, p_metric, p_amount,
      true, CASE 
        WHEN v_current_usage + p_amount > v_plan_limit THEN 'bonus_consumed'
        ELSE 'success'
      END,
      jsonb_build_object(
        'plan_limit', v_plan_limit,
        'usage_before', v_current_usage,
        'usage_after', v_current_usage + p_amount,
        'bonus_used', CASE 
          WHEN v_current_usage + p_amount > v_plan_limit THEN p_amount 
          ELSE 0 
        END,
        'idempotency_key', p_idempotency_key
      )
    );
    
    RETURN QUERY SELECT 
      true AS allowed,
      v_total_available - p_amount AS remaining,
      v_plan_limit AS limit_amount,
      CASE 
        WHEN v_current_usage + p_amount > v_plan_limit 
        THEN p_amount 
        ELSE 0 
      END AS bonus_used,
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

-- Note: idempotency_key column and constraint already created in table definition above

-- Create comprehensive audit log table (replaces denial_logs)
CREATE TABLE IF NOT EXISTS quota_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  metric TEXT NOT NULL,
  attempted_amount INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  reason TEXT NOT NULL, -- "success", "quota_exceeded", "race_condition", "bonus_consumed"
  context JSONB DEFAULT '{}'::jsonb, -- Plan details, usage stats, endpoint, etc.
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying and real-time monitoring
CREATE INDEX IF NOT EXISTS idx_audit_user_metric ON quota_audit_log (user_id, metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_success ON quota_audit_log (success, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_reason ON quota_audit_log (reason, created_at DESC);

-- Enable real-time subscriptions for this table
ALTER TABLE quota_audit_log REPLICA IDENTITY FULL;

-- Create view for failure analytics
CREATE OR REPLACE VIEW quota_failures_realtime AS
SELECT 
  user_id,
  metric,
  reason,
  COUNT(*) as failure_count,
  MAX(created_at) as last_failure
FROM quota_audit_log
WHERE success = false
  AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
GROUP BY user_id, metric, reason;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION check_and_consume_quota TO authenticated;
GRANT INSERT, SELECT ON quota_audit_log TO authenticated;
GRANT SELECT ON quota_failures_realtime TO authenticated;