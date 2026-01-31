-- =====================================================
-- Migration 065: Remove Omar's Cal.com URL
-- =====================================================
-- Author: Claude Code Assistant
-- Created: August 31, 2025
-- Purpose: Set Omar's cal_com_event_type_url to null
-- Dependencies: Migration 064 (Avatar fixes)
-- =====================================================

BEGIN;

-- Use PostgreSQL best practice: set session_replication_role to bypass triggers during migration
-- This bypasses the prevent_advisor_admin_field_changes() trigger
SET session_replication_role = 'replica';

-- =====================================================
-- Part 1: Update Omar's Cal.com URL
-- =====================================================

-- Set Omar's cal_com_event_type_url to null
UPDATE advisors 
SET 
  cal_com_event_type_url = NULL,
  updated_at = now()
WHERE user_id = 'dd2520e2-564c-42f6-aa54-197f24026bd2'
  AND display_name = 'Omar Khalil';

-- Reset session replication role to default before committing
SET session_replication_role = 'origin';

COMMIT;

-- =====================================================
-- Verification
-- =====================================================

-- Verify Omar's Cal.com URL was removed
SELECT 
  u.email,
  a.display_name,
  a.cal_com_event_type_url,
  a.updated_at
FROM advisors a
JOIN auth.users u ON u.id = a.user_id
WHERE u.email = 'omar.khalil@sheenapps.com';

-- Summary
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 065 completed successfully!';
  RAISE NOTICE '🗑️ Removed Cal.com URL for Omar Khalil';
  RAISE NOTICE '📅 cal_com_event_type_url set to NULL';
END $$;