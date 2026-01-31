-- 🔐 Phase 1: Secure Critical User Data Tables
-- Immediate protection for user financial/usage data
-- Execute: psql -d your_db -f phase1-secure-user-data-tables.sql

BEGIN;

-- =================================
-- CRITICAL USER DATA TABLES
-- =================================

-- user_ai_time_balance: User's time/credit balance
ALTER TABLE public.user_ai_time_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_time_balance FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_ai_time_balance_user_access"
ON public.user_ai_time_balance
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_time_balance TO authenticated;

-- user_ai_time_consumption: User's usage tracking
ALTER TABLE public.user_ai_time_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_time_consumption FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_ai_time_consumption_user_access"
ON public.user_ai_time_consumption
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_time_consumption TO authenticated;

-- user_ai_time_purchases: User's purchase history
ALTER TABLE public.user_ai_time_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_time_purchases FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_ai_time_purchases_user_access"
ON public.user_ai_time_purchases
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_time_purchases TO authenticated;

-- user_bonuses: User bonus/reward data
ALTER TABLE public.user_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_bonuses FORCE ROW LEVEL SECURITY;

CREATE POLICY "user_bonuses_user_access"
ON public.user_bonuses
FOR ALL
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_bonuses TO authenticated;

-- user_ai_consumption_metadata: User consumption analytics
-- First check if this table has user_id column
DO $$
DECLARE
  has_user_id boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_ai_consumption_metadata' 
    AND column_name = 'user_id'
  ) INTO has_user_id;
  
  -- Enable RLS regardless
  EXECUTE 'ALTER TABLE public.user_ai_consumption_metadata ENABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE public.user_ai_consumption_metadata FORCE ROW LEVEL SECURITY';
  
  IF has_user_id THEN
    -- User-specific access if user_id exists
    EXECUTE '
      CREATE POLICY "user_ai_consumption_metadata_user_access"
      ON public.user_ai_consumption_metadata
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
    RAISE NOTICE 'Applied user-specific policy to user_ai_consumption_metadata';
  ELSE
    -- Admin-only access if no user_id column
    EXECUTE '
      CREATE POLICY "user_ai_consumption_metadata_admin_only"
      ON public.user_ai_consumption_metadata
      FOR ALL
      USING ((auth.jwt() ->> ''role'') = ''admin'')
      WITH CHECK ((auth.jwt() ->> ''role'') = ''admin'')';
    RAISE NOTICE 'Applied admin-only policy to user_ai_consumption_metadata (no user_id column)';
  END IF;
  
  -- Grant privileges
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_ai_consumption_metadata TO authenticated';
END$$;

-- =================================
-- AUDIT LOG
-- =================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'phase1_user_data_secured',
    jsonb_build_object(
        'action', 'secured_critical_user_data_tables',
        'tables_secured', array[
          'user_ai_time_balance',
          'user_ai_time_consumption', 
          'user_ai_time_purchases',
          'user_bonuses',
          'user_ai_consumption_metadata'
        ],
        'security_level', 'FORCE_RLS_with_user_only_policies',
        'timestamp', now()
    ),
    'phase1_user_data_security'
);

-- =================================
-- VERIFICATION QUERY
-- =================================

-- Verify the tables are now properly secured
SELECT 
  t.table_name,
  CASE WHEN c.relrowsecurity THEN 'ON' ELSE 'OFF' END as rls_enabled,
  CASE WHEN c.relforcerowsecurity THEN 'FORCED' ELSE 'NORMAL' END as rls_forced,
  COALESCE(p.policy_count, 0) as policies,
  CASE WHEN g.has_grants THEN 'YES' ELSE 'NO' END as has_grants
FROM (VALUES 
  ('user_ai_time_balance'),
  ('user_ai_time_consumption'),
  ('user_ai_time_purchases'), 
  ('user_bonuses'),
  ('user_ai_consumption_metadata')
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

COMMIT;

-- =================================
-- POST-EXECUTION SUMMARY
-- =================================

-- Phase 1 Complete: Critical User Data Secured
-- ✅ user_ai_time_balance: FORCE RLS + user-only access  
-- ✅ user_ai_time_consumption: FORCE RLS + user-only access
-- ✅ user_ai_time_purchases: FORCE RLS + user-only access
-- ✅ user_bonuses: FORCE RLS + user-only access
-- ✅ user_ai_consumption_metadata: FORCE RLS + appropriate access (user or admin)
--
-- Next: Run Phase 2 to secure project data tables