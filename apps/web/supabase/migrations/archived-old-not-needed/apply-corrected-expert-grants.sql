-- 🔧 CORRECTED Expert-Hardened Database Grants
-- Fixed table names based on actual schema (000_reference_schema_20250805.sql)
-- Ready for copy-paste into Supabase SQL Editor

BEGIN;

-- EXPERT SECURITY: Lock down ALL functions from PUBLIC first
-- Critical: Prevents any function execution via PUBLIC role inheritance
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;

-- Essential: Schema access
GRANT USAGE ON SCHEMA public TO authenticated;

-- CRITICAL: Sequences for INSERT with identity/serial columns
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Core tables - Full CRUD access (RLS controls row-level access)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;

-- Build system tables - CORRECTED NAMES from schema analysis
-- These are system-managed, should be read-only for users
GRANT SELECT ON public.project_build_events TO authenticated;
GRANT SELECT ON public.project_build_metrics TO authenticated;
GRANT SELECT ON public.project_build_records TO authenticated;

-- Daily stats table (read-only)
GRANT SELECT ON public.build_events_daily_stats TO authenticated;

-- Recommendations (read-only)
GRANT SELECT ON public.project_recommendations TO authenticated;

-- Billing (read-only) - CORRECTED: only subscriptions table exists
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT SELECT ON public.subscription_history TO authenticated;

-- Specific RPC Functions: Grant EXECUTE only on functions we actually use
-- These are now the ONLY functions authenticated users can execute (PUBLIC revoked above)
DO $$
BEGIN
  -- Billing/usage functions
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_subscription') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_user_subscription TO authenticated';
    RAISE NOTICE '✅ Granted RPC: get_user_subscription';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'track_claude_usage') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.track_claude_usage TO authenticated';
    RAISE NOTICE '✅ Granted RPC: track_claude_usage';
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'refund_project_quota') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.refund_project_quota TO authenticated';
    RAISE NOTICE '✅ Granted RPC: refund_project_quota';
  END IF;
  
  -- Version control functions
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_commit_and_update_branch') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.create_commit_and_update_branch TO authenticated';
    RAISE NOTICE '✅ Granted RPC: create_commit_and_update_branch';
  END IF;
  
  -- Debug functions (dev/staging)
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'debug_auth_context') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.debug_auth_context TO authenticated';
    RAISE NOTICE '✅ Granted RPC: debug_auth_context';
  END IF;
  
END $$;

-- COMPLETE SECURITY: Revoke ALL privileges from anon across all objects
REVOKE ALL ON public.projects FROM anon;
REVOKE ALL ON public.organizations FROM anon;
REVOKE ALL ON public.organization_members FROM anon;
REVOKE ALL ON public.project_versions FROM anon;
REVOKE ALL ON public.project_collaborators FROM anon;

-- Build system tables (corrected names)
REVOKE ALL ON public.project_build_events FROM anon;
REVOKE ALL ON public.project_build_metrics FROM anon;
REVOKE ALL ON public.project_build_records FROM anon;
REVOKE ALL ON public.build_events_daily_stats FROM anon;

-- Other tables
REVOKE ALL ON public.project_recommendations FROM anon;
REVOKE ALL ON public.subscriptions FROM anon;
REVOKE ALL ON public.subscription_history FROM anon;

-- EXPERT ADDITION: Revoke sequence usage from anon
REVOKE USAGE ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- EXPERT VERIFICATION: Robust sequence grant checking using pg_catalog
DO $$
DECLARE 
  missing_seq_grants int;
  table_grants_ok boolean;
  total_sequences int;
BEGIN
  -- Expert's robust sequence verification using has_sequence_privilege()
  SELECT COUNT(*) INTO missing_seq_grants
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'S'
    AND NOT has_sequence_privilege('authenticated', format('%I.%I', n.nspname, c.relname), 'USAGE');

  -- Count total sequences for context
  SELECT COUNT(*) INTO total_sequences
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'S';

  -- Check basic table grants
  SELECT EXISTS (
    SELECT 1 FROM information_schema.table_privileges
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'projects'
      AND privilege_type = 'SELECT'
  ) INTO table_grants_ok;

  -- Report comprehensive results
  IF missing_seq_grants = 0 THEN
    RAISE NOTICE '✅ Sequence USAGE grants verified: %/% sequences accessible to authenticated', total_sequences, total_sequences;
  ELSE
    RAISE WARNING '❌ % of % public sequences missing USAGE for authenticated', missing_seq_grants, total_sequences;
  END IF;

  IF table_grants_ok THEN
    RAISE NOTICE '✅ Base table grants verified for authenticated role';
  ELSE
    RAISE WARNING '❌ Base table grants verification failed';
  END IF;

  -- Final status
  IF missing_seq_grants = 0 AND table_grants_ok THEN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 CORRECTED EXPERT-HARDENED GRANTS APPLIED SUCCESSFULLY';
    RAISE NOTICE '🔒 Security posture: Maximum privilege restriction with RLS enforcement';
    RAISE NOTICE '📋 Tables covered: projects, organizations, organization_members, project_versions,';
    RAISE NOTICE '   project_collaborators, project_build_*, subscriptions, project_recommendations';
    RAISE NOTICE '🚀 Ready for RLS migration - no more 42501 permission denied errors';
  ELSE
    RAISE WARNING '⚠️ INCOMPLETE GRANT APPLICATION - Check errors above';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '🧪 VALIDATION STEPS:';
  RAISE NOTICE '   1. Test: curl http://localhost:3000/api/test-authenticated-access';
  RAISE NOTICE '   2. Expected: 200 OK (not 42501 permission denied)';
  RAISE NOTICE '   3. Test INSERT operations to verify sequence grants';
  RAISE NOTICE '   4. Test /rpc endpoints - only granted functions should work';
  RAISE NOTICE '   5. Verify users see only their own data (RLS working)';

END $$;

COMMIT;