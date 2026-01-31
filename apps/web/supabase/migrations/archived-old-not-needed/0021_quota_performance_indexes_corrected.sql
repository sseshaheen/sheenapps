-- Quota System Performance Indexes - Corrected for Actual Schema
-- Based on actual table structures from postgres-29-june-2025.sql

-- 1. Optimize usage_tracking queries
-- Note: usage_tracking has composite PK (user_id, period_start), not id
CREATE INDEX IF NOT EXISTS idx_usage_tracking_metric_lookup 
ON usage_tracking(user_id, metric_name, period_start DESC);

-- 2. Optimize quota audit log monitoring queries
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_monitoring 
ON quota_audit_log(created_at DESC)
WHERE success = false;

-- 3. Optimize user-specific audit queries
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_user_analysis 
ON quota_audit_log(user_id, created_at DESC);

-- 4. Optimize metric-specific queries
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_metric 
ON quota_audit_log(metric, created_at DESC);

-- 5. Optimize usage_events idempotency checks
-- Add unique constraint if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_idempotency_key'
    ) THEN
        ALTER TABLE usage_events 
        ADD CONSTRAINT unique_idempotency_key 
        UNIQUE (user_id, idempotency_key);
    END IF;
END $$;

-- Create index for idempotency lookups
CREATE INDEX IF NOT EXISTS idx_usage_events_idempotency 
ON usage_events(user_id, idempotency_key);

-- 6. Optimize bonus quota lookups
CREATE INDEX IF NOT EXISTS idx_user_bonuses_active 
ON user_bonuses(user_id, metric, expires_at)
WHERE used_amount < amount;

-- 7. Optimize subscription lookups via customers
CREATE INDEX IF NOT EXISTS idx_subscriptions_active 
ON subscriptions(customer_id, status)
WHERE status IN ('active', 'trialing');

-- 8. Optimize customer user lookups
CREATE INDEX IF NOT EXISTS idx_customers_user 
ON customers(user_id);

-- 9. Optimize admin alerts if table exists
CREATE INDEX IF NOT EXISTS idx_admin_alerts_recent 
ON admin_alerts(created_at DESC, severity);

-- 10. Add covering index for monitoring queries
-- Note: PostgreSQL 11+ required for INCLUDE clause
DO $$
BEGIN
    -- Check PostgreSQL version
    IF current_setting('server_version_num')::integer >= 110000 THEN
        -- Create covering index if not exists
        IF NOT EXISTS (
            SELECT 1 FROM pg_indexes 
            WHERE indexname = 'idx_usage_tracking_monitoring'
        ) THEN
            CREATE INDEX idx_usage_tracking_monitoring 
            ON usage_tracking(period_start, metric_name)
            INCLUDE (user_id, usage_amount);
        END IF;
    ELSE
        -- Fallback for older PostgreSQL versions
        CREATE INDEX IF NOT EXISTS idx_usage_tracking_monitoring 
        ON usage_tracking(period_start, metric_name, user_id, usage_amount);
    END IF;
END $$;

-- 11. Optimize export_logs queries
CREATE INDEX IF NOT EXISTS idx_export_logs_user 
ON export_logs(user_id, exported_at DESC);

-- 12. Optimize usage_events for spike detection
CREATE INDEX IF NOT EXISTS idx_usage_events_spike_detection 
ON usage_events(created_at DESC, metric);

-- 13. Optimize denial reason analysis
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_reason 
ON quota_audit_log(reason, created_at DESC)
WHERE success = false;

-- 14. Additional indexes for quota_audit_logs table (separate from quota_audit_log)
CREATE INDEX IF NOT EXISTS idx_quota_audit_logs_user_event 
ON quota_audit_logs(user_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quota_audit_logs_metric_time 
ON quota_audit_logs(metric, created_at DESC);

-- 15. Optimize usage_bonuses table (old table that might still have data)
-- Note: This is different from user_bonuses
CREATE INDEX IF NOT EXISTS idx_usage_bonuses_user_active 
ON usage_bonuses(user_id, metric)
WHERE archived = false AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

-- 16. Add index for referrals if being used for bonus tracking
CREATE INDEX IF NOT EXISTS idx_referrals_user 
ON referrals(referrer_user_id, status);

-- 17. Add composite index for plan_limits joins
CREATE INDEX IF NOT EXISTS idx_plan_limits_lookup 
ON plan_limits(plan_name);

-- 18. Optimize project counting for quota checks
CREATE INDEX IF NOT EXISTS idx_projects_owner_active 
ON projects(owner_id)
WHERE archived_at IS NULL;

-- Analyze tables to update query planner statistics
ANALYZE usage_tracking;
ANALYZE quota_audit_log;
ANALYZE usage_events;
ANALYZE user_bonuses;
ANALYZE subscriptions;
ANALYZE customers;
ANALYZE plan_limits;
ANALYZE projects;

-- Add helpful comments
COMMENT ON INDEX idx_usage_tracking_metric_lookup IS 'Primary lookup for quota checks - hot path';
COMMENT ON INDEX idx_quota_audit_log_monitoring IS 'Partial index for monitoring failures';
COMMENT ON INDEX idx_user_bonuses_active IS 'Partial index for available bonuses only';
COMMENT ON INDEX idx_projects_owner_active IS 'Fast count of active projects per user';

-- Performance verification query
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename IN ('usage_tracking', 'quota_audit_log', 'usage_events', 'user_bonuses', 'subscriptions', 'customers')
ORDER BY tablename, indexname;