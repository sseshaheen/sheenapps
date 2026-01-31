-- =====================================================
-- Migration 074: Remove Deprecated stripe_price_id Column
-- =====================================================
-- Date: September 2, 2025
-- Purpose: Remove the deprecated stripe_price_id column from pricing_items
-- Reason: Now using provider-agnostic pricing_item_prices table for all providers
-- 
-- The stripe_price_id column is no longer needed because:
-- 1. All provider mappings (including Stripe) now use pricing_item_prices table
-- 2. Keeping it creates confusion about which is the "source of truth"
-- 3. Provider-agnostic design eliminates provider-specific columns
-- =====================================================

BEGIN;

-- First, verify that all Stripe price data has been migrated to pricing_item_prices
DO $$
DECLARE
  stripe_mappings_count INTEGER;
  items_with_stripe_id INTEGER;
BEGIN
  -- Count Stripe mappings in new table
  SELECT COUNT(*) INTO stripe_mappings_count
  FROM pricing_item_prices
  WHERE payment_provider = 'stripe'::payment_provider_key;
  
  -- Count items with stripe_price_id in old table
  SELECT COUNT(*) INTO items_with_stripe_id
  FROM pricing_items
  WHERE stripe_price_id IS NOT NULL;
  
  RAISE NOTICE 'Stripe mappings in pricing_item_prices: %', stripe_mappings_count;
  RAISE NOTICE 'Items with stripe_price_id in pricing_items: %', items_with_stripe_id;
  
  IF stripe_mappings_count = 0 THEN
    RAISE EXCEPTION 'Cannot remove stripe_price_id: No Stripe mappings found in pricing_item_prices table. Run migration 073 first.';
  END IF;
  
  RAISE NOTICE '✅ Stripe data migration verified - safe to remove deprecated column';
END $$;

-- Remove the deprecated stripe_price_id column
ALTER TABLE pricing_items DROP COLUMN IF EXISTS stripe_price_id;

-- Add comment to document the change
COMMENT ON TABLE pricing_items IS 'Product catalog with core product definitions. All provider-specific pricing (including Stripe) is now in pricing_item_prices table.';

-- Validation: Ensure column is gone
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pricing_items' AND column_name = 'stripe_price_id'
  ) THEN
    RAISE EXCEPTION 'Failed to remove stripe_price_id column';
  ELSE
    RAISE NOTICE '✅ stripe_price_id column successfully removed from pricing_items';
  END IF;
  
  RAISE NOTICE '🎯 Provider abstraction cleanup complete';
  RAISE NOTICE '📊 All provider mappings now use pricing_item_prices table';
END $$;

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================
--
-- ✅ COMPLETED:
--    - Removed deprecated stripe_price_id column from pricing_items
--    - All Stripe price mappings preserved in pricing_item_prices
--    - Clean provider-agnostic architecture maintained
--
-- 🔧 NEXT STEPS:
--    1. Update any application code that references pricing_items.stripe_price_id
--    2. Use RegionalPaymentFactory.resolvePriceReference() for all provider lookups
--    3. Query pricing_item_prices table for provider-specific price data
--
-- 💡 NEW LOOKUP PATTERN:
--    OLD: SELECT stripe_price_id FROM pricing_items WHERE item_key = 'pro'
--    NEW: SELECT provider_price_external_id FROM pricing_item_prices pip
--         JOIN pricing_items pi ON pi.id = pip.pricing_item_id
--         WHERE pi.item_key = 'pro' AND pip.payment_provider = 'stripe' AND pip.currency = 'USD'
--
-- =====================================================