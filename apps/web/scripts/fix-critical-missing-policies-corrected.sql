-- 🚨 Fix Critical Missing Policies - CORRECTED with Actual Schema
-- Based on exact column names from 000_reference_schema_20250805.sql

BEGIN;

-- =================================
-- CRITICAL FIX: project_collaborators (HIGHEST PRIORITY)
-- =================================

CREATE POLICY "project_collaborators_read_access"
ON public.project_collaborators
FOR SELECT
USING (
  user_id = auth.uid()  -- Users can see their own memberships
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

-- =================================
-- METRICS TABLES: Schema-Accurate Policies
-- =================================

-- project_ai_session_metrics: Has build_id, NO project_id
-- Access via build_id -> project_build_records -> project ownership
CREATE POLICY "ai_session_metrics_via_build"
ON public.project_ai_session_metrics
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_build_records pbr
    JOIN public.projects p ON p.id::text = pbr.project_id
    WHERE pbr.build_id = project_ai_session_metrics.build_id
    AND p.owner_id = auth.uid()
  )
);

-- project_build_metrics: Has project_id varchar(255), user_id varchar(255)
CREATE POLICY "build_metrics_user_and_project_access"
ON public.project_build_metrics
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User who ran the build
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_build_metrics.project_id
    AND p.owner_id = auth.uid()  -- Project owner
  )
);

-- project_chat_plan_sessions: Has user_id varchar(255), project_id varchar(255)
CREATE POLICY "chat_plan_sessions_user_and_project_access"
ON public.project_chat_plan_sessions
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User who owns the session
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_chat_plan_sessions.project_id
    AND p.owner_id = auth.uid()  -- Project owner
  )
);

-- project_deployment_metrics: Has build_id, NO direct project_id
-- Access via build_id -> project_build_records -> project ownership
CREATE POLICY "deployment_metrics_via_build"
ON public.project_deployment_metrics
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_build_records pbr
    JOIN public.projects p ON p.id::text = pbr.project_id
    WHERE pbr.build_id = project_deployment_metrics.build_id
    AND p.owner_id = auth.uid()
  )
);

-- project_error_metrics: Has build_id, NO direct project_id
-- Access via build_id -> project_build_records -> project ownership
CREATE POLICY "error_metrics_via_build"
ON public.project_error_metrics
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_build_records pbr
    JOIN public.projects p ON p.id::text = pbr.project_id
    WHERE pbr.build_id = project_error_metrics.build_id
    AND p.owner_id = auth.uid()
  )
);

-- project_integrations: Has project_id uuid (direct match!)
CREATE POLICY "integrations_project_owner"
ON public.project_integrations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_integrations.project_id
    AND p.owner_id = auth.uid()
  )
);

-- project_metrics_summary: Has project_id varchar(255), user_id varchar(255)
CREATE POLICY "metrics_summary_user_and_project_access"
ON public.project_metrics_summary
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User's summary
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_metrics_summary.project_id
    AND p.owner_id = auth.uid()  -- Project owner
  )
);

-- =================================
-- CRITICAL FIX: user_ai_consumption_metadata  
-- =================================

-- Let's check what columns this table actually has
DO $$
DECLARE
  column_list text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY ordinal_position)
  INTO column_list
  FROM information_schema.columns 
  WHERE table_schema = 'public' 
  AND table_name = 'user_ai_consumption_metadata';
  
  RAISE NOTICE 'user_ai_consumption_metadata columns: %', column_list;
  
  -- Try to create a policy based on available columns
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_ai_consumption_metadata' 
    AND column_name = 'user_id'
  ) THEN
    EXECUTE '
      CREATE POLICY "user_ai_consumption_user_access"
      ON public.user_ai_consumption_metadata
      FOR ALL
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid())';
  ELSE
    -- No user_id, create admin-only policy for now
    EXECUTE '
      CREATE POLICY "user_ai_consumption_admin_only"
      ON public.user_ai_consumption_metadata
      FOR ALL
      USING ((auth.jwt() ->> ''role'') = ''admin'')
      WITH CHECK ((auth.jwt() ->> ''role'') = ''admin'')';
    RAISE NOTICE 'Applied admin-only policy to user_ai_consumption_metadata';
  END IF;
END$$;

-- =================================
-- AUDIT LOG
-- =================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'critical_missing_policies_fixed_corrected',
    jsonb_build_object(
        'action', 'added_schema_accurate_policies_to_rls_tables',
        'critical_table_fixed', 'project_collaborators',
        'metrics_tables_fixed', 7,
        'schema_verification', 'used_exact_column_names_from_reference_schema',
        'collaboration_restored', true,
        'timestamp', now()
    ),
    '029_critical_policy_fixes_corrected'
);

COMMIT;

-- =================================
-- POST-EXECUTION SUMMARY
-- =================================

-- Schema-accurate fixes:
-- ✅ project_collaborators: Full collaboration support restored
-- ✅ project_ai_session_metrics: Access via build_id chain
-- ✅ project_build_metrics: Direct user_id + project ownership
-- ✅ project_chat_plan_sessions: Direct user_id + project ownership  
-- ✅ project_deployment_metrics: Access via build_id chain
-- ✅ project_error_metrics: Access via build_id chain
-- ✅ project_integrations: Direct project ownership (uuid match)
-- ✅ project_metrics_summary: Direct user_id + project ownership
-- ✅ user_ai_consumption_metadata: Dynamic based on actual columns
--
-- Key insight: Some metrics tables use build_id chains rather than direct project_id
-- This requires JOIN through project_build_records to establish project ownership
--
-- Next: Verify policies work and test core functionality