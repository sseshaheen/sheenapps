-- 🔍 Security Verification Script - Phase 1C
-- Comprehensive verification that selective privilege restoration worked securely
-- Run this after secure-rls-implementation.sql and selective-privilege-restoration.sql

-- =================================
-- SECURITY VERIFICATION CHECKS
-- =================================

-- Check 1: Verify NO privileges on vulnerable tables (critical security check)
SELECT 
  '🚨 CRITICAL SECURITY CHECK' as test_type,
  'Vulnerable tables should have NO privileges' as description,
  table_name,
  privilege_type,
  '⚠️  SECURITY VIOLATION: Vulnerable table has privileges!' as alert
FROM information_schema.table_privileges 
WHERE grantee = 'authenticated'
AND table_schema = 'public'
AND table_name IN (
  'admin_alerts', 'build_events_daily_stats', 'currencies', 'export_logs',
  'oauth_exchange_idempotency', 'oauth_state_nonces', 'plan_change_log',
  'quota_audit_log', 'quota_audit_logs', 'quota_rate_limits',
  'r2_cleanup_logs', 'storage_audit_log', 'user_bonuses', 'usage_events',
  'versioning_metrics', 'webhook_failures', 'worker_task_dependencies',
  'worker_task_plans', 'worker_tasks', 'supabase_account_discovery',
  'supabase_breakglass_recovery', 'supabase_connections'
);
-- 🎯 EXPECTED RESULT: NO ROWS (all vulnerable tables remain inaccessible)

-- Check 2: Count protected tables with privileges
SELECT 
  '✅ PRIVILEGE COUNT CHECK' as test_type,
  COUNT(*) as tables_with_privileges,
  '43+ tables should have privileges' as expected
FROM information_schema.table_privileges 
WHERE grantee = 'authenticated'
AND table_schema = 'public';

-- Check 3: Verify core user tables have both RLS AND privileges
SELECT 
  '🔒 CORE SECURITY CHECK' as test_type,
  t.tablename,
  t.rowsecurity as has_rls,
  CASE WHEN tp.table_name IS NOT NULL THEN true ELSE false END as has_privileges,
  CASE 
    WHEN t.rowsecurity AND tp.table_name IS NOT NULL THEN '✅ Secure + Accessible'
    WHEN t.rowsecurity AND tp.table_name IS NULL THEN '🔒 Secure but Inaccessible'
    WHEN NOT t.rowsecurity AND tp.table_name IS NOT NULL THEN '🚨 VULNERABLE + Accessible'
    ELSE '🔒 Secure (No Access)'
  END as security_status
FROM pg_tables t
LEFT JOIN (
  SELECT DISTINCT table_name 
  FROM information_schema.table_privileges 
  WHERE grantee = 'authenticated' AND table_schema = 'public'
) tp ON t.tablename = tp.table_name
WHERE t.schemaname = 'public'
AND t.tablename IN ('projects', 'project_versions', 'organizations', 'customers')
ORDER BY t.tablename;

-- Check 4: RLS policy verification  
SELECT 
  '📋 POLICY VERIFICATION' as test_type,
  schemaname,
  tablename,
  COUNT(*) as policy_count,
  string_agg(policyname, ', ') as policy_names
FROM pg_policies 
WHERE schemaname = 'public'
AND tablename IN ('projects', 'project_versions', 'project_chat_log_minimal', 'unified_chat_sessions')
GROUP BY schemaname, tablename
ORDER BY tablename;

-- Check 5: Comprehensive table security status
SELECT 
  '📊 SECURITY OVERVIEW' as test_type,
  COUNT(*) FILTER (WHERE rowsecurity = true) as rls_enabled_tables,
  COUNT(*) FILTER (WHERE rowsecurity = false) as no_rls_tables,
  COUNT(*) as total_tables,
  ROUND(
    COUNT(*) FILTER (WHERE rowsecurity = true) * 100.0 / COUNT(*), 
    1
  ) as rls_coverage_percentage
FROM pg_tables 
WHERE schemaname = 'public';

-- Check 6: Privilege distribution
SELECT 
  '🔑 PRIVILEGE DISTRIBUTION' as test_type,
  privilege_type,
  COUNT(*) as table_count
FROM information_schema.table_privileges 
WHERE grantee = 'authenticated' 
AND table_schema = 'public'
GROUP BY privilege_type
ORDER BY privilege_type;

-- Check 7: Sequence and function access
SELECT 
  '⚙️  SYSTEM PRIVILEGES' as test_type,
  'Sequences' as object_type,
  COUNT(*) as accessible_count
FROM information_schema.usage_privileges 
WHERE grantee = 'authenticated'
AND object_schema = 'public'
AND object_type = 'SEQUENCE'
UNION ALL
SELECT 
  '⚙️  SYSTEM PRIVILEGES' as test_type,
  'Functions' as object_type,
  COUNT(*) as accessible_count
FROM information_schema.routine_privileges 
WHERE grantee = 'authenticated'
AND routine_schema = 'public';

-- Check 8: Debug function verification
SELECT 
  '🔧 DEBUG TOOLS' as test_type,
  routine_name,
  routine_type,
  'Debug function available' as status
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_name = 'debug_auth_context';

-- =================================
-- SECURITY SUMMARY REPORT
-- =================================

SELECT 
  '📋 SECURITY IMPLEMENTATION SUMMARY' as report_section,
  'Phase 1A + 1B Complete' as implementation_status,
  (
    SELECT COUNT(*) FROM pg_tables t
    JOIN information_schema.table_privileges tp 
      ON t.tablename = tp.table_name 
      AND tp.grantee = 'authenticated' 
      AND tp.table_schema = 'public'
    WHERE t.schemaname = 'public' 
    AND t.rowsecurity = true
  ) as secure_accessible_tables,
  (
    SELECT COUNT(*) FROM information_schema.table_privileges 
    WHERE grantee = 'authenticated' 
    AND table_schema = 'public'
  ) as total_accessible_tables,
  (
    SELECT COUNT(*) FROM pg_tables 
    WHERE schemaname = 'public' 
    AND rowsecurity = false
  ) as protected_inaccessible_tables;

-- =================================
-- EXPECTED VERIFICATION RESULTS
-- =================================

/*
✅ SUCCESSFUL IMPLEMENTATION SHOULD SHOW:

1. 🚨 CRITICAL SECURITY CHECK: 0 rows (no vulnerable tables have privileges)
2. ✅ PRIVILEGE COUNT: ~43 tables with privileges  
3. 🔒 CORE SECURITY: All core tables show "✅ Secure + Accessible"
4. 📋 POLICY VERIFICATION: Policies exist on critical user tables
5. 📊 SECURITY OVERVIEW: ~37% RLS coverage (26-30 tables out of 70+ total)
6. 🔑 PRIVILEGE DISTRIBUTION: SELECT, INSERT, UPDATE, DELETE on ~43 tables
7. ⚙️  SYSTEM PRIVILEGES: Access to sequences and functions
8. 🔧 DEBUG TOOLS: debug_auth_context function exists

🎯 CORE FUNCTIONALITY TEST:
After this verification passes, test:
- /api/projects/[id]/status should return 200 or 404 (not 403)
- Users should only see their own projects and data
- No access to other users' chat logs, prompts, or sensitive data
*/