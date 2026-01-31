-- Migration: 142_domain_dispute_tracking.sql
-- Purpose: Add Stripe dispute tracking for domain billing
-- Part of: easy-mode-email-enhancements-plan.md (Enhancement 2)

BEGIN;

-- 1. Add charge_id and dispute columns to domain invoices
-- stripe_charge_id links payments to disputes for matching
-- dispute_id/dispute_status track active disputes

ALTER TABLE inhouse_domain_invoices
ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS dispute_id VARCHAR(100),
ADD COLUMN IF NOT EXISTS dispute_status VARCHAR(30);

-- Index for efficient dispute lookups by charge
CREATE INDEX IF NOT EXISTS idx_domain_invoices_charge
  ON inhouse_domain_invoices(stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

-- Index for finding domains with active disputes
CREATE INDEX IF NOT EXISTS idx_domain_invoices_dispute
  ON inhouse_domain_invoices(dispute_id)
  WHERE dispute_id IS NOT NULL;

-- 2. Idempotency table for Stripe events
-- Prevents duplicate processing when webhooks retry
CREATE TABLE IF NOT EXISTS stripe_processed_events (
  event_id VARCHAR(100) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup queries (older than 30 days can be purged)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_processed_events(processed_at);

-- 3. Update domain status CHECK constraint to include 'at_risk'
-- Drop existing constraint if it exists, then recreate with new value
ALTER TABLE inhouse_registered_domains
  DROP CONSTRAINT IF EXISTS inhouse_registered_domains_status_chk;

ALTER TABLE inhouse_registered_domains
  ADD CONSTRAINT inhouse_registered_domains_status_chk
  CHECK (status IN ('pending', 'active', 'expired', 'grace', 'redemption', 'suspended', 'transferred', 'at_risk'));

-- 4. Update domain events CHECK constraint to include dispute event types
ALTER TABLE inhouse_domain_events
  DROP CONSTRAINT IF EXISTS inhouse_domain_events_type_chk;

ALTER TABLE inhouse_domain_events
  ADD CONSTRAINT inhouse_domain_events_type_chk
  CHECK (event_type IN (
    'registered', 'renewed', 'expired', 'grace_period', 'redemption',
    'transferred', 'nameservers_updated', 'contacts_updated', 'settings_updated',
    'payment_failed', 'payment_succeeded', 'suspension', 'reactivation',
    'expiry_warning', 'auth_code_requested',
    -- Dispute event types (new)
    'dispute_created', 'dispute_won', 'dispute_lost'
  ));

-- 5. Add CHECK constraint for dispute_status values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_domain_invoices_dispute_status_chk') THEN
    ALTER TABLE inhouse_domain_invoices
      ADD CONSTRAINT inhouse_domain_invoices_dispute_status_chk
      CHECK (dispute_status IS NULL OR dispute_status IN (
        'warning_needs_response', 'needs_response', 'under_review',
        'charge_refunded', 'won', 'lost'
      ));
  END IF;
END $$;

-- 6. Comment on new columns for documentation
COMMENT ON COLUMN inhouse_domain_invoices.stripe_charge_id IS 'Stripe charge ID for linking payments to disputes';
COMMENT ON COLUMN inhouse_domain_invoices.dispute_id IS 'Active dispute ID if payment is disputed';
COMMENT ON COLUMN inhouse_domain_invoices.dispute_status IS 'Current dispute status (warning_needs_response, needs_response, under_review, won, lost)';
COMMENT ON TABLE stripe_processed_events IS 'Idempotency tracking for Stripe webhook events - prevents duplicate processing';

COMMIT;
