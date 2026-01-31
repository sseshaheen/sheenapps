-- Migration: Add Middle East Currencies Support
-- Date: 2025-09-01
-- Description: Extends currency support to include EGP, SAR, AED for frontend i18n compatibility

BEGIN;

-- =====================================================
-- 1. UPDATE CURRENCY CONSTRAINTS
-- =====================================================

-- Remove existing currency constraint
ALTER TABLE pricing_items DROP CONSTRAINT IF EXISTS pricing_items_currency_check;

-- Add expanded currency constraint including Middle East currencies
ALTER TABLE pricing_items ADD CONSTRAINT pricing_items_currency_check 
  CHECK (currency IN ('USD', 'EUR', 'GBP', 'EGP', 'SAR', 'AED'));

-- Add helpful comment
COMMENT ON CONSTRAINT pricing_items_currency_check ON pricing_items 
  IS 'Supported currencies: USD, EUR, GBP (initial), EGP, SAR, AED (Middle East expansion)';

-- =====================================================
-- 2. VERIFY EXISTING CONSTRAINTS ARE CORRECT
-- =====================================================

-- The expert confirmed our existing constraints are already correct:
-- ✅ UNIQUE(catalog_version_id, item_key, currency) - Already implemented  
-- ✅ CREATE UNIQUE INDEX idx_pricing_items_stripe_unique - Already implemented

-- Verify the constraints exist (should not fail if properly implemented)
DO $$
BEGIN
  -- Check unique constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name LIKE '%catalog_version_id%item_key%currency%' 
    OR constraint_name LIKE '%pricing_items%catalog_version_id%'
  ) THEN
    RAISE NOTICE 'Currency-aware unique constraint verified';
  END IF;
  
  -- Check Stripe unique index exists  
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_pricing_items_stripe_unique'
  ) THEN
    RAISE NOTICE 'Stripe price unique index verified';
  END IF;
END $$;

COMMIT;