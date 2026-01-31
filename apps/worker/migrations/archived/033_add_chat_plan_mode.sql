-- Migration: 033_add_chat_plan_mode.sql
-- Purpose: Add chat plan mode support with unified timeline and session tracking
-- Date: 2025-08-09
-- Implementation for docs/CHAT_PLAN_MODE_IMPLEMENTATION.md

-- =====================================================================
-- 1. Create global sequence for timeline ordering
-- =====================================================================
CREATE SEQUENCE IF NOT EXISTS project_timeline_seq;

-- =====================================================================
-- 2. Extend project_chat_log_minimal for plan mode support
-- =====================================================================
ALTER TABLE public.project_chat_log_minimal
  ADD COLUMN IF NOT EXISTS response_data JSONB,
  ADD COLUMN IF NOT EXISTS chat_mode VARCHAR(50), -- 'question'|'feature'|'fix'|'analysis'|'general'|'build'|'initial'|'build_progress'
  ADD COLUMN IF NOT EXISTS parent_message_id BIGINT REFERENCES public.project_chat_log_minimal(id),
  ADD COLUMN IF NOT EXISTS version_id TEXT,
  ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS billable_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS ai_session_id TEXT,
  ADD COLUMN IF NOT EXISTS ai_tracking_id TEXT,
  ADD COLUMN IF NOT EXISTS converted_from_session_id TEXT,
  ADD COLUMN IF NOT EXISTS timeline_seq BIGINT DEFAULT nextval('project_timeline_seq'),
  ADD COLUMN IF NOT EXISTS locale VARCHAR(10),   -- e.g., 'ar-EG', 'en-US'
  ADD COLUMN IF NOT EXISTS language VARCHAR(5),  -- e.g., 'ar', 'en'
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true;

-- Update constraints to support new message types
ALTER TABLE public.project_chat_log_minimal
  DROP CONSTRAINT IF EXISTS chat_log_minimal_message_type_check,
  DROP CONSTRAINT IF EXISTS chat_log_message_type_check_v2,
  ADD CONSTRAINT chat_log_message_type_check_v2
    CHECK (message_type IN ('user','assistant','system','error','build_reference'));

-- =====================================================================
-- 3. Create project_chat_plan_sessions table for session lifecycle tracking
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.project_chat_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  project_id VARCHAR(255) NOT NULL,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  message_count INTEGER DEFAULT 0,
  total_tokens_used INTEGER DEFAULT 0,
  total_ai_seconds_consumed INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'active', -- 'active'|'converted'|'expired'|'archived'
  converted_to_build_id VARCHAR(64),
  conversion_prompt TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- =====================================================================
-- 4. Update user_ai_time_consumption to support plan operations
-- =====================================================================
ALTER TABLE public.user_ai_time_consumption
  DROP CONSTRAINT IF EXISTS user_ai_time_consumption_operation_type_check,
  DROP CONSTRAINT IF EXISTS user_ai_time_consumption_operation_type_check_v2,
  ADD CONSTRAINT user_ai_time_consumption_operation_type_check_v2
    CHECK (operation_type IN (
      'main_build','metadata_generation','update',
      'plan_consultation','plan_question','plan_feature','plan_fix','plan_analysis'
    ));

-- =====================================================================
-- 5. Create indices for performance
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_chat_log_project_timeline
  ON public.project_chat_log_minimal(project_id, timeline_seq DESC);

CREATE INDEX IF NOT EXISTS idx_chat_log_session
  ON public.project_chat_log_minimal(session_id);

CREATE INDEX IF NOT EXISTS idx_chat_log_response_type
  ON public.project_chat_log_minimal((response_data->>'type'))
  WHERE response_data IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_log_templates
  ON public.project_chat_log_minimal(response_data)
  WHERE response_data->>'template' IS NOT NULL;

-- Ensure one build_reference per build
CREATE UNIQUE INDEX IF NOT EXISTS uniq_build_reference
  ON public.project_chat_log_minimal(build_id)
  WHERE response_data->>'type' = 'build_reference';

-- Indices for project_chat_plan_sessions
CREATE INDEX IF NOT EXISTS idx_plan_sessions_user_project
  ON public.project_chat_plan_sessions(user_id, project_id);

