-- Phase 3: Database Optimization - Project Build Events Indexes
-- Optimized indexes based on expert review for build events queries
-- These indexes will dramatically improve query performance as data grows

-- 1. Primary compound index for build event fetching (most common query)
-- Covers: .eq('build_id', buildId).eq('user_id', userId).gt('id', lastEventId)
CREATE INDEX IF NOT EXISTS idx_pbe_build_user_id_sequence 
ON public.project_build_events (build_id, user_id, id);

-- 2. Compound index for build-scoped queries (admin/debugging)
-- Covers: .eq('build_id', buildId).gt('id', lastEventId)
CREATE INDEX IF NOT EXISTS idx_pbe_build_id_sequence
ON public.project_build_events (build_id, id);

-- 3. Partial index for clean events only (user-visible events)
-- This index is smaller and faster for the most common query pattern
-- Covers: .eq('build_id', buildId).eq('user_id', userId).eq('user_visible', true).gt('id', lastEventId)
CREATE INDEX IF NOT EXISTS idx_pbe_clean_events_only
ON public.project_build_events (build_id, user_id, id)
WHERE user_visible = true AND event_phase IS NOT NULL;

-- 4. User-scoped index for dashboard queries
-- Covers: .eq('user_id', userId).order('created_at', { ascending: false })
CREATE INDEX IF NOT EXISTS idx_pbe_user_recent_events
ON public.project_build_events (user_id, created_at DESC);

-- 5. Created time index for retention policy cleanup
-- Covers: WHERE created_at < NOW() - INTERVAL '45 days'
CREATE INDEX IF NOT EXISTS idx_pbe_created_at_cleanup
ON public.project_build_events (created_at);

-- 6. Build status monitoring index
-- Covers: .eq('event_type', 'completed').eq('finished', true)
CREATE INDEX IF NOT EXISTS idx_pbe_completion_monitoring
ON public.project_build_events (event_type, finished, created_at)
WHERE finished = true;

-- Performance Analysis Query for Index Usage
-- Run this periodically to ensure indexes are being used effectively
/*
-- Check index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as "Index Scans",
    idx_tup_read as "Tuples Read via Index",
    idx_tup_fetch as "Tuples Fetched via Index"
FROM pg_stat_user_indexes 
WHERE tablename = 'project_build_events'
ORDER BY idx_scan DESC;

-- Check table scan statistics
SELECT 
    schemaname,
    tablename,
    seq_scan as "Sequential Scans",
    seq_tup_read as "Tuples Read via Sequential Scan",
    idx_scan as "Index Scans",
    idx_tup_fetch as "Tuples Fetched via Index",
    CASE 
        WHEN seq_scan > 0 THEN round((idx_scan::float / (seq_scan + idx_scan) * 100)::numeric, 2)
        ELSE 100 
    END as "Index Scan Percentage"
FROM pg_stat_user_tables
WHERE tablename = 'project_build_events';

-- Analyze query plans for common patterns
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM project_build_events 
WHERE build_id = 'sample_build_id' 
  AND user_id = 'sample_user_id' 
  AND user_visible = true 
  AND id > 1000 
ORDER BY created_at ASC 
LIMIT 50;
*/