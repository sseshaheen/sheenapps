-- Migration: 144_domain_transfers.sql
-- Purpose: Domain transfer-in tracking infrastructure
-- Part of: easy-mode-email-enhancements-plan.md (Enhancement 4)

BEGIN;

-- =============================================================================
-- inhouse_domain_transfers: Track domain transfer-in requests
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_domain_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

  -- Domain info
  domain VARCHAR(255) NOT NULL,
  tld VARCHAR(50) NOT NULL,

  -- Transfer tracking
  opensrs_order_id VARCHAR(100),
  auth_code_hash VARCHAR(64),  -- SHA-256 hash for audit, never store plaintext

  -- Status tracking
  -- NOTE: Status mappings should be validated against OpenSRS sandbox before production
  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
  status_message TEXT,
  raw_provider_status VARCHAR(100),  -- Preserve actual OpenSRS status for debugging

  -- Source registrar (if known - TLD dependent per OpenSRS docs)
  source_registrar VARCHAR(100),

  -- Contact information
  contacts JSONB NOT NULL,

  -- Billing
  stripe_payment_intent_id VARCHAR(100),
  stripe_charge_id VARCHAR(100),
  price_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- User who initiated
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email VARCHAR(255),

  -- Timestamps
  initiated_at TIMESTAMPTZ,  -- When transfer actually started (after payment)
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Link to registered domain once complete
  registered_domain_id UUID REFERENCES inhouse_registered_domains(id) ON DELETE SET NULL
);

-- =============================================================================
-- Status CHECK constraint
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_domain_transfers_status_chk') THEN
    ALTER TABLE inhouse_domain_transfers
      ADD CONSTRAINT inhouse_domain_transfers_status_chk
      CHECK (status IN (
        'pending_payment',  -- Awaiting payment confirmation
        'pending',          -- Payment confirmed, awaiting auth code
        'initiated',        -- Transfer request sent to OpenSRS
        'processing',       -- Transfer in progress with registry
        'completed',        -- Transfer successful
        'failed',           -- Transfer failed
        'cancelled'         -- User cancelled
      ));
  END IF;
END $$;

-- =============================================================================
-- Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_transfers_project
  ON inhouse_domain_transfers(project_id);

CREATE INDEX IF NOT EXISTS idx_transfers_status
  ON inhouse_domain_transfers(status)
  WHERE status NOT IN ('completed', 'failed', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_transfers_domain
  ON inhouse_domain_transfers(domain);

CREATE INDEX IF NOT EXISTS idx_transfers_opensrs_order
  ON inhouse_domain_transfers(opensrs_order_id)
  WHERE opensrs_order_id IS NOT NULL;

-- =============================================================================
-- Updated at trigger
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_domain_transfers_timestamp') THEN
    CREATE TRIGGER update_domain_transfers_timestamp
      BEFORE UPDATE ON inhouse_domain_transfers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- Update domain events CHECK constraint to include transfer events
-- =============================================================================
ALTER TABLE inhouse_domain_events
  DROP CONSTRAINT IF EXISTS inhouse_domain_events_type_chk;

ALTER TABLE inhouse_domain_events
  ADD CONSTRAINT inhouse_domain_events_type_chk
  CHECK (event_type IN (
    'registered', 'renewed', 'expired', 'grace_period', 'redemption',
    'transferred', 'nameservers_updated', 'contacts_updated', 'settings_updated',
    'payment_failed', 'payment_succeeded', 'suspension', 'reactivation',
    'expiry_warning', 'auth_code_requested',
    -- Dispute event types
    'dispute_created', 'dispute_won', 'dispute_lost',
    -- Transfer-in event types (new)
    'transfer_initiated', 'transfer_processing', 'transfer_completed', 'transfer_failed'
  ));

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE inhouse_domain_transfers IS 'Domain transfer-in tracking - tracks lifecycle from payment to completion';
COMMENT ON COLUMN inhouse_domain_transfers.auth_code_hash IS 'SHA-256 hash of auth code for audit trail - never store plaintext';
COMMENT ON COLUMN inhouse_domain_transfers.raw_provider_status IS 'Original OpenSRS status for debugging - actual values may vary by TLD';
COMMENT ON COLUMN inhouse_domain_transfers.source_registrar IS 'Previous registrar name - availability varies by TLD';

COMMIT;
