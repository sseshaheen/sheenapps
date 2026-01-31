-- Combined script to apply quota system fixes and performance indexes
-- Run this script directly in your Supabase SQL editor

-- First, apply the missing RPC function and fixes from 0018
\echo 'Creating missing RPC functions and fixes...'
\i supabase/migrations/0018_quota_system_fixes.sql

-- Then apply the performance indexes from 0019
\echo 'Creating performance indexes...'
\i supabase/migrations/0019_quota_performance_indexes.sql

-- Verify indexes were created
\echo 'Verifying indexes...'
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('usage_tracking', 'quota_audit_log', 'usage_events', 'user_bonuses', 'subscriptions')
ORDER BY tablename, indexname;

-- Check index sizes
\echo 'Index sizes:'
SELECT 
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
AND tablename IN ('usage_tracking', 'quota_audit_log', 'usage_events', 'user_bonuses', 'subscriptions')
ORDER BY pg_relation_size(indexrelid) DESC;