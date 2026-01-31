-- Migration 157: OpenClaw Idempotency & Safety Constraints
--
-- Adds missing constraints for production-safe operation:
-- 1. UNIQUE constraint on openclaw_event_log.delivery_id (prevents duplicate events on retry)
-- 2. Partial unique index on leads(project_id, phone) for upsert logic
--
-- Reference: Code review findings from SHEENAPPS_OPENCLAW_ANALYSIS.md

BEGIN;

-- =============================================================================
-- Add UNIQUE constraint on openclaw_event_log.delivery_id
-- Enables idempotent event logging (ON CONFLICT DO NOTHING)
-- =============================================================================

-- First, remove any duplicate delivery_ids if they exist (keep newest)
-- This is idempotent - safe to run multiple times
DELETE FROM openclaw_event_log a
USING openclaw_event_log b
WHERE a.delivery_id = b.delivery_id
  AND a.delivery_id IS NOT NULL
  AND a.created_at < b.created_at;

-- Drop the old non-unique index (created in migration 156) to avoid redundancy
-- We're replacing it with a unique version with the same name
DROP INDEX IF EXISTS idx_openclaw_events_delivery;

-- Create unique index on delivery_id (only for non-null values)
-- Use the original name since we're replacing the non-unique version
CREATE UNIQUE INDEX IF NOT EXISTS idx_openclaw_events_delivery
  ON openclaw_event_log(delivery_id)
  WHERE delivery_id IS NOT NULL;

-- =============================================================================
-- Add partial unique index on leads for phone-based upsert
-- Required for: ON CONFLICT (project_id, phone) WHERE phone IS NOT NULL
-- =============================================================================

-- Deduplicate leads by (project_id, phone) before creating the unique index
-- Keeps the newest row per (project_id, phone) combination
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY project_id, phone
          ORDER BY created_at DESC NULLS LAST, id DESC
        ) AS rn
      FROM leads
      WHERE phone IS NOT NULL
    )
    DELETE FROM leads
    WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
  END IF;
END $$;

-- Check if the leads table exists before creating the index
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    -- Create partial unique index for phone-based upsert
    -- This allows multiple leads with NULL phone (email-only leads)
    IF NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE indexname = 'idx_leads_unique_phone_per_project'
    ) THEN
      CREATE UNIQUE INDEX idx_leads_unique_phone_per_project
        ON leads(project_id, phone)
        WHERE phone IS NOT NULL;
    END IF;
  END IF;
END $$;

COMMIT;
