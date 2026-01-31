-- ============================================================================
-- Migration: 121_inhouse_realtime.sql
-- Description: Realtime infrastructure for Easy Mode (channels, presence)
-- Part of Phase 3C: EASY_MODE_SDK_PLAN.md
-- ============================================================================

-- ============================================================================
-- REALTIME USAGE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_realtime_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    operation VARCHAR(20) NOT NULL,
    channel VARCHAR(255),
    success BOOLEAN DEFAULT true,
    error_code VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inhouse_realtime_usage_operation_valid CHECK (operation IN ('publish', 'connect', 'presence'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inhouse_realtime_usage_project
    ON inhouse_realtime_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_realtime_usage_created
    ON inhouse_realtime_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_realtime_usage_project_created
    ON inhouse_realtime_usage(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_realtime_usage_channel
    ON inhouse_realtime_usage(channel)
    WHERE channel IS NOT NULL;

-- Cleanup index for log retention (7 days)
CREATE INDEX IF NOT EXISTS idx_inhouse_realtime_usage_cleanup
    ON inhouse_realtime_usage(created_at);

-- Aggregate index for usage statistics
CREATE INDEX IF NOT EXISTS idx_inhouse_realtime_usage_stats
    ON inhouse_realtime_usage(project_id, channel, operation, created_at);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE inhouse_realtime_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own project realtime usage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'inhouse_realtime_usage_owner_read'
    ) THEN
        CREATE POLICY inhouse_realtime_usage_owner_read ON inhouse_realtime_usage
            FOR SELECT
            TO authenticated
            USING (
                project_id IN (
                    SELECT id FROM projects WHERE owner_id = auth.uid()
                )
            );
    END IF;
END $$;

-- ============================================================================
-- SERVICE ROLE ACCESS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- Service role full access for realtime usage
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy WHERE polname = 'inhouse_realtime_usage_service_access'
        ) THEN
            CREATE POLICY inhouse_realtime_usage_service_access ON inhouse_realtime_usage
                FOR ALL
                TO service_role
                USING (true);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE inhouse_realtime_usage IS 'Realtime operation usage tracking for Easy Mode projects';
COMMENT ON COLUMN inhouse_realtime_usage.operation IS 'Type of realtime operation: publish, connect, or presence';
COMMENT ON COLUMN inhouse_realtime_usage.channel IS 'Channel name (without project prefix)';
