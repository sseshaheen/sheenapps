-- 🔐 Phase 2: Secure Critical Project Data Tables  
-- Protection for project-related data with owner/collaborator access
-- Execute: psql -d your_db -f phase2-secure-project-data-tables.sql

BEGIN;

-- =================================
-- PROJECT METRICS TABLES (Build Chain Access)
-- =================================

-- project_ai_session_metrics: Access via build_id -> project chain
ALTER TABLE public.project_ai_session_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ai_session_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_ai_session_metrics_build_access"
ON public.project_ai_session_metrics
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_build_records pbr
    JOIN public.projects p ON p.id::text = pbr.project_id
    WHERE pbr.build_id = project_ai_session_metrics.build_id
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_ai_session_metrics TO authenticated;

-- project_build_metrics: Direct project_id + user_id access
ALTER TABLE public.project_build_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_build_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_build_metrics_access"
ON public.project_build_metrics
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User who ran the build
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_build_metrics.project_id
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_build_metrics TO authenticated;

-- project_build_records: Direct project_id + user_id access  
ALTER TABLE public.project_build_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_build_records FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_build_records_access"
ON public.project_build_records
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User who created the build
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_build_records.project_id
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_build_records TO authenticated;

-- =================================
-- PROJECT CHAT TABLES
-- =================================

-- project_chat_log_minimal: Direct user_id + project_id access
ALTER TABLE public.project_chat_log_minimal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_log_minimal FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_chat_log_minimal_access"
ON public.project_chat_log_minimal
FOR ALL
USING (
  user_id = auth.uid()  -- User's own chat logs
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_chat_log_minimal.project_id
    AND (
      p.owner_id = auth.uid()  -- Project owner can see all chats
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor')  -- No viewer access to chats
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_log_minimal TO authenticated;

-- project_chat_plan_sessions: Direct user_id + project_id access
ALTER TABLE public.project_chat_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_plan_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_chat_plan_sessions_access"
ON public.project_chat_plan_sessions
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User's own sessions
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_chat_plan_sessions.project_id
    AND (
      p.owner_id = auth.uid()  -- Project owner
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id::text = p.id::text
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor')
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_chat_plan_sessions TO authenticated;

-- =================================
-- PROJECT INFRASTRUCTURE TABLES
-- =================================

-- project_deployment_metrics: Access via build_id chain
ALTER TABLE public.project_deployment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_deployment_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_deployment_metrics_build_access"
ON public.project_deployment_metrics
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_build_records pbr
    JOIN public.projects p ON p.id::text = pbr.project_id
    WHERE pbr.build_id = project_deployment_metrics.build_id
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_deployment_metrics TO authenticated;

-- project_error_metrics: Access via build_id chain
ALTER TABLE public.project_error_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_error_metrics FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_error_metrics_build_access"
ON public.project_error_metrics
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.project_build_records pbr
    JOIN public.projects p ON p.id::text = pbr.project_id
    WHERE pbr.build_id = project_error_metrics.build_id
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_error_metrics TO authenticated;

-- project_integrations: Direct project_id access (UUID match)
ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_integrations FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_integrations_project_access"
ON public.project_integrations
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_integrations.project_id  -- Direct UUID match
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor')  -- No viewer access to integrations
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_integrations TO authenticated;

-- =================================
-- PROJECT SUMMARY TABLES
-- =================================

-- project_metrics_summary: Direct user_id + project_id access
ALTER TABLE public.project_metrics_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_metrics_summary FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_metrics_summary_access"
ON public.project_metrics_summary
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User's own metrics
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_metrics_summary.project_id
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_metrics_summary TO authenticated;

-- project_published_domains: Direct project_id access
ALTER TABLE public.project_published_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_published_domains FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_published_domains_project_access"
ON public.project_published_domains
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_published_domains.project_id
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_published_domains TO authenticated;

-- project_recommendations: Direct user_id + project_id access
ALTER TABLE public.project_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_recommendations FORCE ROW LEVEL SECURITY;

CREATE POLICY "project_recommendations_access"
ON public.project_recommendations
FOR ALL
USING (
  user_id = (auth.uid())::text  -- User who created recommendation
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id::text = project_recommendations.project_id
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id::text = p.id::text
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor', 'viewer')
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_recommendations TO authenticated;

-- =================================
-- SESSION TABLES
-- =================================

-- unified_chat_sessions: Direct user_id + project_id access
ALTER TABLE public.unified_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_chat_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "unified_chat_sessions_access"
ON public.unified_chat_sessions
FOR ALL
USING (
  user_id = auth.uid()  -- User's own sessions
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = unified_chat_sessions.project_id
    AND (
      p.owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.project_collaborators pc
        WHERE pc.project_id = p.id
        AND pc.user_id = auth.uid()
        AND pc.role IN ('owner', 'admin', 'editor')  -- No viewer access to chat sessions
      )
    )
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.unified_chat_sessions TO authenticated;

-- =================================
-- AUDIT LOG
-- =================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'phase2_project_data_secured',
    jsonb_build_object(
        'action', 'secured_critical_project_data_tables',
        'tables_secured', array[
          'project_ai_session_metrics',
          'project_build_metrics',
          'project_build_records',
          'project_chat_log_minimal',
          'project_chat_plan_sessions',
          'project_deployment_metrics',
          'project_error_metrics',
          'project_integrations',
          'project_metrics_summary',
          'project_published_domains',
          'project_recommendations',
          'unified_chat_sessions'
        ],
        'security_level', 'FORCE_RLS_with_project_collaboration_policies',
        'access_pattern', 'owner_collaborator_user_based',
        'timestamp', now()
    ),
    'phase2_project_data_security'
);

-- =================================
-- VERIFICATION QUERY
-- =================================

-- Verify all project tables are properly secured
SELECT 
  t.table_name,
  CASE WHEN c.relrowsecurity THEN 'ON' ELSE 'OFF' END as rls_enabled,
  CASE WHEN c.relforcerowsecurity THEN 'FORCED' ELSE 'NORMAL' END as rls_forced,
  COALESCE(p.policy_count, 0) as policies,
  CASE WHEN g.has_grants THEN 'YES' ELSE 'NO' END as has_grants
FROM (VALUES 
  ('project_ai_session_metrics'),
  ('project_build_metrics'),
  ('project_build_records'),
  ('project_chat_log_minimal'),
  ('project_chat_plan_sessions'),
  ('project_deployment_metrics'),
  ('project_error_metrics'),
  ('project_integrations'),
  ('project_metrics_summary'),
  ('project_published_domains'),
  ('project_recommendations'),
  ('unified_chat_sessions')
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

-- Phase 2 Complete: Critical Project Data Secured
-- ✅ 12 project tables now protected with FORCE RLS
-- ✅ Sophisticated collaboration policies (owner + collaborators)
-- ✅ Role-based access (owner/admin/editor/viewer)
-- ✅ Build chain access for metrics tables
-- ✅ User-specific access for chat/session data
--
-- Security Features:
-- - FORCE RLS prevents table owner bypass
-- - Project ownership validation
-- - Collaborator role checking  
-- - User session isolation
-- - Build metrics via project chains
--
-- Next: Run Phase 3 to secure system/admin tables