-- 147_workflow_attributions.sql
-- Purpose: Run Hub Phase 4 - Workflow outcome attribution tracking
-- Part of: Run Hub Actions → Outcomes loop (append-only attribution records)

-- =============================================================================
-- workflow_attributions table
-- =============================================================================
-- Links payment/conversion events to workflow runs for outcome measurement.
-- CRITICAL: This is append-only. Don't mutate business_events.payload for attribution.
-- One payment can only be attributed to one workflow run (UNIQUE on payment_event_id).

CREATE TABLE IF NOT EXISTS workflow_attributions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  workflow_run_id       UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  payment_event_id      BIGINT NOT NULL REFERENCES business_events(id) ON DELETE CASCADE,

  -- Attribution details
  attributed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  model                 TEXT NOT NULL DEFAULT 'last_touch_48h',  -- Attribution model used
  match_method          TEXT NOT NULL,                           -- 'wid_link', 'email_exact', 'cart_match', 'amount_match'
  amount_cents          BIGINT NOT NULL,
  currency              CHAR(3) NOT NULL,

  -- Confidence level (derived from match_method)
  confidence            TEXT NOT NULL DEFAULT 'medium',          -- 'high' (link), 'medium' (email), 'low' (amount)

  -- One attribution per payment event
  CONSTRAINT workflow_attributions_payment_unique UNIQUE (payment_event_id)
);

-- =============================================================================
-- Indexes
-- =============================================================================

-- Query pattern: Get impact for a workflow run (joins for outcome display)
CREATE INDEX IF NOT EXISTS idx_workflow_attributions_run
  ON workflow_attributions (workflow_run_id, attributed_at DESC);

-- Query pattern: Get all attributions for a project (for digest/reporting)
CREATE INDEX IF NOT EXISTS idx_workflow_attributions_project
  ON workflow_attributions (project_id, attributed_at DESC);

-- Query pattern: Check if payment already attributed (fast lookup before insert)
CREATE INDEX IF NOT EXISTS idx_workflow_attributions_payment
  ON workflow_attributions (payment_event_id);

-- =============================================================================
-- RLS Policies (idempotent)
-- =============================================================================

ALTER TABLE workflow_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_attributions FORCE ROW LEVEL SECURITY;

-- Project owner can read their attributions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'workflow_attributions_owner_select') THEN
    CREATE POLICY workflow_attributions_owner_select ON workflow_attributions
      FOR SELECT
      USING (
        project_id IN (
          SELECT id FROM projects WHERE owner_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Service role can insert attributions (worker operations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'workflow_attributions_service_insert') THEN
    CREATE POLICY workflow_attributions_service_insert ON workflow_attributions
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- =============================================================================
-- Check constraints
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_attributions_model_check') THEN
    ALTER TABLE workflow_attributions
      ADD CONSTRAINT workflow_attributions_model_check
      CHECK (model IN ('last_touch_48h'));  -- Extensible for future models
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_attributions_match_method_check') THEN
    ALTER TABLE workflow_attributions
      ADD CONSTRAINT workflow_attributions_match_method_check
      CHECK (match_method IN ('wid_link', 'email_exact', 'cart_match', 'amount_match'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_attributions_confidence_check') THEN
    ALTER TABLE workflow_attributions
      ADD CONSTRAINT workflow_attributions_confidence_check
      CHECK (confidence IN ('high', 'medium', 'low'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workflow_attributions_currency_check') THEN
    ALTER TABLE workflow_attributions
      ADD CONSTRAINT workflow_attributions_currency_check
      CHECK (currency ~ '^[A-Z]{3}$');  -- ISO 4217 currency code
  END IF;
END $$;

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE workflow_attributions IS 'Tracks attribution of payments/conversions to workflow runs for outcome measurement';
COMMENT ON COLUMN workflow_attributions.model IS 'Attribution model: last_touch_48h (last workflow within 48h gets credit)';
COMMENT ON COLUMN workflow_attributions.match_method IS 'How attribution was determined: wid_link (explicit), email_exact, cart_match, amount_match';
COMMENT ON COLUMN workflow_attributions.confidence IS 'Confidence level: high (link-based), medium (email match), low (amount only)';
COMMENT ON COLUMN workflow_attributions.payment_event_id IS 'Reference to business_events.id for the attributed payment';
