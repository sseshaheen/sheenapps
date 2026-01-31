-- Migration: 136_inhouse_domain_invoices.sql
-- Description: Domain billing invoices for Easy Mode (Phase 3: Domain Registration)
-- Part of easy-mode-email-plan.md

BEGIN;

-- =============================================================================
-- inhouse_domain_invoices: Billing records for domain purchases/renewals
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_domain_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id UUID NOT NULL REFERENCES inhouse_registered_domains(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Amount
  amount_cents INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  -- Possible values:
  -- 'draft'         - Invoice created but not finalized
  -- 'open'          - Invoice sent, awaiting payment
  -- 'paid'          - Payment received
  -- 'uncollectible' - Payment failed after retries
  -- 'void'          - Invoice canceled

  -- Type
  invoice_type VARCHAR(20) NOT NULL,
  -- 'registration' - Initial domain purchase
  -- 'renewal'      - Domain renewal
  -- 'transfer'     - Domain transfer-in

  -- Stripe references
  stripe_invoice_id VARCHAR(100),
  stripe_payment_intent_id VARCHAR(100),

  -- Payment timing
  paid_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_domain_invoices_domain
  ON inhouse_domain_invoices(domain_id);
CREATE INDEX IF NOT EXISTS idx_domain_invoices_user
  ON inhouse_domain_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_domain_invoices_status
  ON inhouse_domain_invoices(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_domain_invoices_stripe_pi
  ON inhouse_domain_invoices(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- =============================================================================
-- inhouse_domain_payment_methods: User payment methods for domain billing
-- =============================================================================
CREATE TABLE IF NOT EXISTS inhouse_domain_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Stripe references
  stripe_payment_method_id VARCHAR(100) NOT NULL,

  -- Card info (for display only, not PCI sensitive)
  card_brand VARCHAR(20),
  card_last4 VARCHAR(4),
  card_exp_month INTEGER,
  card_exp_year INTEGER,

  -- Status
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  -- 'active', 'expired', 'deleted'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_domain_payment_methods_user
  ON inhouse_domain_payment_methods(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_domain_payment_methods_stripe
  ON inhouse_domain_payment_methods(stripe_payment_method_id);
CREATE INDEX IF NOT EXISTS idx_domain_payment_methods_default
  ON inhouse_domain_payment_methods(user_id, is_default)
  WHERE is_default = TRUE;

-- =============================================================================
-- CHECK Constraints (prevent typos in string enum fields)
-- =============================================================================

-- Invoice status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_domain_invoices_status_chk') THEN
    ALTER TABLE inhouse_domain_invoices
      ADD CONSTRAINT inhouse_domain_invoices_status_chk
      CHECK (status IN ('draft', 'open', 'paid', 'uncollectible', 'void'));
  END IF;
END $$;

-- Invoice type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_domain_invoices_type_chk') THEN
    ALTER TABLE inhouse_domain_invoices
      ADD CONSTRAINT inhouse_domain_invoices_type_chk
      CHECK (invoice_type IN ('registration', 'renewal', 'transfer'));
  END IF;
END $$;

-- Payment method status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inhouse_domain_payment_methods_status_chk') THEN
    ALTER TABLE inhouse_domain_payment_methods
      ADD CONSTRAINT inhouse_domain_payment_methods_status_chk
      CHECK (status IN ('active', 'expired', 'deleted'));
  END IF;
END $$;

-- =============================================================================
-- Enforce single default payment method per user
-- =============================================================================
-- Drop non-unique index if exists, replace with unique partial index
DROP INDEX IF EXISTS idx_domain_payment_methods_default;

CREATE UNIQUE INDEX IF NOT EXISTS uq_domain_payment_methods_one_default
  ON inhouse_domain_payment_methods(user_id)
  WHERE is_default = TRUE;

-- =============================================================================
-- RLS Policies
-- =============================================================================

ALTER TABLE inhouse_domain_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_domain_payment_methods ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own invoices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'domain_invoices_user_access' AND tablename = 'inhouse_domain_invoices') THEN
    CREATE POLICY domain_invoices_user_access ON inhouse_domain_invoices
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- Policy: Users can manage their own payment methods
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'domain_payment_methods_user_access' AND tablename = 'inhouse_domain_payment_methods') THEN
    CREATE POLICY domain_payment_methods_user_access ON inhouse_domain_payment_methods
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Service role bypass for both tables
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'domain_invoices_service_full' AND tablename = 'inhouse_domain_invoices') THEN
      CREATE POLICY domain_invoices_service_full ON inhouse_domain_invoices
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'domain_payment_methods_service_full' AND tablename = 'inhouse_domain_payment_methods') THEN
      CREATE POLICY domain_payment_methods_service_full ON inhouse_domain_payment_methods
        FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
  END IF;
END $$;

-- =============================================================================
-- Updated at triggers
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_domain_invoices_timestamp') THEN
    CREATE TRIGGER update_domain_invoices_timestamp
      BEFORE UPDATE ON inhouse_domain_invoices
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_domain_payment_methods_timestamp') THEN
    CREATE TRIGGER update_domain_payment_methods_timestamp
      BEFORE UPDATE ON inhouse_domain_payment_methods
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- =============================================================================
-- Add user_id column to registered domains for direct user lookup
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'inhouse_registered_domains' AND column_name = 'user_id') THEN
    ALTER TABLE inhouse_registered_domains ADD COLUMN user_id UUID REFERENCES auth.users(id);

    -- Backfill from project owner
    UPDATE inhouse_registered_domains rd
    SET user_id = p.owner_id
    FROM projects p
    WHERE rd.project_id = p.id AND rd.user_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_registered_domains_user
  ON inhouse_registered_domains(user_id)
  WHERE user_id IS NOT NULL;

-- Policy: Users can also view domains by user_id (in addition to project ownership)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'registered_domains_user_select' AND tablename = 'inhouse_registered_domains') THEN
    CREATE POLICY registered_domains_user_select ON inhouse_registered_domains
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;
END $$;

-- =============================================================================
-- Comments
-- =============================================================================
COMMENT ON TABLE inhouse_domain_invoices IS 'Billing invoices for domain registration and renewal';
COMMENT ON TABLE inhouse_domain_payment_methods IS 'Saved payment methods for domain auto-renewal';

COMMIT;
