-- =====================================================
-- Example Price Mappings for Multi-Provider System
-- =====================================================
-- Date: September 2, 2025
-- Purpose: Demonstrate how pricing items map to multiple providers
-- Status: Example/Demo data for testing multi-provider system
--
-- This shows how the same pricing items (Starter, Pro, etc.) can be
-- mapped to different providers with different external IDs and currencies
-- =====================================================

-- Note: This assumes the pricing_items table is already populated from migration 071
-- and the provider-agnostic schema from migration 072 is in place

BEGIN;

-- =====================================================
-- 1. FAWRY PRICE MAPPINGS (Egypt - EGP, Package Only)
-- =====================================================

-- 🔧 EXPERT FIX: Use active catalog anchoring to prevent ambiguity
WITH active_catalog AS (
  SELECT id FROM pricing_catalog_versions WHERE is_active = true LIMIT 1
)
-- Map packages to Fawry (cash payments, EGP only)
-- Fawry doesn't support subscriptions, only one-time packages
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
  -- Packages (one-time purchases) - Note: FX rates are illustrative examples
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'mini' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'fawry'::payment_provider_key, 'EGP', 'fawry_mini_egp', false, 2500, true, NULL, true),      -- Example: ~25 EGP
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'booster' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'fawry'::payment_provider_key, 'EGP', 'fawry_booster_egp', false, 10000, true, NULL, true), -- Example: ~100 EGP  
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'mega' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'fawry'::payment_provider_key, 'EGP', 'fawry_mega_egp', false, 29500, true, NULL, true),      -- Example: ~295 EGP
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'max' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'fawry'::payment_provider_key, 'EGP', 'fawry_max_egp', false, 60000, true, NULL, true)        -- Example: ~600 EGP
ON CONFLICT (pricing_item_id, payment_provider, currency) DO UPDATE SET
  provider_price_external_id = EXCLUDED.provider_price_external_id,
  supports_recurring = EXCLUDED.supports_recurring,
  unit_amount_cents = EXCLUDED.unit_amount_cents,
  tax_inclusive = EXCLUDED.tax_inclusive,
  billing_interval = EXCLUDED.billing_interval,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- =====================================================
-- 2. PAYMOB PRICE MAPPINGS (Egypt - EGP, Cards + Subscriptions)
-- =====================================================

-- 🔧 EXPERT FIX: Use active catalog anchoring to prevent ambiguity  
WITH active_catalog AS (
  SELECT id FROM pricing_catalog_versions WHERE is_active = true LIMIT 1
)
-- Paymob supports both subscriptions and packages with cards in Egypt
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
  -- Subscriptions (recurring) - Note: FX rates are illustrative examples
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'starter' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_starter_egp_month', true, 9500, true, 'month', true),   -- Example: ~95 EGP/month
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'builder' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_builder_egp_month', true, 19500, true, 'month', true),  -- Example: ~195 EGP/month
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'pro' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_pro_egp_month', true, 34500, true, 'month', true),         -- Example: ~345 EGP/month
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'ultra' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_ultra_egp_month', true, 64500, true, 'month', true),     -- Example: ~645 EGP/month
  
  -- Packages (one-time)
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'mini' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_mini_egp', false, 2500, true, NULL, true),
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'booster' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_booster_egp', false, 10000, true, NULL, true),
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'mega' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_mega_egp', false, 29500, true, NULL, true),
  ((SELECT pi.id FROM pricing_items pi WHERE pi.item_key = 'max' AND pi.catalog_version_id = (SELECT id FROM active_catalog) LIMIT 1), 'paymob'::payment_provider_key, 'EGP', 'paymob_max_egp', false, 60000, true, NULL, true)
ON CONFLICT (pricing_item_id, payment_provider, currency) DO UPDATE SET
  provider_price_external_id = EXCLUDED.provider_price_external_id,
  supports_recurring = EXCLUDED.supports_recurring,
  unit_amount_cents = EXCLUDED.unit_amount_cents,
  tax_inclusive = EXCLUDED.tax_inclusive,
  billing_interval = EXCLUDED.billing_interval,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- =====================================================
-- 3. STC PAY PRICE MAPPINGS (Saudi Arabia - SAR, Wallet Only)
-- =====================================================

