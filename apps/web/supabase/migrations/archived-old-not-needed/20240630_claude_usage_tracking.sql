-- Create usage tracking table for Claude API calls (monitoring only, no quotas)
CREATE TABLE IF NOT EXISTS claude_user_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, window_start)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_claude_usage_user_window 
    ON claude_user_usage(user_id, window_start DESC);

-- Enable RLS
ALTER TABLE claude_user_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own usage
CREATE POLICY "Users can view own usage" 
    ON claude_user_usage
    FOR SELECT 
    USING (auth.uid() = user_id);

-- Function to track Claude usage (no quota enforcement)
CREATE OR REPLACE FUNCTION track_claude_usage(
    p_user_id UUID
) RETURNS VOID AS $$
DECLARE
    v_window_start TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate current hour window
    v_window_start := date_trunc('hour', NOW());
    
    -- Insert or update usage count
    INSERT INTO claude_user_usage (user_id, window_start, calls)
    VALUES (p_user_id, v_window_start, 1)
    ON CONFLICT (user_id, window_start)
    DO UPDATE SET 
        calls = claude_user_usage.calls + 1,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION track_claude_usage TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION track_claude_usage IS 'Tracks Claude API usage for monitoring purposes. Does not enforce any quotas.';

-- Create a view for usage monitoring
CREATE OR REPLACE VIEW claude_usage_current AS
SELECT 
    u.id as user_id,
    u.email,
    COALESCE(c.calls, 0) as calls_this_hour,
    date_trunc('hour', NOW()) as current_window,
    date_trunc('hour', NOW()) + INTERVAL '1 hour' as window_reset_at
FROM 
    auth.users u
    LEFT JOIN claude_user_usage c ON u.id = c.user_id 
        AND c.window_start = date_trunc('hour', NOW())
WHERE 
    u.deleted_at IS NULL;

-- Grant select on view to authenticated users
GRANT SELECT ON claude_usage_current TO authenticated;

-- Function to get usage stats for analytics
CREATE OR REPLACE FUNCTION get_claude_usage_stats(
    p_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW() - INTERVAL '7 days',
    p_end_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
) RETURNS TABLE (
    hour TIMESTAMP WITH TIME ZONE,
    total_calls INTEGER,
    unique_users INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.window_start as hour,
        SUM(c.calls)::INTEGER as total_calls,
        COUNT(DISTINCT c.user_id)::INTEGER as unique_users
    FROM 
        claude_user_usage c
    WHERE 
        c.window_start >= p_start_date 
        AND c.window_start <= p_end_date
    GROUP BY 
        c.window_start
    ORDER BY 
        c.window_start DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to service role only (for admin endpoints)
GRANT EXECUTE ON FUNCTION get_claude_usage_stats TO service_role;