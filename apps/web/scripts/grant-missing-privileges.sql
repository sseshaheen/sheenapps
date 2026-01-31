-- 🔑 Grant Missing Privileges for Policy-Protected Tables
-- Fix tables that have RLS policies but lack base privileges for authenticated role

BEGIN;

-- =================================
-- CRITICAL: Grant privileges to tables with policies but no grants
-- =================================

-- These tables have RLS + policies but the dynamic granting missed them
-- because they weren't accessible when the script ran

-- FORCE RLS tables that need privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_session_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_build_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_plan_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_deployment_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_error_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_integrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_metrics_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_consumption_metadata TO authenticated;

-- Critical collaboration table
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;

-- =================================
-- VERIFICATION: Show what we just granted
-- =================================

SELECT 
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) as granted_privileges
FROM information_schema.role_table_grants 
WHERE grantee = 'authenticated' 
AND table_schema = 'public'
AND table_name IN (
  'project_ai_session_metrics',
  'project_build_metrics', 
  'project_chat_plan_sessions',
  'project_deployment_metrics',
  'project_error_metrics',
  'project_integrations',
  'project_metrics_summary',
  'user_ai_consumption_metadata',
  'project_collaborators'
)
GROUP BY table_name
ORDER BY table_name;

-- =================================
-- AUDIT LOG
-- =================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'missing_privileges_granted',
    jsonb_build_object(
        'action', 'granted_privileges_to_policy_protected_tables',
        'tables_fixed', array[
          'project_ai_session_metrics',
          'project_build_metrics', 
          'project_chat_plan_sessions',
          'project_deployment_metrics',
          'project_error_metrics',
          'project_integrations',
          'project_metrics_summary',
          'user_ai_consumption_metadata',
          'project_collaborators'
        ],
        'privileges_granted', 'SELECT, INSERT, UPDATE, DELETE',
        'reason', 'dynamic_granting_missed_inaccessible_tables',
        'timestamp', now()
    ),
    '029_missing_privileges_fix'
);

COMMIT;

-- =================================
-- POST-EXECUTION SUMMARY
-- =================================

-- Fixed 9 critical tables that had RLS policies but no base privileges:
-- ✅ project_ai_session_metrics (FORCE RLS + policies + NOW privileges)
-- ✅ project_build_metrics (FORCE RLS + policies + NOW privileges)  
-- ✅ project_chat_plan_sessions (FORCE RLS + policies + NOW privileges)
-- ✅ project_deployment_metrics (FORCE RLS + policies + NOW privileges)
-- ✅ project_error_metrics (FORCE RLS + policies + NOW privileges)
-- ✅ project_integrations (FORCE RLS + policies + NOW privileges)
-- ✅ project_metrics_summary (FORCE RLS + policies + NOW privileges)
-- ✅ user_ai_consumption_metadata (FORCE RLS + policies + NOW privileges)
-- ✅ project_collaborators (RLS + policies + NOW privileges) - CRITICAL for collaboration
--
-- These tables should now be fully functional with proper access control:
-- - Base privileges allow queries to reach RLS layer
-- - RLS policies enforce user/project-based restrictions
-- - FORCE RLS prevents bypassing security
--
-- Next: Test core functionality - should work perfectly now!