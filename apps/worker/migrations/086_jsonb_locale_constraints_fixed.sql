-- =====================================================
-- Migration 086: JSONB Locale Key Validation Constraints (FIXED)
-- =====================================================
-- Author: Claude Code Assistant
-- Created: September 15, 2025
-- Purpose: Add strict JSONB constraints to prevent unknown locale keys
-- Expert recommendation: Prevent junk locale keys like "xx" from contaminating database
-- Dependencies: Existing multilingual JSONB columns
-- Status: Production-ready with expert-validated patterns
--
-- Features Added:
-- - Reusable jsonb_only_locale_keys() validator function
-- - Constraints for all existing multilingual JSONB columns
-- - Safe migration pattern (NOT VALID -> validate after cleanup)
-- - Only targets tables/columns that actually exist in schema
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: Create reusable JSONB locale validator function
-- =====================================================

-- Expert recommendation: Reusable validator function with NULL safety + lowercase normalization
CREATE OR REPLACE FUNCTION jsonb_only_locale_keys(j jsonb, allowed text[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT j IS NULL                                  -- treat NULL as valid (empty state)
      OR j = '{}'::jsonb                            -- empty JSONB is valid
      OR NOT EXISTS (
           SELECT 1
           FROM jsonb_object_keys(COALESCE(j, '{}'::jsonb)) AS k(key)
           WHERE lower(k.key) <> ALL(allowed)       -- lowercase compare for case insensitivity
         );
$$;

COMMENT ON FUNCTION jsonb_only_locale_keys(jsonb, text[]) IS 'Validates that JSONB object contains only allowed locale keys from whitelist';

-- =====================================================
-- Step 2: Add constraints to advisors table
-- =====================================================

-- Validate multilingual_bio column
ALTER TABLE advisors
  ADD CONSTRAINT chk_multilingual_bio_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_bio, ARRAY['en','ar','fr','es','de'])) NOT VALID;

-- Validate multilingual_display_name column
ALTER TABLE advisors
  ADD CONSTRAINT chk_multilingual_display_name_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_display_name, ARRAY['en','ar','fr','es','de'])) NOT VALID;

-- =====================================================
-- Step 3: Add constraints to career tables (only existing ones)
-- =====================================================

-- Career categories (exists in schema)
ALTER TABLE career_categories
  ADD CONSTRAINT chk_career_categories_multilingual_name_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_name, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_categories
  ADD CONSTRAINT chk_career_categories_multilingual_description_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_description, ARRAY['en','ar','fr','es','de'])) NOT VALID;

-- Career companies (exists in schema)
ALTER TABLE career_companies
  ADD CONSTRAINT chk_career_companies_multilingual_name_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_name, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_companies
  ADD CONSTRAINT chk_career_companies_multilingual_description_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_description, ARRAY['en','ar','fr','es','de'])) NOT VALID;

-- Career jobs (exists in schema)
ALTER TABLE career_jobs
  ADD CONSTRAINT chk_career_jobs_multilingual_title_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_title, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_jobs
  ADD CONSTRAINT chk_career_jobs_multilingual_description_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_description, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_jobs
  ADD CONSTRAINT chk_career_jobs_multilingual_requirements_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_requirements, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_jobs
  ADD CONSTRAINT chk_career_jobs_multilingual_benefits_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_benefits, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_jobs
  ADD CONSTRAINT chk_career_jobs_multilingual_location_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_location, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_jobs
  ADD CONSTRAINT chk_career_jobs_multilingual_meta_description_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_meta_description, ARRAY['en','ar','fr','es','de'])) NOT VALID;

ALTER TABLE career_jobs
  ADD CONSTRAINT chk_career_jobs_multilingual_meta_keywords_known_keys
  CHECK (jsonb_only_locale_keys(multilingual_meta_keywords, ARRAY['en','ar','fr','es','de'])) NOT VALID;

-- =====================================================
-- Step 4: Clean up any existing invalid data
-- =====================================================

-- Log any rows that would violate constraints before cleaning
DO $$
DECLARE
    violation_count integer;
BEGIN
    -- Check for violations in advisors.multilingual_bio
    SELECT COUNT(*) INTO violation_count
    FROM advisors
    WHERE NOT jsonb_only_locale_keys(multilingual_bio, ARRAY['en','ar','fr','es','de']);

    IF violation_count > 0 THEN
        RAISE NOTICE 'Found % advisor rows with invalid multilingual_bio keys', violation_count;
    END IF;

    -- Check for violations in advisors.multilingual_display_name
    SELECT COUNT(*) INTO violation_count
    FROM advisors
    WHERE NOT jsonb_only_locale_keys(multilingual_display_name, ARRAY['en','ar','fr','es','de']);

    IF violation_count > 0 THEN
        RAISE NOTICE 'Found % advisor rows with invalid multilingual_display_name keys', violation_count;
    END IF;
END $$;

