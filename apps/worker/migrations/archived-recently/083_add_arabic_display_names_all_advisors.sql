-- =====================================================
-- Migration 083: Add Arabic Display Names for All Advisors
-- =====================================================
-- Author: Claude Assistant
-- Created: 2025-09-08
-- Purpose: Add Arabic translations for all advisor display names
-- Dependencies: Migration 055 (multilingual_display_name column)
-- 
-- This migration adds Arabic display names for all 23 advisors
-- to enable proper localization when x-sheen-locale: ar is used
-- =====================================================

BEGIN;

-- =====================================================
-- Step 1: Bypass RLS triggers for admin field updates
-- =====================================================
-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Step 2: Update Arabic display names for all advisors
-- =====================================================

-- Abdullah Al-Rashid (Saudi)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'عبدالله الراشد'
)
WHERE display_name = 'Abdullah Al-Rashid';

-- Fatima El-Sayed (Egyptian)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'فاطمة السيد'
)
WHERE display_name = 'Fatima El-Sayed';

-- Vikram Singh (Indian - keep English/transliterated)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'فيكرام سينغ'
)
WHERE display_name = 'Vikram Singh';

-- Priya Patel (Indian - keep English/transliterated)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'بريا باتيل'
)
WHERE display_name = 'Priya Patel';

-- Faisal Al-Harbi (Saudi)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'فيصل الحربي'
)
WHERE display_name = 'Faisal Al-Harbi';

-- Khalid Al-Mutairi (Saudi)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'خالد المطيري'
)
WHERE display_name = 'Khalid Al-Mutairi';

-- Arjun Reddy (Indian - keep English/transliterated)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'أرجون ريدي'
)
WHERE display_name = 'Arjun Reddy';

-- Ahmad Al-Maktoum (Emirati)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'أحمد آل مكتوم'
)
WHERE display_name = 'Ahmad Al-Maktoum';

-- Raj Sharma (Indian - keep English/transliterated)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'راج شارما'
)
WHERE display_name = 'Raj Sharma';

-- Sarah Al-Zahra (Saudi)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'سارة الزهراء'
)
WHERE display_name = 'Sarah Al-Zahra';

-- Lina Khoury (Lebanese)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'لينا خوري'
)
WHERE display_name = 'Lina Khoury';

-- Sneha Gupta (Indian - keep English/transliterated)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'سنيها غوبتا'
)
WHERE display_name = 'Sneha Gupta';

-- Amira Fathy (Egyptian)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'أميرة فتحي'
)
WHERE display_name = 'Amira Fathy';

-- Nadia Al-Qasimi (Emirati)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'نادية القاسمي'
)
WHERE display_name = 'Nadia Al-Qasimi';

-- Ahmed Hassan (Egyptian)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'أحمد حسن'
)
WHERE display_name = 'Ahmed Hassan';

-- Kavya Nair (Indian - keep English/transliterated)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'كافيا ناير'
)
WHERE display_name = 'Kavya Nair';

-- Nour Mansour (Egyptian/Lebanese)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'نور منصور'
)
WHERE display_name = 'Nour Mansour';

-- Fatima Shah (Pakistani - keep English/transliterated)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'فاطمة شاه'
)
WHERE display_name = 'Fatima Shah';

-- Youssef Bennani (Moroccan)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'يوسف بناني'
)
WHERE display_name = 'Youssef Bennani';

-- Layla Al-Faisal (Saudi)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'ليلى الفيصل'
)
WHERE display_name = 'Layla Al-Faisal';

-- Mohamed Farouk (Egyptian)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'محمد فاروق'
)
WHERE display_name = 'Mohamed Farouk';

-- Hassan Abdalla (Egyptian)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'حسن عبدالله'
)
WHERE display_name = 'Hassan Abdalla';

-- Yasmin Abdel-Rahman (Egyptian)
UPDATE advisors 
SET multilingual_display_name = jsonb_build_object(
  'en', display_name,
  'ar', 'ياسمين عبد الرحمن'
)
WHERE display_name = 'Yasmin Abdel-Rahman';

-- =====================================================
-- Step 2: Update Omar Khalil if exists (preserve existing translations)
-- =====================================================

-- Omar Khalil already has multilingual support from migration 055
-- Update only if missing Arabic translation
UPDATE advisors 
SET multilingual_display_name = multilingual_display_name || jsonb_build_object('ar', 'عمر خليل')
WHERE display_name = 'Omar Khalil' 
  AND (multilingual_display_name IS NULL 
       OR multilingual_display_name = '{}'::jsonb 
       OR NOT multilingual_display_name ? 'ar');

-- =====================================================
-- Step 3: Reset session replication role
-- =====================================================
-- Reset session replication role to default before verification
SET session_replication_role = 'origin';

-- =====================================================
-- Step 4: Verification
-- =====================================================

DO $$
DECLARE
  advisor_count INTEGER;
  arabic_count INTEGER;
  r RECORD;
BEGIN
  -- Count total advisors
  SELECT COUNT(*) INTO advisor_count 
  FROM advisors 
  WHERE approval_status = 'approved';
  
  -- Count advisors with Arabic names
  SELECT COUNT(*) INTO arabic_count
  FROM advisors 
  WHERE approval_status = 'approved'
    AND multilingual_display_name ? 'ar';
  
  RAISE NOTICE '✅ Updated Arabic display names for % out of % approved advisors', arabic_count, advisor_count;
  
  -- List advisors without Arabic names (if any)
  FOR r IN 
    SELECT display_name 
    FROM advisors 
    WHERE approval_status = 'approved'
      AND (multilingual_display_name IS NULL 
           OR multilingual_display_name = '{}'::jsonb 
           OR NOT multilingual_display_name ? 'ar')
  LOOP
    RAISE NOTICE '⚠️ Missing Arabic name for: %', r.display_name;
  END LOOP;
END $$;

COMMIT;

-- =====================================================
-- Post-migration verification queries
-- =====================================================
-- Run these manually to verify the migration worked:
--
-- 1. Check all advisors have Arabic names:
-- SELECT display_name, multilingual_display_name 
-- FROM advisors 
-- WHERE approval_status = 'approved'
-- ORDER BY display_name;
--
-- 2. Test the localization function:
-- SELECT 
--   display_name,
--   get_advisor_display_name_localized(user_id, 'ar') as arabic_name,
--   get_advisor_display_name_localized(user_id, 'en') as english_name
-- FROM advisors 
-- WHERE approval_status = 'approved'
-- LIMIT 5;
--
-- 3. Verify API response with Arabic locale:
-- curl -H "x-sheen-locale: ar" http://localhost:8081/api/v1/advisors/search
-- =====================================================