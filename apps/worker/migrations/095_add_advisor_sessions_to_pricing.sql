-- Migration: Add advisor sessions to pricing items table
-- Description: Moves advisor session configuration from code to database for better maintainability
-- Expert-enhanced: Production hardening with eligibility constraints and catalog versioning safety
-- Date: 2025-09-22
--
-- Future consideration: Two-column approach (advisor_sessions_policy ENUM, advisor_sessions_count INTEGER)
-- would provide stronger typing but current TEXT approach with enhanced constraints is sufficient

BEGIN;

-- =====================================================
-- Add advisor_sessions_value column to pricing_items
-- =====================================================

-- Add the new column to store advisor session configuration
ALTER TABLE pricing_items
ADD COLUMN IF NOT EXISTS advisor_sessions_value TEXT;

-- Add basic value constraint first (eligibility constraint added after data population)
DO $$
BEGIN
  -- Enhanced constraint with integer overflow protection
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_advisor_sessions_valid') THEN
    ALTER TABLE pricing_items
      ADD CONSTRAINT chk_advisor_sessions_valid
      CHECK (
        advisor_sessions_value IS NULL OR
        advisor_sessions_value IN ('community', 'daily') OR
        (advisor_sessions_value ~ '^[0-9]{1,9}$' AND advisor_sessions_value::integer >= 0)
      );
  END IF;
END $$;

-- =====================================================
-- Populate existing pricing items with session values (active catalog only)
-- Expert-enhanced: Scoped to active catalogs, precise tracking, no silent fallback
-- =====================================================

-- Backfill only the active catalog version(s) to preserve historical data
-- Only populate sessions for advisor-eligible plans to satisfy constraint
WITH active_catalogs AS (
  SELECT id FROM pricing_catalog_versions WHERE is_active = true
),
updated_items AS (
  UPDATE pricing_items pi
  SET advisor_sessions_value = CASE
      WHEN NOT pi.advisor_eligible THEN NULL  -- Non-eligible plans must have NULL
      WHEN pi.item_key = 'lite' THEN '2'
      WHEN pi.item_key = 'starter' THEN '4'
      WHEN pi.item_key = 'builder' THEN '6'
      WHEN pi.item_key = 'pro' THEN '10'
      WHEN pi.item_key = 'ultra' THEN 'daily'
      ELSE NULL  -- Unknown eligible plans get NULL (will cause constraint failure if needed)
    END
  FROM active_catalogs ac
  WHERE pi.catalog_version_id = ac.id
    AND pi.item_type = 'subscription'
    AND pi.advisor_sessions_value IS NULL
  RETURNING pi.item_key, pi.advisor_sessions_value, pi.catalog_version_id, pi.advisor_eligible
),
update_summary AS (
  SELECT
    COUNT(*) as updated_count,
    ARRAY_AGG(item_key ORDER BY item_key) as updated_keys
  FROM updated_items
)
SELECT updated_count, updated_keys FROM update_summary;

-- =====================================================
-- Add eligibility constraint after data population
-- =====================================================

-- Now that data is populated, enforce consistency between advisor eligibility and session values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_advisor_sessions_eligibility') THEN
    ALTER TABLE pricing_items
      ADD CONSTRAINT chk_advisor_sessions_eligibility
      CHECK (
        (NOT advisor_eligible AND advisor_sessions_value IS NULL) OR
        (advisor_eligible AND advisor_sessions_value IS NOT NULL)
      );
  END IF;
END $$;

-- =====================================================
-- Verification
-- =====================================================

-- Enhanced verification with eligibility consistency checks (expert-enhanced)
DO $$
DECLARE
    subscription_count INTEGER;
    populated_count INTEGER;
    sample_values TEXT;
    missing_eligible INTEGER := 0;
    invalid_non_eligible INTEGER := 0;
BEGIN
    -- Count total active subscriptions
    SELECT COUNT(*) INTO subscription_count
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = true;

    -- Count populated sessions values
    SELECT COUNT(*) INTO populated_count
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = true
      AND pi.advisor_sessions_value IS NOT NULL;

    -- Check for eligible plans missing session values
    SELECT COUNT(*) INTO missing_eligible
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = true
      AND pi.advisor_eligible = true
      AND pi.advisor_sessions_value IS NULL;

    -- Check for non-eligible plans with session values
    SELECT COUNT(*) INTO invalid_non_eligible
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = true
      AND pi.advisor_eligible = false
      AND pi.advisor_sessions_value IS NOT NULL;

    -- Get sample values for verification
    SELECT string_agg(pi.item_key || ':' || COALESCE(pi.advisor_sessions_value, 'NULL'), ', ' ORDER BY pi.display_order) INTO sample_values
    FROM pricing_items pi
    JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
    WHERE pcv.is_active = true
      AND pi.item_type = 'subscription'
      AND pi.is_active = true;

    RAISE NOTICE 'Advisor sessions migration: subscriptions %, populated %, examples: %',
                 subscription_count, populated_count, COALESCE(sample_values, 'none');

    -- Critical validation checks
    IF missing_eligible > 0 THEN
        RAISE EXCEPTION '❌ % eligible plans missing session values', missing_eligible;
    END IF;

    IF invalid_non_eligible > 0 THEN
        RAISE EXCEPTION '❌ % non-eligible plans have session values', invalid_non_eligible;
    END IF;

    -- Summary validation
    IF populated_count < subscription_count THEN
        RAISE NOTICE '⚠️  Some active subscriptions lack session values (%/%). This is OK if they are non-eligible plans.', populated_count, subscription_count;
    ELSE
        RAISE NOTICE '✅ All active subscriptions have session values';
    END IF;

    RAISE NOTICE '✅ Eligibility consistency validated: no constraint violations found';
END $$;

COMMIT;

-- =====================================================
-- Verification queries (commented out)
-- =====================================================

-- Uncomment to verify the changes manually:

-- -- Check all subscription plans with advisor sessions
-- SELECT
--     pi.item_key,
--     pi.display_name,
--     pi.advisor_eligible,
--     pi.advisor_sessions_value,
--     pi.advisor_payout_cents / 100.0 as payout_usd
-- FROM pricing_items pi
-- JOIN pricing_catalog_versions pcv ON pi.catalog_version_id = pcv.id
-- WHERE pcv.is_active = true
--   AND pi.item_type = 'subscription'
--   AND pi.is_active = true
-- ORDER BY pi.display_order;