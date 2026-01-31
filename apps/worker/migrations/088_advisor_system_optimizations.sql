-- Advisor System Optimizations
-- Performance improvements and production hardening for advisor matching and workspace systems
-- Based on expert recommendations and production best practices

BEGIN;

-- =====================================================
-- Performance Optimizations: JSONB GIN Indexes
-- =====================================================

-- Fast technology stack filtering for matching algorithms
CREATE INDEX IF NOT EXISTS idx_projects_techstack_gin 
  ON projects USING gin (technology_stack jsonb_path_ops);

-- Fast match criteria filtering for advisor requests
CREATE INDEX IF NOT EXISTS idx_match_criteria_gin 
  ON advisor_match_requests USING gin (match_criteria jsonb_path_ops);

-- Fast preference criteria filtering for admin rules
CREATE INDEX IF NOT EXISTS idx_pref_criteria_gin 
  ON advisor_preferences USING gin (criteria jsonb_path_ops);

-- Fast admin preference rule conditions filtering
CREATE INDEX IF NOT EXISTS idx_admin_preference_conditions_gin 
  ON admin_preference_rules USING gin (conditions jsonb_path_ops);

-- Dead letter queue operations for notification management
CREATE INDEX IF NOT EXISTS idx_outbox_dead_letter 
  ON notification_outbox(dead_letter) 
  WHERE dead_letter = true;

-- =====================================================
-- Data Integrity: Time-off Overlap Prevention
-- =====================================================

-- Prevent overlapping time-off periods for the same advisor
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'excl_timeoff_no_overlap') THEN
    ALTER TABLE advisor_time_off
      ADD CONSTRAINT excl_timeoff_no_overlap
      EXCLUDE USING gist (advisor_id WITH =, period WITH &&);
  END IF;
END $$;

-- =====================================================
-- Business Logic: Project Owner Audit Access
-- =====================================================

-- Project owners should see workspace activity on their projects
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'owner_read_workspace_audit') THEN
    CREATE POLICY owner_read_workspace_audit ON advisor_workspace_audit_log
      FOR SELECT TO authenticated
      USING (
        project_id IN (SELECT id FROM projects 
                       WHERE owner_id = current_setting('app.current_user_id', true)::uuid)
      );
  END IF;
END $$;

-- =====================================================
-- Security: Session Guard Function
-- =====================================================

-- Create app schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS app;

-- Fail-closed security: ensure app.current_user_id is always set
CREATE OR REPLACE FUNCTION app.require_current_user()
RETURNS void AS $$
BEGIN
  IF current_setting('app.current_user_id', true) IS NULL OR 
     current_setting('app.current_user_id', true) = '' THEN
    RAISE EXCEPTION 'Security violation: app.current_user_id not set in database session';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to authenticated users (they'll call this in security-critical operations)
GRANT EXECUTE ON FUNCTION app.require_current_user TO authenticated;

-- =====================================================
-- Additional Performance Indexes
-- =====================================================

-- Fast advisor skill lookups with verified status
CREATE INDEX IF NOT EXISTS idx_advisor_skills_verified 
  ON advisor_skills (skill_category, skill_name, verified, proficiency_level DESC)
  WHERE verified = true;

-- Fast workspace session cleanup queries
CREATE INDEX IF NOT EXISTS idx_workspace_sessions_cleanup
  ON advisor_workspace_sessions(last_activity)
  WHERE status IN ('active', 'idle');

-- Fast notification outbox processing (status + attempt scheduling)
CREATE INDEX IF NOT EXISTS idx_outbox_processing_enhanced
  ON notification_outbox(status, next_attempt_at, attempts)
  WHERE status IN ('pending', 'queued');

COMMIT;