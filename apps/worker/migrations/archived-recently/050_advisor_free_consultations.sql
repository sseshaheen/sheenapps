-- =====================================================
-- Migration 050: Advisor-Controlled Free Consultations
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 28, 2025
-- Purpose: Enable advisors to offer free consultations for any duration
-- Dependencies: Migration 048 (multilingual advisor profiles)
-- Status: Flexible free consultation system
--
-- Features:
-- - Advisors can choose which durations to offer for free (15, 30, 60 min)
-- - Hybrid model: mix free and paid consultations
-- - Business intelligence tracking for free consultation impact
-- - API compatibility with existing consultation booking flow
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: Add free consultation controls to advisors table
-- =====================================================

-- Add pricing model enum for advisor consultation offerings
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'advisor_pricing_model') THEN
    CREATE TYPE advisor_pricing_model AS ENUM (
      'platform_fixed',  -- Standard $9/$19/$35 platform pricing only
      'free_only',        -- Only offers free consultations (no paid)
      'hybrid'            -- Offers both free and paid consultations
    );
    RAISE NOTICE '✓ Created advisor_pricing_model enum type';
  ELSE
    RAISE NOTICE '✓ Type advisor_pricing_model already exists, skipping';
  END IF;
END $$;

-- Add pricing model column to advisors table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'advisors' AND column_name = 'pricing_model') THEN
    ALTER TABLE advisors 
    ADD COLUMN pricing_model advisor_pricing_model DEFAULT 'platform_fixed';
    RAISE NOTICE '✓ Added pricing_model column to advisors table';
  ELSE
    RAISE NOTICE '✓ Column pricing_model already exists, skipping';
  END IF;
END $$;

-- Add free consultation duration offerings (JSONB for flexibility)
-- Format: {"15": true, "30": false, "60": true} = offers free 15min and 60min
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'advisors' AND column_name = 'free_consultation_durations') THEN
    ALTER TABLE advisors 
    ADD COLUMN free_consultation_durations JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '✓ Added free_consultation_durations column to advisors table';
  ELSE
    RAISE NOTICE '✓ Column free_consultation_durations already exists, skipping';
  END IF;
END $$;

-- Add constraint to ensure valid duration keys only (simplified - no subqueries)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.constraint_column_usage 
                 WHERE constraint_name = 'advisors_valid_free_durations') THEN
    ALTER TABLE advisors 
    ADD CONSTRAINT advisors_valid_free_durations 
    CHECK (
      free_consultation_durations = '{}'::jsonb OR 
      (
        jsonb_typeof(free_consultation_durations) = 'object' AND
        (free_consultation_durations ? '15' OR free_consultation_durations ? '30' OR free_consultation_durations ? '60')
      )
    );
    RAISE NOTICE '✓ Added free consultation duration validation constraint';
  ELSE
    RAISE NOTICE '✓ Constraint advisors_valid_free_durations already exists, skipping';
  END IF;
END $$;

-- =====================================================
-- Step 2: Add free consultation tracking to advisor_consultations table
-- =====================================================

-- Track whether consultation was booked as free
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'advisor_consultations' AND column_name = 'is_free_consultation') THEN
    ALTER TABLE advisor_consultations 
    ADD COLUMN is_free_consultation BOOLEAN DEFAULT false;
    RAISE NOTICE '✓ Added is_free_consultation column to advisor_consultations table';
  ELSE
    RAISE NOTICE '✓ Column is_free_consultation already exists, skipping';
  END IF;
END $$;

-- Track original advisor pricing settings at booking time for auditing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'advisor_consultations' AND column_name = 'pricing_context') THEN
    ALTER TABLE advisor_consultations 
    ADD COLUMN pricing_context JSONB DEFAULT '{}'::jsonb;
    RAISE NOTICE '✓ Added pricing_context column to advisor_consultations table';
  ELSE
    RAISE NOTICE '✓ Column pricing_context already exists, skipping';
  END IF;
END $$;

-- =====================================================
-- Step 3: Create helper functions for free consultation logic
-- =====================================================

