-- 🔐 Phase 5: Complete Any Remaining Table Coverage
-- Catch any tables missed in previous phases
-- Execute: psql -d your_db -f phase5-complete-remaining-tables.sql

BEGIN;

-- =================================
-- VERSION BACKUP TABLES (CONDITIONAL - ONLY IF THEY EXIST)
-- =================================

-- project_versions_backup: Backup of project versions (admin-only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions_backup') THEN
    EXECUTE 'ALTER TABLE public.project_versions_backup ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.project_versions_backup FORCE ROW LEVEL SECURITY';
    
    EXECUTE '
      CREATE POLICY "project_versions_backup_admin_only"
      ON public.project_versions_backup
      FOR ALL
      USING ((auth.jwt() ->> ''role'') = ''admin'')
      WITH CHECK ((auth.jwt() ->> ''role'') = ''admin'')';
    
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions_backup TO authenticated';
    RAISE NOTICE '✅ Secured: project_versions_backup';
  ELSE
    RAISE NOTICE '⏭️  Skipped: project_versions_backup (table does not exist)';
  END IF;
END$$;

-- project_versions_metadata: Version metadata (project-based access)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions_metadata') THEN
    EXECUTE 'ALTER TABLE public.project_versions_metadata ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.project_versions_metadata FORCE ROW LEVEL SECURITY';
    
    EXECUTE '
      CREATE POLICY "project_versions_metadata_project_access"
      ON public.project_versions_metadata
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.project_versions pv
          JOIN public.projects p ON p.id::text = pv.project_id
          WHERE pv.id::text = project_versions_metadata.version_id::text
          AND (
            p.owner_id = auth.uid()
            OR pv.user_id = (auth.uid())::text
            OR EXISTS (
              SELECT 1 FROM public.project_collaborators pc
              WHERE pc.project_id = p.id
              AND pc.user_id = auth.uid()
              AND pc.role IN (''owner'', ''admin'', ''editor'', ''viewer'')
            )
          )
        )
      )';
    
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions_metadata TO authenticated';
    RAISE NOTICE '✅ Secured: project_versions_metadata';
  ELSE
    RAISE NOTICE '⏭️  Skipped: project_versions_metadata (table does not exist)';
  END IF;
END$$;

-- project_versions_metadata_backup: Backup metadata (admin-only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'project_versions_metadata_backup') THEN
    EXECUTE 'ALTER TABLE public.project_versions_metadata_backup ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.project_versions_metadata_backup FORCE ROW LEVEL SECURITY';
    
    EXECUTE '
      CREATE POLICY "project_versions_metadata_backup_admin_only"
      ON public.project_versions_metadata_backup
      FOR ALL
      USING ((auth.jwt() ->> ''role'') = ''admin'')
      WITH CHECK ((auth.jwt() ->> ''role'') = ''admin'')';
    
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_versions_metadata_backup TO authenticated';
    RAISE NOTICE '✅ Secured: project_versions_metadata_backup';
  ELSE
    RAISE NOTICE '⏭️  Skipped: project_versions_metadata_backup (table does not exist)';
  END IF;
END$$;

-- =================================
-- PROJECT BUILD EVENTS (EXISTING RLS, MISSING DELETE POLICY)
-- =================================

-- project_build_events: Already has RLS + some policies, add missing DELETE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'project_build_events' 
    AND policyname = 'project_build_events_admin_delete'
  ) THEN
    EXECUTE '
      CREATE POLICY "project_build_events_admin_delete"
      ON public.project_build_events
      FOR DELETE
      USING ((auth.jwt() ->> ''role'') = ''admin'')';
  END IF;
END$$;

-- =================================
-- USAGE TRACKING TABLES (CONDITIONAL)
-- =================================

-- usage_tracking: User usage statistics
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'usage_tracking') THEN
    EXECUTE 'ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.usage_tracking FORCE ROW LEVEL SECURITY';
    
    EXECUTE '
      CREATE POLICY "usage_tracking_user_and_admin_access"
      ON public.usage_tracking
      FOR ALL
      USING (
        (auth.jwt() ->> ''role'') = ''admin''
        OR user_id = auth.uid()
      )';
    
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_tracking TO authenticated';
    RAISE NOTICE '✅ Secured: usage_tracking';
  ELSE
    RAISE NOTICE '⏭️  Skipped: usage_tracking (table does not exist)';
  END IF;
