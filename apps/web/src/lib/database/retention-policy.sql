-- Phase 3: Database Retention Policy for Build Events
-- Automatically purges old build events while preserving aggregated stats
-- Reduces database size and improves query performance

-- 1. Create aggregated stats table for historical data preservation
CREATE TABLE IF NOT EXISTS public.build_events_daily_stats (
    date DATE PRIMARY KEY,
    total_events BIGINT NOT NULL DEFAULT 0,
    total_builds BIGINT NOT NULL DEFAULT 0,
    successful_builds BIGINT NOT NULL DEFAULT 0,
    failed_builds BIGINT NOT NULL DEFAULT 0,
    avg_duration_seconds NUMERIC(10,2),
    total_users BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create function to aggregate stats before deletion
CREATE OR REPLACE FUNCTION aggregate_build_events_stats(target_date DATE)
RETURNS void AS $$
BEGIN
    -- Insert or update daily stats
    INSERT INTO public.build_events_daily_stats (
        date,
        total_events,
        total_builds,
        successful_builds,
        failed_builds,
        avg_duration_seconds,
        total_users,
        updated_at
    )
    SELECT
        target_date,
        COUNT(*) as total_events,
        COUNT(DISTINCT build_id) as total_builds,
        COUNT(DISTINCT CASE WHEN event_type = 'completed' AND finished = true THEN build_id END) as successful_builds,
        COUNT(DISTINCT CASE WHEN event_type = 'failed' AND finished = true THEN build_id END) as failed_builds,
        AVG(duration_seconds) as avg_duration_seconds,
        COUNT(DISTINCT user_id) as total_users,
        NOW()
    FROM public.project_build_events
    WHERE DATE(created_at) = target_date
    ON CONFLICT (date) DO UPDATE SET
        total_events = EXCLUDED.total_events,
        total_builds = EXCLUDED.total_builds,
        successful_builds = EXCLUDED.successful_builds,
        failed_builds = EXCLUDED.failed_builds,
        avg_duration_seconds = EXCLUDED.avg_duration_seconds,
        total_users = EXCLUDED.total_users,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 3. Create main retention cleanup function
CREATE OR REPLACE FUNCTION purge_old_build_events(retention_days INTEGER DEFAULT 190)
RETURNS TABLE(
    purged_date DATE,
    events_deleted BIGINT,
    stats_preserved BOOLEAN
) AS $$
DECLARE
    cutoff_date DATE;
    current_date_iter DATE;
    deleted_count BIGINT;
    total_deleted BIGINT := 0;
BEGIN
    cutoff_date := CURRENT_DATE - retention_days;

    -- Log retention operation start
    RAISE NOTICE 'Starting retention cleanup for events older than % days (before %)', retention_days, cutoff_date;

    -- Process each day individually to avoid long transactions
    FOR current_date_iter IN
        SELECT DISTINCT DATE(created_at) as event_date
        FROM public.project_build_events
        WHERE DATE(created_at) < cutoff_date
        ORDER BY event_date
    LOOP
        -- Aggregate stats for this date before deletion
        PERFORM aggregate_build_events_stats(current_date_iter);

        -- Delete events for this specific date
        DELETE FROM public.project_build_events
        WHERE DATE(created_at) = current_date_iter;

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        total_deleted := total_deleted + deleted_count;

        -- Return information about this date's cleanup
        RETURN QUERY SELECT current_date_iter, deleted_count, true;

        -- Log progress
        RAISE NOTICE 'Deleted % events from % (stats preserved)', deleted_count, current_date_iter;

        -- Commit batch to avoid long transactions
        -- Note: This function should be called from a context that handles commits

    END LOOP;

    -- Final summary
    RAISE NOTICE 'Retention cleanup completed: % total events deleted', total_deleted;
END;
$$ LANGUAGE plpgsql;

-- 4. Create function for safe cleanup with validation
CREATE OR REPLACE FUNCTION safe_purge_old_build_events(retention_days INTEGER DEFAULT 190)
RETURNS JSON AS $$
DECLARE
    result JSON;
    cutoff_date DATE;
    events_to_delete BIGINT;
    oldest_event_date DATE;
    cleanup_results RECORD;
    total_deleted BIGINT := 0;
BEGIN
    cutoff_date := CURRENT_DATE - retention_days;

    -- Validation checks
    SELECT COUNT(*), MIN(DATE(created_at))
    INTO events_to_delete, oldest_event_date
    FROM public.project_build_events
    WHERE DATE(created_at) < cutoff_date;

    -- Safety check: Don't delete if it's more than 50% of total events
    IF events_to_delete > (SELECT COUNT(*) * 0.5 FROM public.project_build_events) THEN
        result := json_build_object(
            'success', false,
            'error', 'Safety check failed: Would delete more than 50% of events',
            'events_to_delete', events_to_delete,
            'retention_days', retention_days,
            'cutoff_date', cutoff_date
        );
        RETURN result;
    END IF;

    -- Proceed with cleanup if we have events to delete
    IF events_to_delete > 0 THEN
        -- Aggregate results
        SELECT COUNT(events_deleted) as dates_processed, SUM(events_deleted) as total_events_deleted
        INTO cleanup_results
        FROM purge_old_build_events(retention_days) as t(purged_date, events_deleted, stats_preserved);

        result := json_build_object(
            'success', true,
            'events_deleted', COALESCE(cleanup_results.total_events_deleted, 0),
            'dates_processed', COALESCE(cleanup_results.dates_processed, 0),
            'retention_days', retention_days,
            'cutoff_date', cutoff_date,
            'oldest_deleted_date', oldest_event_date,
            'stats_preserved', true,
            'completed_at', NOW()
        );
    ELSE
        result := json_build_object(
            'success', true,
            'events_deleted', 0,
            'message', 'No events older than retention period found',
            'retention_days', retention_days,
            'cutoff_date', cutoff_date
        );
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 5. Example usage and monitoring queries

/*
-- Manual cleanup (test with small retention first)
SELECT safe_purge_old_build_events(365); -- Clean events older than 365 days

-- Production cleanup
SELECT safe_purge_old_build_events(190); -- Clean events older than 190 days

-- Check retention policy effectiveness
SELECT
    CURRENT_DATE - MAX(DATE(created_at)) as oldest_event_days,
    COUNT(*) as total_events,
    COUNT(*) FILTER (WHERE created_at > CURRENT_DATE - INTERVAL '190 days') as recent_events,
    COUNT(*) FILTER (WHERE created_at <= CURRENT_DATE - INTERVAL '190 days') as old_events
FROM public.project_build_events;

-- View aggregated historical stats
SELECT * FROM public.build_events_daily_stats
ORDER BY date DESC
LIMIT 30;

-- Monitor database size
SELECT
    pg_size_pretty(pg_total_relation_size('project_build_events')) as table_size,
    pg_size_pretty(pg_indexes_size('project_build_events')) as indexes_size;
*/

-- 6. Set up automated cleanup (requires pg_cron extension)
/*
-- Enable pg_cron extension (run as superuser)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule nightly cleanup at 2 AM UTC
SELECT cron.schedule(
    'build-events-retention',
    '0 2 * * *',  -- Daily at 2 AM
    $$ SELECT safe_purge_old_build_events(45); $$
);

-- Check scheduled jobs
SELECT * FROM cron.job;

-- Remove scheduled job if needed
SELECT cron.unschedule('build-events-retention');
*/
