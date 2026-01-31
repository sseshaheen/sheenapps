-- Add usage tracking columns to project_chat_log_minimal
-- These columns are for INTERNAL tracking only - not exposed via API

-- Add chat_mode column if it doesn't exist
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS chat_mode text;

-- Add response_data column for storing structured responses
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS response_data jsonb;

-- Add tokens_used for tracking token consumption
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS tokens_used integer;

-- Add duration_ms for tracking processing time
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS duration_ms integer;

-- Add billable_seconds for billing calculations
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS billable_seconds integer;

-- Add locale and language for i18n tracking
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS locale text;

ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS language text;

-- Add timeline_seq for ordering
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS timeline_seq bigint;

-- Add is_hidden for filtering
ALTER TABLE project_chat_log_minimal 
ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_chat_log_tokens_used 
ON project_chat_log_minimal(project_id, tokens_used) 
WHERE tokens_used IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_log_billable 
ON project_chat_log_minimal(project_id, user_id, billable_seconds) 
WHERE billable_seconds IS NOT NULL;

-- Add comment explaining internal use only
COMMENT ON COLUMN project_chat_log_minimal.tokens_used IS 'Internal token usage tracking - NOT exposed via API';
COMMENT ON COLUMN project_chat_log_minimal.billable_seconds IS 'Internal billing calculation - NOT exposed via API';
COMMENT ON COLUMN project_chat_log_minimal.duration_ms IS 'Internal performance metric - NOT exposed via API';

-- Create or replace view for aggregated usage (internal reporting only)
CREATE OR REPLACE VIEW internal_chat_usage_summary AS
SELECT 
    project_id,
    user_id,
    DATE(created_at) as usage_date,
    COUNT(*) as total_messages,
    SUM(COALESCE(tokens_used, 0)) as total_tokens,
    SUM(COALESCE(billable_seconds, 0)) as total_billable_seconds,
    AVG(COALESCE(duration_ms, 0))::integer as avg_duration_ms,
    MAX(tokens_used) as max_tokens_per_message,
    COUNT(DISTINCT session_id) as unique_sessions
FROM project_chat_log_minimal
WHERE message_type = 'assistant'
GROUP BY project_id, user_id, DATE(created_at);

COMMENT ON VIEW internal_chat_usage_summary IS 'Internal usage tracking view - NOT for API exposure';