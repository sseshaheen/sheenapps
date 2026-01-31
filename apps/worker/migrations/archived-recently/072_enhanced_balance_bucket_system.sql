-- Migration: Enhanced Balance System with Bucket Tracking
-- Date: 2025-09-01
-- Description: Extends user_ai_time_balance with expert-enhanced bucket system, monthly caps, rollover logic, and computed columns

BEGIN;

-- =====================================================
-- 1. EXTEND USER_AI_TIME_BALANCE TABLE
-- =====================================================

-- Add monthly bonus tracking columns
ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  bonus_month_year TEXT DEFAULT TO_CHAR(NOW(), 'YYYY-MM');

ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  bonus_used_this_month INTEGER DEFAULT 0 CHECK (bonus_used_this_month >= 0);

ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  bonus_monthly_cap INTEGER DEFAULT 18000 CHECK (bonus_monthly_cap >= 0); -- 300 minutes in seconds

-- Add bucket tracking (JSONB for flexibility) - Expert fix: NOT NULL for simpler code paths
ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  second_buckets JSONB DEFAULT '[]'; -- renamed to be precise

-- Expert recommendation: Ensure second_buckets is never NULL (simplifies code paths)
ALTER TABLE user_ai_time_balance
  ALTER COLUMN second_buckets SET NOT NULL;

-- Add computed columns for fast reads (expert recommendation)
ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  total_paid_seconds BIGINT NOT NULL DEFAULT 0 CHECK (total_paid_seconds >= 0);

ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  total_bonus_seconds BIGINT NOT NULL DEFAULT 0 CHECK (total_bonus_seconds >= 0);

ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  next_expiry_at TIMESTAMPTZ;

-- Add pricing catalog version tracking
ALTER TABLE user_ai_time_balance ADD COLUMN IF NOT EXISTS
  pricing_catalog_version TEXT DEFAULT '2025-09-01';

-- =====================================================
-- 2. CREATE PERFORMANCE INDEXES
-- =====================================================

-- Bonus tracking performance
CREATE INDEX IF NOT EXISTS idx_bonus_tracking 
  ON user_ai_time_balance(bonus_month_year, bonus_used_this_month);

-- Next expiry lookup performance
CREATE INDEX IF NOT EXISTS idx_next_expiry 
  ON user_ai_time_balance(next_expiry_at) 
  WHERE next_expiry_at IS NOT NULL;

-- Expert recommendation: Partial index for active users with upcoming expiries (useful for reminders)
CREATE INDEX IF NOT EXISTS idx_next_expiry_active
  ON user_ai_time_balance (next_expiry_at)
  WHERE next_expiry_at IS NOT NULL AND (total_paid_seconds + total_bonus_seconds) > 0;

-- Optional JSONB index for complex bucket queries (add if needed later)
-- CREATE INDEX IF NOT EXISTS idx_second_buckets 
--   ON user_ai_time_balance USING gin (second_buckets jsonb_path_ops);

-- =====================================================
-- 3. ADD BUCKET VALIDATION FUNCTIONS
-- =====================================================

-- Function to validate bucket structure and constraints (expert-enhanced)
CREATE OR REPLACE FUNCTION validate_bucket_integrity(buckets JSONB) 
RETURNS BOOLEAN AS $$
DECLARE
  bucket JSONB;
  ts timestamptz;
  ids TEXT[];
BEGIN
  -- Validate each bucket in the array
  FOR bucket IN SELECT jsonb_array_elements(buckets)
  LOOP
    -- Check required fields
    IF NOT (bucket ? 'id' AND bucket ? 'source' AND bucket ? 'seconds' AND bucket ? 'consumed') THEN
      RETURN FALSE;
    END IF;
    
    -- Check data types and constraints
    IF NOT (
      jsonb_typeof(bucket->'seconds') = 'number' AND
      jsonb_typeof(bucket->'consumed') = 'number' AND
      (bucket->>'seconds')::INTEGER >= 0 AND
      (bucket->>'consumed')::INTEGER >= 0 AND
      (bucket->>'consumed')::INTEGER <= (bucket->>'seconds')::INTEGER
    ) THEN
      RETURN FALSE;
    END IF;
    
    -- Check source type
    IF NOT (bucket->>'source' IN ('daily', 'subscription', 'rollover', 'package', 'welcome', 'gift')) THEN
      RETURN FALSE;
    END IF;

    -- Expert fix: Validate expires_at is parseable (prevents hard crashes)
    IF bucket ? 'expires_at' AND bucket->>'expires_at' IS NOT NULL THEN
      BEGIN
        ts := (bucket->>'expires_at')::timestamptz;
      EXCEPTION WHEN others THEN
        RETURN FALSE;
      END;
    END IF;
  END LOOP;

  -- Expert fix: Enforce unique bucket IDs within the array
  SELECT array_agg((b->>'id')) INTO ids
  FROM jsonb_array_elements(buckets) b;

  IF ids IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Check for duplicate IDs using array comparison
  IF cardinality(ids) <> cardinality(ARRAY(SELECT DISTINCT unnest(ids))) THEN
    RETURN FALSE;
  END IF;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add comments for the validation function
