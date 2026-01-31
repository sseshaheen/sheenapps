-- 🛡️ Emergency RLS Shield - Enhanced Security Implementation
-- Based on user's critical security improvements
-- This approach is superior: FORCE RLS + deny-all + dynamic privilege grants

BEGIN;

-- =================================
-- PHASE 1: EMERGENCY RLS SHIELD ON VULNERABLE TABLES
-- =================================

-- Critical user data tables - apply FORCE RLS for maximum security
ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_versions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_chat_log_minimal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_log_minimal FORCE ROW LEVEL SECURITY;

ALTER TABLE public.unified_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unified_chat_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_ai_consumption_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_consumption_metadata FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_ai_time_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_time_balance FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_ai_time_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_time_consumption FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_ai_time_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_time_purchases FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_build_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_build_records FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_recommendations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_published_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_published_domains FORCE ROW LEVEL SECURITY;

-- Project metrics tables
ALTER TABLE public.project_ai_session_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ai_session_metrics FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_build_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_build_metrics FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_chat_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_chat_plan_sessions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_deployment_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_deployment_metrics FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_error_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_error_metrics FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_integrations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.project_metrics_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_metrics_summary FORCE ROW LEVEL SECURITY;

-- =================================
-- PHASE 2: TEMPORARY DENY-ALL POLICIES (EXPLICIT SAFETY)
-- =================================

-- Apply temporary deny-all policies for explicit safety during transition
CREATE POLICY "deny_all_temp_pv" ON public.project_versions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_chat" ON public.project_chat_log_minimal FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_sessions" ON public.unified_chat_sessions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_ai_meta" ON public.user_ai_consumption_metadata FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_balance" ON public.user_ai_time_balance FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_consumption" ON public.user_ai_time_consumption FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_purchases" ON public.user_ai_time_purchases FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_builds" ON public.project_build_records FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_recs" ON public.project_recommendations FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_domains" ON public.project_published_domains FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_ai_metrics" ON public.project_ai_session_metrics FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_build_metrics" ON public.project_build_metrics FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_chat_plans" ON public.project_chat_plan_sessions FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_deploy" ON public.project_deployment_metrics FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_errors" ON public.project_error_metrics FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_integrations" ON public.project_integrations FOR ALL USING (false) WITH CHECK (false);
CREATE POLICY "deny_all_temp_summary" ON public.project_metrics_summary FOR ALL USING (false) WITH CHECK (false);

-- =================================
-- AUDIT LOG - PHASE 1 & 2 COMPLETE
-- =================================

INSERT INTO public.security_audit_log (event_type, details, migration_version)
VALUES (
    'emergency_rls_shield_applied',
    jsonb_build_object(
        'action', 'applied_force_rls_and_deny_all_policies',
        'tables_secured', 17,
        'force_rls_enabled', true,
        'temporary_deny_policies', true,
        'security_level', 'maximum_lockdown',
        'timestamp', now()
    ),
    '029_emergency_rls_shield'
);

COMMIT;