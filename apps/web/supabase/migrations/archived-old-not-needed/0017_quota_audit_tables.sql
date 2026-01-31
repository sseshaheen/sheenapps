-- Comprehensive audit log table for quota events
CREATE TABLE IF NOT EXISTS quota_audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  metric TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_user_event ON quota_audit_logs (user_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_metric_time ON quota_audit_logs (metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event_type ON quota_audit_logs (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON quota_audit_logs (created_at DESC);

-- Enable real-time for monitoring
ALTER TABLE quota_audit_logs REPLICA IDENTITY FULL;

-- View for spike detection
CREATE OR REPLACE VIEW quota_usage_spikes AS
WITH hourly_usage AS (
  SELECT 
    user_id,
    metric,
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as usage_count
  FROM usage_events
  WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
  GROUP BY user_id, metric, DATE_TRUNC('hour', created_at)
),
usage_with_avg AS (
  SELECT 
    user_id,
    metric,
    hour,
    usage_count,
    AVG(usage_count) OVER (
      PARTITION BY user_id, metric 
      ORDER BY hour 
      ROWS BETWEEN 24 PRECEDING AND 1 PRECEDING
    ) as avg_hourly_usage
  FROM hourly_usage
)
SELECT 
  user_id,
  metric,
  hour,
  usage_count,
  avg_hourly_usage
FROM usage_with_avg
WHERE usage_count > 2 * COALESCE(avg_hourly_usage, 0)
  AND avg_hourly_usage IS NOT NULL;

-- View for concurrent attempts detection
CREATE OR REPLACE VIEW quota_concurrent_attempts AS
WITH numbered_events AS (
  SELECT 
    user_id,
    metric,
    created_at,
    LAG(created_at) OVER (PARTITION BY user_id, metric ORDER BY created_at) as prev_created_at
  FROM usage_events
  WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
)
SELECT 
  user_id,
  metric,
  COUNT(*) as concurrent_count,
  MIN(created_at) as first_attempt,
  MAX(created_at) as last_attempt
FROM numbered_events
WHERE EXTRACT(EPOCH FROM (created_at - prev_created_at)) < 1 -- Less than 1 second apart
GROUP BY user_id, metric
HAVING COUNT(*) > 1;

-- View for users with high denial rates
CREATE OR REPLACE VIEW quota_high_denial_users AS
SELECT 
  user_id,
  metric,
  COUNT(*) FILTER (WHERE NOT success) as denial_count,
  COUNT(*) FILTER (WHERE success) as success_count,
  COUNT(*) as total_attempts,
  ROUND(100.0 * COUNT(*) FILTER (WHERE NOT success) / NULLIF(COUNT(*), 0), 2) as denial_rate_percent,
  MAX(created_at) FILTER (WHERE NOT success) as last_denial
FROM quota_audit_log
WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
GROUP BY user_id, metric
HAVING COUNT(*) FILTER (WHERE NOT success) > 5 -- More than 5 denials
   AND COUNT(*) > 10 -- At least 10 total attempts
ORDER BY denial_count DESC;

-- Function to get user quota status
CREATE OR REPLACE FUNCTION get_user_quota_status(p_user_id UUID)
RETURNS TABLE (
  metric TEXT,
  plan_limit INTEGER,
  current_usage INTEGER,
  remaining INTEGER,
  usage_percent NUMERIC,
  bonus_available INTEGER,
  last_reset TIMESTAMPTZ,
  next_reset TIMESTAMPTZ
) AS $$
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
    JOIN subscriptions s ON s.customer_id = c.id
    WHERE c.user_id = p_user_id
      AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1
  ),
  metrics AS (
    SELECT unnest(ARRAY['ai_generations', 'exports', 'projects']) as metric_name
  )
  SELECT 
    m.metric_name,
    CASE m.metric_name
      WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
      WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
      WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
    END as plan_limit,
    COALESCE(ut.usage_amount, 0) as current_usage,
    GREATEST(0, 
      CASE m.metric_name
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END - COALESCE(ut.usage_amount, 0)
    ) as remaining,
    CASE 
      WHEN CASE m.metric_name
        WHEN 'ai_generations' THEN COALESCE(pl.max_ai_generations_per_month, 10)
        WHEN 'exports' THEN COALESCE(pl.max_exports_per_month, 1)
        WHEN 'projects' THEN COALESCE(pl.max_projects, 3)
      END = 0 THEN 0
      ELSE ROUND(100.0 * COALESCE(ut.usage_amount, 0) / CASE m.metric_name
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
    AND ut.metric_name = m.metric_name 
    AND ut.period_start = cp.period_start
  LEFT JOIN LATERAL (
    SELECT SUM(amount - used_amount) as available
    FROM user_bonuses
    WHERE user_id = p_user_id 
      AND metric = m.metric_name
      AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
  ) bonus ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Admin alerts table for critical events
CREATE TABLE IF NOT EXISTS admin_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_unack ON admin_alerts (acknowledged, created_at DESC) WHERE NOT acknowledged;
CREATE INDEX IF NOT EXISTS idx_admin_alerts_severity ON admin_alerts (severity, created_at DESC);

-- Grant necessary permissions
GRANT SELECT ON quota_audit_logs TO authenticated;
GRANT SELECT ON quota_usage_spikes TO authenticated;
GRANT SELECT ON quota_concurrent_attempts TO authenticated;
GRANT SELECT ON quota_high_denial_users TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_quota_status TO authenticated;
GRANT SELECT, INSERT, UPDATE ON admin_alerts TO authenticated;