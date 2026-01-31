-- 🚨 CRITICAL FIX: Final Two Tables Security Gap
-- Fix the last 2 critical security issues
-- Execute: psql -d your_db -f critical-fix-final-two-tables.sql

BEGIN;

-- =================================
-- CRITICAL FIX 1: project_versions (MISSING RLS)
-- =================================

-- Enable RLS on project_versions
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions FORCE ROW LEVEL SECURITY;

-- Create comprehensive project_versions policies
CREATE POLICY "project_versions_select_access"
ON public.project_versions
FOR SELECT
USING (
  user_id = (auth.uid())::text  -- Version creator
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_versions.project_id
    AND (
      p.owner_id = auth.uid()  -- Project owner
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
      )
    )
  )
);

CREATE POLICY "project_versions_insert_access"
ON public.project_versions
FOR INSERT
WITH CHECK (user_id = (auth.uid())::text);

CREATE POLICY "project_versions_update_access"
ON public.project_versions
FOR UPDATE
USING (
  user_id = (auth.uid())::text  -- Version creator can update
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_versions.project_id
    AND p.owner_id = auth.uid()  -- Project owner can update
  )
);

CREATE POLICY "project_versions_delete_access"
ON public.project_versions
FOR DELETE
USING (
  user_id = (auth.uid())::text  -- Version creator can delete
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_versions.project_id
    AND p.owner_id = auth.uid()  -- Project owner can delete
  )
);

-- Grant privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions TO authenticated;

-- =================================
-- CRITICAL FIX 2: project_collaborators (NEEDS POLICIES)
-- =================================

-- Create comprehensive project_collaborators policies
CREATE POLICY "project_collaborators_select_access"
ON public.project_collaborators
FOR SELECT
USING (
  user_id = auth.uid()  -- Users can see their own collaborations
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_collaborators.project_id
    AND p.owner_id = auth.uid()  -- Project owners can see all collaborators
  )
);

CREATE POLICY "project_collaborators_insert_access"
ON public.project_collaborators
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_collaborators.project_id
    AND p.owner_id = auth.uid()  -- Only project owners can add collaborators
  )
);

CREATE POLICY "project_collaborators_update_access"
ON public.project_collaborators
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_collaborators.project_id
    AND p.owner_id = auth.uid()  -- Only project owners can update collaborators
  )
);

CREATE POLICY "project_collaborators_delete_access"
ON public.project_collaborators
FOR DELETE
USING (
  user_id = auth.uid()  -- Users can remove themselves
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_collaborators.project_id
    AND p.owner_id = auth.uid()  -- Project owners can remove anyone
  )
);

-- Grant privileges (should already exist but ensuring)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_collaborators TO authenticated;

-- =================================
-- VERIFICATION
-- =================================

-- Verify both tables are now properly secured
SELECT 
  t.table_name,
  CASE WHEN c.relrowsecurity THEN '✅ ENABLED' ELSE '❌ MISSING' END as rls_status,
  CASE WHEN c.relforcerowsecurity THEN '🔒 FORCED' ELSE '⚠️  NORMAL' END as force_rls_status,
  COALESCE(p.policy_count, 0) as policies,
  CASE WHEN g.has_grants THEN '✅ YES' ELSE '❌ NO' END as has_grants,
  CASE 
    WHEN NOT c.relrowsecurity THEN '🚨 NEEDS RLS'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) = 0 THEN '🚨 NEEDS POLICIES'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) > 0 AND NOT g.has_grants THEN '🚨 NEEDS GRANTS'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) > 0 AND g.has_grants AND c.relforcerowsecurity THEN '🎉 FULLY SECURE'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count, 0) > 0 AND g.has_grants THEN '✅ SECURE'
    ELSE '❓ UNKNOWN'
  END as final_security_status
FROM (VALUES 
  ('project_versions'),
  ('project_collaborators')
) t(table_name)
LEFT JOIN pg_class c ON c.relname = t.table_name
LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN (
  SELECT tablename, COUNT(*) as policy_count
  FROM pg_policies 
  WHERE schemaname = 'public'
  GROUP BY tablename
) p ON p.tablename = t.table_name
LEFT JOIN (
  SELECT table_name, true as has_grants
  FROM information_schema.role_table_grants
  WHERE grantee = 'authenticated' AND table_schema = 'public'
  GROUP BY table_name
) g ON g.table_name = t.table_name
ORDER BY t.table_name;

-- =================================
-- FINAL SUCCESS CHECK
-- =================================

-- Count any remaining critical issues across entire database
DO $$
DECLARE
  critical_issues integer;
BEGIN
  SELECT COUNT(*) INTO critical_issues
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN (
    SELECT tablename FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
  ) p ON p.tablename = c.relname
  LEFT JOIN (
    SELECT table_name FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public'
    GROUP BY table_name
  ) g ON g.table_name = c.relname
  WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
  AND (
    NOT c.relrowsecurity  -- Missing RLS
    OR (c.relrowsecurity AND p.tablename IS NULL)  -- Missing policies
    OR (c.relrowsecurity AND p.tablename IS NOT NULL AND g.table_name IS NULL)  -- Missing grants
  );
  
  IF critical_issues = 0 THEN
    RAISE NOTICE '🎉🎉🎉 COMPLETE SUCCESS! 🎉🎉🎉';
    RAISE NOTICE '✅ ALL TABLES ARE NOW PROPERLY SECURED!';
    RAISE NOTICE '✅ Zero critical security issues remaining';
    RAISE NOTICE '✅ Database is production-ready with comprehensive RLS protection';
  ELSE
    RAISE NOTICE '⚠️  % critical issues still remain - review needed', critical_issues;
  END IF;
END$$;

-- =================================
-- AUDIT LOG
-- =================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'critical_final_fix_complete',
    jsonb_build_object(
        'action', 'fixed_final_two_critical_security_gaps',
        'tables_fixed', array['project_versions', 'project_collaborators'],
        'project_versions_actions', array['enable_rls', 'force_rls', 'create_policies', 'grant_privileges'],
        'project_collaborators_actions', array['create_policies'],
        'expected_result', 'zero_critical_issues_remaining',
        'timestamp', now()
    ),
    'critical_final_fix'
);

COMMIT;

-- =================================
-- POST-EXECUTION SUMMARY
-- =================================

-- 🎯 Critical Fix Complete!
-- ✅ project_versions: Now has FORCE RLS + comprehensive policies + grants
-- ✅ project_collaborators: Now has full policy coverage for all operations
-- 
-- Security Features Added:
-- - Project ownership validation
-- - Collaborator role-based access
-- - Version creator permissions
-- - Self-service collaboration management
-- 
-- Expected Result: 🎉 ZERO CRITICAL SECURITY ISSUES
-- Next: Test application functionality with new security policies