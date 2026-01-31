-- =====================================================
-- Migration 074: Final Production Fixes for Promotions
-- =====================================================
-- Author: Claude Code Assistant
-- Created: September 2, 2025
-- Purpose: Critical production fixes including corrected backfill
-- Dependencies: 073_promotion_system_expert_fixes.sql
-- Status: Production-ready
--
-- CRITICAL FIX: Corrected backfill query that respects constraints
-- Additional improvements from final expert review
-- =====================================================

BEGIN;

-- =====================================================
-- CRITICAL FIX: Correct Backfill for Existing Promotions
-- =====================================================
-- Previous backfill would violate constraint by setting currency
-- for percentage promotions. This corrected version:
-- 1. Only sets currency='USD' for fixed_amount promotions without currency
-- 2. Explicitly sets NULL for percentage promotions
-- 3. Preserves existing valid currencies

UPDATE promotions
SET 
  currency = CASE
    -- For fixed_amount without currency, default to USD
    WHEN discount_type = 'fixed_amount' AND currency IS NULL THEN 'USD'
    -- For percentage, ensure NULL (constraint requirement)
    WHEN discount_type = 'percentage' THEN NULL
    -- Keep existing valid currency
    ELSE currency
  END,
  -- Always ensure providers are set
  supported_providers = COALESCE(
    supported_providers, 
    ARRAY['stripe']::payment_provider_key[]
  ),
  -- Set supported_currencies based on single currency for existing promotions
  supported_currencies = CASE
    WHEN discount_type = 'fixed_amount' AND currency IS NOT NULL THEN ARRAY[currency]::TEXT[]
    WHEN discount_type = 'percentage' THEN NULL
    ELSE ARRAY['USD', 'EUR', 'GBP']::TEXT[] -- Default for unknown
  END
WHERE created_at < NOW() AND supported_currencies IS NULL; -- Only update if not already set

-- Verify the backfill worked correctly
DO $$
DECLARE
  v_invalid_count INTEGER;
BEGIN
  -- Check for constraint violations
  SELECT COUNT(*) INTO v_invalid_count
  FROM promotions
  WHERE (discount_type = 'percentage' AND currency IS NOT NULL)
     OR (discount_type = 'fixed_amount' AND currency IS NULL);
  
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'Backfill failed: % promotions violate currency constraints', v_invalid_count;
  END IF;
END $$;

-- =====================================================
-- API Boundary Normalization Guards
-- =====================================================
-- Create helper functions for API normalization

-- Currency normalization (always uppercase)
CREATE OR REPLACE FUNCTION normalize_currency(p_currency TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_currency IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Uppercase and validate
  p_currency := UPPER(TRIM(p_currency));
  
  IF p_currency NOT IN ('USD', 'EUR', 'GBP', 'EGP', 'SAR') THEN
    RAISE EXCEPTION 'Invalid currency: %', p_currency;
  END IF;
  
  RETURN p_currency;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Region normalization (always lowercase)
CREATE OR REPLACE FUNCTION normalize_region(p_region TEXT)
RETURNS TEXT AS $$
BEGIN
  IF p_region IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Lowercase and validate
  p_region := LOWER(TRIM(p_region));
  
  IF p_region NOT IN ('us', 'ca', 'gb', 'eu', 'eg', 'sa') THEN
    RAISE EXCEPTION 'Invalid region: %', p_region;
  END IF;
  
  RETURN p_region;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Provider normalization (validate enum)
CREATE OR REPLACE FUNCTION normalize_provider(p_provider TEXT)
RETURNS payment_provider_key AS $$
BEGIN
  IF p_provider IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Lowercase and validate against enum
  p_provider := LOWER(TRIM(p_provider));
  
  -- Will throw error if not valid enum value
  RETURN p_provider::payment_provider_key;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Semantic Clarifications as Constraints
-- =====================================================

-- Add comment clarifying checkout_type_restrictions semantics
COMMENT ON COLUMN promotions.checkout_type_restrictions IS 
  'NULL or undefined = No restriction (all types allowed). Empty array [] would block all checkouts (never use). Set to specific types to restrict.';

-- Add comment clarifying code normalization
COMMENT ON COLUMN promotion_codes.code_normalized IS 
  'Normalized using UPPER(TRIM(code)) for case-insensitive matching. Users enter "Summer2025", we store normalized as "SUMMER2025"';

-- =====================================================
-- Database Constraint Validation (No Triggers Needed)
-- =====================================================
-- Using CHECK constraints instead of triggers for better performance
-- Triggers removed to avoid redundancy with constraints in migration 073

-- Additional constraint to prevent empty arrays
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'promotions_no_empty_arrays') THEN
    ALTER TABLE promotions
    ADD CONSTRAINT promotions_no_empty_arrays CHECK (
      (supported_providers IS NULL OR cardinality(supported_providers) > 0) AND
      (supported_currencies IS NULL OR cardinality(supported_currencies) > 0) AND
      (checkout_type_restrictions IS NULL OR cardinality(checkout_type_restrictions) > 0)
    );
  END IF;
