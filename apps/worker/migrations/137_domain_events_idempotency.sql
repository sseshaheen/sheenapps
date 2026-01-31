-- Migration: 137_domain_events_idempotency.sql
-- Description: Add idempotency_key column to inhouse_domain_events for proper webhook deduplication
-- Part of easy-mode-email-plan.md (Phase 3: Domain Registration)
--
-- This improves OpenSRS webhook processing:
-- 1. Move idempotency from JSONB query to proper indexed column
-- 2. Use unique constraint for atomic deduplication (ON CONFLICT DO NOTHING)
-- 3. Better performance than metadata->>'idempotency_key' queries

BEGIN;

-- =============================================================================
-- Add idempotency_key column
-- =============================================================================
ALTER TABLE inhouse_domain_events
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create unique index for atomic deduplication
-- Partial index (WHERE idempotency_key IS NOT NULL) allows multiple NULL values
-- which is fine since internal events may not have idempotency keys
CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_events_idempotency_key
  ON inhouse_domain_events (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN inhouse_domain_events.idempotency_key IS
  'Unique key for webhook idempotency (format: opensrs:<domain>:<action>:<timestamp>)';

COMMIT;
