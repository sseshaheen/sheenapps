-- Migration: Show ultra subscription plan
-- Description: Re-activates the ultra subscription plan while keeping starter and pro hidden
-- Visible plans after migration: free, lite, builder, ultra
-- Date: 2025-09-22

BEGIN;

-- =====================================================
-- Re-activate ultra subscription plan
-- =====================================================

-- Re-activate ultra subscription plan in active catalog versions only
WITH updated_items AS (
  UPDATE pricing_items pi
  SET is_active = true
  FROM pricing_catalog_versions pcv
  WHERE pi.catalog_version_id = pcv.id
    AND pcv.is_active = true              -- Scope to active catalog versions only
    AND pi.item_type = 'subscription'
    AND pi.item_key = 'ultra'
    AND pi.is_active = false
  RETURNING pi.item_key, pi.catalog_version_id
),
update_summary AS (
  SELECT
    COUNT(*) as updated_count,
    ARRAY_AGG(item_key ORDER BY item_key) as updated_keys
  FROM updated_items
)
SELECT updated_count, updated_keys FROM update_summary;

-- Comprehensive validation
DO $$
DECLARE
    updated_count INTEGER;
    visible_plans TEXT[];
    hidden_plans TEXT[];
BEGIN
    -- Get the actual update count
    SELECT COUNT(*) INTO updated_count
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.item_key = 'ultra'
      AND pi.is_active = true;

    -- Get current visible plans (active catalog only)
    SELECT ARRAY_AGG(pi.item_key ORDER BY pi.display_order) INTO visible_plans
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = true;

    -- Get hidden plans
    SELECT ARRAY_AGG(pi.item_key ORDER BY pi.display_order) INTO hidden_plans
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = false;

    RAISE NOTICE 'Activated ultra plan: % rows updated', updated_count;
    RAISE NOTICE 'Visible plans now: %', visible_plans;
    RAISE NOTICE 'Hidden plans: %', hidden_plans;

    -- Validate ultra is now visible
    IF 'ultra' = ANY(visible_plans) THEN
        RAISE NOTICE '✅ Ultra plan is now visible';
    ELSE
        RAISE EXCEPTION '❌ Ultra plan is not visible after migration';
    END IF;

    -- Validate expected plans are visible
    IF 'free' = ANY(visible_plans) AND 'lite' = ANY(visible_plans) AND 'builder' = ANY(visible_plans) AND 'ultra' = ANY(visible_plans) THEN
        RAISE NOTICE '✅ Expected plans (free, lite, builder, ultra) are visible';
    ELSE
        RAISE EXCEPTION '❌ Missing expected visible plans. Current visible: %', visible_plans;
    END IF;

    -- Validate starter and pro remain hidden
    IF 'starter' = ANY(hidden_plans) AND 'pro' = ANY(hidden_plans) THEN
        RAISE NOTICE '✅ Starter and pro plans remain hidden';
    ELSE
        RAISE WARNING '⚠️  Expected starter and pro to remain hidden. Current hidden: %', hidden_plans;
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Rollback Operations (hide ultra again)
-- =====================================================

-- Uncomment and run to hide ultra plan again if needed:
/*
BEGIN;
UPDATE pricing_items pi
SET is_active = false
FROM pricing_catalog_versions pcv
WHERE pi.catalog_version_id = pcv.id
  AND pcv.is_active = true
  AND pi.item_type = 'subscription'
  AND pi.item_key = 'ultra'
  AND pi.is_active = true;
COMMIT;
*/

-- =====================================================
-- Verification queries (commented out)
-- =====================================================

-- Uncomment to verify the changes manually:

-- -- Check all subscription plans status
-- SELECT
--     pi.item_key,
--     pi.display_name,
--     pi.seconds / 60 as minutes,
--     pi.unit_amount_cents / 100.0 as price_usd,
--     pi.display_order,
--     pi.is_active,
--     CASE WHEN pi.is_active THEN 'VISIBLE' ELSE 'HIDDEN' END as status
-- FROM pricing_items pi
-- JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
-- WHERE pcv.is_active = true
--   AND pi.item_type = 'subscription'
-- ORDER BY pi.display_order;