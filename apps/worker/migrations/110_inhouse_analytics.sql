-- Migration: 110_inhouse_analytics.sql
-- Description: Analytics tables for Easy Mode projects
-- Date: 2026-01-24

-- =============================================================================
-- Analytics Events Table
-- =============================================================================
-- Stores all analytics events (track, page, identify)

CREATE TABLE IF NOT EXISTS public.inhouse_analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN ('track', 'page', 'identify')),
    event_name VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    anonymous_id VARCHAR(255),
    properties JSONB DEFAULT '{}'::jsonb,
    context JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- At least one identity required
    CONSTRAINT inhouse_analytics_events_identity_check
        CHECK (user_id IS NOT NULL OR anonymous_id IS NOT NULL)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_events_project
    ON public.inhouse_analytics_events(project_id);

CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_events_project_type
    ON public.inhouse_analytics_events(project_id, event_type);

CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_events_project_name
    ON public.inhouse_analytics_events(project_id, event_name);

CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_events_project_user
    ON public.inhouse_analytics_events(project_id, user_id)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_events_project_anon
    ON public.inhouse_analytics_events(project_id, anonymous_id)
    WHERE anonymous_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_events_timestamp
    ON public.inhouse_analytics_events(project_id, timestamp DESC);

-- =============================================================================
-- Analytics Users Table
-- =============================================================================
-- Stores identified user profiles with traits

CREATE TABLE IF NOT EXISTS public.inhouse_analytics_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    anonymous_id VARCHAR(255),
    traits JSONB DEFAULT '{}'::jsonb,
    first_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Unique user per project
    CONSTRAINT inhouse_analytics_users_project_user_unique
        UNIQUE (project_id, user_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_users_project
    ON public.inhouse_analytics_users(project_id);

CREATE INDEX IF NOT EXISTS idx_inhouse_analytics_users_anon
    ON public.inhouse_analytics_users(project_id, anonymous_id)
    WHERE anonymous_id IS NOT NULL;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE public.inhouse_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inhouse_analytics_users ENABLE ROW LEVEL SECURITY;

-- Events: Project owner can read, service role can write
CREATE POLICY inhouse_analytics_events_select ON public.inhouse_analytics_events
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
    );

-- Allow inserts from service role (SDK calls through worker)
CREATE POLICY inhouse_analytics_events_service_insert ON public.inhouse_analytics_events
    FOR INSERT
    WITH CHECK (true);

-- Users: Same pattern
CREATE POLICY inhouse_analytics_users_select ON public.inhouse_analytics_users
    FOR SELECT
    USING (
        project_id IN (
            SELECT id FROM public.projects WHERE owner_id = auth.uid()
        )
    );

CREATE POLICY inhouse_analytics_users_service_all ON public.inhouse_analytics_users
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- Cleanup function (90 days retention)
-- =============================================================================

CREATE OR REPLACE FUNCTION cleanup_old_analytics_events()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.inhouse_analytics_events
    WHERE created_at < NOW() - INTERVAL '90 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON TABLE public.inhouse_analytics_events IS 'Analytics events for Easy Mode projects (track, page, identify)';
COMMENT ON TABLE public.inhouse_analytics_users IS 'Identified user profiles for Easy Mode projects';
COMMENT ON COLUMN public.inhouse_analytics_events.event_type IS 'Event type: track (custom), page (page view), identify (user identification)';
COMMENT ON COLUMN public.inhouse_analytics_events.event_name IS 'Event name or page path';
COMMENT ON COLUMN public.inhouse_analytics_events.properties IS 'Event-specific properties';
COMMENT ON COLUMN public.inhouse_analytics_events.context IS 'Context about the event (user agent, IP, etc.)';
COMMENT ON FUNCTION cleanup_old_analytics_events() IS 'Removes analytics events older than 90 days';
