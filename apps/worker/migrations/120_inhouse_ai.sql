-- ============================================================================
-- Migration: 120_inhouse_ai.sql
-- Description: AI infrastructure for Easy Mode (chat, embeddings, images)
-- Part of Phase 3C: EASY_MODE_SDK_PLAN.md
-- ============================================================================

-- ============================================================================
-- AI USAGE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS inhouse_ai_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    model VARCHAR(100) NOT NULL,
    operation VARCHAR(20) NOT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    success BOOLEAN DEFAULT true,
    error_code VARCHAR(50),
    request_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT inhouse_ai_usage_operation_valid CHECK (operation IN ('chat', 'embed', 'image'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inhouse_ai_usage_project
    ON inhouse_ai_usage(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_ai_usage_created
    ON inhouse_ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_ai_usage_project_created
    ON inhouse_ai_usage(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_ai_usage_model
    ON inhouse_ai_usage(model);
CREATE INDEX IF NOT EXISTS idx_inhouse_ai_usage_request_id
    ON inhouse_ai_usage(request_id)
    WHERE request_id IS NOT NULL;

-- Cleanup index for log retention (30 days)
CREATE INDEX IF NOT EXISTS idx_inhouse_ai_usage_cleanup
    ON inhouse_ai_usage(created_at);

-- Aggregate index for usage statistics
CREATE INDEX IF NOT EXISTS idx_inhouse_ai_usage_stats
    ON inhouse_ai_usage(project_id, model, created_at)
    WHERE success = true;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE inhouse_ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own project AI usage
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy WHERE polname = 'inhouse_ai_usage_owner_read'
    ) THEN
        CREATE POLICY inhouse_ai_usage_owner_read ON inhouse_ai_usage
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
        -- Service role full access for AI usage
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy WHERE polname = 'inhouse_ai_usage_service_access'
        ) THEN
            CREATE POLICY inhouse_ai_usage_service_access ON inhouse_ai_usage
                FOR ALL
                TO service_role
                USING (true);
        END IF;
    END IF;
END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE inhouse_ai_usage IS 'AI operation usage tracking for Easy Mode projects';
COMMENT ON COLUMN inhouse_ai_usage.model IS 'AI model used (e.g., gpt-4o, claude-3-sonnet)';
COMMENT ON COLUMN inhouse_ai_usage.operation IS 'Type of AI operation: chat, embed, or image';
COMMENT ON COLUMN inhouse_ai_usage.prompt_tokens IS 'Input tokens consumed';
COMMENT ON COLUMN inhouse_ai_usage.completion_tokens IS 'Output tokens generated';
COMMENT ON COLUMN inhouse_ai_usage.request_id IS 'Client-provided request ID for idempotency';
