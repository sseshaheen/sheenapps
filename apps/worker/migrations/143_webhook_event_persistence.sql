-- Migration: 143_webhook_event_persistence.sql
-- Purpose: Webhook persistence and retry infrastructure
-- Part of: easy-mode-email-enhancements-plan.md (Enhancement 3)

BEGIN;

-- =============================================================================
-- inhouse_webhook_events: Raw webhook storage for debugging, replay, and audit
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification
  source VARCHAR(50) NOT NULL,  -- 'opensrs', 'stripe', 'resend'
  endpoint VARCHAR(200) NOT NULL,

  -- Raw data (immutable - never modify after insert)
  raw_headers JSONB NOT NULL,
  raw_body TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sender info
  sender_ip VARCHAR(50),
  idempotency_key VARCHAR(200),

  -- Processing status
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- 'pending'    - Just received, not yet processed
  -- 'processing' - Currently being processed
  -- 'completed'  - Successfully processed
  -- 'failed'     - Processing failed (may retry)
  -- 'retrying'   - Scheduled for retry

  processed_at TIMESTAMPTZ,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TIMESTAMPTZ,

  -- Parsed data (populated after successful processing)
  parsed_event_type VARCHAR(100),
  parsed_data JSONB,

  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Note: idempotency_key can be NULL for sources that don't provide one
  -- We use a partial unique index instead of table constraint
  CONSTRAINT check_idempotency_required CHECK (
    -- For known webhook sources, idempotency_key should be provided
    source NOT IN ('opensrs', 'stripe', 'resend') OR idempotency_key IS NOT NULL
  )
);

-- Partial unique index for idempotency (only when key is not NULL)
-- This allows multiple NULL values while preventing duplicates when key exists
CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_idempotency
  ON inhouse_webhook_events (source, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON inhouse_webhook_events(status);

CREATE INDEX IF NOT EXISTS idx_webhook_events_source
  ON inhouse_webhook_events(source, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_retry
  ON inhouse_webhook_events(next_retry_at)
  WHERE status = 'retrying';

CREATE INDEX IF NOT EXISTS idx_webhook_events_failed
  ON inhouse_webhook_events(source, status, updated_at DESC)
  WHERE status = 'failed';

-- =============================================================================
-- Status CHECK constraint
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_webhook_events_status_chk') THEN
    ALTER TABLE inhouse_webhook_events
      ADD CONSTRAINT inhouse_webhook_events_status_chk
      CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'retrying'));
  END IF;
END $$;

-- =============================================================================
-- Updated at trigger
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_webhook_events_timestamp') THEN
    CREATE TRIGGER update_webhook_events_timestamp
      BEFORE UPDATE ON inhouse_webhook_events
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE inhouse_webhook_events IS 'Raw webhook event storage for debugging, retry, and audit trail';
COMMENT ON COLUMN inhouse_webhook_events.raw_headers IS 'Original HTTP headers (immutable)';
COMMENT ON COLUMN inhouse_webhook_events.raw_body IS 'Original request body (immutable)';
COMMENT ON COLUMN inhouse_webhook_events.idempotency_key IS 'Unique key for deduplication (source-specific format)';
COMMENT ON COLUMN inhouse_webhook_events.parsed_event_type IS 'Extracted event type after processing';
COMMENT ON COLUMN inhouse_webhook_events.parsed_data IS 'Extracted event data after processing';

COMMIT;
