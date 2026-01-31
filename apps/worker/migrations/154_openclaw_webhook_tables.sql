-- Migration 154: OpenClaw Webhook Tables
--
-- Creates tables for:
-- 1. Webhook delivery tracking (idempotency)
-- 2. Daily metrics aggregation
-- 3. Event log for audit trail
--
-- Note: These tables are for the OpenClaw integration with SheenApps
-- Reference: /docs/SHEENAPPS_OPENCLAW_ANALYSIS.md

BEGIN;

-- =============================================================================
-- Table: openclaw_webhook_deliveries
-- Purpose: Track processed webhook deliveries for idempotency
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries (delete old deliveries after 7 days)
CREATE INDEX IF NOT EXISTS idx_openclaw_deliveries_created
  ON openclaw_webhook_deliveries(created_at);

-- Index for project-specific queries
CREATE INDEX IF NOT EXISTS idx_openclaw_deliveries_project
  ON openclaw_webhook_deliveries(project_id, created_at DESC);

-- Add comment
COMMENT ON TABLE openclaw_webhook_deliveries IS
  'Tracks processed OpenClaw webhook deliveries for idempotency. Entries older than 7 days can be safely deleted.';

-- =============================================================================
-- Table: openclaw_daily_metrics
-- Purpose: Aggregate daily metrics per project for Run Hub dashboard
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint for upsert
  CONSTRAINT uq_openclaw_metrics_project_date_event
    UNIQUE (project_id, metric_date, event_type)
);

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_openclaw_metrics_project_date
  ON openclaw_daily_metrics(project_id, metric_date DESC);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_openclaw_metrics_date
  ON openclaw_daily_metrics(metric_date);

-- Add comment
COMMENT ON TABLE openclaw_daily_metrics IS
  'Aggregated daily metrics for OpenClaw activity per project. Used by Run Hub dashboard.';

-- =============================================================================
-- Table: openclaw_event_log
-- Purpose: Audit trail for tool calls and important events
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  gateway_id TEXT NOT NULL,
  session_id TEXT,
  event_type TEXT NOT NULL,
  channel TEXT,
  sender_id TEXT,
  tool_name TEXT,
  tool_params JSONB,
  tool_result JSONB,
  error_code TEXT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for project event queries
CREATE INDEX IF NOT EXISTS idx_openclaw_events_project_created
  ON openclaw_event_log(project_id, created_at DESC);

-- Index for session-specific queries
CREATE INDEX IF NOT EXISTS idx_openclaw_events_session
  ON openclaw_event_log(session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

-- Index for tool analytics
CREATE INDEX IF NOT EXISTS idx_openclaw_events_tool
  ON openclaw_event_log(project_id, tool_name, created_at DESC)
  WHERE tool_name IS NOT NULL;

-- Partial index for error queries
CREATE INDEX IF NOT EXISTS idx_openclaw_events_errors
  ON openclaw_event_log(project_id, created_at DESC)
  WHERE error_code IS NOT NULL;

-- Add comment
COMMENT ON TABLE openclaw_event_log IS
  'Audit trail for OpenClaw tool calls and important events. Used for debugging and analytics.';

-- =============================================================================
-- Table: openclaw_channel_status
-- Purpose: Track channel connection status per project
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_channel_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  gateway_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected', 'disconnected', 'error')),
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One status record per project+channel
  CONSTRAINT uq_openclaw_channel_project
    UNIQUE (project_id, channel)
);

-- Index for health check queries
CREATE INDEX IF NOT EXISTS idx_openclaw_channels_project
  ON openclaw_channel_status(project_id);

-- Add comment
COMMENT ON TABLE openclaw_channel_status IS
  'Current connection status for each OpenClaw channel per project.';

-- =============================================================================
-- Add openclaw_enabled and openclaw_kill_switch to projects metadata
-- (No schema change needed - uses existing JSONB metadata column)
-- =============================================================================

-- Note: Projects table already has a metadata JSONB column.
-- OpenClaw settings are stored as:
--   metadata->>'openclaw_enabled' (boolean)
--   metadata->>'openclaw_kill_switch' (boolean)
--   metadata->>'openclaw_config' (JSON object with tool policy, etc.)

COMMIT;