-- Clean up invalid keys (conservative approach: remove unknown keys rather than entire records)
-- Expert feedback: Handle NULL safely + lowercase normalization + guard empty results

UPDATE advisors
SET multilingual_bio = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_bio, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_bio IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_bio, ARRAY['en','ar','fr','es','de']);

UPDATE advisors
SET multilingual_display_name = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_display_name, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_display_name IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_display_name, ARRAY['en','ar','fr','es','de']);

-- Clean up career_categories
UPDATE career_categories
SET multilingual_name = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_name, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_name IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_name, ARRAY['en','ar','fr','es','de']);

UPDATE career_categories
SET multilingual_description = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_description, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_description IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_description, ARRAY['en','ar','fr','es','de']);

-- Clean up career_companies
UPDATE career_companies
SET multilingual_name = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_name, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_name IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_name, ARRAY['en','ar','fr','es','de']);

UPDATE career_companies
SET multilingual_description = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_description, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_description IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_description, ARRAY['en','ar','fr','es','de']);

-- Clean up career_jobs (multiple columns)
UPDATE career_jobs
SET multilingual_title = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_title, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_title IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_title, ARRAY['en','ar','fr','es','de']);

UPDATE career_jobs
SET multilingual_description = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_description, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_description IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_description, ARRAY['en','ar','fr','es','de']);

UPDATE career_jobs
SET multilingual_requirements = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_requirements, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_requirements IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_requirements, ARRAY['en','ar','fr','es','de']);

UPDATE career_jobs
SET multilingual_benefits = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_benefits, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_benefits IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_benefits, ARRAY['en','ar','fr','es','de']);

UPDATE career_jobs
SET multilingual_location = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_location, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_location IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_location, ARRAY['en','ar','fr','es','de']);

UPDATE career_jobs
SET multilingual_meta_description = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_meta_description, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_meta_description IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_meta_description, ARRAY['en','ar','fr','es','de']);

UPDATE career_jobs
SET multilingual_meta_keywords = COALESCE((
  SELECT jsonb_object_agg(lower(k), v)
  FROM jsonb_each(COALESCE(multilingual_meta_keywords, '{}'::jsonb)) AS t(k,v)
  WHERE lower(k) IN ('en','ar','fr','es','de')
), '{}'::jsonb)
WHERE multilingual_meta_keywords IS NOT NULL
  AND NOT jsonb_only_locale_keys(multilingual_meta_keywords, ARRAY['en','ar','fr','es','de']);

-- =====================================================
-- Step 5: Validate constraints (expert recommendation)
-- =====================================================

-- Now that data is cleaned, validate all constraints
-- This makes them active and enforced

-- Advisors table
ALTER TABLE advisors VALIDATE CONSTRAINT chk_multilingual_bio_known_keys;
ALTER TABLE advisors VALIDATE CONSTRAINT chk_multilingual_display_name_known_keys;

-- Career tables
ALTER TABLE career_categories VALIDATE CONSTRAINT chk_career_categories_multilingual_name_known_keys;
ALTER TABLE career_categories VALIDATE CONSTRAINT chk_career_categories_multilingual_description_known_keys;

ALTER TABLE career_companies VALIDATE CONSTRAINT chk_career_companies_multilingual_name_known_keys;
ALTER TABLE career_companies VALIDATE CONSTRAINT chk_career_companies_multilingual_description_known_keys;

ALTER TABLE career_jobs VALIDATE CONSTRAINT chk_career_jobs_multilingual_title_known_keys;
ALTER TABLE career_jobs VALIDATE CONSTRAINT chk_career_jobs_multilingual_description_known_keys;
ALTER TABLE career_jobs VALIDATE CONSTRAINT chk_career_jobs_multilingual_requirements_known_keys;
ALTER TABLE career_jobs VALIDATE CONSTRAINT chk_career_jobs_multilingual_benefits_known_keys;
ALTER TABLE career_jobs VALIDATE CONSTRAINT chk_career_jobs_multilingual_location_known_keys;
ALTER TABLE career_jobs VALIDATE CONSTRAINT chk_career_jobs_multilingual_meta_description_known_keys;
ALTER TABLE career_jobs VALIDATE CONSTRAINT chk_career_jobs_multilingual_meta_keywords_known_keys;

COMMIT;

-- =====================================================
-- Verification Queries (run after migration)
-- =====================================================

-- Test constraint by trying to insert invalid data (should fail)
-- INSERT INTO advisors (multilingual_bio) VALUES ('{"invalid": "test"}');

-- Verify constraint is working
-- SELECT conname, contype FROM pg_constraint WHERE conname LIKE '%known_keys%';

-- RAISE NOTICE '✅ Migration 086 completed: JSONB locale constraints added and validated';
-- RAISE NOTICE '✅ All multilingual JSONB columns now reject unknown locale keys';
-- RAISE NOTICE '✅ Supported locales: en, ar, fr, es, de';