END $$;

-- Constraint for regional config
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'regional_config_no_empty_arrays') THEN
    ALTER TABLE promotion_regional_config
    ADD CONSTRAINT regional_config_no_empty_arrays CHECK (
      preferred_providers IS NULL OR cardinality(preferred_providers) > 0
    );
  END IF;
END $$;

-- =====================================================
-- Enhanced Analytics View with Provider Metrics
-- =====================================================

CREATE OR REPLACE VIEW promotion_analytics_dashboard AS
WITH promotion_stats AS (
  SELECT 
    p.id,
    p.name,
    p.status,
    p.discount_type,
    p.discount_value,
    p.currency,
    p.supported_currencies,
    p.supported_providers,
    p.max_total_uses, -- Expert caught this missing field
    p.created_at,
    p.valid_from,
    p.valid_until,
    
    -- Usage metrics (scalar subqueries to avoid nesting)
    (SELECT COUNT(DISTINCT user_id) FROM promotion_redemptions r2 
     WHERE r2.promotion_id = p.id AND r2.committed_at IS NOT NULL) as unique_users,
    (SELECT COUNT(*) FROM promotion_redemptions r2 
     WHERE r2.promotion_id = p.id AND r2.committed_at IS NOT NULL) as total_redemptions,
    (SELECT COALESCE(SUM(discount_applied_amount), 0) FROM promotion_redemptions r2 
     WHERE r2.promotion_id = p.id AND r2.committed_at IS NOT NULL) as total_discount_given,
    
    -- Active reservation count
    (SELECT COUNT(*) FROM promotion_reservations res 
     WHERE res.promotion_id = p.id AND res.status = 'reserved' AND res.expires_at > NOW()) as active_reservations
    
  FROM promotions p
),
provider_breakdown AS (
  SELECT 
    r.promotion_id,
    jsonb_object_agg(r.gateway::text, r.redemption_count) as provider_usage
  FROM (
    SELECT 
      promotion_id,
      gateway,
      COUNT(*) as redemption_count
    FROM promotion_redemptions
    WHERE committed_at IS NOT NULL AND gateway IS NOT NULL
    GROUP BY promotion_id, gateway
  ) r
  GROUP BY r.promotion_id
),
currency_breakdown AS (
  SELECT 
    r.promotion_id,
    jsonb_object_agg(r.currency, r.redemption_count) as currency_usage
  FROM (
    SELECT 
      promotion_id,
      currency,
      COUNT(*) as redemption_count
    FROM promotion_redemptions
    WHERE committed_at IS NOT NULL AND currency IS NOT NULL
    GROUP BY promotion_id, currency
  ) r
  GROUP BY r.promotion_id
)
SELECT 
  ps.*,
  pb.provider_usage,
  cb.currency_usage,
  -- Calculated fields (text field, not enum constrained)
  CASE 
    WHEN ps.valid_until < NOW() THEN 'expired'::text
    WHEN ps.valid_from > NOW() THEN 'scheduled'::text
    WHEN ps.status = 'active' THEN 'active'::text
    ELSE ps.status::text
  END as effective_status,
  
  -- Effective currencies (single or array)
  CASE
    WHEN ps.supported_currencies IS NOT NULL THEN ps.supported_currencies
    WHEN ps.currency IS NOT NULL THEN ARRAY[ps.currency]
    ELSE NULL
  END as effective_currencies,
  
  -- Utilization rate
  CASE 
    WHEN ps.max_total_uses > 0 THEN 
      ROUND(100.0 * ps.total_redemptions / ps.max_total_uses, 2)
    ELSE NULL
  END as utilization_percentage

