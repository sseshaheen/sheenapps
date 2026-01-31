-- =====================================================
-- Migration 059: Dashboard Performance Optimization Indexes
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 29, 2025
-- Purpose: Add dashboard-specific performance indexes and optimizations
-- Dependencies: Migration 058 (Analytics summary tables)
-- =====================================================

BEGIN;

-- =====================================================
-- Part 1: Dashboard Overview Query Optimizations
-- =====================================================

-- Composite index for advisor dashboard overview queries
-- Optimizes: profile info + approval status + availability lookups
CREATE INDEX IF NOT EXISTS idx_advisors_dashboard_overview
ON advisors (user_id, approval_status, is_accepting_bookings, created_at DESC);

-- Index for earnings overview queries (current month focus)
CREATE INDEX IF NOT EXISTS idx_advisor_consultations_earnings_month
ON advisor_consultations (advisor_id, start_time)
WHERE status = 'completed' AND is_free_consultation = false;

-- =====================================================
-- Part 2: Consultation Management Query Optimizations  
-- =====================================================

-- Optimized index for upcoming consultations with pagination support
CREATE INDEX IF NOT EXISTS idx_consult_upcoming_pagination
ON advisor_consultations (advisor_id, start_time, id)
WHERE status IN ('scheduled', 'in_progress');

-- Index for consultation history with stable sorting for cursor pagination
CREATE INDEX IF NOT EXISTS idx_consult_history_cursor
ON advisor_consultations (advisor_id, start_time DESC, id)
WHERE status = 'completed';

-- =====================================================
-- Part 3: Analytics Query Optimizations
-- =====================================================

-- Index for monthly analytics aggregation queries
-- Note: Using start_time directly since DATE_TRUNC is not immutable for indexes
CREATE INDEX IF NOT EXISTS idx_consultations_monthly_agg
ON advisor_consultations (advisor_id, start_time)
WHERE status = 'completed';

-- Index for advisor reviews analytics (ratings are in separate table)
CREATE INDEX IF NOT EXISTS idx_reviews_advisor_analytics
ON advisor_reviews (advisor_id, created_at DESC, rating);

-- =====================================================
-- Part 4: Specialization Performance Tracking
-- =====================================================

-- Note: Specialization tracking will be added in future migrations
-- when specialty_focus field is added to advisor_consultations table

-- =====================================================
-- Part 5: Worker Database Performance Grants
-- =====================================================

-- Ensure all new tables have proper worker grants
GRANT USAGE ON SCHEMA public TO worker_db_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO worker_db_role;

COMMIT;

-- =====================================================
-- Verification and Performance Analysis
-- =====================================================

-- Show all advisor-related indexes
SELECT 
  schemaname,
  tablename,
  indexname
FROM pg_indexes 
WHERE tablename IN ('advisors', 'advisor_consultations', 'advisor_availability_settings', 'advisor_analytics_summary')
  AND indexname LIKE '%advisor%'
ORDER BY tablename, indexname;

-- Check index usage statistics (if available)
SELECT 
  schemaname,
  relname as tablename,
  indexrelname as indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes 
WHERE relname LIKE '%advisor%'
ORDER BY idx_scan DESC;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 059 completed successfully!';
  RAISE NOTICE '⚡ Dashboard-specific performance indexes created';
  RAISE NOTICE '📊 Optimized for overview, consultations, and analytics queries';
  RAISE NOTICE '🔍 Cursor pagination support added';
  RAISE NOTICE '📱 Ready for API endpoint implementation';
END $$;