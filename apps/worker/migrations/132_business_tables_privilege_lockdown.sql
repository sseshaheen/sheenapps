-- 132_business_tables_privilege_lockdown.sql
-- Purpose: Explicitly lock down table privileges for business_events and business_kpi_daily
-- This ensures RLS policies are effective even if grants are accidentally misconfigured

-- =============================================================================
-- Revoke all privileges from anon and authenticated roles
-- These tables should only be accessed via service_role (worker) or through RLS
-- =============================================================================

-- Revoke from anon (public/unauthenticated access)
REVOKE ALL ON public.business_events FROM anon;
REVOKE ALL ON public.business_kpi_daily FROM anon;

-- Revoke INSERT/UPDATE/DELETE from authenticated (users can only SELECT via RLS)
REVOKE INSERT, UPDATE, DELETE ON public.business_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.business_kpi_daily FROM authenticated;

-- Grant SELECT to authenticated (RLS policies control which rows they see)
GRANT SELECT ON public.business_events TO authenticated;
GRANT SELECT ON public.business_kpi_daily TO authenticated;

-- =============================================================================
-- Ensure service_role has full access (for worker operations)
-- =============================================================================

GRANT ALL ON public.business_events TO service_role;
GRANT ALL ON public.business_kpi_daily TO service_role;

-- Grant sequence usage to service_role for inserts
GRANT USAGE, SELECT ON SEQUENCE business_events_id_seq TO service_role;
