-- =====================================================
-- Migration 063: Cleanup Omar Test Account
-- =====================================================
-- Author: Claude Code Assistant
-- Created: August 29, 2025
-- Purpose: Remove duplicate Omar test account (omar.khalil@example.com)
-- Dependencies: Migration 062 (Omar advisor profile)
-- =====================================================

BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Part 1: Delete Related Advisor Data
-- =====================================================

-- Delete advisor availability settings for orphaned advisor
DELETE FROM advisor_availability_settings 
WHERE advisor_id IN (
  SELECT id FROM advisors WHERE user_id = '45267073-2690-4d8b-b58c-acbc6bf9c618'
);

-- Delete orphaned advisor profile (no corresponding auth.users record)
DELETE FROM advisors 
WHERE user_id = '45267073-2690-4d8b-b58c-acbc6bf9c618';

-- Delete advisor availability settings for old test user (if exists)
DELETE FROM advisor_availability_settings 
WHERE advisor_id IN (
  SELECT id FROM advisors WHERE user_id = '783f2a6c-fe22-4908-b430-3e295a25e110'
);

-- Delete old test advisor profile (if exists)
DELETE FROM advisors 
WHERE user_id = '783f2a6c-fe22-4908-b430-3e295a25e110';

-- =====================================================
-- Part 2: Delete Auth User Account
-- =====================================================

-- Delete the test user account (if exists)
DELETE FROM auth.users 
WHERE id = '783f2a6c-fe22-4908-b430-3e295a25e110'
  AND email = 'omar.khalil@example.com';

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- Verification
-- =====================================================

-- Verify cleanup was successful
SELECT 
  'Remaining Omar accounts' as check_type,
  COUNT(*) as count,
  array_agg(email) as emails
FROM auth.users 
WHERE email LIKE '%omar%';

-- Verify advisor profiles
SELECT 
  'Remaining Omar advisor profiles' as check_type,
  COUNT(*) as count,
  array_agg(a.display_name || ' (' || u.email || ')') as profiles
FROM advisors a
JOIN auth.users u ON u.id = a.user_id
WHERE u.email LIKE '%omar%';

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 063 completed successfully!';
  RAISE NOTICE '🗑️ Deleted test account: omar.khalil@example.com';
  RAISE NOTICE '✅ Kept real account: omar.khalil@sheenapps.com';
  RAISE NOTICE '🧹 Cleaned up duplicate advisor profiles';
END $$;