-- Migration: Feedback SECURITY DEFINER Function Permissions
-- Date: 2026-01-22
-- Purpose: Lock down SECURITY DEFINER functions to service_role only
--
-- Issue: PostgreSQL grants EXECUTE to PUBLIC by default for functions.
-- SECURITY DEFINER functions run with definer's privileges (superuser),
-- so any authenticated/anon user could call these admin-only functions.
--
-- Fix: REVOKE from PUBLIC, GRANT only to service_role.
-- API routes use service_role client, so admin features keep working.

-- ============================================================================
-- 1. Revoke PUBLIC access (default grant)
-- ============================================================================

-- Triage stats function (admin dashboard)
REVOKE EXECUTE ON FUNCTION get_feedback_triage_stats() FROM PUBLIC;

-- NPS detractor rate function (admin dashboard)
REVOKE EXECUTE ON FUNCTION get_nps_detractor_rate(INT) FROM PUBLIC;

-- Frustration signal rate function (admin dashboard)
REVOKE EXECUTE ON FUNCTION get_frustration_signal_rate(INT) FROM PUBLIC;

-- Bulk label update function (admin bulk operations)
REVOKE EXECUTE ON FUNCTION bulk_update_feedback_labels(UUID[], TEXT, TEXT, UUID, TEXT) FROM PUBLIC;

-- ============================================================================
-- 2. Grant to service_role only
-- ============================================================================

-- Triage stats function
GRANT EXECUTE ON FUNCTION get_feedback_triage_stats() TO service_role;

-- NPS detractor rate function
GRANT EXECUTE ON FUNCTION get_nps_detractor_rate(INT) TO service_role;

-- Frustration signal rate function
GRANT EXECUTE ON FUNCTION get_frustration_signal_rate(INT) TO service_role;

-- Bulk label update function
GRANT EXECUTE ON FUNCTION bulk_update_feedback_labels(UUID[], TEXT, TEXT, UUID, TEXT) TO service_role;

-- ============================================================================
-- 3. Verification comments
-- ============================================================================

COMMENT ON FUNCTION get_feedback_triage_stats IS
  'Get dashboard stats for feedback triage queue. SERVICE_ROLE ONLY - admin API routes.';

COMMENT ON FUNCTION get_nps_detractor_rate IS
  'Calculate NPS detractor rate over time period. SERVICE_ROLE ONLY - admin API routes.';

COMMENT ON FUNCTION get_frustration_signal_rate IS
  'Get frustration signal rates for alerting. SERVICE_ROLE ONLY - admin API routes.';

COMMENT ON FUNCTION bulk_update_feedback_labels IS
  'Atomic bulk add/remove labels. SERVICE_ROLE ONLY - admin API routes.';
