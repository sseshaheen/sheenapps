-- Migration: Build Events Performance Indexes
-- Implements expert feedback for optimized query patterns
-- Part of BUILD_EVENTS_ANALYSIS_AND_SOLUTION_PLAN.md implementation

-- Add timestamp-based composite index for user dashboard queries
-- Pattern: "Show me the latest 50 build events for user X"
DO $$ 
BEGIN
  CREATE INDEX IF NOT EXISTS idx_build_events_user_created_desc
    ON public.project_build_events (user_id, created_at DESC);
EXCEPTION
  WHEN duplicate_table THEN
    -- Index already exists, skip
    NULL;
END $$;

-- Add build_id focused index for single-build queries  
-- Pattern: "Show me all events for build X" (already exists from 022 migration)
DO $$ 
BEGIN
  CREATE INDEX IF NOT EXISTS idx_build_events_build_id
    ON public.project_build_events (build_id);
EXCEPTION
  WHEN duplicate_table THEN
    -- Index already exists, skip
    NULL;
END $$;

-- Add composite index for filtered real-time subscriptions
-- Pattern: "Subscribe to events for build X by user Y"
-- This optimizes the Supabase real-time filter: `build_id=eq.X AND user_id=eq.Y`
DO $$ 
BEGIN
  CREATE INDEX IF NOT EXISTS idx_build_events_build_user_created
    ON public.project_build_events (build_id, user_id, created_at DESC);
EXCEPTION
  WHEN duplicate_table THEN
    -- Index already exists, skip
    NULL;
END $$;

-- Add event_type index for analytics queries
-- Pattern: "Show me all failed builds for user X"
DO $$ 
BEGIN
  CREATE INDEX IF NOT EXISTS idx_build_events_user_type_created
    ON public.project_build_events (user_id, event_type, created_at DESC);
EXCEPTION
  WHEN duplicate_table THEN
    -- Index already exists, skip
    NULL;
END $$;

-- Update table comment to reflect optimized query patterns
COMMENT ON TABLE public.project_build_events IS 
'Stores all build progress events for polling and real-time updates. 
Events are user-scoped for security. Optimized indexes support:
- User dashboard queries (user_id, created_at DESC)
- Single build tracking (build_id)
- Real-time subscriptions (build_id, user_id, created_at DESC)
- Analytics queries (user_id, event_type, created_at DESC)';

-- Add index usage hints for query optimization
COMMENT ON INDEX idx_build_events_user_created_desc IS 
'Optimizes user dashboard queries: ORDER BY created_at DESC with user filtering';

COMMENT ON INDEX idx_build_events_build_user_created IS 
'Optimizes real-time subscription queries: build_id + user_id filters with chronological order';

COMMENT ON INDEX idx_build_events_user_type_created IS 
'Optimizes analytics queries: event type filtering by user with chronological order';

-- Performance validation query (for testing)
-- This query should use idx_build_events_user_created_desc
-- SELECT * FROM project_build_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50;