END$$;

-- usage_bonuses: User bonus tracking
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'usage_bonuses') THEN
    EXECUTE 'ALTER TABLE public.usage_bonuses ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.usage_bonuses FORCE ROW LEVEL SECURITY';
    
    EXECUTE '
      CREATE POLICY "usage_bonuses_user_and_admin_access"
      ON public.usage_bonuses
      FOR ALL
      USING (
        (auth.jwt() ->> ''role'') = ''admin''
        OR user_id = auth.uid()
      )';
    
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.usage_bonuses TO authenticated';
    RAISE NOTICE '✅ Secured: usage_bonuses';
  ELSE
    RAISE NOTICE '⏭️  Skipped: usage_bonuses (table does not exist)';
  END IF;
END$$;

-- webhook_dead_letter: Webhook failure tracking (admin-only)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'webhook_dead_letter') THEN
    EXECUTE 'ALTER TABLE public.webhook_dead_letter ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.webhook_dead_letter FORCE ROW LEVEL SECURITY';
    
    EXECUTE '
      CREATE POLICY "webhook_dead_letter_admin_only"
      ON public.webhook_dead_letter
      FOR ALL
      USING ((auth.jwt() ->> ''role'') = ''admin'')
      WITH CHECK ((auth.jwt() ->> ''role'') = ''admin'')';
    
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_dead_letter TO authenticated';
    RAISE NOTICE '✅ Secured: webhook_dead_letter';
  ELSE
    RAISE NOTICE '⏭️  Skipped: webhook_dead_letter (table does not exist)';
  END IF;
END$$;

-- =================================
-- CHECK FOR ANY REMAINING UNPROTECTED TABLES
-- =================================

-- This query will show any remaining tables without RLS
DO $$
DECLARE
  unprotected_tables text;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
  INTO unprotected_tables
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND c.relname NOT LIKE 'pg_%'
  AND c.relname NOT LIKE 'supabase_%'
  AND c.relname NOT LIKE '%_pkey'
  AND c.relname NOT IN (
    'schema_migrations', 'spatial_ref_sys', 'geography_columns', 
    'geometry_columns', 'raster_columns', 'raster_overviews'
  );
  
  IF unprotected_tables IS NOT NULL THEN
    RAISE NOTICE 'WARNING: Tables still without RLS: %', unprotected_tables;
    
    -- Log this for review
    INSERT INTO public.security_audit_log (event_type, details, migration_version)
    VALUES (
        'phase5_unprotected_tables_found',
        jsonb_build_object(
            'unprotected_tables', string_to_array(unprotected_tables, ', '),
            'count', array_length(string_to_array(unprotected_tables, ', '), 1),
            'timestamp', now()
        ),
        'phase5_remaining_gaps'
    );
  ELSE
    RAISE NOTICE 'SUCCESS: All tables now have RLS enabled!';
  END IF;
END$$;

-- =================================
-- AUDIT LOG
-- =================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'phase5_remaining_tables_secured_conditional',
    jsonb_build_object(
        'action', 'secured_remaining_tables_if_they_exist',
        'tables_attempted', array[
          'project_versions_backup',
          'project_versions_metadata',
          'project_versions_metadata_backup',
          'usage_tracking',
          'usage_bonuses',
          'webhook_dead_letter'
        ],
        'policies_completed', array[
          'project_build_events'
        ],
        'approach', 'conditional_existence_check',
        'security_level', 'mixed_admin_user_project_based',
        'note', 'script_safely_skips_nonexistent_tables',
        'timestamp', now()
    ),
    'phase5_conditional_table_security'
);

COMMIT;

-- =================================
-- POST-EXECUTION SUMMARY
-- =================================

-- Phase 5 Complete: Remaining Tables Secured
-- ✅ Backup tables protected (admin-only access)
-- ✅ Version metadata with project-based access
-- ✅ Usage tracking with user access
-- ✅ Webhook systems secured
-- ✅ Completed missing DELETE policy for build events
-- ✅ Automated detection of any remaining unprotected tables
--
-- Next: Run Phase 6 to verify complete coverage