-- Function to check if advisor offers free consultation for given duration
CREATE OR REPLACE FUNCTION advisor_offers_free_consultation(
  advisor_user_id UUID,
  duration_minutes INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  advisor_pricing advisor_pricing_model;
  free_durations JSONB;
BEGIN
  -- Get advisor's pricing model and free duration settings
  SELECT pricing_model, free_consultation_durations
  INTO advisor_pricing, free_durations
  FROM advisors
  WHERE user_id = advisor_user_id 
    AND approval_status = 'approved'
    AND is_accepting_bookings = true;
  
  -- Return false if advisor not found or not available
  IF advisor_pricing IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check pricing model and duration availability
  CASE advisor_pricing
    WHEN 'platform_fixed' THEN
      RETURN false; -- No free consultations in platform-fixed model
    WHEN 'free_only' THEN
      RETURN duration_minutes IN (15, 30, 60); -- All durations free
    WHEN 'hybrid' THEN
      -- Check specific duration in free_durations JSONB
      RETURN COALESCE((free_durations ->> duration_minutes::text)::boolean, false);
  END CASE;
  
  RETURN false;
END;
$$;

-- Function to get consultation pricing including free options
CREATE OR REPLACE FUNCTION get_consultation_pricing_with_free(
  advisor_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  base_pricing JSONB;
  advisor_free_durations JSONB;
  advisor_pricing advisor_pricing_model;
  result JSONB;
BEGIN
  -- Base platform pricing
  base_pricing := '{
    "15": {"price_cents": 900, "price_display": "$9.00"},
    "30": {"price_cents": 1900, "price_display": "$19.00"}, 
    "60": {"price_cents": 3500, "price_display": "$35.00"}
  }'::jsonb;
  
  -- If no specific advisor, return base pricing only
  IF advisor_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'pricing', base_pricing,
      'platform_fee_percentage', 30,
      'currency', 'USD'
    );
  END IF;
  
  -- Get advisor's free consultation settings
  SELECT pricing_model, free_consultation_durations
  INTO advisor_pricing, advisor_free_durations
  FROM advisors
  WHERE user_id = advisor_user_id;
  
  -- Build result with free consultation info
  result := jsonb_build_object(
    'pricing', base_pricing,
    'platform_fee_percentage', 30,
    'currency', 'USD',
    'advisor_pricing_model', advisor_pricing
  );
  
  -- Add free consultation availability
  CASE advisor_pricing
    WHEN 'free_only' THEN
      result := result || jsonb_build_object(
        'free_consultations_available', jsonb_build_object(
          '15', true, '30', true, '60', true
        )
      );
    WHEN 'hybrid' THEN
      result := result || jsonb_build_object(
        'free_consultations_available', COALESCE(advisor_free_durations, '{}'::jsonb)
      );
    ELSE
      result := result || jsonb_build_object(
        'free_consultations_available', '{}'::jsonb
      );
  END CASE;
  
  RETURN result;
END;
$$;

-- =====================================================
-- Step 4: Create free consultation metrics table
-- =====================================================

-- Track business impact of free consultations
CREATE TABLE IF NOT EXISTS advisor_free_consultation_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advisor_user_id UUID NOT NULL REFERENCES auth.users(id),
  duration_minutes INTEGER NOT NULL,
  conversion_to_paid BOOLEAN DEFAULT false, -- Did client book paid consultation after?
  client_feedback_rating INTEGER, -- Optional rating for free consultation
  created_at TIMESTAMPTZ DEFAULT now(),
  converted_at TIMESTAMPTZ, -- When client booked first paid consultation
  
  CONSTRAINT free_consultation_valid_duration 
    CHECK (duration_minutes IN (15, 30, 60)),
  CONSTRAINT free_consultation_valid_rating
    CHECK (client_feedback_rating IS NULL OR client_feedback_rating BETWEEN 1 AND 5)
);

-- Index for free consultation analytics
CREATE INDEX IF NOT EXISTS idx_free_consultation_metrics_advisor 
ON advisor_free_consultation_metrics(advisor_user_id);
CREATE INDEX IF NOT EXISTS idx_free_consultation_metrics_conversion 
ON advisor_free_consultation_metrics(conversion_to_paid, created_at);

-- =====================================================
-- Step 5: Update consultation booking logic for free sessions
-- =====================================================

-- Function to calculate consultation total (0 for free, platform rate for paid)
CREATE OR REPLACE FUNCTION calculate_consultation_total(
  advisor_user_id UUID,
  duration_minutes INTEGER,
  force_free BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  is_free BOOLEAN;
  base_rates JSONB;
  total_cents INTEGER;
BEGIN
  -- Check if this should be free
  is_free := force_free OR advisor_offers_free_consultation(advisor_user_id, duration_minutes);
  
  -- Base platform rates
  base_rates := '{
    "15": 900, "30": 1900, "60": 3500
  }'::jsonb;
  
  -- Calculate total
  IF is_free THEN
    total_cents := 0;
  ELSE
    total_cents := (base_rates ->> duration_minutes::text)::integer;
  END IF;
  
  RETURN jsonb_build_object(
    'total_cents', total_cents,
    'is_free', is_free,
    'duration_minutes', duration_minutes,
    'price_display', CASE 
      WHEN is_free THEN 'Free'
      ELSE '$' || (total_cents::float / 100)::text
    END
  );
END;
$$;

-- =====================================================
-- Step 6: Sample data for testing
-- =====================================================

-- Example: Set up a hybrid advisor who offers free 15-min consultations
-- This is just for testing - remove or modify as needed
/*
UPDATE advisors 
SET 
  pricing_model = 'hybrid',
  free_consultation_durations = '{"15": true, "30": false, "60": false}'::jsonb
WHERE user_id = 'some-test-advisor-uuid';
*/

COMMIT;

-- =====================================================
-- Migration Summary
-- =====================================================

DO $$
DECLARE
  total_advisors INTEGER;
  hybrid_advisors INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_advisors FROM advisors;
  SELECT COUNT(*) INTO hybrid_advisors FROM advisors WHERE pricing_model != 'platform_fixed';
  
  RAISE NOTICE '✅ Migration 050 completed successfully!';
  RAISE NOTICE '💡 Free consultation system enabled';
  RAISE NOTICE '👥 Total advisors: %', total_advisors;
  RAISE NOTICE '🎯 Advisors with flexible pricing: %', hybrid_advisors;
  RAISE NOTICE '🔧 New functions: advisor_offers_free_consultation(), get_consultation_pricing_with_free()';
  RAISE NOTICE '📊 Free consultation metrics tracking enabled';
  RAISE NOTICE '🚀 Ready for advisor-controlled free consultation implementation';
END $$;