-- Phase 2: Minimal Chat Logging for Debugging Support
-- Lightweight chat logging table to help with support without full persistence complexity
-- Focuses on build mode messages and critical prompts for debugging

-- 1. Create minimal chat logging table
CREATE TABLE IF NOT EXISTS public.project_chat_log_minimal (
    id BIGSERIAL PRIMARY KEY,

    -- Context identifiers
    project_id UUID NOT NULL,
    user_id UUID NOT NULL,
    request_id TEXT,  -- From middleware (universal tracking)
    correlation_id TEXT,  -- From worker calls (specific tracking)

    -- Chat context
    mode TEXT CHECK (mode IN ('plan', 'build')) NOT NULL,
    session_id TEXT,  -- For grouping related messages

    -- Message content
    message_text TEXT NOT NULL,
    message_type TEXT CHECK (message_type IN ('user', 'assistant', 'system', 'error')) NOT NULL DEFAULT 'user',

    -- Build context (when applicable)
    build_id TEXT,
    build_triggered BOOLEAN DEFAULT FALSE,

    -- Metadata
    user_agent TEXT,
    ip_address INET,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Indexes for efficient queries
    CONSTRAINT fk_chat_log_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 2. Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_log_project_user
ON public.project_chat_log_minimal (project_id, user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_log_user_recent
ON public.project_chat_log_minimal (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_log_build_mode
ON public.project_chat_log_minimal (mode, build_triggered, created_at DESC)
WHERE mode = 'build';

CREATE INDEX IF NOT EXISTS idx_chat_log_correlation
ON public.project_chat_log_minimal (correlation_id)
WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_log_request
ON public.project_chat_log_minimal (request_id)
WHERE request_id IS NOT NULL;

-- 3. Create retention policy for chat logs (shorter than build events)
CREATE OR REPLACE FUNCTION purge_old_chat_logs(retention_days INTEGER DEFAULT 185)
RETURNS JSON AS $$
DECLARE
    result JSON;
    cutoff_timestamp TIMESTAMPTZ;
    logs_deleted BIGINT;
BEGIN
    cutoff_timestamp := NOW() - (retention_days || ' days')::INTERVAL;

    -- Delete old chat logs
    DELETE FROM public.project_chat_log_minimal
    WHERE created_at < cutoff_timestamp;

    GET DIAGNOSTICS logs_deleted = ROW_COUNT;

    result := json_build_object(
        'success', true,
        'logs_deleted', logs_deleted,
        'retention_days', retention_days,
        'cutoff_timestamp', cutoff_timestamp,
        'completed_at', NOW()
    );

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 4. Helper function to log chat messages from application
CREATE OR REPLACE FUNCTION log_chat_message(
    p_project_id UUID,
    p_user_id UUID,
    p_message_text TEXT,
    p_mode TEXT DEFAULT 'plan',
    p_message_type TEXT DEFAULT 'user',
    p_request_id TEXT DEFAULT NULL,
    p_correlation_id TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL,
    p_build_id TEXT DEFAULT NULL,
    p_build_triggered BOOLEAN DEFAULT FALSE,
    p_user_agent TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
    log_id BIGINT;
BEGIN
    INSERT INTO public.project_chat_log_minimal (
        project_id,
        user_id,
        message_text,
        mode,
        message_type,
        request_id,
        correlation_id,
        session_id,
        build_id,
        build_triggered,
        user_agent,
        ip_address
    ) VALUES (
        p_project_id,
        p_user_id,
        p_message_text,
        p_mode,
        p_message_type,
        p_request_id,
        p_correlation_id,
        p_session_id,
        p_build_id,
        p_build_triggered,
        p_user_agent,
        p_ip_address
    )
    RETURNING id INTO log_id;

    RETURN log_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Support and debugging query helpers

-- Get recent chat activity for a user
CREATE OR REPLACE FUNCTION get_user_chat_activity(
    p_user_id UUID,
    p_days INTEGER DEFAULT 7
)
RETURNS TABLE(
    project_id UUID,
    mode TEXT,
    message_count BIGINT,
    build_count BIGINT,
    last_activity TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cl.project_id,
        cl.mode,
        COUNT(*) as message_count,
        COUNT(*) FILTER (WHERE cl.build_triggered = true) as build_count,
        MAX(cl.created_at) as last_activity
    FROM public.project_chat_log_minimal cl
    WHERE cl.user_id = p_user_id
      AND cl.created_at > NOW() - (p_days || ' days')::INTERVAL
    GROUP BY cl.project_id, cl.mode
    ORDER BY last_activity DESC;
END;
$$ LANGUAGE plpgsql;

-- Get chat context around a specific build
CREATE OR REPLACE FUNCTION get_build_chat_context(
    p_build_id TEXT,
    p_context_minutes INTEGER DEFAULT 185
)
RETURNS TABLE(
    id BIGINT,
    project_id UUID,
    user_id UUID,
    message_text TEXT,
    message_type TEXT,
    build_triggered BOOLEAN,
    created_at TIMESTAMPTZ
) AS $$
DECLARE
    build_time TIMESTAMPTZ;
BEGIN
    -- Find when the build was triggered
    SELECT MIN(created_at) INTO build_time
    FROM public.project_chat_log_minimal
    WHERE build_id = p_build_id AND build_triggered = true;

    -- Return messages around that time
    RETURN QUERY
    SELECT
        cl.id,
        cl.project_id,
        cl.user_id,
        cl.message_text,
        cl.message_type,
        cl.build_triggered,
        cl.created_at
    FROM public.project_chat_log_minimal cl
    WHERE (cl.build_id = p_build_id OR
           (build_time IS NOT NULL AND
            cl.created_at BETWEEN build_time - (p_context_minutes || ' minutes')::INTERVAL
                               AND build_time + (p_context_minutes || ' minutes')::INTERVAL))
    ORDER BY cl.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 6. Example usage and monitoring queries
/*
-- Log a chat message (from application code)
SELECT log_chat_message(
    'project-uuid-here'::UUID,
    'user-uuid-here'::UUID,
    'Please add a contact form to my website',
    'build',
    'user',
    'req_12345',
    'nextjs_1735689600000_a1b2c3d4',
    'session-123',
    'build-456',
    true,
    'Mozilla/5.0...',
    '192.168.1.1'
);

-- Get recent user activity
SELECT * FROM get_user_chat_activity('user-uuid-here'::UUID, 7);

-- Get chat context for a build
SELECT * FROM get_build_chat_context('build-456', 185);

-- Support queries
-- Find users with recent build activity
SELECT
    user_id,
    COUNT(*) as total_messages,
    COUNT(*) FILTER (WHERE mode = 'build') as build_messages,
    MAX(created_at) as last_activity
FROM public.project_chat_log_minimal
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id
HAVING COUNT(*) FILTER (WHERE mode = 'build') > 0
ORDER BY last_activity DESC;

-- Monitor chat volume
SELECT
    DATE(created_at) as date,
    COUNT(*) as total_messages,
    COUNT(DISTINCT user_id) as active_users,
    COUNT(*) FILTER (WHERE build_triggered = true) as builds_triggered
FROM public.project_chat_log_minimal
WHERE created_at > NOW() - INTERVAL '185 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Cleanup old logs (run periodically)
SELECT purge_old_chat_logs(185);
*/
