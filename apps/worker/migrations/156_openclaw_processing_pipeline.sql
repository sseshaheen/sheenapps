-- Migration 156: OpenClaw Processing Pipeline Schema Updates
--
-- Adds missing columns and tables for the OpenClaw webhook worker:
-- 1. Add delivery_id and event_data to openclaw_event_log
-- 2. Add last_activity_at to openclaw_channel_status
-- 3. Create openclaw_tool_usage table for tool analytics
--
-- Reference: /docs/SHEENAPPS_OPENCLAW_ANALYSIS.md Phase 4

BEGIN;

-- =============================================================================
-- Add missing columns to openclaw_event_log
-- =============================================================================

-- Add delivery_id for correlating with webhook deliveries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_event_log' AND column_name = 'delivery_id'
  ) THEN
    ALTER TABLE openclaw_event_log ADD COLUMN delivery_id TEXT;
  END IF;
END $$;

-- Add event_data for storing the full event payload
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_event_log' AND column_name = 'event_data'
  ) THEN
    ALTER TABLE openclaw_event_log ADD COLUMN event_data JSONB DEFAULT '{}';
  END IF;
END $$;

-- Add event_timestamp for the original event time (vs created_at which is when we logged it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_event_log' AND column_name = 'event_timestamp'
  ) THEN
    ALTER TABLE openclaw_event_log ADD COLUMN event_timestamp TIMESTAMPTZ;
  END IF;
END $$;

-- Index for delivery_id lookups
CREATE INDEX IF NOT EXISTS idx_openclaw_events_delivery
  ON openclaw_event_log(delivery_id)
  WHERE delivery_id IS NOT NULL;

-- =============================================================================
-- Add missing columns to openclaw_channel_status
-- =============================================================================

-- Add last_activity_at for tracking when last message was processed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_channel_status' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE openclaw_channel_status ADD COLUMN last_activity_at TIMESTAMPTZ;
  END IF;
END $$;

-- =============================================================================
-- Table: openclaw_tool_usage
-- Purpose: Track tool execution for analytics and billing
-- =============================================================================

CREATE TABLE IF NOT EXISTS openclaw_tool_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  sender_id TEXT,
  tool_name TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for project analytics queries
CREATE INDEX IF NOT EXISTS idx_openclaw_tool_usage_project
  ON openclaw_tool_usage(project_id, created_at DESC);

-- Index for tool popularity queries
CREATE INDEX IF NOT EXISTS idx_openclaw_tool_usage_tool
  ON openclaw_tool_usage(project_id, tool_name, created_at DESC);

-- Index for session tracking
CREATE INDEX IF NOT EXISTS idx_openclaw_tool_usage_session
  ON openclaw_tool_usage(session_id, created_at DESC);

COMMENT ON TABLE openclaw_tool_usage IS
  'Tracks OpenClaw tool executions for analytics and billing. Used to understand which tools are most popular and for cost attribution.';

-- =============================================================================
-- Add 'pending' status option to openclaw_channel_status
-- =============================================================================

-- Drop and recreate the check constraint to include 'pending'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'openclaw_channel_status' AND constraint_name = 'openclaw_channel_status_status_check'
  ) THEN
    ALTER TABLE openclaw_channel_status DROP CONSTRAINT openclaw_channel_status_status_check;
    ALTER TABLE openclaw_channel_status ADD CONSTRAINT openclaw_channel_status_status_check
      CHECK (status IN ('connected', 'disconnected', 'error', 'pending'));
  END IF;
END $$;

COMMIT;
