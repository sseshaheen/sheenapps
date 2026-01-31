-- =====================================================
-- Migration 060: Localized Language Names Function
-- =====================================================
-- Author: Claude Code Assistant  
-- Created: August 29, 2025
-- Purpose: Add function to get localized language names for advisor dashboard
-- Dependencies: Migration 059 (Dashboard performance indexes)
-- =====================================================

BEGIN;

-- =====================================================
-- Part 1: Language Name Localization Mapping
-- =====================================================

-- Create function to get localized language names
CREATE OR REPLACE FUNCTION get_localized_language_name(
  language_code VARCHAR(5),
  target_locale VARCHAR(5) DEFAULT 'en'
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Return localized language names based on target locale
  CASE target_locale
    WHEN 'ar' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'العربية'
        WHEN 'en' THEN 'الإنجليزية'  
        WHEN 'fr' THEN 'الفرنسية'
        WHEN 'es' THEN 'الإسبانية'
        WHEN 'de' THEN 'الألمانية'
        ELSE language_code
      END;
    WHEN 'fr' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'Arabe'
        WHEN 'en' THEN 'Anglais'
        WHEN 'fr' THEN 'Français'
        WHEN 'es' THEN 'Espagnol'
        WHEN 'de' THEN 'Allemand'
        ELSE language_code
      END;
    WHEN 'es' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'Árabe'
        WHEN 'en' THEN 'Inglés'
        WHEN 'fr' THEN 'Francés'
        WHEN 'es' THEN 'Español'
        WHEN 'de' THEN 'Alemán'
        ELSE language_code
      END;
    WHEN 'de' THEN
      RETURN CASE language_code
        WHEN 'ar' THEN 'Arabisch'
        WHEN 'en' THEN 'Englisch'
        WHEN 'fr' THEN 'Französisch'
        WHEN 'es' THEN 'Spanisch'
        WHEN 'de' THEN 'Deutsch'
        ELSE language_code
      END;
    ELSE -- Default to English
      RETURN CASE language_code
        WHEN 'ar' THEN 'Arabic'
        WHEN 'en' THEN 'English'
        WHEN 'fr' THEN 'French'
        WHEN 'es' THEN 'Spanish'
        WHEN 'de' THEN 'German'
        ELSE language_code
      END;
  END CASE;
END;
$$;

-- =====================================================
-- Part 2: Enhanced Available Languages Function  
-- =====================================================

-- Create function to get advisor's available languages with localized names
CREATE OR REPLACE FUNCTION get_advisor_available_languages_localized(
  advisor_user_id UUID,
  target_locale VARCHAR(5) DEFAULT 'en'
)
RETURNS TABLE (
  language_code VARCHAR(5),
  language_name TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  lang VARCHAR(5);
BEGIN
  -- Get available language codes first
  FOR lang IN 
    SELECT unnest(get_advisor_available_languages(advisor_user_id))
  LOOP
    RETURN QUERY SELECT 
      lang as language_code,
      get_localized_language_name(lang, target_locale) as language_name;
  END LOOP;
END;
$$;

COMMIT;

-- =====================================================
-- Verification and Examples
-- =====================================================

-- Test localized language names in different locales
SELECT 'English UI' as context, language_code, language_name
FROM get_advisor_available_languages_localized(
  (SELECT user_id FROM advisors WHERE display_name = 'Omar Khalil' LIMIT 1),
  'en'
)
UNION ALL
SELECT 'Arabic UI' as context, language_code, language_name  
FROM get_advisor_available_languages_localized(
  (SELECT user_id FROM advisors WHERE display_name = 'Omar Khalil' LIMIT 1),
  'ar'
)
UNION ALL
SELECT 'French UI' as context, language_code, language_name
FROM get_advisor_available_languages_localized(
  (SELECT user_id FROM advisors WHERE display_name = 'Omar Khalil' LIMIT 1),
  'fr'
);

-- Test individual language name function
SELECT 
  'ar' as code, 
  get_localized_language_name('ar', 'en') as english_name,
  get_localized_language_name('ar', 'ar') as arabic_name,
  get_localized_language_name('ar', 'fr') as french_name;

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 060 completed successfully!';
  RAISE NOTICE '🌍 Localized language names now supported';  
  RAISE NOTICE '📱 Use get_advisor_available_languages_localized() in dashboard APIs';
  RAISE NOTICE '🎯 Example: Omar speaks العربية, الإنجليزية, الفرنسية in Arabic UI';
END $$;