-- STC Pay: Mobile wallet, one-time payments only, SAR currency
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
  -- Packages only (STC Pay doesn't support recurring subscriptions)
  ((SELECT id FROM pricing_items WHERE item_key = 'mini'), 'stcpay', 'SAR', 'stcpay_mini_sar', false, 1875, false, NULL, true),      -- ~$5 → 18.75 SAR
  ((SELECT id FROM pricing_items WHERE item_key = 'booster'), 'stcpay', 'SAR', 'stcpay_booster_sar', false, 7500, false, NULL, true), -- ~$20 → 75 SAR
  ((SELECT id FROM pricing_items WHERE item_key = 'mega'), 'stcpay', 'SAR', 'stcpay_mega_sar', false, 22125, false, NULL, true),      -- ~$59 → 221.25 SAR
  ((SELECT id FROM pricing_items WHERE item_key = 'max'), 'stcpay', 'SAR', 'stcpay_max_sar', false, 45000, false, NULL, true)        -- ~$120 → 450 SAR
ON CONFLICT (pricing_item_id, payment_provider, currency) DO UPDATE SET
  provider_price_external_id = EXCLUDED.provider_price_external_id,
  supports_recurring = EXCLUDED.supports_recurring,
  unit_amount_cents = EXCLUDED.unit_amount_cents,
  tax_inclusive = EXCLUDED.tax_inclusive,
  billing_interval = EXCLUDED.billing_interval,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- =====================================================
-- 4. PAYTABS PRICE MAPPINGS (Saudi Arabia - SAR, Cards + Subscriptions)
-- =====================================================

-- PayTabs: Cards with subscription support for Saudi market
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
  -- Subscriptions (recurring)
  ((SELECT id FROM pricing_items WHERE item_key = 'starter'), 'paytabs', 'SAR', 'pt_starter_sar_monthly', true, 7125, false, 'month', true),   -- ~$19 → 71.25 SAR/month
  ((SELECT id FROM pricing_items WHERE item_key = 'builder'), 'paytabs', 'SAR', 'pt_builder_sar_monthly', true, 14625, false, 'month', true),  -- ~$39 → 146.25 SAR/month
  ((SELECT id FROM pricing_items WHERE item_key = 'pro'), 'paytabs', 'SAR', 'pt_pro_sar_monthly', true, 25875, false, 'month', true),         -- ~$69 → 258.75 SAR/month
  ((SELECT id FROM pricing_items WHERE item_key = 'ultra'), 'paytabs', 'SAR', 'pt_ultra_sar_monthly', true, 48375, false, 'month', true),     -- ~$129 → 483.75 SAR/month
  
  -- Packages (one-time)
  ((SELECT id FROM pricing_items WHERE item_key = 'mini'), 'paytabs', 'SAR', 'pt_mini_sar', false, 1875, false, NULL, true),
  ((SELECT id FROM pricing_items WHERE item_key = 'booster'), 'paytabs', 'SAR', 'pt_booster_sar', false, 7500, false, NULL, true),
  ((SELECT id FROM pricing_items WHERE item_key = 'mega'), 'paytabs', 'SAR', 'pt_mega_sar', false, 22125, false, NULL, true),
  ((SELECT id FROM pricing_items WHERE item_key = 'max'), 'paytabs', 'SAR', 'pt_max_sar', false, 45000, false, NULL, true)
ON CONFLICT (pricing_item_id, payment_provider, currency) DO UPDATE SET
  provider_price_external_id = EXCLUDED.provider_price_external_id,
  supports_recurring = EXCLUDED.supports_recurring,
  unit_amount_cents = EXCLUDED.unit_amount_cents,
  tax_inclusive = EXCLUDED.tax_inclusive,
  billing_interval = EXCLUDED.billing_interval,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- =====================================================
-- 5. SUMMARY QUERY: VIEW ALL MAPPINGS
-- =====================================================

-- This query shows how pricing items are mapped across all providers
-- Useful for admin dashboard and validation
DO $$
DECLARE
  rec RECORD;  -- 🚨 EXPERT FIX: Missing DECLARE for loop variable
BEGIN
  RAISE NOTICE '=== MULTI-PROVIDER PRICE MAPPING SUMMARY ===';
  
  -- Show mapping counts by provider
  RAISE NOTICE 'Price mappings by provider:';
  FOR rec IN 
    SELECT 
      payment_provider,
      currency,
      COUNT(*) as mapping_count,
      SUM(CASE WHEN supports_recurring THEN 1 ELSE 0 END) as subscription_count,
      SUM(CASE WHEN NOT supports_recurring THEN 1 ELSE 0 END) as package_count
    FROM pricing_item_prices 
    WHERE is_active = true 
    GROUP BY payment_provider, currency
    ORDER BY payment_provider, currency
  LOOP
    RAISE NOTICE '  % (%) - % total (% subscriptions, % packages)', 
      rec.payment_provider, rec.currency, rec.mapping_count, rec.subscription_count, rec.package_count;
  END LOOP;
  
  RAISE NOTICE 'Multi-provider system ready! 🌍';
END $$;

COMMIT;

-- =====================================================
-- VALIDATION QUERIES (For Testing)
-- =====================================================

-- Test provider selection logic
-- This demonstrates how the RegionalPaymentFactory would resolve providers

-- Egypt user buying a subscription (should route to Paymob)
SELECT 
  pi.item_key,
  pi.item_type,
  pip.payment_provider,
  pip.currency,
  pip.provider_price_external_id,
  pip.unit_amount_cents
FROM pricing_items pi
JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
WHERE pi.item_key = 'starter' 
  AND pip.currency = 'EGP' 
  AND pip.supports_recurring = true
  AND pip.is_active = true;

-- Egypt user buying a package (should route to Fawry for cash, Paymob for card)
SELECT 
  pi.item_key,
  pi.item_type,
  pip.payment_provider,
  pip.currency,
  pip.provider_price_external_id,
  pip.unit_amount_cents
FROM pricing_items pi
JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
WHERE pi.item_key = 'mini' 
  AND pip.currency = 'EGP' 
  AND pip.supports_recurring = false
  AND pip.is_active = true
ORDER BY pip.payment_provider;

-- Saudi user buying a subscription (should route to PayTabs)
SELECT 
  pi.item_key,
  pi.item_type,
  pip.payment_provider,
  pip.currency,
  pip.provider_price_external_id,
  pip.unit_amount_cents
FROM pricing_items pi
JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
WHERE pi.item_key = 'pro' 
  AND pip.currency = 'SAR' 
  AND pip.supports_recurring = true
  AND pip.is_active = true;

-- Saudi user buying a package (should route to STC Pay for wallet, PayTabs for card)
SELECT 
  pi.item_key,
  pi.item_type,
  pip.payment_provider,
  pip.currency,
  pip.provider_price_external_id,
  pip.unit_amount_cents
FROM pricing_items pi
JOIN pricing_item_prices pip ON pi.id = pip.pricing_item_id
WHERE pi.item_key = 'booster' 
  AND pip.currency = 'SAR' 
  AND pip.supports_recurring = false
  AND pip.is_active = true
ORDER BY pip.payment_provider;

-- =====================================================
-- EXPERT-RECOMMENDED VALIDATION QUERIES
-- =====================================================

-- 🧪 EXPERT VALIDATION: Prove subscription/package routing is valid per provider
-- This should return zero rows (Fawry must never have recurring=true)
SELECT 'VALIDATION FAILED: Fawry has recurring subscriptions' as error_message, *
FROM pricing_item_prices
WHERE payment_provider = 'fawry'::payment_provider_key
  AND supports_recurring = true;

-- This should return zero rows (STC Pay must never have recurring=true)  
SELECT 'VALIDATION FAILED: STC Pay has recurring subscriptions' as error_message, *
FROM pricing_item_prices  
WHERE payment_provider = 'stcpay'::payment_provider_key
  AND supports_recurring = true;

-- 🧪 EXPERT VALIDATION: Quick integrity check for each item_key across providers
-- This gives a comprehensive view of all mappings
SELECT pi.item_key,
       pip.payment_provider,
       pip.currency,
       pip.supports_recurring,
       pip.unit_amount_cents,
       pip.is_active
FROM pricing_items pi
JOIN pricing_item_prices pip ON pip.pricing_item_id = pi.id
WHERE pi.catalog_version_id = (SELECT id FROM pricing_catalog_versions WHERE is_active = true LIMIT 1)
ORDER BY pi.item_key, pip.payment_provider, pip.currency;

-- 🧪 EXPERT VALIDATION: Ensure each currency has appropriate providers
-- Egypt (EGP) should have Fawry + Paymob
-- Saudi Arabia (SAR) should have STC Pay + PayTabs  
-- USD should have Stripe
WITH currency_provider_counts AS (
  SELECT 
    pip.currency,
    pip.payment_provider,
    COUNT(*) as mapping_count
  FROM pricing_item_prices pip
  WHERE pip.is_active = true
  GROUP BY pip.currency, pip.payment_provider
)
SELECT 
  currency,
  array_agg(payment_provider ORDER BY payment_provider) as available_providers,
  SUM(mapping_count) as total_mappings
FROM currency_provider_counts
GROUP BY currency
ORDER BY currency;

-- 🧪 Final validation summary with expert-recommended checks
DO $$
DECLARE
  rec RECORD;
  fawry_recurring_count INTEGER;
  stcpay_recurring_count INTEGER;
  total_mappings INTEGER;
BEGIN
  -- Check for invalid recurring configurations
  SELECT COUNT(*) INTO fawry_recurring_count
  FROM pricing_item_prices 
  WHERE payment_provider = 'fawry'::payment_provider_key AND supports_recurring = true;
  
  SELECT COUNT(*) INTO stcpay_recurring_count
  FROM pricing_item_prices 
  WHERE payment_provider = 'stcpay'::payment_provider_key AND supports_recurring = true;
  
  SELECT COUNT(*) INTO total_mappings
  FROM pricing_item_prices 
  WHERE is_active = true;
  
  IF fawry_recurring_count > 0 THEN
    RAISE WARNING '❌ VALIDATION FAILED: Fawry has % recurring subscriptions (should be 0)', fawry_recurring_count;
  ELSE
    RAISE NOTICE '✅ Fawry validation passed: No recurring subscriptions';
  END IF;
  
  IF stcpay_recurring_count > 0 THEN
    RAISE WARNING '❌ VALIDATION FAILED: STC Pay has % recurring subscriptions (should be 0)', stcpay_recurring_count;
  ELSE
    RAISE NOTICE '✅ STC Pay validation passed: No recurring subscriptions';  
  END IF;
  
  RAISE NOTICE '📊 Total active price mappings: %', total_mappings;
  
  IF fawry_recurring_count = 0 AND stcpay_recurring_count = 0 AND total_mappings > 0 THEN
    RAISE NOTICE '🎯 All expert validations PASSED! Multi-provider price mappings ready for production.';
  END IF;
END $$;