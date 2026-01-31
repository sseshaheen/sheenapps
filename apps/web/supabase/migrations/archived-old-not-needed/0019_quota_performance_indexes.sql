-- Quota System Performance Indexes
-- These indexes optimize the most common and performance-critical queries

-- 1. Optimize usage_tracking queries (most frequent operation)
-- Used by: check_and_consume_quota RPC, getUserQuotaStatus
CREATE INDEX IF NOT EXISTS idx_usage_tracking_lookup 
ON usage_tracking(user_id, metric_name, period_start DESC);

-- 2. Optimize quota audit log queries for monitoring
-- Used by: Real-time monitoring, admin dashboard, getRecentDenials
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_monitoring 
ON quota_audit_log(created_at DESC)
WHERE success = false; -- Partial index for failures only

-- 3. Optimize user-specific audit queries
-- Used by: User risk scoring, abuse detection
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_user_analysis 
ON quota_audit_log(user_id, created_at DESC);

-- 4. Optimize metric-specific queries
-- Used by: Metric-based analytics, trending
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_metric 
ON quota_audit_log(metric, created_at DESC);

-- 5. Optimize usage_events idempotency checks
-- Used by: check_and_consume_quota for duplicate prevention
CREATE INDEX IF NOT EXISTS idx_usage_events_idempotency 
ON usage_events(user_id, idempotency_key);

-- 6. Optimize bonus quota lookups
-- Used by: check_and_consume_quota for available bonus calculation
CREATE INDEX IF NOT EXISTS idx_user_bonuses_active 
ON user_bonuses(user_id, metric, expires_at)
WHERE used_amount < amount; -- Partial index for available bonuses only

-- 7. Optimize subscription lookups
-- Used by: Plan limit queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_active 
ON subscriptions(user_id, status)
WHERE status IN ('active', 'trialing'); -- Partial index for active only

-- 8. Optimize admin alerts queries
-- Used by: Alert monitoring, admin notifications
CREATE INDEX IF NOT EXISTS idx_admin_alerts_recent 
ON admin_alerts(created_at DESC, severity);

-- 9. Composite index for the get_users_near_quota_limit function
-- This significantly speeds up the monitoring dashboard
CREATE INDEX IF NOT EXISTS idx_usage_tracking_monitoring 
ON usage_tracking(period_start, metric_name)
INCLUDE (user_id, usage_amount); -- Covering index

-- 10. Optimize export_logs queries
-- Used by: Export quota tracking
CREATE INDEX IF NOT EXISTS idx_export_logs_user 
ON export_logs(user_id, created_at DESC);

-- 11. Optimize realtime monitoring queries for spikes
-- Used by: Spike detection views
CREATE INDEX IF NOT EXISTS idx_usage_events_spike_detection 
ON usage_events(created_at DESC, metric);

-- 12. Optimize denial reason analysis
-- Used by: Monitoring dashboards, analytics
CREATE INDEX IF NOT EXISTS idx_quota_audit_log_reason 
ON quota_audit_log(reason, created_at DESC)
WHERE success = false;

-- Analyze tables to update statistics for query planner
ANALYZE usage_tracking;
ANALYZE quota_audit_log;
ANALYZE usage_events;
ANALYZE user_bonuses;
ANALYZE subscriptions;

-- Add table comments explaining index usage
COMMENT ON INDEX idx_usage_tracking_lookup IS 'Primary lookup index for quota checks - hot path';
COMMENT ON INDEX idx_quota_audit_log_monitoring IS 'Partial index for failure monitoring - reduces index size by ~90%';
COMMENT ON INDEX idx_user_bonuses_active IS 'Partial index for available bonuses - excludes exhausted bonuses';
COMMENT ON INDEX idx_usage_tracking_monitoring IS 'Covering index for monitoring queries - includes all needed columns';

-- Performance impact notes:
-- These indexes will use approximately 50-100MB of storage for 1M users
-- Index creation may take 1-5 minutes on large tables
-- Partial indexes significantly reduce index size and maintenance overhead
-- The covering index (idx_usage_tracking_monitoring) eliminates table lookups for monitoring queries