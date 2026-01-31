-- Migration: In-House Mode Admin Infrastructure
-- Purpose: Admin panel tables for In-House Mode SDK management
-- Date: 2026-01-25
-- Plan: docs/INHOUSE_ADMIN_PLAN.md

-- =============================================================================
-- CANONICAL ACTIVITY LOG (Single Event Stream)
-- All In-House Mode services write here. Enables fast "recent activity" queries
-- and consistent monitoring/alerting.
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service TEXT NOT NULL, -- 'auth', 'db', 'storage', 'jobs', 'email', 'payments', 'analytics', 'secrets', 'backups'
  action TEXT NOT NULL, -- 'query', 'upload', 'enqueue', 'send', 'backup_created', etc.
  status TEXT NOT NULL DEFAULT 'success', -- 'success', 'error', 'pending'
  correlation_id TEXT,
  actor_type TEXT, -- 'user', 'system', 'admin', 'cron'
  actor_id TEXT, -- user_id, admin_id, or null for system
  resource_type TEXT, -- 'file', 'job', 'email', 'backup', etc.
  resource_id TEXT,
  metadata JSONB, -- Service-specific details (keep small!)
  duration_ms INTEGER,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inhouse_activity_project_created
  ON inhouse_activity_log(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_activity_service
  ON inhouse_activity_log(service, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inhouse_activity_correlation
  ON inhouse_activity_log(correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inhouse_activity_errors
  ON inhouse_activity_log(created_at DESC) WHERE status = 'error';

-- =============================================================================
-- USAGE EVENTS (Billing-Defensible)
-- Store events, not mutable counters. Enables auditable adjustments.
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, -- 'storage_bytes', 'email_sends', 'job_runs', etc.
  delta BIGINT NOT NULL, -- Can be negative for adjustments
  reason TEXT, -- Required for admin adjustments
  actor_type TEXT NOT NULL, -- 'system', 'admin'
  actor_id UUID, -- admin_id for adjustments, null for system
  period_start DATE NOT NULL, -- Billing period start
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inhouse_usage_project_metric
  ON inhouse_usage_events(project_id, metric, period_start);
CREATE INDEX IF NOT EXISTS idx_inhouse_usage_period
  ON inhouse_usage_events(period_start, metric);

-- Helper function to get current usage
CREATE OR REPLACE FUNCTION get_inhouse_usage(
  p_project_id UUID,
  p_metric TEXT,
  p_period_start DATE DEFAULT date_trunc('month', CURRENT_DATE)::DATE
) RETURNS BIGINT AS $$
  SELECT COALESCE(SUM(delta), 0)
  FROM inhouse_usage_events
  WHERE project_id = p_project_id
    AND metric = p_metric
    AND period_start = p_period_start;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- ADMIN AUDIT LOG (Specific to Admin Operations)
-- No FK to auth.users - preserves audit history if admin is deleted
-- Admin email can be resolved at query time via JOIN if needed
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_admin_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'project_view', 'job_retry', 'quota_override', 'impersonate_start', etc.
  project_id UUID REFERENCES projects(id),
  resource_type TEXT, -- 'job', 'email', 'backup', etc.
  resource_id TEXT,
  reason TEXT,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inhouse_admin_audit_admin
  ON inhouse_admin_audit(admin_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_admin_audit_project
  ON inhouse_admin_audit(project_id);
CREATE INDEX IF NOT EXISTS idx_inhouse_admin_audit_created
  ON inhouse_admin_audit(created_at DESC);

-- =============================================================================
-- QUOTA OVERRIDES
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_quota_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric TEXT NOT NULL, -- 'storage_bytes', 'email_sends', 'job_runs'
  original_limit BIGINT NOT NULL,
  new_limit BIGINT NOT NULL,
  reason TEXT NOT NULL,
  created_by UUID NOT NULL, -- No FK - preserves audit trail if admin deleted
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID -- No FK - preserves audit trail if admin deleted
);

CREATE INDEX IF NOT EXISTS idx_inhouse_quota_overrides_project
  ON inhouse_quota_overrides(project_id);
-- Index for finding active overrides (expiration check done at query time)
CREATE INDEX IF NOT EXISTS idx_inhouse_quota_overrides_active
  ON inhouse_quota_overrides(project_id, metric, expires_at)
  WHERE revoked_at IS NULL;

-- =============================================================================
-- ALERT RULES
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service TEXT NOT NULL, -- 'jobs', 'emails', 'storage', etc.
  metric TEXT NOT NULL, -- 'error_rate', 'queue_depth', 'bounce_rate'
  condition TEXT NOT NULL, -- 'gt', 'lt', 'eq'
  threshold NUMERIC NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 5,
  channels JSONB NOT NULL DEFAULT '[]', -- ['email', 'slack']
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL, -- No FK - preserves config if admin deleted
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ACTIVE ALERTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS inhouse_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES inhouse_alert_rules(id),
  project_id UUID REFERENCES projects(id),
  severity TEXT NOT NULL DEFAULT 'warning', -- 'info', 'warning', 'critical'
  message TEXT NOT NULL,
  metadata JSONB,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID, -- No FK - preserves alert history if admin deleted
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inhouse_alerts_active
  ON inhouse_alerts(triggered_at DESC)
  WHERE resolved_at IS NULL;

-- =============================================================================
-- ROW LEVEL SECURITY
-- These tables are admin-only, so we use restrictive policies
-- =============================================================================

ALTER TABLE inhouse_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_admin_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_quota_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_alerts ENABLE ROW LEVEL SECURITY;

-- Activity log: Project owners can view their project's activity
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_activity_log_owner_select') THEN
    CREATE POLICY inhouse_activity_log_owner_select ON inhouse_activity_log
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- Usage events: Project owners can view their usage
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_usage_events_owner_select') THEN
    CREATE POLICY inhouse_usage_events_owner_select ON inhouse_usage_events
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- Admin audit: Only visible to admins (via service role, not RLS)
-- No user policies - accessed only through admin service

-- Quota overrides: Project owners can view their overrides
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_quota_overrides_owner_select') THEN
    CREATE POLICY inhouse_quota_overrides_owner_select ON inhouse_quota_overrides
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- Alert rules: Admin-only (no user policy)

-- Alerts: Project owners can view alerts related to their projects
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'inhouse_alerts_owner_select') THEN
    CREATE POLICY inhouse_alerts_owner_select ON inhouse_alerts
      FOR SELECT USING (
        project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

-- =============================================================================
-- HELPER FUNCTION FOR LOGGING ADMIN ACTIONS
-- =============================================================================

CREATE OR REPLACE FUNCTION log_inhouse_admin_action(
  p_admin_id UUID,
  p_action TEXT,
  p_project_id UUID DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO inhouse_admin_audit (
    admin_id, action, project_id, resource_type, resource_id,
    reason, metadata, ip_address, user_agent
  ) VALUES (
    p_admin_id, p_action, p_project_id, p_resource_type, p_resource_id,
    p_reason, p_metadata, p_ip_address, p_user_agent
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- HELPER FUNCTION FOR LOGGING ACTIVITY
-- =============================================================================

CREATE OR REPLACE FUNCTION log_inhouse_activity(
  p_project_id UUID,
  p_service TEXT,
  p_action TEXT,
  p_status TEXT DEFAULT 'success',
  p_correlation_id TEXT DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'system',
  p_actor_id TEXT DEFAULT NULL,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO inhouse_activity_log (
    project_id, service, action, status, correlation_id,
    actor_type, actor_id, resource_type, resource_id,
    metadata, duration_ms, error_code
  ) VALUES (
    p_project_id, p_service, p_action, p_status, p_correlation_id,
    p_actor_type, p_actor_id, p_resource_type, p_resource_id,
    p_metadata, p_duration_ms, p_error_code
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE inhouse_activity_log IS 'Canonical activity stream for all In-House Mode services. Services write here for unified monitoring/alerting.';
COMMENT ON TABLE inhouse_usage_events IS 'Event-sourced usage tracking. Usage = SUM(delta). Adjustments are negative events (auditable, reversible).';
COMMENT ON TABLE inhouse_admin_audit IS 'Admin operation audit trail. All sensitive admin actions logged here.';
COMMENT ON TABLE inhouse_quota_overrides IS 'Temporary or permanent quota overrides for projects.';
COMMENT ON TABLE inhouse_alert_rules IS 'Alert rule configuration for In-House Mode monitoring.';
COMMENT ON TABLE inhouse_alerts IS 'Active and historical alerts triggered by alert rules.';

COMMENT ON FUNCTION log_inhouse_admin_action IS 'Helper to log admin actions to the audit table.';
COMMENT ON FUNCTION log_inhouse_activity IS 'Helper to log service activity to the activity log table.';
COMMENT ON FUNCTION get_inhouse_usage IS 'Get current usage for a metric in a billing period (computed from events).';