CREATE INDEX IF NOT EXISTS idx_plan_sessions_status
  ON public.project_chat_plan_sessions(status)
  WHERE status IN ('active', 'converted');

CREATE INDEX IF NOT EXISTS idx_plan_sessions_last_active
  ON public.project_chat_plan_sessions(last_active);

-- =====================================================================
-- 6. Create unified timeline view
-- =====================================================================
CREATE OR REPLACE VIEW public.project_timeline AS
SELECT
  pcl.id,
  pcl.project_id,
  pcl.user_id,
  pcl.created_at,
  pcl.timeline_seq,
  pcl.mode,
  pcl.chat_mode,
  pcl.message_text,
  pcl.message_type,
  pcl.response_data,
  pcl.build_id,
  pcl.version_id,
  pcl.session_id,
  pcl.locale,
  pcl.language,
  pv.preview_url,
  pv.status AS version_status,
  pv.artifact_url,
  pbm.status AS build_status,
  pbm.total_duration_ms AS build_duration,
  CASE
    WHEN pcl.mode = 'build' AND pv.id IS NOT NULL THEN 'deployed'
    WHEN pcl.mode = 'build' AND pbm.status = 'failed' THEN 'failed'
    WHEN pcl.mode = 'build' AND pbm.status IN ('queued','running') THEN 'in_progress'
    WHEN pcl.mode = 'plan' THEN 'planning'
    ELSE 'unknown'
  END AS timeline_status
FROM public.project_chat_log_minimal pcl
LEFT JOIN public.project_versions pv ON pv.version_id = pcl.version_id
LEFT JOIN public.project_build_metrics pbm ON pbm.build_id = pcl.build_id
WHERE pcl.is_visible = true
ORDER BY pcl.timeline_seq DESC;

-- =====================================================================
-- 7. Create view for chat with build events
-- =====================================================================
CREATE OR REPLACE VIEW public.project_chat_with_builds AS
SELECT
  pcl.*,
  CASE
    WHEN pcl.response_data->>'type' = 'build_reference' THEN
      (SELECT json_agg(pbe.* ORDER BY pbe.created_at)
       FROM public.project_build_events pbe
       WHERE pbe.build_id = pcl.build_id AND pbe.user_visible = true)
  END AS build_events
FROM public.project_chat_log_minimal pcl
WHERE pcl.is_visible = true
ORDER BY pcl.timeline_seq ASC;

-- =====================================================================
-- 8. Add comments for documentation
-- =====================================================================
COMMENT ON TABLE public.project_chat_plan_sessions IS 'Tracks chat plan mode sessions for billing and conversion tracking';
COMMENT ON COLUMN public.project_chat_plan_sessions.session_id IS 'Claude CLI session ID for resumption';
COMMENT ON COLUMN public.project_chat_plan_sessions.converted_to_build_id IS 'Links to build if session was converted';
COMMENT ON COLUMN public.project_chat_plan_sessions.total_ai_seconds_consumed IS 'Total AI processing time for billing';

COMMENT ON COLUMN public.project_chat_log_minimal.response_data IS 'Structured response data including templates and variables';
COMMENT ON COLUMN public.project_chat_log_minimal.chat_mode IS 'Specific chat mode for plan sessions';
COMMENT ON COLUMN public.project_chat_log_minimal.timeline_seq IS 'Global sequence for unified timeline ordering';
COMMENT ON COLUMN public.project_chat_log_minimal.converted_from_session_id IS 'Links build messages to their originating plan session';
COMMENT ON COLUMN public.project_chat_log_minimal.is_visible IS 'Controls visibility in timeline views';

COMMENT ON VIEW public.project_timeline IS 'Unified timeline view combining chat messages, builds, and deployments';
COMMENT ON VIEW public.project_chat_with_builds IS 'Chat messages enriched with build event data for build_reference rows';

-- =====================================================================
-- 9. Migration complete
-- =====================================================================
-- Note: migrations_history table not used in this environment
-- Migration: 033_add_chat_plan_mode
-- Applied: 2025-08-09
-- Purpose: Add chat plan mode support with unified timeline