COMMENT ON FUNCTION validate_bucket_integrity IS 'Validates JSONB bucket structure and integrity constraints';

-- Function to compute totals from buckets (expert-enhanced: exclude expired buckets)
CREATE OR REPLACE FUNCTION compute_bucket_totals(buckets JSONB)
RETURNS TABLE(paid_seconds BIGINT, bonus_seconds BIGINT, next_expiry TIMESTAMPTZ) AS $$
DECLARE
  bucket JSONB;
  paid_total BIGINT := 0;
  bonus_total BIGINT := 0;
  earliest_expiry TIMESTAMPTZ := NULL;
  bucket_expiry TIMESTAMPTZ;
  remaining_seconds INTEGER;
  is_expired BOOLEAN;
BEGIN
  FOR bucket IN SELECT jsonb_array_elements(buckets)
  LOOP
    remaining_seconds := (bucket->>'seconds')::INTEGER - (bucket->>'consumed')::INTEGER;

    -- Check if bucket has expired (treat null expires_at as non-expiring)
    is_expired := FALSE;
    IF bucket ? 'expires_at' AND bucket->>'expires_at' IS NOT NULL THEN
      bucket_expiry := (bucket->>'expires_at')::timestamptz;
      is_expired := (bucket_expiry <= now());
    END IF;

    -- Only count non-expired buckets with remaining seconds
    IF remaining_seconds > 0 AND NOT is_expired THEN
      -- Expert recommendation: welcome and gift are paid by policy (not bonus)
      -- Bonus = daily only; Paid = everything else (subs, packages, welcome grants, support gifts)
      IF bucket->>'source' IN ('subscription','rollover','package','welcome','gift') THEN
        paid_total := paid_total + remaining_seconds;
      ELSE
        bonus_total := bonus_total + remaining_seconds;
      END IF;

      -- Track earliest expiry among non-expired, expiring buckets only
      IF bucket ? 'expires_at' AND bucket->>'expires_at' IS NOT NULL THEN
        IF earliest_expiry IS NULL OR bucket_expiry < earliest_expiry THEN
          earliest_expiry := bucket_expiry;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT paid_total, bonus_total, earliest_expiry;
END;
$$ LANGUAGE plpgsql;

-- Add comments for the compute function (expert policy: bonus = daily only; paid = everything else)
COMMENT ON FUNCTION compute_bucket_totals IS 'Computes paid/bonus totals and next expiry from bucket JSONB. Policy: bonus = daily only; paid = subscription, rollover, package, welcome, gift';

-- =====================================================
-- 4. CREATE BUCKET UPDATE TRIGGER
-- =====================================================

-- Trigger function to maintain computed columns automatically (expert-enhanced error handling)
CREATE OR REPLACE FUNCTION update_computed_balance_fields()
RETURNS TRIGGER AS $$
DECLARE
  computed_totals RECORD;
BEGIN
  -- Expert fix: Validate bucket structure with better error messages for debugging
  IF NOT validate_bucket_integrity(NEW.second_buckets) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Invalid bucket structure in second_buckets',
      DETAIL = NEW.second_buckets::text;
  END IF;
  
  -- Compute totals from buckets
  SELECT * INTO computed_totals 
  FROM compute_bucket_totals(NEW.second_buckets);
  
  -- Update computed fields
  NEW.total_paid_seconds := computed_totals.paid_seconds;
  NEW.total_bonus_seconds := computed_totals.bonus_seconds;
  NEW.next_expiry_at := computed_totals.next_expiry;
  
  -- Update timestamp (verified: updated_at column exists in our codebase)
  NEW.updated_at := NOW();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for computed field maintenance (expert fix: also run on INSERT)
