-- Quick Admin Voice Analytics Permissions Setup
-- Run this in Supabase SQL Editor

-- Step 1: Set database-level admin emails setting (if not already set)
-- This makes these emails have admin access
ALTER DATABASE postgres SET app.admin_emails = 'admindev@sheenapps.com,shaheer@sheenapps.com,sh@sheenapps.com';

-- Step 2: For users with app_metadata support (Supabase Auth proper table)
-- Note: auth.users might not have raw_app_meta_data or app_metadata columns exposed
-- This is expected - permissions are managed via the admin login flow

-- Step 3: Quick workaround - Just login to the admin panel!
-- The worker will automatically grant 'admin:*' wildcard permission when you login
-- See this code in worker src/routes/adminAuth.ts:
--   admin_permissions: fullUserData.user.app_metadata?.admin_permissions || ['admin:*']
--
-- This means: If your email is in ADMIN_EMAILS, you get admin:* by default!
-- The admin:* wildcard includes voice_analytics.* automatically!

-- Step 4: Verify your admin email is in the system
SELECT
  id,
  email,
  created_at,
  CASE
    WHEN email IN ('admindev@sheenapps.com', 'shaheer@sheenapps.com', 'sh@sheenapps.com')
    THEN 'YES - You have admin access with admin:* wildcard'
    ELSE 'NO - Not in admin email list'
  END as admin_status
FROM auth.users
WHERE email IN ('admindev@sheenapps.com', 'shaheer@sheenapps.com', 'sh@sheenapps.com');

-- ============================================================================
-- THAT'S IT! You already have access via the admin:* wildcard!
-- ============================================================================
--
-- Just:
-- 1. Logout of admin panel
-- 2. Login again (to get fresh JWT with admin:* permission)
-- 3. Navigate to /admin/voice-analytics
-- 4. It should work!
--
-- The admin:* wildcard matches:
-- - voice_analytics.read ✅
-- - voice_analytics.audio ✅
-- - voice_analytics.* ✅
-- - everything else ✅
