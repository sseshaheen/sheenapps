-- Migration: Hide subscription packages (starter, pro, ultra)
-- Description: Sets starter, pro, and ultra subscription packages as inactive
-- Keeps visible: free, lite, builder
-- Date: 2025-09-22

BEGIN;

-- =====================================================
-- Hide specific subscription packages (starter, pro, ultra)
-- Expert-enhanced: Scoped to active catalog versions only, with atomic measurement
-- =====================================================

-- Hide packages in active catalog versions only (preserves catalog history)
WITH updated_items AS (
  UPDATE pricing_items pi
  SET is_active = false
  FROM pricing_catalog_versions pcv
  WHERE pi.catalog_version_id = pcv.id
    AND pcv.is_active = true              -- Scope to active catalog versions only
    AND pi.item_type = 'subscription'
    AND pi.item_key = ANY(ARRAY['starter', 'pro', 'ultra'])
    AND pi.is_active = true
  RETURNING pi.item_key, pi.catalog_version_id
),
update_summary AS (
  SELECT
    COUNT(*) as updated_count,
    ARRAY_AGG(item_key ORDER BY item_key) as updated_keys
  FROM updated_items
)
SELECT updated_count, updated_keys FROM update_summary;

-- Comprehensive validation with explicit failure for missing keys
DO $$
DECLARE
    updated_count INTEGER;
    missing_keys TEXT[];
    visible_plans TEXT[];
BEGIN
    -- Get the actual update count from the CTE (approximation since CTE is consumed)
    SELECT COUNT(*) INTO updated_count
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.item_key = ANY(ARRAY['starter', 'pro', 'ultra'])
      AND pi.is_active = false;

    -- Ensure all target keys exist in active catalog (fail-fast if missing)
    SELECT ARRAY(
        SELECT k FROM unnest(ARRAY['starter', 'pro', 'ultra']::TEXT[]) k
        EXCEPT
        SELECT DISTINCT pi.item_key
        FROM pricing_items pi
        JOIN pricing_catalog_versions pcv ON pcv.id = pi.catalog_version_id
        WHERE pcv.is_active = true AND pi.item_type = 'subscription'
    ) INTO missing_keys;

    IF array_length(missing_keys, 1) IS NOT NULL THEN
        RAISE EXCEPTION '❌ Missing expected plan keys in active catalog: %', missing_keys;
    END IF;

    -- Get current visible plans (active catalog only)
    SELECT ARRAY_AGG(pi.item_key ORDER BY pi.display_order) INTO visible_plans
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = true;

    RAISE NOTICE 'Updated rows: % (starter/pro/ultra in active catalog)', updated_count;
    RAISE NOTICE 'Visible plans now: %', visible_plans;

    -- Validate required plans remain visible
    IF 'free' = ANY(visible_plans) AND 'lite' = ANY(visible_plans) AND 'builder' = ANY(visible_plans) THEN
        RAISE NOTICE '✅ Required plans (free, lite, builder) remain visible';
    ELSE
        RAISE EXCEPTION '❌ Missing required visible plans. Current visible: %', visible_plans;
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Rollback Operations (keep handy for quick reversal)
-- =====================================================

-- Uncomment and run to re-activate the three plans if needed:
/*
BEGIN;
UPDATE pricing_items pi
SET is_active = true
FROM pricing_catalog_versions pcv
WHERE pi.catalog_version_id = pcv.id
  AND pcv.is_active = true
  AND pi.item_type = 'subscription'
  AND pi.item_key = ANY(ARRAY['starter', 'pro', 'ultra'])
  AND pi.is_active = false;
COMMIT;
*/

-- =====================================================
-- Verification queries (commented out)
-- =====================================================

-- Uncomment to verify the changes manually:

-- -- Check active subscription plans
-- SELECT
--     pi.item_key,
--     pi.display_name,
--     pi.seconds / 60 as minutes,
--     pi.unit_amount_cents / 100.0 as price_usd,
--     pi.display_order,
--     pi.is_active
-- FROM pricing_items pi
-- JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
-- WHERE pcv.is_active = true
--   AND pi.item_type = 'subscription'
-- ORDER BY pi.display_order;

-- -- Check hidden plans
-- SELECT
--     pi.item_key,
--     pi.display_name,
--     pi.is_active
-- FROM pricing_items pi
-- JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
-- WHERE pcv.is_active = true
--   AND pi.item_type = 'subscription'
--   AND pi.item_key IN ('starter', 'pro', 'ultra');