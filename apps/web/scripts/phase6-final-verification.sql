-- 🔍 Phase 6: Final Security Verification
-- Comprehensive audit to confirm all security gaps are closed
-- Execute: psql -d your_db -f phase6-final-verification.sql

BEGIN;

-- =================================
-- COMPREHENSIVE SECURITY AUDIT
-- =================================

-- Create a final security summary
CREATE OR REPLACE VIEW security_implementation_summary AS
SELECT 
  'TABLES' as object_type,
  COUNT(*) as total_objects,
  COUNT(*) FILTER (WHERE relrowsecurity) as rls_enabled,
  COUNT(*) FILTER (WHERE relforcerowsecurity) as force_rls_enabled,
  COUNT(*) FILTER (WHERE NOT relrowsecurity) as needs_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'

UNION ALL

SELECT 
  'POLICIES' as object_type,
  COUNT(*) as total_objects,
  COUNT(DISTINCT schemaname || '.' || tablename) as tables_with_policies,
  COUNT(*) FILTER (WHERE cmd = 'ALL') as all_command_policies,
  0 as needs_rls
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT 
  'GRANTS' as object_type,
  COUNT(DISTINCT table_name) as total_objects,
  COUNT(DISTINCT table_name) FILTER (WHERE privilege_type = 'SELECT') as tables_with_select,
  COUNT(DISTINCT table_name) FILTER (WHERE privilege_type = 'INSERT') as tables_with_insert,
  0 as needs_rls
FROM information_schema.role_table_grants
WHERE grantee = 'authenticated' AND table_schema = 'public';

-- =================================
-- DETAILED TABLE SECURITY STATUS
-- =================================

-- Show security status for all tables
SELECT 
  'TABLE SECURITY STATUS' as report_section,
  c.relname as table_name,
  CASE WHEN c.relrowsecurity THEN '✅ ENABLED' ELSE '❌ MISSING' END as rls_status,
  CASE WHEN c.relforcerowsecurity THEN '🔒 FORCED' ELSE '⚠️  NORMAL' END as force_rls_status,
  COALESCE(p.policy_count, 0) as policies,
  CASE 
    WHEN NOT c.relrowsecurity THEN '🚨 NEEDS RLS'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) = 0 THEN '🚨 NEEDS POLICIES'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) > 0 AND NOT g.has_grants THEN '🚨 NEEDS GRANTS'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) > 0 AND g.has_grants AND c.relforcerowsecurity THEN '✅ SECURE'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) > 0 AND g.has_grants THEN '⚠️  SECURE (Consider FORCE RLS)'
    ELSE '❓ UNKNOWN'
  END as security_verdict
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT tablename, COUNT(*) as policy_count
  FROM pg_policies 
  WHERE schemaname = 'public'
  GROUP BY tablename
) p ON p.tablename = c.relname
LEFT JOIN (
  SELECT table_name, true as has_grants
  FROM information_schema.role_table_grants
  WHERE grantee = 'authenticated' AND table_schema = 'public'
  GROUP BY table_name
) g ON g.table_name = c.relname
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY 
  CASE 
    WHEN NOT c.relrowsecurity THEN 1
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) = 0 THEN 2
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) > 0 AND NOT g.has_grants THEN 3
    ELSE 4
  END,
  c.relname;

-- =================================
-- CRITICAL ISSUES SUMMARY
-- =================================

-- Count remaining critical issues
DO $$
DECLARE
  tables_without_rls integer;
  tables_without_policies integer; 
  tables_without_grants integer;
  total_issues integer;
BEGIN
  -- Count tables without RLS
  SELECT COUNT(*) INTO tables_without_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
  
  -- Count tables with RLS but no policies
  SELECT COUNT(*) INTO tables_without_policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
  ) p ON p.tablename = c.relname
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND p.tablename IS NULL;
  
  -- Count tables with policies but no grants
  SELECT COUNT(*) INTO tables_without_grants
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
  ) p ON p.tablename = c.relname
  LEFT JOIN (
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public'
    GROUP BY table_name
  ) g ON g.table_name = c.relname
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND g.table_name IS NULL;
  
  total_issues := tables_without_rls + tables_without_policies + tables_without_grants;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'SECURITY IMPLEMENTATION RESULTS:';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Tables without RLS: %', tables_without_rls;
  RAISE NOTICE 'Tables without Policies: %', tables_without_policies;
  RAISE NOTICE 'Tables without Grants: %', tables_without_grants;
  RAISE NOTICE '----------------------------------------';
  RAISE NOTICE 'TOTAL CRITICAL ISSUES: %', total_issues;
  
  IF total_issues = 0 THEN
    RAISE NOTICE '🎉 SUCCESS: All tables are properly secured!';
    RAISE NOTICE '✅ RLS enabled on all tables';
    RAISE NOTICE '✅ Policies created for all RLS tables';
    RAISE NOTICE '✅ Grants provided for all policy-protected tables';
  ELSE
    RAISE NOTICE '⚠️  WARNING: % critical security issues remain', total_issues;
    RAISE NOTICE 'Review the detailed report above and run additional security scripts';
  END IF;
  
  RAISE NOTICE '========================================';
  
  -- Log final results
  INSERT INTO public.security_audit_log (event_type, details, migration_version)
  VALUES (
      'phase6_final_verification_complete',
      jsonb_build_object(
          'tables_without_rls', tables_without_rls,
          'tables_without_policies', tables_without_policies,
          'tables_without_grants', tables_without_grants,
          'total_critical_issues', total_issues,
          'implementation_successful', total_issues = 0,
          'timestamp', now()
      ),
      'phase6_final_verification'
  );
END$$;

COMMIT;

-- =================================
-- RECOMMENDED NEXT STEPS
-- =================================

/*
If any critical issues remain after running all 5 phases:

1. Re-run the security_rls_audit view:
   SELECT * FROM public.security_rls_audit WHERE verdict LIKE 'NEEDS_ACTION:%';

2. Create targeted fixes for any remaining tables:
   - Use secure_user_table() for user-owned data
   - Use secure_project_table() for project-related data  
   - Use secure_admin_table() for system/admin data
   - Use secure_reference_table() for read-all reference data

3. Test critical application functions:
   - User registration/login
   - Project creation/access
   - Dashboard data loading
   - Payment/subscription operations

4. Monitor application logs for any remaining 42501 errors

5. Consider enabling FORCE RLS on additional tables for maximum security
*/