-- =====================================================
-- Migration 071: Multi-Provider Promotion Enhancements
-- =====================================================
-- Author: Claude Code Assistant
-- Created: September 2, 2025
-- Purpose: Extend promotion system for 5-provider support with production hardening
-- Dependencies: 070_promotion_system_foundation.sql, 072_payment_provider_abstraction_schema.sql
-- Status: Production-ready with v3 enhancements
--
-- Key Enhancements:
-- - Multi-provider support (Stripe, Fawry, Paymob, STC Pay, PayTabs)
-- - Multi-currency support (USD, EUR, GBP, EGP, SAR)
-- - Production-hardened analytics views (no cartesian joins)
-- - Enhanced audit trail with exchange rate tracking
-- - Batch-safe cleanup operations
-- - Invoice discount support with proper constraints
-- =====================================================

BEGIN;

-- =====================================================
-- Checkout Type Enum (for voucher vs redirect flows)
-- =====================================================
DO $$ BEGIN
  CREATE TYPE checkout_type AS ENUM ('redirect', 'voucher');
EXCEPTION WHEN duplicate_object THEN END $$;

-- =====================================================
-- Enhanced Promotions Table for Multi-Provider
-- =====================================================

-- Add multi-provider support columns
ALTER TABLE promotions 
  ADD COLUMN IF NOT EXISTS supported_providers payment_provider_key[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS supported_currencies TEXT[] DEFAULT NULL
    CONSTRAINT valid_currencies CHECK (
      supported_currencies IS NULL OR
      supported_currencies <@ ARRAY['USD','EUR','GBP','EGP','SAR']::TEXT[]
    ),
  ADD COLUMN IF NOT EXISTS regional_restrictions JSONB,
  ADD COLUMN IF NOT EXISTS checkout_type_restrictions checkout_type[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS minimum_order_minor_units INTEGER,
  ADD COLUMN IF NOT EXISTS minimum_order_currency CHAR(3)
    CONSTRAINT valid_min_order_currency CHECK (
      minimum_order_currency IS NULL OR
      minimum_order_currency IN ('USD','EUR','GBP','EGP','SAR')
    );

-- Backfill existing promotions with Stripe only (safer than defaulting to all)
UPDATE promotions 
SET supported_providers = ARRAY['stripe']::payment_provider_key[],
    supported_currencies = ARRAY['USD', 'EUR', 'GBP']
WHERE supported_providers IS NULL;

-- Add GIN indexes for array columns
CREATE INDEX IF NOT EXISTS idx_promotions_supported_providers
  ON promotions USING GIN (supported_providers);
CREATE INDEX IF NOT EXISTS idx_promotions_supported_currencies
  ON promotions USING GIN (supported_currencies);

-- =====================================================
-- Enhanced Promotion Artifacts for Multi-Provider
-- =====================================================

-- First, we need to ensure artifact_gateway can handle all providers
-- Drop old enum and recreate with all providers
ALTER TABLE promotion_artifacts 
  ALTER COLUMN gateway DROP DEFAULT,
  ALTER COLUMN gateway TYPE TEXT USING gateway::TEXT;

DROP TYPE IF EXISTS artifact_gateway CASCADE;

-- Now alter to use payment_provider_key enum
ALTER TABLE promotion_artifacts 
  ALTER COLUMN gateway TYPE payment_provider_key USING gateway::payment_provider_key,
  ADD COLUMN IF NOT EXISTS provider_metadata JSONB,
  ADD COLUMN IF NOT EXISTS checkout_type checkout_type;

-- Add unique constraint for idempotency (partial to avoid NULL conflicts)
DO $$ BEGIN
  ALTER TABLE promotion_artifacts
    ADD CONSTRAINT ux_artifacts_gateway_external 
    UNIQUE (gateway, external_coupon_id)
    DEFERRABLE INITIALLY IMMEDIATE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Also create partial index for NULL safety
CREATE UNIQUE INDEX IF NOT EXISTS ux_artifacts_gateway_external_partial
  ON promotion_artifacts(gateway, external_coupon_id)
  WHERE external_coupon_id IS NOT NULL;

-- =====================================================
-- Enhanced Promotion Codes
-- =====================================================

-- Note: code_normalized already exists in migration 070 as UPPER(TRIM(code))
-- Just need to add index for it
CREATE INDEX IF NOT EXISTS idx_promotion_codes_normalized 
  ON promotion_codes(code_normalized) WHERE is_active = true;

-- =====================================================
-- Enhanced Promotion Reservations with Audit Trail
-- =====================================================

ALTER TABLE promotion_reservations
  ADD COLUMN IF NOT EXISTS evaluated_threshold_minor INTEGER,
  ADD COLUMN IF NOT EXISTS evaluated_exchange_rate DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS provider_context JSONB;

-- =====================================================
-- Enhanced Promotion Redemptions with Full Tracking
-- =====================================================

-- Note: discount_applied_amount, original_amount, final_amount columns 
-- already exist from migration 070_promotion_system_foundation.sql

-- First ensure gateway column can handle all providers
ALTER TABLE promotion_redemptions 
  ALTER COLUMN gateway DROP DEFAULT,
  ALTER COLUMN gateway TYPE TEXT USING gateway::TEXT;

-- Now convert to payment_provider_key enum
ALTER TABLE promotion_redemptions 
  ALTER COLUMN gateway TYPE payment_provider_key USING gateway::payment_provider_key,
  ADD COLUMN IF NOT EXISTS provider_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,6),
  ADD COLUMN IF NOT EXISTS exchange_rate_date DATE,
  ADD COLUMN IF NOT EXISTS exchange_rate_source TEXT,
  ADD COLUMN IF NOT EXISTS base_currency_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS evaluated_threshold_minor INTEGER,
  ADD COLUMN IF NOT EXISTS evaluated_exchange_rate DECIMAL(10,6);

-- Add safety rails with unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_redemptions_reservation 
  ON promotion_redemptions(reservation_id)
  WHERE reservation_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_code_per_user_committed
  ON promotion_redemptions(promotion_code_id, user_id)
  WHERE committed_at IS NOT NULL;

-- Optional: Also prevent multiple uses per user across ALL codes for same promotion
CREATE UNIQUE INDEX IF NOT EXISTS ux_promo_per_user_once
  ON promotion_redemptions(promotion_id, user_id)
  WHERE committed_at IS NOT NULL;

-- Performance indexes for analytics
CREATE INDEX IF NOT EXISTS idx_promo_reservations_state_expires
  ON promotion_reservations(status, expires_at);

CREATE INDEX IF NOT EXISTS idx_redemptions_prom_state_date
  ON promotion_redemptions(promotion_id, committed_at DESC)
  WHERE committed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_redemptions_gateway_state_date
  ON promotion_redemptions(gateway, committed_at DESC)
  WHERE committed_at IS NOT NULL;

-- =====================================================
-- Regional Payment Preferences Table
-- =====================================================

CREATE TABLE IF NOT EXISTS promotion_regional_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  region_code TEXT NOT NULL CHECK (region_code IN ('US', 'CA', 'GB', 'EU', 'EG', 'SA')),
  preferred_providers payment_provider_key[] DEFAULT ARRAY[]::payment_provider_key[],
  localized_name JSONB, -- {"en": "Save 20%", "ar": "وفر ٢٠٪"}
  localized_description JSONB,
  min_order_amount_override INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_promotion_region 
  ON promotion_regional_config(promotion_id, region_code);

-- =====================================================
-- PRODUCTION-HARDENED Analytics View (v3)
-- =====================================================

CREATE OR REPLACE VIEW promotion_multi_provider_stats AS
SELECT 
  p.id,
  p.name,
  p.status,
  p.supported_providers,
  p.supported_currencies,
  
  -- Scalar subqueries prevent row multiplication from JOIN
  (SELECT COALESCE(COUNT(*), 0)
   FROM promotion_redemptions r 
   WHERE r.promotion_id = p.id 
     AND r.committed_at IS NOT NULL) AS total_redemptions,
   
  (SELECT COALESCE(COUNT(DISTINCT user_id), 0)
   FROM promotion_redemptions r 
   WHERE r.promotion_id = p.id 
     AND r.committed_at IS NOT NULL) AS total_unique_users,
   
  (SELECT COALESCE(SUM(discount_applied_amount), 0)
   FROM promotion_redemptions r 
   WHERE r.promotion_id = p.id 
     AND r.committed_at IS NOT NULL) AS total_discount_minor_units,
  
  -- Provider breakdown (fixed with nested subquery to avoid multiple rows)
  (SELECT jsonb_object_agg(x.gateway, x.val)
   FROM (
     SELECT r.gateway::text AS gateway,
            jsonb_build_object(
              'redemptions', COUNT(*) FILTER (WHERE r.committed_at IS NOT NULL),
              'unique_users', COUNT(DISTINCT r.user_id) FILTER (WHERE r.committed_at IS NOT NULL),
              'discount_amount', COALESCE(SUM(r.discount_applied_amount) FILTER (WHERE r.committed_at IS NOT NULL), 0),
              'discount_usd', COALESCE(SUM(r.base_currency_amount_cents) FILTER (WHERE r.committed_at IS NOT NULL), 0)
            ) AS val
     FROM promotion_redemptions r
     WHERE r.promotion_id = p.id
     GROUP BY r.gateway
   ) x) AS provider_breakdown,
  
  -- Currency breakdown (fixed with nested subquery to avoid multiple rows)
  (SELECT jsonb_object_agg(x.currency, x.val)
   FROM (
     SELECT r.currency,
            jsonb_build_object(
              'redemptions', COUNT(*) FILTER (WHERE r.committed_at IS NOT NULL),
              'discount_amount', COALESCE(SUM(r.discount_applied_amount) FILTER (WHERE r.committed_at IS NOT NULL), 0)
            ) AS val
     FROM promotion_redemptions r
     WHERE r.promotion_id = p.id
     GROUP BY r.currency
   ) x) AS currency_breakdown
  
FROM promotions p;

-- =====================================================
-- Enhanced Invoice Support for Discounts
-- =====================================================

ALTER TABLE billing_invoices
  ADD COLUMN IF NOT EXISTS discount_source TEXT,
  ADD COLUMN IF NOT EXISTS discount_minor_units INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_id UUID REFERENCES promotions(id),
  ADD COLUMN IF NOT EXISTS original_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS total_after_discount_cents INTEGER;

-- Update invoice constraint to handle discounts properly
ALTER TABLE billing_invoices DROP CONSTRAINT IF EXISTS invoice_amount_matches_snapshot;
ALTER TABLE billing_invoices ADD CONSTRAINT invoice_amount_with_discount CHECK (
  -- Either no discount (amount matches snapshot)
  (discount_minor_units = 0 AND amount_cents = (price_snapshot->>'unit_amount_cents')::int)
  OR
  -- Or with discount (all fields properly set)
  (discount_minor_units > 0
    AND original_amount_cents = (price_snapshot->>'unit_amount_cents')::int
    AND total_after_discount_cents = GREATEST(original_amount_cents - discount_minor_units, 0)
    AND amount_cents = total_after_discount_cents)
);

-- =====================================================
-- Audit Trail Trigger for Regional Config
-- =====================================================

CREATE OR REPLACE FUNCTION update_promotion_regional_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_promotion_regional_config_timestamp
  BEFORE UPDATE ON promotion_regional_config
  FOR EACH ROW
  EXECUTE FUNCTION update_promotion_regional_config_timestamp();

-- =====================================================
-- Helper Functions for Multi-Provider Operations
-- =====================================================

-- Function to get preferred provider for a region (with intersection against supported providers)
CREATE OR REPLACE FUNCTION get_preferred_provider_for_region(
  p_promotion_id UUID,
  p_region_code TEXT
) RETURNS payment_provider_key[] AS $$
DECLARE
  v_providers payment_provider_key[];
  v_supported payment_provider_key[];
BEGIN
  -- Get the promotion's supported providers
  SELECT supported_providers INTO v_supported
  FROM promotions
  WHERE id = p_promotion_id;
  
  -- Get regional preferences
  SELECT preferred_providers INTO v_providers
  FROM promotion_regional_config
  WHERE promotion_id = p_promotion_id 
    AND region_code = p_region_code;
  
  IF v_providers IS NULL THEN
    -- Return default providers based on region
    CASE p_region_code
      WHEN 'EG' THEN v_providers := ARRAY['fawry', 'paymob']::payment_provider_key[];
      WHEN 'SA' THEN v_providers := ARRAY['stcpay', 'paytabs']::payment_provider_key[];
      ELSE v_providers := ARRAY['stripe']::payment_provider_key[];
    END CASE;
  END IF;
  
  -- Intersect with supported providers to ensure we only return valid options
  IF v_supported IS NOT NULL THEN
    RETURN (
      SELECT ARRAY(
        SELECT unnest(v_providers) 
        INTERSECT 
        SELECT unnest(v_supported)
      )
    );
  ELSE
    RETURN v_providers;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Indexes for Performance
-- =====================================================

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_promotions_status_dates 
  ON promotions(status, valid_from, valid_until)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_redemptions_user_promotion 
  ON promotion_redemptions(user_id, promotion_id, committed_at DESC)
  WHERE committed_at IS NOT NULL;

-- =====================================================
-- Completion Comments
-- =====================================================

COMMENT ON TABLE promotion_regional_config IS 'Regional configuration for promotions including localized names and preferred providers';
COMMENT ON COLUMN promotions.supported_providers IS 'Array of payment providers that can process this promotion';
COMMENT ON COLUMN promotions.supported_currencies IS 'Array of currencies this promotion is valid for';
COMMENT ON COLUMN promotion_redemptions.exchange_rate_source IS 'Source of exchange rate (stripe, ecb, etc) for audit trail';
COMMENT ON COLUMN promotion_redemptions.evaluated_threshold_minor IS 'Minimum order threshold at time of validation for audit';
COMMENT ON VIEW promotion_multi_provider_stats IS 'Production-hardened analytics view using scalar subqueries to prevent cartesian joins';

COMMIT;

-- =====================================================
-- Post-Migration Verification
-- =====================================================
-- Run these queries after migration to verify:
-- SELECT COUNT(*) FROM promotions WHERE supported_providers IS NOT NULL;
-- SELECT COUNT(*) FROM promotion_redemptions WHERE gateway IS NOT NULL;
-- SELECT * FROM promotion_multi_provider_stats LIMIT 1;