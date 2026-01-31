-- =====================================================
-- Migration 075: Update Deprecated Pricing Queries
-- =====================================================
-- Date: September 2, 2025
-- Purpose: Update database functions/views that reference deprecated stripe_price_id
-- 
-- This migration addresses queries that break after removing stripe_price_id column:
-- 1. Create helper functions for provider-agnostic price lookups
-- 2. Update any database-level dependencies
-- =====================================================

BEGIN;

-- Create helper function to get pricing item by provider price ID
-- This replaces the old stripe_price_id lookups with provider-agnostic approach
CREATE OR REPLACE FUNCTION get_pricing_item_by_provider_price_id(
  p_provider payment_provider_key,
  p_provider_price_id TEXT,
  p_currency CHAR(3) DEFAULT 'USD'
) RETURNS pricing_items AS $$
DECLARE
  result pricing_items%ROWTYPE;
BEGIN
  SELECT pi.* INTO result
  FROM pricing_catalog_versions cv
  JOIN pricing_items pi ON cv.id = pi.catalog_version_id
  JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
  WHERE cv.is_active = true 
    AND pip.payment_provider = p_provider
    AND pip.provider_price_external_id = p_provider_price_id
    AND pip.currency = p_currency
    AND pip.is_active = true
    AND pi.is_active = true
  LIMIT 1;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Create helper function to get provider price mapping
CREATE OR REPLACE FUNCTION get_provider_price_mapping(
  p_item_key TEXT,
  p_provider payment_provider_key,
  p_currency CHAR(3) DEFAULT 'USD'
) RETURNS pricing_item_prices AS $$
DECLARE
  result pricing_item_prices%ROWTYPE;
BEGIN
  SELECT pip.* INTO result
  FROM pricing_catalog_versions cv
  JOIN pricing_items pi ON cv.id = pi.catalog_version_id
  JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
  WHERE cv.is_active = true 
    AND pi.item_key = p_item_key
    AND pip.payment_provider = p_provider
    AND pip.currency = p_currency
    AND pip.is_active = true
    AND pi.is_active = true
  LIMIT 1;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add helpful comments
COMMENT ON FUNCTION get_pricing_item_by_provider_price_id IS 'Provider-agnostic replacement for stripe_price_id lookups';
COMMENT ON FUNCTION get_provider_price_mapping IS 'Get provider-specific price mapping for a given item_key and provider';

-- Example usage validation
DO $$
DECLARE
  test_item pricing_items%ROWTYPE;
  test_mapping pricing_item_prices%ROWTYPE;
BEGIN
  -- Test the functions work (if we have data)
  SELECT * INTO test_item FROM get_pricing_item_by_provider_price_id('stripe', 'price_1RfNHODYx2Y7dl19KGyCXfTi', 'USD');
  
  IF test_item.id IS NOT NULL THEN
    RAISE NOTICE '✅ get_pricing_item_by_provider_price_id working: Found item_key=%', test_item.item_key;
  ELSE
    RAISE NOTICE 'ℹ️ get_pricing_item_by_provider_price_id: No test data found (run migrations 072-073 first)';
  END IF;
  
  SELECT * INTO test_mapping FROM get_provider_price_mapping('starter', 'stripe', 'USD');
  
  IF test_mapping.id IS NOT NULL THEN
    RAISE NOTICE '✅ get_provider_price_mapping working: Found price_id=%', test_mapping.provider_price_external_id;
  ELSE
    RAISE NOTICE 'ℹ️ get_provider_price_mapping: No test data found (run migrations 072-073 first)';
  END IF;
END $$;

COMMIT;

-- =====================================================
-- MIGRATION NOTES FOR APPLICATION CODE UPDATES
-- =====================================================
--
-- 🔧 CODE MIGRATION PATTERNS:
--
-- OLD QUERY:
--   SELECT * FROM pricing_items WHERE stripe_price_id = 'price_123';
--
-- NEW QUERY:
--   SELECT * FROM get_pricing_item_by_provider_price_id('stripe', 'price_123', 'USD');
--
-- OLD JOIN:
--   JOIN pricing_items pi ON pi.stripe_price_id = bs.stripe_price_id
--
-- NEW JOIN:
--   JOIN pricing_item_prices pip ON pip.provider_price_external_id = bs.stripe_price_id 
--                                  AND pip.payment_provider = 'stripe'
--   JOIN pricing_items pi ON pi.id = pip.pricing_item_id
--
-- =====================================================