DO $$
BEGIN
  -- Drop existing trigger if it exists (to update it with INSERT)
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'maintain_computed_balance_fields' 
    AND tgrelid = 'user_ai_time_balance'::regclass
  ) THEN
    DROP TRIGGER maintain_computed_balance_fields ON user_ai_time_balance;
  END IF;

  -- Create trigger that runs on both INSERT and UPDATE
  CREATE TRIGGER maintain_computed_balance_fields
    BEFORE INSERT OR UPDATE ON user_ai_time_balance
    FOR EACH ROW
    EXECUTE FUNCTION update_computed_balance_fields();
END $$;

-- =====================================================
-- 5. MIGRATION DATA INTEGRITY CONSTRAINTS
-- =====================================================

-- Add constraint to ensure bucket integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'valid_bucket_structure'
    AND conrelid = 'user_ai_time_balance'::regclass
  ) THEN
    ALTER TABLE user_ai_time_balance 
    ADD CONSTRAINT valid_bucket_structure 
    CHECK (validate_bucket_integrity(second_buckets));
  END IF;
END $$;

-- Add constraint for monthly bonus cap
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'bonus_within_monthly_cap'
    AND conrelid = 'user_ai_time_balance'::regclass
  ) THEN
    ALTER TABLE user_ai_time_balance 
    ADD CONSTRAINT bonus_within_monthly_cap 
    CHECK (bonus_used_this_month <= bonus_monthly_cap);
  END IF;
END $$;

-- Add constraint for computed field consistency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'computed_fields_non_negative'
    AND conrelid = 'user_ai_time_balance'::regclass
  ) THEN
    ALTER TABLE user_ai_time_balance 
    ADD CONSTRAINT computed_fields_non_negative 
    CHECK (total_paid_seconds >= 0 AND total_bonus_seconds >= 0);
  END IF;
END $$;

-- =====================================================
-- 6. UPDATE EXISTING RECORDS
-- =====================================================

-- Expert recommendation: Safer migration approach - avoid referencing potentially missing columns
-- Initialize to empty buckets and let application code populate gradually
-- This prevents migration failures in environments with different schema states
UPDATE user_ai_time_balance 
SET 
  -- Initialize empty buckets (safer than trying to migrate from legacy columns)
  second_buckets = CASE 
    WHEN second_buckets = '[]' OR second_buckets IS NULL THEN '[]'::jsonb
    ELSE second_buckets -- Keep existing buckets if already set
  END,
  
  -- Set monthly bonus tracking for current month
  bonus_month_year = CASE 
    WHEN bonus_month_year IS NULL THEN TO_CHAR(NOW(), 'YYYY-MM')
    ELSE bonus_month_year
  END,
  
  -- Initialize monthly cap (300 minutes = 18000 seconds for free tier)
  bonus_monthly_cap = CASE 
    WHEN bonus_monthly_cap IS NULL THEN 18000
    ELSE bonus_monthly_cap
  END,
  
  -- Set pricing catalog version
  pricing_catalog_version = CASE 
    WHEN pricing_catalog_version IS NULL THEN '2025-09-01'
    ELSE pricing_catalog_version
  END

WHERE 
  -- Only update records that need migration
  second_buckets IS NULL OR
  bonus_month_year IS NULL OR
  bonus_monthly_cap IS NULL OR
  pricing_catalog_version IS NULL;

-- Force trigger execution to update computed fields for migrated records
UPDATE user_ai_time_balance 
SET second_buckets = second_buckets 
WHERE total_paid_seconds = 0 AND total_bonus_seconds = 0;

-- =====================================================
-- 7. ADD HELPFUL COMMENTS
-- =====================================================

COMMENT ON COLUMN user_ai_time_balance.second_buckets IS 'JSONB array of time buckets with expert-recommended structure for consumption tracking';
COMMENT ON COLUMN user_ai_time_balance.bonus_month_year IS 'Track monthly bonus usage in YYYY-MM format for monthly cap enforcement';
COMMENT ON COLUMN user_ai_time_balance.bonus_used_this_month IS 'Seconds of bonus time used this month (resets monthly)';
COMMENT ON COLUMN user_ai_time_balance.bonus_monthly_cap IS 'Maximum bonus seconds allowed per month (free tier abuse prevention)';
COMMENT ON COLUMN user_ai_time_balance.total_paid_seconds IS 'Computed total of remaining paid seconds across all buckets';
COMMENT ON COLUMN user_ai_time_balance.total_bonus_seconds IS 'Computed total of remaining bonus seconds across all buckets';
COMMENT ON COLUMN user_ai_time_balance.next_expiry_at IS 'Computed timestamp of next bucket expiry for proactive notifications';
COMMENT ON COLUMN user_ai_time_balance.pricing_catalog_version IS 'Version tag of pricing catalog used for this user';

COMMIT;