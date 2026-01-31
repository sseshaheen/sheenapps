-- 🔍 Pre-Flight RLS Security Check
-- Verify RLS coverage before restoring privileges
-- This ensures no tables will be exposed when we grant privileges

-- Check which public tables have RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity,
  CASE 
    WHEN rowsecurity THEN '✅ Protected'
    ELSE '🚨 VULNERABLE - No RLS!'
  END as status
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check for tables that should have RLS but don't
SELECT 
  'Security Gap Analysis' as check_type,
  tablename,
  '🚨 USER TABLE WITHOUT RLS' as risk
FROM pg_tables 
WHERE schemaname = 'public'
AND tablename IN (
  'projects', 'project_versions', 'files', 'assets', 
  'organizations', 'organization_members', 'ab_tests',
  'subscription_history', 'user_quotas', 'referrals'
)
AND rowsecurity = false;

-- Count existing policies
SELECT 
  schemaname,
  tablename,
  COUNT(*) as policy_count,
  string_agg(policyname, ', ') as policy_names
FROM pg_policies 
WHERE schemaname = 'public'
GROUP BY schemaname, tablename
ORDER BY tablename;

-- Check specifically for projects table (our test case)
SELECT 
  'projects table check' as analysis,
  EXISTS(
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'projects' 
    AND rowsecurity = true
  ) as has_rls,
  (
    SELECT COUNT(*) FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'projects'
  ) as policy_count;

-- Show current privileges for authenticated role (should be empty after lockdown)
SELECT 
  table_schema,
  table_name,
  privilege_type,
  'Current privilege that should not exist' as warning
FROM information_schema.table_privileges 
WHERE grantee = 'authenticated'
AND table_schema = 'public';