FROM promotion_stats ps
LEFT JOIN provider_breakdown pb ON pb.promotion_id = ps.id
LEFT JOIN currency_breakdown cb ON cb.promotion_id = ps.id;

-- Index to support the analytics view
CREATE INDEX IF NOT EXISTS idx_redemptions_analytics
  ON promotion_redemptions(promotion_id, committed_at, gateway, currency)
  WHERE committed_at IS NOT NULL;

-- =====================================================
-- Data Integrity Verification
-- =====================================================

-- Function to check system health
CREATE OR REPLACE FUNCTION verify_promotion_system_health()
RETURNS TABLE(
  check_name TEXT,
  check_passed BOOLEAN,
  issue_count INTEGER,
  details TEXT
) AS $$
BEGIN
  -- Currency consistency per migration 073 rules
  RETURN QUERY
  SELECT 
    'currency_consistency'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' promotions violating currency consistency'
      ELSE 'All promotions have valid currency settings'
    END
  FROM promotions
  WHERE
    (discount_type = 'percentage' AND (currency IS NOT NULL OR supported_currencies IS NOT NULL))
    OR
    (discount_type = 'fixed_amount' AND (
      currency IS NULL
      OR currency NOT IN ('USD','EUR','GBP','EGP','SAR')
      OR (supported_currencies IS NOT NULL AND NOT (currency = ANY(supported_currencies)))
    ));
  
  -- Empty arrays guard (defensive)
  RETURN QUERY
  SELECT 
    'no_empty_arrays'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' rows with empty arrays'
      ELSE 'No empty arrays found'
    END
  FROM promotions
  WHERE (supported_providers IS NOT NULL AND cardinality(supported_providers) = 0)
     OR (supported_currencies IS NOT NULL AND cardinality(supported_currencies) = 0)
     OR (checkout_type_restrictions IS NOT NULL AND cardinality(checkout_type_restrictions) = 0);
  
  -- Region code casing
  RETURN QUERY
  SELECT 
    'region_code_lowercase'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' regional configs with uppercase regions'
      ELSE 'All region codes are lowercase'
    END
  FROM promotion_regional_config
  WHERE region_code != LOWER(region_code);
  
  -- Stale reservations (should not linger as reserved)
  RETURN QUERY
  SELECT 
    'no_orphaned_reservations'::TEXT,
    COUNT(*) = 0,
    COUNT(*)::INTEGER,
    CASE 
      WHEN COUNT(*) > 0 THEN 'Found ' || COUNT(*) || ' expired reservations still marked reserved'
      ELSE 'No orphaned reservations'
    END
  FROM promotion_reservations
  WHERE status = 'reserved' AND expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- Completion Comments & Clarifications
-- =====================================================

-- Clarify our normalization approach (expert was wrong about LOWER)
COMMENT ON COLUMN promotion_codes.code_normalized IS 
  'Normalized using UPPER(TRIM(code)) for case-insensitive matching. Users enter \"Summer2025\", stored as \"SUMMER2025\"';

-- Semantic clarification for checkout restrictions
COMMENT ON COLUMN promotions.checkout_type_restrictions IS 
  'NULL = no restriction (all types allowed). Empty [] would block all checkouts (avoid). Specify types to restrict.';

COMMENT ON FUNCTION normalize_currency IS 
  'Ensures currency codes are always uppercase and valid. Used at API boundaries.';
COMMENT ON FUNCTION normalize_region IS 
  'Ensures region codes are always lowercase and valid. Used at API boundaries.';
COMMENT ON FUNCTION verify_promotion_system_health IS 
  'Health check function to verify data integrity across promotion system with dual-currency model validation';
COMMENT ON VIEW promotion_analytics_dashboard IS 
  'Analytics for promotions (dual-currency model): provider & currency breakdown, utilization, effective status.';

COMMIT;

-- =====================================================
-- Post-Migration Verification
-- =====================================================
-- Run immediately after migration:
-- SELECT * FROM verify_promotion_system_health();
-- 
-- Verify backfill worked:
-- SELECT discount_type, currency, COUNT(*) 
-- FROM promotions 
-- GROUP BY discount_type, currency 
-- ORDER BY discount_type, currency;
--
-- Check analytics view:
-- SELECT * FROM promotion_analytics_dashboard LIMIT 5;