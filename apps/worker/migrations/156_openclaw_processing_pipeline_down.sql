-- Migration 156 DOWN: Rollback OpenClaw Processing Pipeline Schema Updates
--
-- Reverses the changes made in 156_openclaw_processing_pipeline.sql:
-- 1. Remove delivery_id and event_data from openclaw_event_log
-- 2. Remove last_activity_at from openclaw_channel_status
-- 3. Drop openclaw_tool_usage table
--
-- WARNING: This will delete data in the affected columns/tables.
-- Only run this if you need to fully rollback the migration.

BEGIN;

-- =============================================================================
-- Drop the openclaw_tool_usage table
-- =============================================================================

DROP TABLE IF EXISTS openclaw_tool_usage;

-- =============================================================================
-- Remove columns from openclaw_event_log
-- =============================================================================

-- Remove event_timestamp column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_event_log' AND column_name = 'event_timestamp'
  ) THEN
    ALTER TABLE openclaw_event_log DROP COLUMN event_timestamp;
  END IF;
END $$;

-- Remove event_data column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_event_log' AND column_name = 'event_data'
  ) THEN
    ALTER TABLE openclaw_event_log DROP COLUMN event_data;
  END IF;
END $$;

-- Remove delivery_id column and its index
DROP INDEX IF EXISTS idx_openclaw_events_delivery;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_event_log' AND column_name = 'delivery_id'
  ) THEN
    ALTER TABLE openclaw_event_log DROP COLUMN delivery_id;
  END IF;
END $$;

-- =============================================================================
-- Remove columns from openclaw_channel_status
-- =============================================================================

-- Remove last_activity_at column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'openclaw_channel_status' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE openclaw_channel_status DROP COLUMN last_activity_at;
  END IF;
END $$;

-- =============================================================================
-- Revert 'pending' status option from openclaw_channel_status
-- =============================================================================

-- Restore original check constraint without 'pending'
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'openclaw_channel_status' AND constraint_name = 'openclaw_channel_status_status_check'
  ) THEN
    -- First update any 'pending' values to 'disconnected' to avoid constraint violation
    UPDATE openclaw_channel_status SET status = 'disconnected' WHERE status = 'pending';

    ALTER TABLE openclaw_channel_status DROP CONSTRAINT openclaw_channel_status_status_check;
    ALTER TABLE openclaw_channel_status ADD CONSTRAINT openclaw_channel_status_status_check
      CHECK (status IN ('connected', 'disconnected', 'error'));
  END IF;
END $$;

COMMIT;
