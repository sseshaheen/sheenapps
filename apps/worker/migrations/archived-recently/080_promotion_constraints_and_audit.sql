-- =====================================================
-- Migration 080: Promotion Constraints and Audit Trail
-- =====================================================
-- Purpose: Apply the SAFE parts of expert fixes without breaking wide-open approach
-- Author: Claude
-- Date: September 2, 2025
-- 
-- What this does:
-- ✅ Adds currency constraints (NULL for percentage, required for fixed)
-- ✅ Adds minimum order validation
-- ✅ Creates audit trail table
-- ✅ Adds performance indexes
-- 
-- What this DOESN'T do:
-- ❌ Drop supported_currencies array (we need it!)
-- ❌ Force lowercase regions (function handles both)
-- ❌ Change to Stripe-only defaults (keeping wide-open)
-- =====================================================

BEGIN;

-- =====================================================
-- Currency Constraints (NULL for percentage, required for fixed_amount)
-- =====================================================

ALTER TABLE promotions
DROP CONSTRAINT IF EXISTS promotions_currency_fixed_required;

ALTER TABLE promotions
ADD CONSTRAINT promotions_currency_fixed_required CHECK (
  (discount_type = 'percentage' AND currency IS NULL) OR
  (discount_type = 'fixed_amount' AND currency IS NOT NULL AND 
   currency IN ('USD', 'EUR', 'GBP', 'EGP', 'SAR'))
);

-- Add uppercase guard for currency consistency
ALTER TABLE promotions
DROP CONSTRAINT IF EXISTS promotions_currency_upper_guard,
ADD CONSTRAINT promotions_currency_upper_guard
CHECK (currency IS NULL OR currency = UPPER(currency));

-- =====================================================
-- Minimum Order Validation (both fields or neither)
-- =====================================================

-- These columns already exist from migration 071, just adding constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'promotions_min_order_consistency'
  ) THEN
    ALTER TABLE promotions
    ADD CONSTRAINT promotions_min_order_consistency CHECK (
      (minimum_order_minor_units IS NULL AND minimum_order_currency IS NULL) OR
      (minimum_order_minor_units IS NOT NULL AND minimum_order_minor_units >= 0 AND
       minimum_order_currency = UPPER(minimum_order_currency) AND
       minimum_order_currency IN ('USD', 'EUR', 'GBP', 'EGP', 'SAR'))
    );
  END IF;
END $$;

-- =====================================================
-- Audit Trail Table for Provider Changes
-- =====================================================

CREATE TABLE IF NOT EXISTS promotion_provider_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id UUID NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  changed_by UUID NOT NULL,  -- Reference to your user ID
  change_type TEXT NOT NULL CHECK (
    change_type IN ('create', 'update', 'add_provider', 'remove_provider', 
                    'update_currency', 'update_config', 'delete')
  ),
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_promo_provider_changes_promotion 
  ON promotion_provider_changes(promotion_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_promo_provider_changes_user
  ON promotion_provider_changes(changed_by, created_at DESC);

-- =====================================================
-- Performance Indexes from Expert Review
-- =====================================================

-- Fast lookup for active promotions in date range
CREATE INDEX IF NOT EXISTS idx_promotions_active_dates
  ON promotions(valid_from, valid_until)
  WHERE status = 'active';

-- Fast lookup for user's promotion usage
CREATE INDEX IF NOT EXISTS idx_redemptions_user_date
  ON promotion_redemptions(user_id, redeemed_at DESC)
  WHERE committed_at IS NOT NULL;

-- =====================================================
-- Fix Existing Data to Match Constraints
-- =====================================================

-- Ensure percentage promotions have NULL currency
UPDATE promotions
SET currency = NULL
WHERE discount_type = 'percentage' AND currency IS NOT NULL;

-- Ensure fixed_amount promotions have currency (default to USD)
UPDATE promotions
SET currency = 'USD'
WHERE discount_type = 'fixed_amount' AND currency IS NULL;

-- Ensure currencies are uppercase
UPDATE promotions
SET currency = UPPER(currency)
WHERE currency IS NOT NULL AND currency != UPPER(currency);

-- Clean up orphaned minimum order currencies
UPDATE promotions
SET minimum_order_minor_units = NULL,
    minimum_order_currency = NULL
WHERE (minimum_order_minor_units IS NULL) != (minimum_order_currency IS NULL);

COMMIT;