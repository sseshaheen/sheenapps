-- =====================================================
-- Migration 073: Populate Stripe Price Mappings
-- =====================================================
-- Date: September 2, 2025
-- Purpose: Populate missing Stripe price mappings based on .env configuration
-- Issue: pricing_items.stripe_price_id was never populated, so migration 072 
--        lines 422-452 migrated 0 rows. We need to create Stripe mappings manually.
--
-- Environment Variables Reference:
-- STRIPE_PRICE_STARTER_USD=price_1RfNHODYx2Y7dl19KGyCXfTi
-- STRIPE_PRICE_GROWTH_USD=price_1RfNHPDYx2Y7dl1944XIvdgN  
-- STRIPE_PRICE_SCALE_USD=price_1RfNHQDYx2Y7dl19uss85Xod
-- =====================================================

BEGIN;

-- Get the active catalog for proper anchoring
WITH active_catalog AS (
  SELECT id FROM pricing_catalog_versions WHERE is_active = true LIMIT 1
)
-- Insert Stripe price mappings based on environment configuration
INSERT INTO pricing_item_prices (
  pricing_item_id, 
  payment_provider, 
  currency, 
  provider_price_external_id,
  supports_recurring,
  unit_amount_cents,
  tax_inclusive,
  billing_interval,
  is_active
) VALUES
  -- Subscription plans (recurring)
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'starter' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'price_1RfNHODYx2Y7dl19KGyCXfTi', true, 1900, false, 'month', true),
  -- Note: 'growth' maps to 'builder' item_key based on pricing structure
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'builder' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'price_1RfNHPDYx2Y7dl1944XIvdgN', true, 3900, false, 'month', true),
  -- Note: 'scale' maps to 'pro' item_key based on pricing structure  
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'pro' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'price_1RfNHQDYx2Y7dl19uss85Xod', true, 6900, false, 'month', true),
  -- Ultra plan (no Stripe price ID in env yet)
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'ultra' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'stripe_ultra_placeholder', true, 12900, false, 'month', false),
  
  -- Package plans (one-time) - Create placeholder Stripe price IDs
  -- Note: These would need actual Stripe price IDs created in Stripe dashboard
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'mini' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'stripe_mini_placeholder', false, 500, false, NULL, false),
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'booster' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'stripe_booster_placeholder', false, 2000, false, NULL, false),
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'mega' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'stripe_mega_placeholder', false, 5900, false, NULL, false),
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'max' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'stripe'::payment_provider_key, 'USD', 'stripe_max_placeholder', false, 12000, false, NULL, false)
ON CONFLICT (pricing_item_id, payment_provider, currency) DO UPDATE SET
  provider_price_external_id = EXCLUDED.provider_price_external_id,
  supports_recurring = EXCLUDED.supports_recurring,
  unit_amount_cents = EXCLUDED.unit_amount_cents,
  tax_inclusive = EXCLUDED.tax_inclusive,
  billing_interval = EXCLUDED.billing_interval,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Update the existing pricing_items table to have the stripe_price_id populated
-- This maintains backward compatibility with existing code that expects stripe_price_id
UPDATE pricing_items SET stripe_price_id = 'price_1RfNHODYx2Y7dl19KGyCXfTi' WHERE item_key = 'starter';
UPDATE pricing_items SET stripe_price_id = 'price_1RfNHPDYx2Y7dl1944XIvdgN' WHERE item_key = 'builder';
UPDATE pricing_items SET stripe_price_id = 'price_1RfNHQDYx2Y7dl19uss85Xod' WHERE item_key = 'pro';

-- Validation: Show what we created
DO $$
DECLARE
  rec RECORD;  -- 🚨 FIX: Missing DECLARE for loop variable
  stripe_count INTEGER;
  active_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO stripe_count
  FROM pricing_item_prices 
  WHERE payment_provider = 'stripe'::payment_provider_key;
  
  SELECT COUNT(*) INTO active_count
  FROM pricing_item_prices 
  WHERE payment_provider = 'stripe'::payment_provider_key AND is_active = true;
  
  SELECT COUNT(*) INTO total_count
  FROM pricing_item_prices;
  
  RAISE NOTICE '✅ Created % Stripe price mappings (% active)', stripe_count, active_count;
  RAISE NOTICE '📊 Total price mappings in system: %', total_count;
  
  -- Show the mapping details
  RAISE NOTICE 'Stripe price mappings:';
  FOR rec IN 
    SELECT 
      pi.item_key,
      pip.provider_price_external_id,
      pip.unit_amount_cents,
      pip.supports_recurring,
      pip.is_active
    FROM pricing_items pi
    JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
    WHERE pip.payment_provider = 'stripe'::payment_provider_key
    ORDER BY pi.item_key
  LOOP
    RAISE NOTICE '  % → % ($%.2f, recurring: %, active: %)', 
      rec.item_key, 
      rec.provider_price_external_id, 
      rec.unit_amount_cents::decimal / 100,
      rec.supports_recurring,
      rec.is_active;
  END LOOP;
END $$;

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================
-- 
-- ⚠️  IMPORTANT: Several price mappings are marked as is_active=false with placeholder IDs:
--    - ultra subscription (no Stripe price ID in environment)
--    - All packages (mini, booster, mega, max)
--
-- 🔧 TO COMPLETE STRIPE SETUP:
--    1. Create missing Stripe price objects in Stripe Dashboard
--    2. Update the placeholder price IDs with real Stripe price IDs
--    3. Set is_active=true for the completed mappings
--
-- 💡 EXAMPLE UPDATE COMMANDS:
--    UPDATE pricing_item_prices 
--    SET provider_price_external_id = 'price_real_stripe_id', is_active = true 
--    WHERE provider_price_external_id = 'stripe_ultra_placeholder';
--
-- ✅ ACTIVE MAPPINGS: starter, builder, pro subscriptions are ready to use
-- =====================================================