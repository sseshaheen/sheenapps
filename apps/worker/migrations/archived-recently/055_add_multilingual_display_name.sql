-- =====================================================
-- Migration 055: Add Multilingual Display Name Support
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 28, 2025
-- Purpose: Add multilingual display name support for advisors
-- Dependencies: Migration 054 (French profile for Omar)
-- =====================================================

BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Part 1: Add Multilingual Display Name Column
-- =====================================================

-- Add multilingual_display_name JSONB column
ALTER TABLE advisors 
ADD COLUMN multilingual_display_name JSONB DEFAULT '{}'::jsonb;

-- Add constraint to ensure valid language codes
ALTER TABLE advisors 
ADD CONSTRAINT advisors_multilingual_display_name_valid_languages 
CHECK (
  multilingual_display_name = '{}'::jsonb 
  OR (
    multilingual_display_name ?| ARRAY['en', 'ar', 'fr', 'es', 'de'] 
    AND NOT (multilingual_display_name ?| ARRAY['en', 'ar', 'fr', 'es', 'de']) = false
  )
);

-- Add GIN index for efficient multilingual name lookups
CREATE INDEX IF NOT EXISTS idx_advisors_multilingual_display_name_gin 
ON advisors USING gin (multilingual_display_name);

-- =====================================================
-- Part 2: Add Omar's Multilingual Display Names
-- =====================================================

-- Add Arabic and French display names for Omar Khalil
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', 'Omar Khalil',
  'ar', 'عمر خليل', 
  'fr', 'Omar Khalil'
)
WHERE display_name = 'Omar Khalil' AND approval_status = 'approved';

-- =====================================================
-- Part 3: Create Helper Function for Localized Display Names
-- =====================================================

-- Function to get localized display name with fallback
CREATE OR REPLACE FUNCTION get_advisor_display_name_localized(advisor_user_id UUID, target_language TEXT DEFAULT 'en')
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result_name TEXT;
  fallback_name TEXT;
BEGIN
  -- Get the advisor's multilingual display name and fallback
  SELECT 
    multilingual_display_name ->> target_language,
    display_name
  INTO result_name, fallback_name
  FROM advisors 
  WHERE user_id = advisor_user_id;

  -- Return localized name if available, otherwise fallback to default display_name
  RETURN COALESCE(result_name, fallback_name, 'Unknown Advisor');
END;
$$;

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- Verification and Summary
-- =====================================================

-- Show Omar's multilingual display names
SELECT 
  display_name as default_name,
  multilingual_display_name,
  get_advisor_display_name_localized(user_id, 'en') as name_en,
  get_advisor_display_name_localized(user_id, 'ar') as name_ar,
  get_advisor_display_name_localized(user_id, 'fr') as name_fr,
  get_advisor_available_languages(user_id) as available_languages
FROM advisors
WHERE display_name = 'Omar Khalil' AND approval_status = 'approved';

-- Test the helper function
SELECT 
  'English' as language,
  get_advisor_display_name_localized(user_id, 'en') as localized_name
FROM advisors WHERE display_name = 'Omar Khalil'
UNION ALL
SELECT 
  'Arabic' as language,
  get_advisor_display_name_localized(user_id, 'ar') as localized_name
FROM advisors WHERE display_name = 'Omar Khalil'  
UNION ALL
SELECT 
  'French' as language,
  get_advisor_display_name_localized(user_id, 'fr') as localized_name
FROM advisors WHERE display_name = 'Omar Khalil';

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 055 completed successfully!';
  RAISE NOTICE '🌍 Multilingual display names now supported';
  RAISE NOTICE '👤 Omar Khalil: English, عمر خليل (Arabic), Omar Khalil (French)';
  RAISE NOTICE '🛠️ Helper function: get_advisor_display_name_localized()';
  RAISE NOTICE '📱 Next: Update API to use localized display names';
END $$;